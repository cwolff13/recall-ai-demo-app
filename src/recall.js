import { createHmac, timingSafeEqual } from "node:crypto";

const RETRYABLE_SECONDS = {
  503: 5,
  507: 30,
};

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function header(headers, current, legacy) {
  if (typeof headers?.get === "function") {
    return headers.get(current) ?? headers.get(legacy);
  }

  const value = headers?.[current] ?? headers?.[legacy];
  return Array.isArray(value) ? value.join(" ") : value;
}

export function webhookId(headers) {
  return header(headers, "webhook-id", "svix-id");
}

export function verifyRecallRequest(secret, headers, rawBody) {
  const id = webhookId(headers);
  const timestamp = header(
    headers,
    "webhook-timestamp",
    "svix-timestamp",
  );
  const signatures = header(
    headers,
    "webhook-signature",
    "svix-signature",
  );

  if (!secret?.startsWith("whsec_") || !id || !timestamp || !signatures) {
    return false;
  }

  let expected;
  try {
    const key = Buffer.from(secret.slice("whsec_".length), "base64");
    expected = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest();
  } catch {
    return false;
  }

  return signatures.split(" ").some((versionedSignature) => {
    const [version, encoded] = versionedSignature.split(",");
    if (version !== "v1" || !encoded) return false;

    try {
      const received = Buffer.from(encoded, "base64");
      return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      );
    } catch {
      return false;
    }
  });
}

export function retryDelayMs(response, attempt, random = Math.random) {
  if (![429, 503, 507].includes(response.status)) return null;

  const retryAfter = Number(response.headers.get("retry-after"));
  const seconds =
    response.status === 429
      ? Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : 2 ** Math.max(0, attempt - 1)
      : RETRYABLE_SECONDS[response.status];

  return (seconds + Math.ceil(random() * 5)) * 1000;
}

export async function recallRequest(
  config,
  path,
  init = {},
  { fetchImpl = fetch, sleep = wait, random = Math.random } = {},
) {
  const url = `https://${config.recallRegion}.recall.ai/api/v1${path}`;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: config.recallApiKey,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const delay = retryDelayMs(response, attempt, random);
    if (delay !== null && attempt < 6) {
      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Recall request failed with status ${response.status}`);
    }

    return response;
  }

  throw new Error("Recall request exceeded its retry limit");
}

export async function createBot(config, meetingUrl, sessionId, options) {
  const response = await recallRequest(
    config,
    "/bot/",
    {
      method: "POST",
      body: JSON.stringify({
        meeting_url: meetingUrl,
        join_at: new Date().toISOString(),
        bot_name: "Discovery Notes Bot",
        metadata: { discovery_session_id: sessionId },
        recording_config: {
          video_mixed_mp4: {},
        },
        chat: {
          on_bot_join: {
            send_to: "everyone",
            message:
              "This meeting is being recorded to create a customer discovery brief.",
          },
        },
      }),
    },
    options,
  );

  const bot = await response.json();
  if (typeof bot?.id !== "string") {
    throw new Error("Recall did not return a bot ID");
  }
  return bot;
}

export async function createTranscript(
  config,
  recordingId,
  sessionId,
  options,
) {
  const response = await recallRequest(
    config,
    `/recording/${encodeURIComponent(recordingId)}/create_transcript/`,
    {
      method: "POST",
      body: JSON.stringify({
        metadata: { discovery_session_id: sessionId },
        provider: {
          recallai_async: {
            language_code: "auto",
          },
        },
        diarization: {
          use_separate_streams_when_available: true,
        },
      }),
    },
    options,
  );

  const transcript = await response.json();
  if (typeof transcript?.id !== "string") {
    throw new Error("Recall did not return a transcript ID");
  }
  return transcript;
}

export async function downloadTranscript(
  config,
  transcriptId,
  options = {},
) {
  const response = await recallRequest(
    config,
    `/transcript/${encodeURIComponent(transcriptId)}/`,
    {},
    options,
  );
  const transcript = await response.json();
  const downloadUrl = transcript?.data?.download_url;
  if (typeof downloadUrl !== "string") {
    throw new Error("Recall transcript is not ready for download");
  }

  const download = await (options.fetchImpl ?? fetch)(downloadUrl);
  if (!download.ok) {
    throw new Error(
      `Transcript download failed with status ${download.status}`,
    );
  }
  return download.json();
}

export async function getRecordingResponse(
  config,
  recordingId,
  range,
  options = {},
) {
  const response = await recallRequest(
    config,
    `/recording/${encodeURIComponent(recordingId)}/`,
    {},
    options,
  );
  const recording = await response.json();
  const downloadUrl =
    recording?.media_shortcuts?.video_mixed?.data?.download_url;

  if (typeof downloadUrl !== "string") {
    throw new Error("Recall recording is not ready for playback");
  }

  const media = await (options.fetchImpl ?? fetch)(downloadUrl, {
    headers: range ? { Range: range } : undefined,
  });
  if (!media.ok && media.status !== 206) {
    throw new Error(`Recording download failed with status ${media.status}`);
  }
  return media;
}
