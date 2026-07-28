const form = document.querySelector("#meeting-form");
const meetingUrl = document.querySelector("#meeting-url");
const submitButton = document.querySelector("#submit-button");
const statusCard = document.querySelector("#status-card");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const result = document.querySelector("#result");
const recording = document.querySelector("#recording");
const copyButton = document.querySelector("#copy-button");
const evidenceList = document.querySelector("#evidence-list");

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
    "Brief ready",
    "Review each claim against its source evidence.",
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

function formatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
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
  const brief = session.brief;
  if (!brief) return;

  document
    .querySelector("#summary")
    .replaceChildren(claimNode(brief.summary.text, brief.summary.sourceIds));
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
  statusDetail.textContent =
    session.stage === "failed" && session.error ? session.error : detail;

  statusCard.dataset.stage = session.stage;
  statusDot.dataset.stage = session.stage;
  const isActive = activeStages.has(session.stage);
  meetingUrl.disabled = isActive;
  submitButton.disabled = isActive;
  submitButton.textContent = isActive ? "Bot active" : "Send bot";

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
  recordingLoaded = false;
  result.hidden = true;
  renderSession({ stage: "sending" });

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingUrl: meetingUrl.value }),
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
