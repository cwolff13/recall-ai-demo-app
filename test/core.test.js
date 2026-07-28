import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import {
  briefToMarkdown,
  normalizeTranscript,
  validateBrief,
} from "../src/brief.js";
import {
  recallRequest,
  retryDelayMs,
  verifyRecallRequest,
} from "../src/recall.js";
import {
  acceptWebhook,
  createApp,
  createSessionStore,
  eventBelongsToSession,
} from "../src/server.js";

const secret = `whsec_${Buffer.from("test signing key").toString("base64")}`;

function signedHeaders(body, id = "message-1") {
  const timestamp = "1731705121";
  const signature = createHmac(
    "sha256",
    Buffer.from(secret.slice("whsec_".length), "base64"),
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

describe("Recall request verification", () => {
  it("accepts the exact signed raw payload and one matching rotated signature", () => {
    const body = '{"event":"recording.done"}';
    const headers = signedHeaders(body);
    headers.set(
      "webhook-signature",
      `v1,${Buffer.alloc(32).toString("base64")} ${headers.get("webhook-signature")}`,
    );

    assert.equal(verifyRecallRequest(secret, headers, body), true);
    assert.equal(
      verifyRecallRequest(secret, headers, `${body}\n`),
      false,
    );
  });

  it("rejects missing verification headers", () => {
    assert.equal(
      verifyRecallRequest(secret, new Headers(), "{}"),
      false,
    );
  });
});

describe("Recall retries", () => {
  it("respects Retry-After and uses fixed service delays", () => {
    assert.equal(
      retryDelayMs(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "7" },
        }),
        1,
        () => 0,
      ),
      7000,
    );
    assert.equal(
      retryDelayMs(new Response(null, { status: 503 }), 1, () => 0),
      5000,
    );
    assert.equal(
      retryDelayMs(new Response(null, { status: 507 }), 1, () => 0),
      30000,
    );
  });

  it("retries a transient Recall response before returning JSON", async () => {
    const statuses = [503, 200];
    const waits = [];
    const response = await recallRequest(
      {
        recallRegion: "us-west-2",
        recallApiKey: "test-key",
      },
      "/bot/",
      {},
      {
        fetchImpl: async () =>
          new Response('{"id":"bot-1"}', {
            status: statuses.shift(),
            headers: { "content-type": "application/json" },
          }),
        sleep: async (milliseconds) => waits.push(milliseconds),
        random: () => 0,
      },
    );

    assert.deepEqual(await response.json(), { id: "bot-1" });
    assert.deepEqual(waits, [5000]);
  });
});

