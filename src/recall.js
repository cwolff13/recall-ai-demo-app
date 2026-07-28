import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_BOT_NAME,
  nonNegativeSeconds,
} from "../shared/domain.js";

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

export async function createBot(
  config,
  meetingUrl,
  sessionId,
  customization = {},
  options,
) {
  const cameraCard = customization.botImage
    ? {
        kind: "jpeg",
        b64_data: customization.botImage,
      }
    : null;

  const response = await recallRequest(
    config,
    "/bot/",
    {
      method: "POST",
      body: JSON.stringify({
        meeting_url: meetingUrl,
        join_at: new Date().toISOString(),
        bot_name: customization.botName || DEFAULT_BOT_NAME,
        metadata: { discovery_session_id: sessionId },
        recording_config: {
          video_mixed_mp4: {},
          participant_events: {},
        },
        ...(cameraCard
          ? {
              automatic_video_output: {
                in_call_not_recording: cameraCard,
                in_call_recording: cameraCard,
              },
            }
          : {}),
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

  return downloadJson(
    downloadUrl,
    options.fetchImpl ?? fetch,
    "Transcript",
  );
}

function participantKey(participant) {
  const id = participant?.id;
  return typeof id === "number" || typeof id === "string"
    ? String(id)
    : null;
}

function recordingDuration(recording, events, speakerTimeline) {
  const startedAt = Date.parse(recording?.started_at);
  const completedAt = Date.parse(recording?.completed_at);
  if (
    Number.isFinite(startedAt) &&
    Number.isFinite(completedAt) &&
    completedAt >= startedAt
  ) {
    return (completedAt - startedAt) / 1000;
  }

  const validSpeakerEnds = speakerTimeline.flatMap((entry) => {
    const startSeconds = nonNegativeSeconds(
      entry?.start_timestamp?.relative,
    );
    const endSeconds = nonNegativeSeconds(
      entry?.end_timestamp?.relative,
    );
    return startSeconds !== null &&
      endSeconds !== null &&
      endSeconds >= startSeconds
      ? [endSeconds]
      : [];
  });

  return Math.max(
    0,
    ...events.map(
      (event) =>
        nonNegativeSeconds(event?.timestamp?.relative) ?? 0,
    ),
    ...validSpeakerEnds,
  );
}

function attendanceFor(events, durationSeconds) {
  const ordered = events
    .filter((event) => event?.action === "join" || event?.action === "leave")
    .map((event) => ({
      action: event.action,
      seconds: nonNegativeSeconds(event?.timestamp?.relative),
    }))
    .filter((event) => event.seconds !== null)
    .sort((left, right) => left.seconds - right.seconds);

  if (ordered.length === 0) {
    return { attendanceSeconds: null, attendanceIntervals: [] };
  }

  const intervals = [];
  let joinedAt = null;
  let incomplete = false;

  for (const event of ordered) {
    if (event.action === "join") {
      if (joinedAt === null) joinedAt = event.seconds;
      continue;
    }

    if (joinedAt === null) {
      incomplete = true;
      continue;
    }

    const endSeconds = Math.max(joinedAt, event.seconds);
    intervals.push({ startSeconds: joinedAt, endSeconds });
    joinedAt = null;
  }

  if (joinedAt !== null) {
    intervals.push({
      startSeconds: joinedAt,
      endSeconds: Math.max(joinedAt, durationSeconds),
    });
  }

  return {
    attendanceSeconds: incomplete
      ? null
      : intervals.reduce(
          (total, interval) =>
            total + interval.endSeconds - interval.startSeconds,
          0,
        ),
    attendanceIntervals: intervals,
  };
}

export function summarizeMeetingParticipation({
  participants,
  events,
  speakerTimeline,
  recording,
}) {
  const participantList = Array.isArray(participants) ? participants : [];
  const participantEvents = Array.isArray(events) ? events : [];
  const timeline = Array.isArray(speakerTimeline) ? speakerTimeline : [];
  const durationSeconds = recordingDuration(
    recording,
    participantEvents,
    timeline,
  );

  const eventsByParticipant = new Map();
  for (const event of participantEvents) {
    const key = participantKey(event?.participant);
    if (!key) continue;
    const current = eventsByParticipant.get(key) ?? [];
    current.push(event);
    eventsByParticipant.set(key, current);
  }

  const speakingByParticipant = new Map();
  for (const entry of timeline) {
    const key = participantKey(entry?.participant);
    const startSeconds = nonNegativeSeconds(
      entry?.start_timestamp?.relative,
    );
    const endSeconds = nonNegativeSeconds(
      entry?.end_timestamp?.relative,
    );
    if (
      !key ||
      startSeconds === null ||
      endSeconds === null ||
      endSeconds < startSeconds
    ) {
      continue;
    }
    speakingByParticipant.set(
      key,
      (speakingByParticipant.get(key) ?? 0) +
        endSeconds -
        startSeconds,
    );
  }

  const normalizedParticipants = participantList.flatMap(
    (participant, index) => {
      const key = participantKey(participant);
      if (!key) return [];

      const name =
        typeof participant?.name === "string" && participant.name.trim()
          ? participant.name.trim()
          : `Participant ${index + 1}`;
      const attendance = attendanceFor(
        eventsByParticipant.get(key) ?? [],
        durationSeconds,
      );

      return [
        {
          id: key,
          name,
          isHost: participant?.is_host === true,
          speakingSeconds: speakingByParticipant.get(key) ?? 0,
          ...attendance,
        },
      ];
    },
  );

  const totalSpeakingSeconds = normalizedParticipants.reduce(
    (total, participant) => total + participant.speakingSeconds,
    0,
  );

  return {
    durationSeconds,
    participantCount: normalizedParticipants.length,
    totalSpeakingSeconds,
    participants: normalizedParticipants.map((participant) => ({
      ...participant,
      speakingShare:
        totalSpeakingSeconds > 0
          ? Math.round(
              (participant.speakingSeconds / totalSpeakingSeconds) * 1000,
            ) / 10
          : 0,
    })),
  };
}

function downloadUrl(value) {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

async function downloadJson(url, fetchImpl, label) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `${label} download failed with status ${response.status}`,
    );
  }
  return response.json();
}

export async function getMeetingParticipation(
  config,
  recordingId,
  options = {},
) {
  const encodedRecordingId = encodeURIComponent(recordingId);
  const [artifactResponse, recordingResponse] = await Promise.all([
    recallRequest(
      config,
      `/participant_events/?recording_id=${encodedRecordingId}&status_code=done`,
      {},
      options,
    ),
    recallRequest(
      config,
      `/recording/${encodedRecordingId}/`,
      {},
      options,
    ),
  ]);
  const [artifacts, recording] = await Promise.all([
    artifactResponse.json(),
    recordingResponse.json(),
  ]);
  const artifact = Array.isArray(artifacts?.results)
    ? artifacts.results.find(
        (candidate) => candidate?.recording?.id === recordingId,
      )
    : null;
  const participantsUrl = downloadUrl(
    artifact?.data?.participants_download_url,
  );
  const eventsUrl = downloadUrl(
    artifact?.data?.participant_events_download_url,
  );
  const speakerTimelineUrl = downloadUrl(
    artifact?.data?.speaker_timeline_download_url,
  );

  if (!participantsUrl || !eventsUrl || !speakerTimelineUrl) {
    throw new Error("Recall participation data is not ready");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const [participants, events, speakerTimeline] = await Promise.all([
    downloadJson(participantsUrl, fetchImpl, "Recall participation"),
    downloadJson(eventsUrl, fetchImpl, "Recall participation"),
    downloadJson(speakerTimelineUrl, fetchImpl, "Recall participation"),
  ]);

  return summarizeMeetingParticipation({
    participants,
    events,
    speakerTimeline,
    recording,
  });
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
