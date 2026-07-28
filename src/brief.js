export const BRIEF_SECTIONS = Object.freeze([
  "summary",
  "pain_points",
  "desired_outcomes",
  "product_requests",
  "follow_ups",
  "open_questions",
]);

const SIGNAL_SECTION = {
  pain_point: "pain_points",
  goal: "desired_outcomes",
  request: "product_requests",
};
const SIGNAL_KINDS = new Set(Object.keys(SIGNAL_SECTION));
const TRANSCRIPT_PAUSE_SECONDS = 1.5;
const TRANSCRIPT_MAX_SEGMENT_SECONDS = 30;
const TRANSCRIPT_MAX_SEGMENT_WORDS = 50;
const SENTENCE_END = /[.!?](?:["')\]]+)?$/;

export const discoveryBriefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: ["object", "null"],
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

export function normalizeBriefSections(input) {
  if (input === undefined) return [...BRIEF_SECTIONS];
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Choose at least one valid brief section");
  }

  const requested = new Set(input);
  if (
    [...requested].some(
      (section) =>
        typeof section !== "string" || !BRIEF_SECTIONS.includes(section),
    )
  ) {
    throw new Error("Choose at least one valid brief section");
  }

  return BRIEF_SECTIONS.filter((section) => requested.has(section));
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

export function validateBrief(
  input,
  transcript,
  sections = BRIEF_SECTIONS,
) {
  const selectedSections = new Set(normalizeBriefSections(sections));
  const knownSources = new Set(
    transcript.map((segment) => segment.sourceId),
  );
  const validSummary = selectedSections.has("summary")
    ? validClaim(input?.summary, knownSources, 3)
    : input?.summary === null;

  if (
    !hasOnlyKeys(input, [
      "summary",
      "signals",
      "followUps",
      "openQuestions",
    ]) ||
    !validSummary ||
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
      selectedSections.has(SIGNAL_SECTION[signal.kind]) &&
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
  const selectedFollowUps =
    selectedSections.has("follow_ups") || input.followUps.length === 0;

  const validQuestions = input.openQuestions.every((question) =>
    validClaim(question, knownSources),
  );
  const selectedQuestions =
    selectedSections.has("open_questions") ||
    input.openQuestions.length === 0;

  if (
    !validSignals ||
    !validFollowUps ||
    !selectedFollowUps ||
    !validQuestions ||
    !selectedQuestions
  ) {
    throw new Error("OpenRouter returned an invalid discovery brief");
  }

  return input;
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function generateBrief(
  config,
  transcript,
  {
    sections = BRIEF_SECTIONS,
    fetchImpl = fetch,
    sleep = wait,
  } = {},
) {
  if (transcript.length === 0) {
    throw new Error("The transcript did not contain any speech");
  }

  const normalizedSections = normalizeBriefSections(sections);
  const selectedSections = normalizedSections.join(", ");
  const unselectedSections = BRIEF_SECTIONS.filter(
    (section) => !normalizedSections.includes(section),
  ).join(", ");

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
          "Within the selected sections, capture explicit pain points, desired outcomes, product requests, and follow-up commitments.",
          "Never invent facts, owners, dates, needs, or requests.",
          "If an owner or due date was not stated, return null.",
          `Populate only these selected brief sections: ${selectedSections}.`,
          unselectedSections
            ? `These sections were not selected and must remain empty: ${unselectedSections}. Return null for an unselected summary, omit unselected signal kinds, and return empty arrays for unselected follow-ups or open questions.`
            : "All brief sections were selected.",
          "Put important missing information in openQuestions only when open_questions is selected.",
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
    return validateBrief(parsed, transcript, normalizedSections);
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

export function briefToMarkdown(
  brief,
  transcript,
  sections = BRIEF_SECTIONS,
) {
  const selectedSections = new Set(normalizeBriefSections(sections));
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

  const markdown = ["# Customer Discovery Brief"];
  if (selectedSections.has("summary")) {
    markdown.push(
      `## Summary\n\n${brief.summary.text} ${references(brief.summary.sourceIds)}`,
    );
  }
  if (selectedSections.has("pain_points")) {
    markdown.push(`## Pain points\n\n${bullets(signals.pain_point)}`);
  }
  if (selectedSections.has("desired_outcomes")) {
    markdown.push(`## Desired outcomes\n\n${bullets(signals.goal)}`);
  }
  if (selectedSections.has("product_requests")) {
    markdown.push(`## Product requests\n\n${bullets(signals.request)}`);
  }
  if (selectedSections.has("follow_ups")) {
    markdown.push(`## Follow-ups\n\n${followUps}`);
  }
  if (selectedSections.has("open_questions")) {
    markdown.push(`## Open questions\n\n${bullets(brief.openQuestions)}`);
  }
  markdown.push(`## Source evidence\n\n${evidence}`);
  return markdown.join("\n\n");
}
