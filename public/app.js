import {
  ACTIVE_STAGES,
  BRIEF_SECTION_DEFINITIONS,
  BRIEF_SECTIONS,
  DEFAULT_BOT_NAME,
  MAX_BOT_IMAGE_BYTES,
  MAX_BOT_NAME_LENGTH,
  MAX_CUSTOM_SECTION_GUIDANCE_LENGTH,
  MAX_CUSTOM_SECTION_NAME_LENGTH,
  formatTimestamp,
} from "/shared/domain.js";
import {
  briefSection,
  citation,
  claim,
  emptyState,
  evidenceItem,
  metric,
  participantCard,
  renderBriefSections,
  sectionOption,
} from "./components.js";

const form = document.querySelector("#meeting-form");
const meetingUrl = document.querySelector("#meeting-url");
const submitButton = document.querySelector("#submit-button");
const botCustomization = document.querySelector("#bot-customization");
const botNameInput = document.querySelector("#bot-name");
const botImageInput = document.querySelector("#bot-image");
const botImageName = document.querySelector("#bot-image-name");
const botImagePreview = document.querySelector("#bot-image-preview");
const botImagePreviewImage = document.querySelector(
  "#bot-image-preview-image",
);
const botImageError = document.querySelector("#bot-image-error");
const removeBotImage = document.querySelector("#remove-bot-image");
const sectionSelector = document.querySelector("#section-selector");
const sectionOptions = document.querySelector("#section-options");
const briefColumn = document.querySelector("#brief-column");
sectionOptions.append(...BRIEF_SECTION_DEFINITIONS.map(sectionOption));
briefColumn.prepend(...BRIEF_SECTION_DEFINITIONS.map(briefSection));
const sectionInputs = [
  ...document.querySelectorAll('input[name="sections"]'),
];
const sectionError = document.querySelector("#section-error");
const customSectionSelector = document.querySelector(
  "#custom-section-selector",
);
const customSectionEnabled = document.querySelector(
  "#custom-section-enabled",
);
const customSectionFields = document.querySelector(
  "#custom-section-fields",
);
const customSectionName = document.querySelector("#custom-section-name");
const customSectionGuidance = document.querySelector(
  "#custom-section-guidance",
);
botNameInput.value = DEFAULT_BOT_NAME;
botNameInput.maxLength = MAX_BOT_NAME_LENGTH;
customSectionName.maxLength = MAX_CUSTOM_SECTION_NAME_LENGTH;
customSectionGuidance.maxLength = MAX_CUSTOM_SECTION_GUIDANCE_LENGTH;
const statusCard = document.querySelector("#status-card");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const result = document.querySelector("#result");
const participationPanel = document.querySelector("#participation-panel");
const participationSummary = document.querySelector(
  "#participation-summary",
);
const participantList = document.querySelector("#participant-list");
const participationNote = document.querySelector(".participation-note");
const participationUnavailable = document.querySelector(
  "#participation-unavailable",
);
const recording = document.querySelector("#recording");
const copyButton = document.querySelector("#copy-button");
const evidenceList = document.querySelector("#evidence-list");
const customBriefSection = document.querySelector(
  "#custom-brief-section",
);
const customBriefHeading = document.querySelector(
  "#custom-brief-heading",
);
const lockableControls = [
  meetingUrl,
  submitButton,
  botNameInput,
  botImageInput,
  removeBotImage,
  sectionSelector,
  customSectionSelector,
];

const stageCopy = {
  idle: ["Ready for a meeting", "Paste a supported meeting URL to begin."],
  sending: ["Sending the bot", "Recall is scheduling the meeting bot."],
  joining: [
    "Bot is joining",
    "Admit the bot if the meeting uses a waiting room.",
  ],
  waiting: [
    "Waiting for admission",
    "The bot is in the meeting waiting room.",
  ],
  recording: [
    "Interview in progress",
    "Recall is recording the conversation.",
  ],
  processing: [
    "Processing the recording",
    "The call ended and Recall is preparing the media.",
  ],
  transcribing: [
    "Creating the transcript",
    "Recall is generating the post-meeting transcript.",
  ],
  generating: [
    "Building the brief",
    "The source-linked customer signals are being organized.",
  ],
  complete: [
    "Your brief is ready",
    "Review the generated notes against their source evidence.",
  ],
  failed: [
    "Processing stopped",
    "Review the error below, then try a new meeting.",
  ],
};

let currentTranscript = [];
let currentMarkdown = "";
let recordingLoaded = false;
let selectionSynchronized = false;
let identitySynchronized = false;
let currentBotImage = null;
let botImageRead = Promise.resolve();

function showBotImageError(message = "") {
  botImageError.textContent = message;
  botImageError.hidden = !message;
}

