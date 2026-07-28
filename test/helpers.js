import { createHmac } from "node:crypto";

export const TEST_SECRET = `whsec_${Buffer.from(
  "test signing key",
).toString("base64")}`;

export function signedHeaders(body, id = "message-1") {
  const timestamp = "1731705121";
  const signature = createHmac(
    "sha256",
    Buffer.from(TEST_SECRET.slice("whsec_".length), "base64"),
  )
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  });
}

export const transcriptWord = (text, start, end) => ({
  text,
  start_timestamp: { relative: start },
  end_timestamp: { relative: end },
});

export const transcriptParagraph = (words, name = "Customer") => ({
  participant: { name },
  words,
});

export const participantEvent = (action, id, seconds) => ({
  action,
  participant: { id },
  timestamp: { relative: seconds },
});

export const speakerInterval = (id, start, end) => ({
  participant: { id },
  start_timestamp: { relative: start },
  end_timestamp: { relative: end },
});

export const sourceClaim = (text, sourceIds = ["S1"]) => ({
  text,
  sourceIds,
});

export function validBrief(overrides = {}) {
  return {
    summary: sourceClaim("Reporting is slow."),
    signals: [
      {
        kind: "pain_point",
        ...sourceClaim("Manual reporting is slow."),
      },
    ],
    followUps: [
      {
        owner: null,
        action: "Review the reporting workflow.",
        dueDate: null,
        sourceIds: ["S1"],
      },
    ],
    openQuestions: [
      sourceClaim("How often is reporting required?"),
    ],
    customItems: [],
    ...overrides,
  };
}

export function openRouterResponse(brief) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(brief) } }],
  });
}

export function recordingDoneEvent(session, recordingId = "recording-1") {
  return {
    event: "recording.done",
    data: {
      bot: {
        id: session.botId,
        metadata: { discovery_session_id: session.id },
      },
      recording: { id: recordingId },
    },
  };
}

export function postSession(baseUrl, input = {}) {
  return fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      meetingUrl: "https://meet.google.com/example",
      ...input,
    }),
  });
}
