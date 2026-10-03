const {
  layout,
  paragraph,
  actionButton,
  detailList,
} = require("./layout");

/**
 * Notification email. Driven entirely by the rows NotificationService already
 * creates, so no new notification behaviour is introduced here: title becomes
 * the subject and heading, message becomes the preheader and lead paragraph.
 *
 * `actionUrl` / `actionLabel` are optional. Nothing passes them today, but the
 * template accepts them so a future notification type can link straight to the
 * task or conversation it is about without touching this file again.
 *
 * `details` is an optional [{ label, value }] list for the task/project context
 * a notification already has available.
 */
function notificationEmail({
  title,
  message,
  type,
  actionUrl = null,
  actionLabel = "Open Taskora",
  details = [],
}) {
  const typeLabel = type
    ? ` (${String(type).replace(/_/g, " ").toLowerCase()})`
    : "";

  const text = [
    `Taskora notification${typeLabel}: ${title}`,
    "",
    message,
    ...(actionUrl ? ["", `Open Taskora: ${actionUrl}`] : []),
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const html = layout({
    title,
    preheader: message,
    footerText: "Turn off email notifications in Settings at any time.",
    bodyHtml: [
      paragraph(message),
      detailList(details),
      actionButton({ url: actionUrl, label: actionLabel }),
      // Only meaningful when there is no deep link to send them to.
      actionUrl ? "" : paragraph("Open Taskora to see the full details."),
    ].join(""),
  });

  return { subject: title, text, html };
}

module.exports = { notificationEmail };
