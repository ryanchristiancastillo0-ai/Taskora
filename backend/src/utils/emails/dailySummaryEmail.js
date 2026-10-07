const {
  layout,
  paragraph,
  actionButton,
  BRAND,
  escapeHtml,
} = require("./layout");

// Web-safe map of the TaskPriority enum, duplicated here so the email never
// depends on a client-side label arriving over the wire.
const PRIORITY_LABELS = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function priorityLabel(value) {
  return value ? PRIORITY_LABELS[value] || value : "";
}

// Between where the mail opens and a button, a bare <ul> is the one list style
// every client agrees on. Rows carry title + (priority • formatted time).
function taskRows(items, accent) {
  const rows = items
    .map(
      (item) => `<tr>
<td style="padding:8px 0 0;font-size:14px;line-height:20px;color:${BRAND.ink};">${escapeHtml(item.title)}</td>
<td style="padding:8px 0 0 12px;font-size:12px;color:${BRAND.inkMuted};text-align:right;white-space:nowrap;vertical-align:top;">${[
        priorityLabel(item.priority),
        item.time,
      ]
        .filter(Boolean)
        .join(" &bull; ")}</td>
</tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 4px;border-left:3px solid ${accent};">
${rows}
</table>`;
}

function sectionLabel(text, count, accent) {
  return `<p style="margin:18px 0 4px;font-size:12px;font-weight:700;color:${accent};letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(text)} &middot; ${count}</p>`;
}

/**
 * The daily recap email. Owns no data and no timezone math: the service hands it
 * fully-formatted sections (titles, priority enums, already-local time strings)
 * so the template stays a pure renderer like every other mail in this folder.
 */
function dailySummaryEmail({
  firstName,
  dateLabel,
  overdue = [],
  dueToday = [],
  upcoming = [],
  completedYesterdayCount = 0,
}) {
  const subject = `Your Taskora summary — ${dateLabel}`;
  const greeting = `Good morning${firstName ? `, ${firstName}` : ""}! Here is what is ahead of you for ${dateLabel}.`;

  const parts = [];

  if (overdue.length > 0) {
    parts.push(sectionLabel("Overdue", overdue.length, BRAND.danger));
    parts.push(taskRows(overdue, BRAND.danger));
  }
  if (dueToday.length > 0) {
    parts.push(sectionLabel("Due today", dueToday.length, BRAND.primary));
    parts.push(taskRows(dueToday, BRAND.primary));
  }
  if (upcoming.length > 0) {
    parts.push(sectionLabel("Coming up this week", upcoming.length, BRAND.inkSoft));
    parts.push(taskRows(upcoming, BRAND.inkMuted));
  }

  const totals = [
    overdue.length ? `${overdue.length} overdue` : null,
    dueToday.length ? `${dueToday.length} due today` : null,
    upcoming.length ? `${upcoming.length} coming up this week` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const preheader = totals
    ? `${totals}.`
    : "Nothing is due and nothing is overdue.";

  if (completedYesterdayCount > 0) {
    parts.push(
      paragraph(
        `You completed ${completedYesterdayCount} ${
          completedYesterdayCount === 1 ? "task" : "tasks"
        } yesterday. Nice work.`
      )
    );
  }

  // A genuinely quiet day is worth saying so — one line, not four empty headers.
  const bodyHtml = (
    parts.length > 0
      ? parts
      : [paragraph("Nothing is due today and nothing is overdue. Enjoy the calm — you are all caught up.")]
  ).join("");

  const appUrl = process.env.CORS_ORIGIN || "http://localhost:5173";

  const text = [
    greeting,
    "",
    ...(overdue.length
      ? [`OVERDUE (${overdue.length})`, ...overdue.map((item) => `- ${item.title}${item.priority ? ` (${priorityLabel(item.priority)})` : ""}${item.time ? ` — ${item.time}` : ""}`), ""]
      : []),
    ...(dueToday.length
      ? [`DUE TODAY (${dueToday.length})`, ...dueToday.map((item) => `- ${item.title}${item.priority ? ` (${priorityLabel(item.priority)})` : ""}${item.time ? ` — ${item.time}` : ""}`), ""]
      : []),
    ...(upcoming.length
      ? [`COMING UP THIS WEEK (${upcoming.length})`, ...upcoming.map((item) => `- ${item.title}${item.time ? ` — ${item.time}` : ""}`), ""]
      : []),
    completedYesterdayCount
      ? `You completed ${completedYesterdayCount} ${completedYesterdayCount === 1 ? "task" : "tasks"} yesterday. Nice work.`
      : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();

  const html = layout({
    title: subject,
    preheader,
    footerText:
      "You are receiving this because the Daily summary is turned on. Change email preferences in Taskora Settings at any time.",
    bodyHtml: [
      paragraph(greeting),
      bodyHtml,
      actionButton({ url: appUrl, label: "Open Taskora" }),
    ].join(""),
  });

  return { subject, text, html };
}

module.exports = { dailySummaryEmail };