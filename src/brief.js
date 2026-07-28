const SIGNAL_KINDS = new Set(["pain_point", "goal", "request"]);
const TRANSCRIPT_PAUSE_SECONDS = 1.5;
const TRANSCRIPT_MAX_SEGMENT_SECONDS = 30;
const TRANSCRIPT_MAX_SEGMENT_WORDS = 50;
const SENTENCE_END = /[.!?](?:["')\]]+)?$/;

export const discoveryBriefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        sourceIds: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string" },
        },
      },
      required: ["text", "sourceIds"],
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: ["pain_point", "goal", "request"],
          },
          text: { type: "string" },
          sourceIds: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
        required: ["kind", "text", "sourceIds"],
      },
    },
    followUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          owner: { type: ["string", "null"] },
          action: { type: "string" },
          dueDate: { type: ["string", "null"] },
          sourceIds: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
        required: ["owner", "action", "dueDate", "sourceIds"],
      },
    },
    openQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          sourceIds: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
        required: ["text", "sourceIds"],
      },
    },
  },
  required: ["summary", "signals", "followUps", "openQuestions"],
};

function finiteSeconds(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function transcriptText(words) {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function splitTranscriptParagraph(paragraph) {
  const words = Array.isArray(paragraph?.words) ? paragraph.words : [];
  const speaker =
    typeof paragraph?.participant?.name === "string" &&
    paragraph.participant.name.trim()
      ? paragraph.participant.name.trim()
      : "Unknown speaker";
  const segments = [];
  let currentWords = [];
  let previousEndSeconds = null;

  const finishSegment = () => {
    if (currentWords.length === 0) return;

    segments.push({
      speaker,
      startSeconds: currentWords[0].startSeconds,
      endSeconds: currentWords.at(-1).endSeconds,
      text: transcriptText(currentWords),
    });
    currentWords = [];
  };

  for (const word of words) {
    const text =
      typeof word?.text === "string" ? word.text.trim() : "";
    if (!text) continue;

    const fallbackStart = previousEndSeconds ?? 0;
    const startSeconds = Math.max(
      fallbackStart,
      finiteSeconds(word?.start_timestamp?.relative, fallbackStart),
      0,
    );
    const endSeconds = Math.max(
      startSeconds,
      finiteSeconds(word?.end_timestamp?.relative, startSeconds),
    );

    if (
      currentWords.length > 0 &&
      startSeconds - previousEndSeconds >= TRANSCRIPT_PAUSE_SECONDS
    ) {
      finishSegment();
    }

    currentWords.push({ text, startSeconds, endSeconds });
    previousEndSeconds = endSeconds;

    const durationSeconds =
      endSeconds - currentWords[0].startSeconds;
    if (
      SENTENCE_END.test(text) ||
      currentWords.length >= TRANSCRIPT_MAX_SEGMENT_WORDS ||
      durationSeconds >= TRANSCRIPT_MAX_SEGMENT_SECONDS
    ) {
      finishSegment();
    }
  }

  finishSegment();
  return segments;
}

export function normalizeTranscript(input) {
  const paragraphs = Array.isArray(input)
    ? input
    : Array.isArray(input?.data)
      ? input.data
      : [];

  return paragraphs
    .flatMap(splitTranscriptParagraph)
    .map((segment, index) => ({
      sourceId: `S${index + 1}`,
      ...segment,
    }));
}

function hasOnlyKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validSourceIds(value, knownSources, maxItems = Infinity) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxItems &&
    value.every(
      (sourceId) =>
        typeof sourceId === "string" && knownSources.has(sourceId),
    )
  );
}

function validClaim(value, knownSources, maxSources = Infinity) {
  return (
    hasOnlyKeys(value, ["text", "sourceIds"]) &&
    isNonEmptyString(value.text) &&
    validSourceIds(value.sourceIds, knownSources, maxSources)
  );
}

