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
const defaultSections = sectionInputs.map((input) => input.value);
const defaultBotName = "Discovery Notes Bot";
const maxBotImageBytes = 1_300_000;

const stageCopy = {
  idle: ["Ready for a meeting", "Paste a supported meeting URL to begin."],
  sending: ["Sending the bot", "Recall is scheduling the meeting bot."],
  joining: [
    "Bot is joining",
    "Admit Discovery Notes Bot if the meeting uses a waiting room.",
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

const activeStages = new Set([
  "sending",
  "joining",
  "waiting",
  "recording",
  "processing",
  "transcribing",
  "generating",
]);

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

  if (file.size > maxBotImageBytes) {
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
    Array.isArray(sections) ? sections : defaultSections,
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

function formatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
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

function participationMetric(label, value) {
  const metric = document.createElement("div");
  metric.className = "participation-metric";

  const metricLabel = document.createElement("span");
  metricLabel.textContent = label;
  const metricValue = document.createElement("strong");
  metricValue.textContent = value;

  metric.append(metricLabel, metricValue);
  return metric;
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

function participantNode(participant) {
  const item = document.createElement("article");
  item.className = "participant";

  const heading = document.createElement("div");
  heading.className = "participant-heading";
  const name = document.createElement("h3");
  name.textContent = participant.name;
  heading.append(name);

  if (participant.isHost) {
    const host = document.createElement("span");
    host.className = "host-badge";
    host.textContent = "Host";
    heading.append(host);
  }

  const metrics = document.createElement("div");
  metrics.className = "participant-metrics";
  metrics.append(
    participationMetric(
      "Attendance",
      participant.attendanceSeconds === null
        ? "Unavailable"
        : formatDuration(participant.attendanceSeconds),
    ),
    participationMetric(
      "Speaking",
      formatDuration(participant.speakingSeconds),
    ),
    participationMetric(
      "Speaking share",
      `${participant.speakingShare}%`,
    ),
  );

  const attendance = document.createElement("p");
  attendance.className = "attendance-timeline";
  attendance.textContent = attendanceDescription(participant);

  const share = Math.min(
    100,
    Math.max(0, Number(participant.speakingShare) || 0),
  );
  const track = document.createElement("div");
  track.className = "speaking-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute(
    "aria-label",
    `${participant.name} speaking share`,
  );
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(share));
  const fill = document.createElement("span");
  fill.style.width = `${share}%`;
  track.append(fill);

  item.append(heading, metrics, attendance, track);
  return item;
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
    participationMetric(
      "Recorded duration",
      formatDuration(participation.durationSeconds),
    ),
    participationMetric(
      "Attendees",
      String(participation.participantCount ?? participants.length),
    ),
    participationMetric(
      "Captured speaking",
      formatDuration(participation.totalSpeakingSeconds),
    ),
  );
  participants.forEach((participant) =>
    participantList.append(participantNode(participant)),
  );

  participationNote.hidden = false;
  participationPanel.hidden = false;
}

function emptyMessage() {
  const message = document.createElement("p");
  message.className = "empty-message";
  message.textContent = "None identified.";
  return message;
}

function citationButton(sourceId) {
  const segment = currentTranscript.find(
    (candidate) => candidate.sourceId === sourceId,
  );
  const button = document.createElement("button");
  button.type = "button";
  button.className = "citation";
  button.textContent = segment
    ? `${sourceId} · ${formatTime(segment.startSeconds)}`
    : sourceId;
  button.addEventListener("click", () => {
    if (!segment) return;
    recording.currentTime = segment.startSeconds;
    recording.play().catch(() => {});
    document
      .querySelector(`[data-evidence="${sourceId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return button;
}

function claimNode(text, sourceIds) {
  const wrapper = document.createElement("div");
  wrapper.className = "claim";
  const copy = document.createElement("p");
  copy.textContent = text;
  wrapper.append(copy);

  const citations = document.createElement("div");
  citations.className = "citations";
  sourceIds.forEach((sourceId) =>
    citations.append(citationButton(sourceId)),
  );
  wrapper.append(citations);
  return wrapper;
}

function renderClaims(targetId, claims) {
  const target = document.querySelector(targetId);
  target.replaceChildren();
  if (claims.length === 0) {
    target.append(emptyMessage());
    return;
  }
  claims.forEach((claim) =>
    target.append(claimNode(claim.text, claim.sourceIds)),
  );
}

function renderFollowUps(items) {
  const target = document.querySelector("#follow-ups");
  target.replaceChildren();
  if (items.length === 0) {
    target.append(emptyMessage());
    return;
  }

  items.forEach((item) => {
    const owner = item.owner ?? "Unassigned";
    const dueDate = item.dueDate ? ` · Due ${item.dueDate}` : "";
    target.append(
      claimNode(`${owner}: ${item.action}${dueDate}`, item.sourceIds),
    );
  });
}

function renderEvidence(transcript) {
  evidenceList.replaceChildren();
  transcript.forEach((segment) => {
    const item = document.createElement("li");
    item.className = "evidence-item";
    item.dataset.evidence = segment.sourceId;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "evidence-time";
    button.textContent = `${segment.sourceId} · ${formatTime(segment.startSeconds)}`;
    button.addEventListener("click", () => {
      recording.currentTime = segment.startSeconds;
      recording.play().catch(() => {});
    });

    const speaker = document.createElement("strong");
    speaker.textContent = segment.speaker;
    const text = document.createElement("p");
    text.textContent = segment.text;

    item.append(button, speaker, text);
    evidenceList.append(item);
  });
}

function renderBrief(session) {
  currentTranscript = session.transcript ?? [];
  currentMarkdown = session.markdown ?? "";
  renderMeetingParticipation(session);
  const brief = session.brief;
  if (!brief) return;
  const selected = new Set(session.sections ?? defaultSections);

  document
    .querySelectorAll("[data-brief-section]")
    .forEach((section) => {
      section.hidden = !selected.has(section.dataset.briefSection);
    });

  if (selected.has("summary") && brief.summary) {
    document
      .querySelector("#summary")
      .replaceChildren(
        claimNode(brief.summary.text, brief.summary.sourceIds),
      );
  }
  renderClaims(
    "#pain-points",
    brief.signals.filter((signal) => signal.kind === "pain_point"),
  );
  renderClaims(
    "#goals",
    brief.signals.filter((signal) => signal.kind === "goal"),
  );
  renderClaims(
    "#requests",
    brief.signals.filter((signal) => signal.kind === "request"),
  );
  renderFollowUps(brief.followUps);
  renderClaims("#open-questions", brief.openQuestions);
  customBriefSection.hidden = !session.customSection;
  if (session.customSection) {
    customBriefHeading.textContent = session.customSection.name;
    renderClaims("#custom-brief-items", brief.customItems ?? []);
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
    session.botName || botNameInput.value.trim() || defaultBotName;
  statusDetail.textContent =
    session.stage === "failed" && session.error
      ? session.error
      : session.stage === "joining"
        ? `Admit ${activeBotName} if the meeting uses a waiting room.`
        : detail;

  statusCard.dataset.stage = session.stage;
  statusDot.dataset.stage = session.stage;
  const isActive = activeStages.has(session.stage);
  meetingUrl.disabled = isActive;
  submitButton.disabled = isActive;
  botNameInput.disabled = isActive;
  botImageInput.disabled = isActive;
  removeBotImage.disabled = isActive;
  botCustomization.classList.toggle("is-disabled", isActive);
  sectionSelector.disabled = isActive;
  customSectionSelector.disabled = isActive;
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
  const botName = botNameInput.value.trim() || defaultBotName;
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
