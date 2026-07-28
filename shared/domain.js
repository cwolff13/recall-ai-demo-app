export const DEFAULT_BOT_NAME = "Discovery Notes Bot";
export const MAX_BOT_NAME_LENGTH = 100;
export const MAX_BOT_IMAGE_BYTES = 1_300_000;
export const MAX_CUSTOM_SECTION_NAME_LENGTH = 60;
export const MAX_CUSTOM_SECTION_GUIDANCE_LENGTH = 500;

export const ACTIVE_STAGES = new Set([
  "sending",
  "joining",
  "waiting",
  "recording",
  "processing",
  "transcribing",
  "generating",
]);

export const BRIEF_SECTION_DEFINITIONS = Object.freeze([
  {
    key: "summary",
    label: "Summary",
    description:
      "A concise overview of the meeting’s key context and takeaways.",
    field: "summary",
    output: "summary",
    targetId: "summary",
  },
  {
    key: "pain_points",
    label: "Pain points",
    description:
      "Problems, frustrations, or blockers explicitly described.",
    field: "signals",
    output: "claims",
    signalKind: "pain_point",
    targetId: "pain-points",
  },
  {
    key: "desired_outcomes",
    label: "Desired outcomes",
    description: "Results participants want to achieve or improve.",
    field: "signals",
    output: "claims",
    signalKind: "goal",
    targetId: "goals",
  },
  {
    key: "product_requests",
    label: "Product requests",
    description:
      "Explicit requests for features, capabilities, or changes.",
    field: "signals",
    output: "claims",
    signalKind: "request",
    targetId: "requests",
  },
  {
    key: "follow_ups",
    label: "Follow-ups",
    description:
      "Stated next steps, including owners and dates only when given.",
    field: "followUps",
    output: "followUps",
    targetId: "follow-ups",
  },
  {
    key: "open_questions",
    label: "Open questions",
    description:
      "Important unknowns or missing information revealed by the discussion.",
    field: "openQuestions",
    output: "claims",
    targetId: "open-questions",
  },
]);

export const BRIEF_SECTIONS = Object.freeze(
  BRIEF_SECTION_DEFINITIONS.map(({ key }) => key),
);

export const SIGNAL_SECTIONS = Object.fromEntries(
  BRIEF_SECTION_DEFINITIONS.filter(({ signalKind }) => signalKind).map(
    ({ key, signalKind }) => [signalKind, key],
  ),
);

export function briefSectionItems(brief, definition) {
  const value = brief?.[definition.field];
  if (definition.output === "summary") return value ? [value] : [];
  const items = Array.isArray(value) ? value : [];
  return definition.signalKind
    ? items.filter(({ kind }) => kind === definition.signalKind)
    : items;
}

export function nonNegativeSeconds(value, fallback = null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function formatTimestamp(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
