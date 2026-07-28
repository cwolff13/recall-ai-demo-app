import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import {
  ACTIVE_STAGES,
  BRIEF_SECTIONS,
  DEFAULT_BOT_NAME,
  MAX_BOT_IMAGE_BYTES,
  MAX_BOT_NAME_LENGTH,
} from "../shared/domain.js";
import {
  createBot,
  createTranscript,
  downloadTranscript,
  getMeetingParticipation,
  getRecordingResponse,
  verifyRecallRequest,
  webhookId,
} from "./recall.js";
import {
  briefToMarkdown,
  generateBrief,
  normalizeBriefSections,
  normalizeCustomSection,
  normalizeTranscript,
} from "./brief.js";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(path.dirname(currentFile));

const BOT_STAGES = new Map([
  ["bot.joining_call", "joining"],
  ["bot.in_waiting_room", "waiting"],
  ["bot.in_call_not_recording", "joining"],
  ["bot.recording_permission_allowed", "joining"],
  ["bot.in_call_recording", "recording"],
  ["bot.call_ended", "processing"],
  ["bot.done", "processing"],
]);
const FAILURE_EVENTS = new Set([
  "bot.fatal",
  "bot.recording_permission_denied",
  "recording.failed",
  "transcript.failed",
]);

function requiredEnvironment(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

export function readConfig(environment = process.env) {
  const recallRegion = requiredEnvironment("RECALL_REGION", environment);
  if (
    ![
      "us-west-2",
      "us-east-1",
      "eu-central-1",
      "ap-northeast-1",
    ].includes(recallRegion)
  ) {
    throw new Error("RECALL_REGION is not supported");
  }

  const publicBaseUrl = requiredEnvironment(
    "PUBLIC_API_BASE_URL",
    environment,
  ).replace(/\/$/, "");
  const parsedBaseUrl = new URL(publicBaseUrl);
  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("PUBLIC_API_BASE_URL must use HTTPS");
  }

  return {
    recallRegion,
    recallApiKey: requiredEnvironment("RECALL_API_KEY", environment),
    verificationSecret: requiredEnvironment(
      "RECALL_WORKSPACE_VERIFICATION_SECRET",
      environment,
    ),
    publicBaseUrl,
    openRouterApiKey: requiredEnvironment(
      "OPENROUTER_API_KEY",
      environment,
    ),
    openRouterModel:
      environment.OPENROUTER_MODEL?.trim() || "openai/gpt-5-mini",
    port: Number(environment.PORT) || 3000,
  };
}

export function createSessionStore() {
  return {
    session: {
      id: null,
      stage: "idle",
      error: null,
      sections: [...BRIEF_SECTIONS],
      customSection: null,
      botName: DEFAULT_BOT_NAME,
    },
    webhookIds: new Set(),
  };
}

export function acceptWebhook(store, id) {
  if (store.webhookIds.has(id)) return false;
  store.webhookIds.add(id);
  return true;
}

export function eventBelongsToSession(session, payload) {
  let idMatch;
  for (const resource of ["bot", "recording", "transcript"]) {
    const entity = payload?.data?.[resource];
    const metadataId = entity?.metadata?.discovery_session_id;
    if (typeof metadataId === "string") {
      return metadataId === session.id;
    }
    const eventId = entity?.id;
    const sessionId = session[`${resource}Id`];
    if (idMatch === undefined && eventId && sessionId) {
      idMatch = eventId === sessionId;
    }
  }
  return idMatch ?? false;
}

function safeFailure(payload) {
  const code = payload?.data?.data?.sub_code ?? payload?.data?.data?.code;
  const safeCode =
    typeof code === "string"
      ? code.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80)
      : "";
  return safeCode
    ? `Recall reported ${payload.event} (${safeCode})`
    : `Recall reported ${payload.event}`;
}

function failSession(session, error) {
  session.stage = "failed";
  session.error =
    error instanceof Error ? error.message : "Meeting processing failed";
}