describe("Transcript and brief evidence", () => {
  const transcript = normalizeTranscript([
    {
      participant: { name: "Customer" },
      words: [
        {
          text: "Reporting",
          start_timestamp: { relative: 4.2 },
          end_timestamp: { relative: 4.8 },
        },
        {
          text: "is slow.",
          start_timestamp: { relative: 4.9 },
          end_timestamp: { relative: 6.1 },
        },
      ],
    },
  ]);

  it("normalizes speaker text, timestamps, and source IDs", () => {
    assert.deepEqual(transcript, [
      {
        sourceId: "S1",
        speaker: "Customer",
        startSeconds: 4.2,
        endSeconds: 6.1,
        text: "Reporting is slow.",
      },
    ]);
  });

  it("splits one speaker into timestamped sentence evidence", () => {
    const segments = normalizeTranscript([
      {
        participant: { name: "Customer" },
        words: [
          {
            text: "Reporting",
            start_timestamp: { relative: 3.4 },
            end_timestamp: { relative: 3.9 },
          },
          {
            text: "is slow.",
            start_timestamp: { relative: 4 },
            end_timestamp: { relative: 4.8 },
          },
          {
            text: "Exports",
            start_timestamp: { relative: 5.1 },
            end_timestamp: { relative: 5.5 },
          },
          {
            text: "would help.",
            start_timestamp: { relative: 5.6 },
            end_timestamp: { relative: 6.4 },
          },
        ],
      },
    ]);

    assert.deepEqual(segments, [
      {
        sourceId: "S1",
        speaker: "Customer",
        startSeconds: 3.4,
        endSeconds: 4.8,
        text: "Reporting is slow.",
      },
      {
        sourceId: "S2",
        speaker: "Customer",
        startSeconds: 5.1,
        endSeconds: 6.4,
        text: "Exports would help.",
      },
    ]);
  });

  it("splits on pauses even when punctuation is missing", () => {
    const segments = normalizeTranscript([
      {
        participant: { name: "Customer" },
        words: [
          {
            text: "First thought",
            start_timestamp: { relative: 1 },
            end_timestamp: { relative: 2 },
          },
          {
            text: "Second thought",
            start_timestamp: { relative: 4 },
            end_timestamp: { relative: 5 },
          },
        ],
      },
    ]);

    assert.deepEqual(
      segments.map(({ sourceId, startSeconds, text }) => ({
        sourceId,
        startSeconds,
        text,
      })),
      [
        {
          sourceId: "S1",
          startSeconds: 1,
          text: "First thought",
        },
        {
          sourceId: "S2",
          startSeconds: 4,
          text: "Second thought",
        },
      ],
    );
  });

  it("bounds punctuation-free segments and sanitizes timestamps", () => {
    const words = Array.from({ length: 51 }, (_, index) => ({
      text: `word-${index + 1}`,
      start_timestamp: {
        relative: index === 0 ? Number.NEGATIVE_INFINITY : index / 10,
      },
      end_timestamp: { relative: (index + 1) / 10 },
    }));

    const segments = normalizeTranscript({
      data: [
        {
          participant: { name: "  Customer  " },
          words: [null, { text: " " }, ...words],
        },
      ],
    });

    assert.equal(segments.length, 2);
    assert.equal(segments[0].text.split(" ").length, 50);
    assert.equal(segments[0].startSeconds, 0);
    assert.equal(segments[1].sourceId, "S2");
    assert.equal(segments[1].speaker, "Customer");
    assert.equal(segments[1].text, "word-51");
  });

  it("bounds a long punctuation-free segment by duration", () => {
    const segments = normalizeTranscript([
      {
        participant: { name: "Customer" },
        words: [0, 10, 20, 30].map((startSeconds, index) => ({
          text: `thought-${index + 1}`,
          start_timestamp: { relative: startSeconds },
          end_timestamp: { relative: startSeconds + 10 },
        })),
      },
    ]);

    assert.deepEqual(
      segments.map(({ startSeconds, endSeconds, text }) => ({
        startSeconds,
        endSeconds,
        text,
      })),
      [
        {
          startSeconds: 0,
          endSeconds: 30,
          text: "thought-1 thought-2 thought-3",
        },
        {
          startSeconds: 30,
          endSeconds: 40,
          text: "thought-4",
        },
      ],
    );
  });

  it("numbers evidence across speaker entries", () => {
    const segments = normalizeTranscript([
      {
        participant: { name: "Interviewer" },
        words: [
          {
            text: "What changed?",
            start_timestamp: { relative: 1 },
            end_timestamp: { relative: 2 },
          },
        ],
      },
      {
        participant: { name: "Customer" },
        words: [
          {
            text: "Reporting changed.",
            start_timestamp: { relative: 3 },
            end_timestamp: { relative: 4 },
          },
        ],
      },
    ]);

    assert.deepEqual(
      segments.map(({ sourceId, speaker }) => ({ sourceId, speaker })),
      [
        { sourceId: "S1", speaker: "Interviewer" },
        { sourceId: "S2", speaker: "Customer" },
      ],
    );
  });

  it("accepts a source-linked brief and rejects unknown evidence", () => {
    const brief = {
      summary: { text: "Reporting is slow.", sourceIds: ["S1"] },
      signals: [
        {
          kind: "pain_point",
          text: "Manual reporting is slow.",
          sourceIds: ["S1"],
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
        {
          text: "How often is reporting required?",
          sourceIds: ["S1"],
        },
      ],
    };

    assert.equal(validateBrief(brief, transcript), brief);
    assert.throws(
      () =>
        validateBrief(
          {
            ...brief,
            summary: { text: "Unsupported", sourceIds: ["S9"] },
          },
          transcript,
        ),
      /invalid discovery brief/,
    );
    assert.throws(
      () =>
        validateBrief(
          {
            ...brief,
            openQuestions: ["How often is reporting required?"],
          },
          transcript,
        ),
      /invalid discovery brief/,
    );
    assert.throws(
      () =>
        validateBrief(
          {
            ...brief,
            summary: {
              text: "Too many summary citations.",
              sourceIds: ["S1", "S1", "S1", "S1"],
            },
          },
          transcript,
        ),
      /invalid discovery brief/,
    );

    const markdown = briefToMarkdown(brief, transcript);
    assert.match(
      markdown,
      /- How often is reporting required\? \[S1\]/,
    );
    assert.doesNotMatch(markdown, /context:/);
  });
});

describe("Single-session webhook flow", () => {
  it("deduplicates webhook IDs and rejects unrelated bot events", () => {
    const store = createSessionStore();
    store.session = {
      id: "session-1",
      stage: "joining",
      botId: "bot-1",
    };

    assert.equal(acceptWebhook(store, "event-1"), true);
    assert.equal(acceptWebhook(store, "event-1"), false);
    assert.equal(
      eventBelongsToSession(store.session, {
        data: { bot: { id: "bot-2" } },
      }),
      false,
    );
    assert.equal(
      eventBelongsToSession(store.session, {
        data: {
          bot: {
            id: "bot-2",
            metadata: { discovery_session_id: "session-1" },
          },
        },
      }),
      true,
    );
  });

  describe("HTTP integration", () => {
    let server;
    let baseUrl;
    let createTranscriptCalls;

    const store = createSessionStore();
    const config = {
      recallRegion: "us-west-2",
      recallApiKey: "test-key",
      verificationSecret: secret,
      publicBaseUrl: "https://example.test",
      openRouterApiKey: "openrouter-test-key",
      openRouterModel: "openai/gpt-5-mini",
    };
    const services = {
      createBot: async (_config, _meetingUrl, sessionId) => ({
        id: `bot-${sessionId}`,
      }),
      createTranscript: async () => {
        createTranscriptCalls += 1;
        return { id: "transcript-1" };
      },
      downloadTranscript: async () => [],
      generateBrief: async () => ({}),
      getRecordingResponse: async () => {
        throw new Error("not used");
      },
    };

    before(async () => {
      createTranscriptCalls = 0;
      const app = createApp({ config, store, services });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it("creates one session and processes a signed recording webhook once", async () => {
      const created = await fetch(`${baseUrl}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingUrl: "https://meet.google.com/example",
        }),
      });
      assert.equal(created.status, 201);

      const sessionId = store.session.id;
      const body = JSON.stringify({
        event: "recording.done",
        data: {
          bot: {
            id: store.session.botId,
            metadata: { discovery_session_id: sessionId },
          },
          recording: { id: "recording-1" },
        },
      });
      const headers = Object.fromEntries(signedHeaders(body, "event-1"));

      const first = await fetch(
        `${baseUrl}/api/webhooks/recall`,
        {
          method: "POST",
          headers,
          body,
        },
      );
      const duplicate = await fetch(
        `${baseUrl}/api/webhooks/recall`,
        {
          method: "POST",
          headers,
          body,
        },
      );
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(first.status, 204);
      assert.equal(duplicate.status, 204);
      assert.equal(createTranscriptCalls, 1);
      assert.equal(store.session.recordingId, "recording-1");
      assert.equal(store.session.transcriptId, "transcript-1");
    });
  });
});
