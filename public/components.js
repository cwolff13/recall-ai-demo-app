import { briefSectionItems } from "/shared/domain.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function sectionOption({ key, label, description }) {
  const option = element("div", "section-option");
  const toggle = element("label", "section-option-toggle");
  const input = element("input");
  const descriptionId = `${key.replaceAll("_", "-")}-description`;
  Object.assign(input, {
    type: "checkbox",
    name: "sections",
    value: key,
    checked: true,
  });
  input.setAttribute("aria-describedby", descriptionId);
  toggle.append(input, element("span", "", label));

  const info = element("button", "section-info", "i");
  info.type = "button";
  info.setAttribute("aria-label", `About ${label}`);
  info.setAttribute("aria-describedby", descriptionId);

  const tooltip = element("span", "section-tooltip", description);
  tooltip.id = descriptionId;
  tooltip.role = "tooltip";
  option.append(toggle, info, tooltip);
  return option;
}

export function briefSection({ key, label, targetId }) {
  const section = element("section", "brief-section");
  section.dataset.briefSection = key;
  section.append(element("h3", "", label));
  const content = element("div");
  content.id = targetId;
  section.append(content);
  return section;
}

export function metric(label, value) {
  const node = element("div", "participation-metric");
  node.append(
    element("span", "", label),
    element("strong", "", value),
  );
  return node;
}

export function emptyState() {
  return element("p", "empty-message", "None identified.");
}

export function citation(segment, sourceId, formatTime, seek) {
  const button = element(
    "button",
    "citation",
    segment
      ? `${sourceId} · ${formatTime(segment.startSeconds)}`
      : sourceId,
  );
  button.type = "button";
  button.addEventListener("click", () => {
    if (segment) seek(segment, true);
  });
  return button;
}

export function claim(item, citationFor) {
  const node = element("div", "claim");
  node.append(element("p", "", item.text));
  const citations = element("div", "citations");
  citations.append(...item.sourceIds.map(citationFor));
  node.append(citations);
  return node;
}

export function evidenceItem(segment, formatTime, seek) {
  const item = element("li", "evidence-item");
  item.dataset.evidence = segment.sourceId;
  const button = element(
    "button",
    "evidence-time",
    `${segment.sourceId} · ${formatTime(segment.startSeconds)}`,
  );
  button.type = "button";
  button.addEventListener("click", () => seek(segment));
  item.append(
    button,
    element("strong", "", segment.speaker),
    element("p", "", segment.text),
  );
  return item;
}

export function participantCard(
  participant,
  { attendanceDescription, formatDuration },
) {
  const item = element("article", "participant");
  const heading = element("div", "participant-heading");
  heading.append(element("h3", "", participant.name));
  if (participant.isHost) {
    heading.append(element("span", "host-badge", "Host"));
  }

  const metrics = element("div", "participant-metrics");
  metrics.append(
    metric(
      "Attendance",
      participant.attendanceSeconds === null
        ? "Unavailable"
        : formatDuration(participant.attendanceSeconds),
    ),
    metric("Speaking", formatDuration(participant.speakingSeconds)),
    metric("Speaking share", `${participant.speakingShare}%`),
  );

  const share = Math.min(
    100,
    Math.max(0, Number(participant.speakingShare) || 0),
  );
  const track = element("div", "speaking-track");
  Object.assign(track, {
    role: "progressbar",
    ariaLabel: `${participant.name} speaking share`,
    ariaValueMin: "0",
    ariaValueMax: "100",
    ariaValueNow: String(share),
  });
  const fill = element("span");
  fill.style.width = `${share}%`;
  track.append(fill);

  item.append(
    heading,
    metrics,
    element(
      "p",
      "attendance-timeline",
      attendanceDescription(participant),
    ),
    track,
  );
  return item;
}

export function renderBriefSections(
  container,
  brief,
  definitions,
  selected,
  renderItems,
) {
  for (const definition of definitions) {
    const section = container.querySelector(
      `[data-brief-section="${definition.key}"]`,
    );
    section.hidden = !selected.has(definition.key);
    if (selected.has(definition.key)) {
      renderItems(
        section.querySelector(`#${definition.targetId}`),
        briefSectionItems(brief, definition),
        definition.output === "followUps",
      );
    }
  }
}