export async function processRecallEvent(
  store,
  payload,
  config,
  services,
) {
  const session = store.session;
  if (!session.id || !eventBelongsToSession(session, payload)) return;

  try {
    const botStage = BOT_STAGES.get(payload.event);
    if (botStage) {
      session.stage = botStage;
      return;
    }

    if (FAILURE_EVENTS.has(payload.event)) {
      session.stage = "failed";
      session.error = safeFailure(payload);
      return;
    }

    if (payload.event === "recording.done") {
      if (session.transcriptRequested) return;

      const recordingId = payload?.data?.recording?.id;
      if (typeof recordingId !== "string") {
        throw new Error("Recording webhook did not include an ID");
      }

      session.recordingId = recordingId;
      session.transcriptRequested = true;
      session.stage = "transcribing";

      const [transcriptResult, participationResult] =
        await Promise.allSettled([
          services.createTranscript(
            config,
            recordingId,
            session.id,
          ),
          services.getMeetingParticipation(config, recordingId),
        ]);

      if (participationResult.status === "fulfilled") {
        session.meetingParticipation = participationResult.value;
        session.meetingParticipationUnavailable = false;
      } else {
        session.meetingParticipationUnavailable = true;
      }

      if (transcriptResult.status === "rejected") {
        throw transcriptResult.reason;
      }

      session.transcriptId = transcriptResult.value.id;
      return;
    }

    if (payload.event === "transcript.done") {
      if (session.briefRequested || session.stage === "complete") return;

      const transcriptId =
        payload?.data?.transcript?.id ?? session.transcriptId;
      if (typeof transcriptId !== "string") {
        throw new Error("Transcript webhook did not include an ID");
      }

      session.transcriptId = transcriptId;
      session.briefRequested = true;
      session.stage = "generating";

      const rawTranscript = await services.downloadTranscript(
        config,
        transcriptId,
      );
      const transcript = normalizeTranscript(rawTranscript);
      const brief = await services.generateBrief(config, transcript, {
        sections: session.sections,
        customSection: session.customSection,
      });

      session.transcript = transcript;
      session.brief = brief;
      session.markdown = briefToMarkdown(
        brief,
        transcript,
        session.sections,
        session.customSection,
      );
      session.stage = "complete";
    }
  } catch (error) {
    failSession(session, error);
    throw error;
  }
}

function publicSession(session) {
  return {
    stage: session.stage,
    error: session.error,
    transcript: session.transcript,
    brief: session.brief,
    markdown: session.markdown,
    sections: session.sections ?? [...BRIEF_SECTIONS],
    customSection: session.customSection ?? null,
    botName: session.botName ?? DEFAULT_BOT_NAME,
    hasRecording: Boolean(session.recordingId),
    meetingParticipation: session.meetingParticipation ?? null,
    meetingParticipationUnavailable:
      session.meetingParticipationUnavailable === true,
  };
}

function validMeetingUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeBotName(value) {
  if (value === undefined || value === null) return DEFAULT_BOT_NAME;
  if (typeof value !== "string") {
    throw new Error("Bot name must be text");
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return DEFAULT_BOT_NAME;
  if (name.length > MAX_BOT_NAME_LENGTH) {
    throw new Error("Bot name must be 100 characters or fewer");
  }
  return name;
}

function normalizeBotImage(value) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("Camera card must be a valid JPEG");
  }

  const image = Buffer.from(value, "base64");
  if (
    image.length === 0 ||
    image.length > MAX_BOT_IMAGE_BYTES ||
    image[0] !== 0xff ||
    image[1] !== 0xd8 ||
    image[2] !== 0xff ||
    image.toString("base64") !== value
  ) {
    throw new Error("Camera card must be a JPEG up to 1.3 MB");
  }
  return value;
}