export function validateBrief(input, transcript) {
  const knownSources = new Set(
    transcript.map((segment) => segment.sourceId),
  );

  if (
    !hasOnlyKeys(input, [
      "summary",
      "signals",
      "followUps",
      "openQuestions",
    ]) ||
    !validClaim(input.summary, knownSources, 3) ||
    !Array.isArray(input.signals) ||
    !Array.isArray(input.followUps) ||
    !Array.isArray(input.openQuestions)
  ) {
    throw new Error("OpenRouter returned an invalid discovery brief");
  }

  const validSignals = input.signals.every(
    (signal) =>
      hasOnlyKeys(signal, ["kind", "text", "sourceIds"]) &&
      SIGNAL_KINDS.has(signal.kind) &&
      isNonEmptyString(signal.text) &&
      validSourceIds(signal.sourceIds, knownSources),
  );

  const validFollowUps = input.followUps.every(
    (item) =>
      hasOnlyKeys(item, [
        "owner",
        "action",
        "dueDate",
        "sourceIds",
      ]) &&
      (item.owner === null || isNonEmptyString(item.owner)) &&
      isNonEmptyString(item.action) &&
      (item.dueDate === null || isNonEmptyString(item.dueDate)) &&
      validSourceIds(item.sourceIds, knownSources),
  );

  const validQuestions = input.openQuestions.every((question) =>
    validClaim(question, knownSources),
  );

  if (!validSignals || !validFollowUps || !validQuestions) {
    throw new Error("OpenRouter returned an invalid discovery brief");
  }

  return input;
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function generateBrief(
  config,
  transcript,
  { fetchImpl = fetch, sleep = wait } = {},
) {
  if (transcript.length === 0) {
    throw new Error("The transcript did not contain any speech");
  }

  const body = {
    model: config.openRouterModel,
    provider: {
      require_parameters: true,
      data_collection: "deny",
    },
    messages: [
      {
        role: "system",
        content: [
          "Create a concise customer discovery brief using only the supplied transcript.",
          "Capture explicit pain points, desired outcomes, product requests, and follow-up commitments.",
          "Never invent facts, owners, dates, needs, or requests.",
          "If an owner or due date was not stated, return null.",
          "Put important missing information in openQuestions.",
          "Every summary, signal, follow-up, and open question must cite one or more supplied sourceIds.",
          "For the summary, cite only the one to three most representative sourceIds instead of every supporting segment.",
          "Keep open-question context in sourceIds; do not add parenthetical context labels to the question text.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ transcript }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "customer_discovery_brief",
        strict: true,
        schema: discoveryBriefSchema,
      },
    },
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetchImpl(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.publicBaseUrl,
          "X-Title": "Recall Customer Discovery Brief",
        },
        body: JSON.stringify(body),
      },
    );

    if ([429, 503].includes(response.status) && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        (Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : 2) * 1000,
      );
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed with status ${response.status}`,
      );
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenRouter returned an empty response");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenRouter returned invalid JSON");
    }
    return validateBrief(parsed, transcript);
  }

  throw new Error("OpenRouter request exceeded its retry limit");
}

export function formatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function references(sourceIds) {
  return sourceIds.map((sourceId) => `[${sourceId}]`).join(" ");
}

export function briefToMarkdown(brief, transcript) {
  const signals = {
    pain_point: brief.signals.filter(
      (signal) => signal.kind === "pain_point",
    ),
    goal: brief.signals.filter((signal) => signal.kind === "goal"),
    request: brief.signals.filter(
      (signal) => signal.kind === "request",
    ),
  };

  const bullets = (items) =>
    items.length
      ? items
          .map(
            (item) =>
              `- ${item.text} ${references(item.sourceIds)}`,
          )
          .join("\n")
      : "- None identified";

  const followUps = brief.followUps.length
    ? brief.followUps
        .map((item) => {
          const owner = item.owner ?? "Unassigned";
          const dueDate = item.dueDate ? ` — due ${item.dueDate}` : "";
          return `- **${owner}:** ${item.action}${dueDate} ${references(item.sourceIds)}`;
        })
        .join("\n")
    : "- None identified";

  const evidence = transcript
    .map(
      (segment) =>
        `- **[${segment.sourceId}] ${formatTime(segment.startSeconds)} — ${segment.speaker}:** ${segment.text}`,
    )
    .join("\n");

  return [
    "# Customer Discovery Brief",
    `## Summary\n\n${brief.summary.text} ${references(brief.summary.sourceIds)}`,
    `## Pain points\n\n${bullets(signals.pain_point)}`,
    `## Desired outcomes\n\n${bullets(signals.goal)}`,
    `## Product requests\n\n${bullets(signals.request)}`,
    `## Follow-ups\n\n${followUps}`,
    `## Open questions\n\n${bullets(brief.openQuestions)}`,
    `## Source evidence\n\n${evidence}`,
  ].join("\n\n");
}