function clearBotImage() {
  currentBotImage = null;
  botImageInput.value = "";
  botImageName.textContent = "No image selected";
  botImagePreviewImage.removeAttribute("src");
  botImagePreview.hidden = true;
  showBotImageError();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function loadBotImage(file) {
  currentBotImage = null;
  botImagePreview.hidden = true;
  showBotImageError();

  if (!file) {
    clearBotImage();
    return;
  }

  if (file.type !== "image/jpeg") {
    clearBotImage();
    showBotImageError("Choose a JPEG image.");
    return;
  }

  if (file.size > MAX_BOT_IMAGE_BYTES) {
    clearBotImage();
    showBotImageError("Choose a JPEG no larger than 1.3 MB.");
    return;
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    if (
      botImageInput.files?.[0] !== file ||
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith("data:image/jpeg;base64,")
    ) {
      return;
    }

    currentBotImage = dataUrl.slice(dataUrl.indexOf(",") + 1);
    botImageName.textContent = file.name;
    botImagePreviewImage.src = dataUrl;
    botImagePreview.hidden = false;
  } catch {
    clearBotImage();
    showBotImageError("The JPEG could not be read.");
  }
}

function selectedSections() {
  return sectionInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function customSectionValue() {
  if (!customSectionEnabled.checked) return null;
  return {
    name: customSectionName.value.trim(),
    guidance: customSectionGuidance.value.trim(),
  };
}

function updateCustomSectionControls() {
  const enabled = customSectionEnabled.checked;
  const locked = customSectionSelector.disabled;
  customSectionFields.hidden = !enabled;
  customSectionName.disabled = !enabled || locked;
  customSectionGuidance.disabled = !enabled || locked;
  customSectionEnabled.setAttribute("aria-expanded", String(enabled));
}

function synchronizeCustomSection(customSection) {
  const enabled =
    customSection &&
    typeof customSection.name === "string" &&
    typeof customSection.guidance === "string";
  customSectionEnabled.checked = Boolean(enabled);
  customSectionName.value = enabled ? customSection.name : "";
  customSectionGuidance.value = enabled ? customSection.guidance : "";
  updateCustomSectionControls();
}

function synchronizeSections(sections) {
  const selected = new Set(
    Array.isArray(sections) ? sections : BRIEF_SECTIONS,
  );
  sectionInputs.forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function validateSectionSelection() {
  const valid =
    selectedSections().length > 0 || customSectionEnabled.checked;
  sectionError.hidden = valid;
  sectionSelector.setAttribute("aria-invalid", String(!valid));
  return valid;
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "Unavailable";
  }

  const wholeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainder,
    ).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function attendanceDescription(participant) {
  if (participant.attendanceSeconds === null) {
    return "Join and leave timing unavailable";
  }

  const intervals = Array.isArray(participant.attendanceIntervals)
    ? participant.attendanceIntervals
    : [];
  if (intervals.length === 0) return "No attendance interval captured";

  const windows = intervals
    .map(
      (interval) =>
        `${formatDuration(interval.startSeconds)}–${formatDuration(
          interval.endSeconds,
        )}`,
    )
    .join(" · ");
  return `Present: ${windows}`;
}

function renderMeetingParticipation(session) {
  participationSummary.replaceChildren();
  participantList.replaceChildren();
  participationUnavailable.hidden = true;
  participationNote.hidden = true;

  const participation = session.meetingParticipation;
  if (!participation) {
    participationPanel.hidden =
      !session.meetingParticipationUnavailable;
    participationUnavailable.hidden =
      !session.meetingParticipationUnavailable;
    return;
  }

  const participants = Array.isArray(participation.participants)
    ? participation.participants
    : [];
  participationSummary.append(
    metric(
      "Recorded duration",
      formatDuration(participation.durationSeconds),
    ),
    metric(
      "Attendees",
      String(participation.participantCount ?? participants.length),
    ),
    metric(
      "Captured speaking",
      formatDuration(participation.totalSpeakingSeconds),
    ),
  );
  participants.forEach((participant) =>
    participantList.append(
      participantCard(participant, {
        attendanceDescription,
        formatDuration,
      }),
    ),
  );

  participationNote.hidden = false;
  participationPanel.hidden = false;
}

function citationFor(sourceId) {
  const segment = currentTranscript.find(
    (candidate) => candidate.sourceId === sourceId,
  );
  return citation(segment, sourceId, formatTimestamp, seekRecording);
}

function seekRecording(segment, revealEvidence = false) {
  recording.currentTime = segment.startSeconds;
  recording.play().catch(() => {});
  if (revealEvidence) {
    document
      .querySelector(`[data-evidence="${segment.sourceId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderCollection(target, items, nodeForItem) {
  target.replaceChildren(
    ...(items.length ? items.map(nodeForItem) : [emptyState()]),
  );
}

function renderItems(target, items, followUps = false) {
  renderCollection(target, items, (item) =>
    claim(
      followUps
        ? {
            ...item,
            text: `${item.owner ?? "Unassigned"}: ${item.action}${
              item.dueDate ? ` · Due ${item.dueDate}` : ""
            }`,
          }
        : item,
      citationFor,
    ),
  );
}

function renderEvidence(transcript) {
  evidenceList.replaceChildren(
    ...transcript.map((segment) =>
      evidenceItem(segment, formatTimestamp, seekRecording),
    ),
  );
}

function renderBrief(session) {
  currentTranscript = session.transcript ?? [];
  currentMarkdown = session.markdown ?? "";
  renderMeetingParticipation(session);
  const brief = session.brief;
  if (!brief) return;
  renderBriefSections(
    briefColumn,
    brief,
    BRIEF_SECTION_DEFINITIONS,
    new Set(session.sections ?? BRIEF_SECTIONS),
    renderItems,
  );
  customBriefSection.hidden = !session.customSection;
  if (session.customSection) {
    customBriefHeading.textContent = session.customSection.name;
    renderItems(
      document.querySelector("#custom-brief-items"),
      brief.customItems ?? [],
    );
  }
  renderEvidence(currentTranscript);

  if (session.hasRecording && !recordingLoaded) {
    recording.src = `/api/recording?session=${Date.now()}`;
    recordingLoaded = true;
  }
  result.hidden = false;
}

function renderSession(session) {
  const [title, detail] = stageCopy[session.stage] ?? stageCopy.idle;
  statusTitle.textContent = title;
  const activeBotName =
    session.botName || botNameInput.value.trim() || DEFAULT_BOT_NAME;
  statusDetail.textContent =
    session.stage === "failed" && session.error
      ? session.error
      : session.stage === "joining"
        ? `Admit ${activeBotName} if the meeting uses a waiting room.`
        : detail;

  statusCard.dataset.stage = session.stage;
  statusDot.dataset.stage = session.stage;
  const isActive = ACTIVE_STAGES.has(session.stage);
  lockableControls.forEach((control) => {
    control.disabled = isActive;
  });
  botCustomization.classList.toggle("is-disabled", isActive);
  updateCustomSectionControls();
  submitButton.textContent = isActive ? "Bot active" : "Send bot";

  if (
    !identitySynchronized &&
    session.stage !== "idle" &&
    typeof session.botName === "string"
  ) {
    botNameInput.value = session.botName;
    identitySynchronized = true;
  }

  if (
    !selectionSynchronized &&
    session.stage !== "idle" &&
    Array.isArray(session.sections)
  ) {
    synchronizeSections(session.sections);
    synchronizeCustomSection(session.customSection);
    selectionSynchronized = true;
  }

  if (session.stage === "complete") {
    renderBrief(session);
  } else if (session.stage !== "failed") {
    result.hidden = true;
  }
}

async function refreshSession() {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) return;
    renderSession(await response.json());
  } catch {
    statusTitle.textContent = "Server unavailable";
    statusDetail.textContent = "Reconnect to the local demo server.";
    statusCard.dataset.stage = "failed";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await botImageRead;
  if (!validateSectionSelection()) {
    sectionInputs[0]?.focus();
    return;
  }

  const sections = selectedSections();
  const customSection = customSectionValue();
  const botName = botNameInput.value.trim() || DEFAULT_BOT_NAME;
  botNameInput.value = botName;
  selectionSynchronized = true;
  identitySynchronized = true;
  recordingLoaded = false;
  result.hidden = true;
  renderSession({ stage: "sending", botName });

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingUrl: meetingUrl.value,
        sections,
        customSection,
        botName,
        botImage: currentBotImage,
      }),
    });
    const session = await response.json();
    if (!response.ok && !session.stage) {
      renderSession({ stage: "failed", error: session.error });
      return;
    }
    renderSession(session);
  } catch {
    renderSession({
      stage: "failed",
      error: "The local server could not start the meeting.",
    });
  }
});

sectionInputs.forEach((input) => {
  input.addEventListener("change", validateSectionSelection);
});

customSectionEnabled.addEventListener("change", () => {
  updateCustomSectionControls();
  validateSectionSelection();
  if (customSectionEnabled.checked) customSectionName.focus();
});

botImageInput.addEventListener("change", () => {
  botImageRead = loadBotImage(botImageInput.files?.[0]);
});

removeBotImage.addEventListener("click", clearBotImage);

copyButton.addEventListener("click", async () => {
  if (!currentMarkdown) return;
  await navigator.clipboard.writeText(currentMarkdown);
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = "Copy Markdown";
  }, 1500);
});

refreshSession();
setInterval(refreshSession, 2000);