function normalizeSessionRequest(body) {
  if (!validMeetingUrl(body?.meetingUrl)) {
    throw new Error("Enter a valid HTTPS meeting URL");
  }
  const customSection = normalizeCustomSection(body?.customSection);
  return {
    meetingUrl: body.meetingUrl,
    sections: normalizeBriefSections(body?.sections, {
      allowEmpty: Boolean(customSection),
    }),
    customSection,
    botName: normalizeBotName(body?.botName),
    botImage: normalizeBotImage(body?.botImage),
  };
}

const defaultServices = {
  createBot,
  createTranscript,
  downloadTranscript,
  generateBrief,
  getMeetingParticipation,
  getRecordingResponse,
};

export function createApp({
  config,
  store = createSessionStore(),
  services = defaultServices,
} = {}) {
  if (!config) throw new Error("createApp requires configuration");

  const app = express();

  app.post(
    "/api/webhooks/recall",
    express.raw({ type: "application/json", limit: "1mb" }),
    (request, response) => {
      const rawBody = Buffer.isBuffer(request.body)
        ? request.body.toString("utf8")
        : "";
      const id = webhookId(request.headers);

      if (
        !id ||
        !verifyRecallRequest(
          config.verificationSecret,
          request.headers,
          rawBody,
        )
      ) {
        response.status(401).json({ error: "Invalid signature" });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
        if (typeof payload?.event !== "string") throw new Error();
      } catch {
        response.status(400).json({ error: "Invalid webhook payload" });
        return;
      }

      if (!acceptWebhook(store, id)) {
        response.sendStatus(204);
        return;
      }

      response.sendStatus(204);
      setImmediate(() => {
        processRecallEvent(store, payload, config, services).catch(() => {
          console.error(
            `[recall] failed to process ${payload.event}`,
          );
        });
      });
    },
  );

  app.use(express.json({ limit: "2mb" }));

  app.post("/api/session", async (request, response) => {
    if (ACTIVE_STAGES.has(store.session.stage)) {
      response
        .status(409)
        .json({ error: "A meeting is already in progress" });
      return;
    }

    let input;
    try {
      input = normalizeSessionRequest(request.body);
    } catch (error) {
      response.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Enter valid meeting settings",
      });
      return;
    }

    const session = {
      id: randomUUID(),
      stage: "sending",
      error: null,
      sections: input.sections,
      customSection: input.customSection,
      botName: input.botName,
    };
    store.session = session;
    store.webhookIds.clear();

    try {
      const bot = await services.createBot(
        config,
        input.meetingUrl,
        session.id,
        { botName: input.botName, botImage: input.botImage },
      );
      session.botId = bot.id;
      session.stage = "joining";
      response.status(201).json(publicSession(session));
    } catch (error) {
      failSession(session, error);
      response.status(502).json(publicSession(session));
    }
  });

  app.get("/api/session", (_request, response) => {
    response.json(publicSession(store.session));
  });

  app.get("/api/recording", async (request, response) => {
    const recordingId = store.session.recordingId;
    if (!recordingId) {
      response.status(404).json({ error: "Recording is not available" });
      return;
    }

    try {
      const media = await services.getRecordingResponse(
        config,
        recordingId,
        request.headers.range,
      );
      response.status(media.status);

      for (const name of [
        "accept-ranges",
        "content-length",
        "content-range",
        "content-type",
      ]) {
        const value = media.headers.get(name);
        if (value) response.setHeader(name, value);
      }

      if (!media.body) {
        response.end();
        return;
      }
      Readable.fromWeb(media.body).pipe(response);
    } catch {
      response.status(502).json({ error: "Recording is unavailable" });
    }
  });

  app.use("/shared", express.static(path.join(projectRoot, "shared")));
  app.use(express.static(path.join(projectRoot, "public")));

  return app;
}

export function startServer(environment = process.env) {
  const config = readConfig(environment);
  const app = createApp({ config });
  app.listen(config.port, () => {
    console.log(
      `Customer discovery demo listening on port ${config.port} (Recall ${config.recallRegion})`,
    );
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    startServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
