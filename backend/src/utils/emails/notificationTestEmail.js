const {
  layout,
  paragraph,
  actionButton,
  detailList,
} = require("./layout");

/**
 * The email sent from Settings -> Notifications -> "Send test email".
 *
 * This exists because "Email notifications" is the one switch in the product
 * whose effect cannot be observed from inside the app: turning it on produces no
 * visible change until some other feature happens to raise a notification, which
 * is exactly why a correct configuration reads as a broken one.
 *
 * It deliberately renders through the same `layout` and the same `send()` call
 * as every real notification. A test mail that took a shortcut through, say, a
 * different transport would prove the shortcut worked, not the product.
 */
function notificationTestEmail({ email, sentAt = null, enabledTypes = [] }) {
  const when = sentAt
    ? new Date(sentAt).toUTCString()
    : new Date().toUTCString();

  const text = [
    "Taskora email notifications are working",
    "",
    `Sent to ${email} at ${when}.`,
    "",
    "If this arrived, Taskora can reach your inbox. Real notifications will arrive",
    "here too, but only for the categories you have switched on.",
    "",
    "Turn email notifications off in Settings at any time.",
  ].join("\n");

  const html = layout({
    title: "Email notifications are working",
    preheader: `Taskora can deliver email to ${email}.`,
    footerText: "Turn off email notifications in Settings at any time.",
    bodyHtml: [
      paragraph(
        "This is a test message from Taskora. If you are reading it, your inbox is connected and real notifications will arrive here."
      ),
      detailList([
        { label: "Sent to", value: email },
        { label: "Sent at", value: when },
        {
          label: "Email categories on",
          value:
            enabledTypes.length > 0 ? enabledTypes.join(", ") : "Email notifications only",
        },
      ]),
      actionButton({ url: null, label: "Open Taskora" }),
      paragraph("No action is needed. You can close this message."),
    ].join(""),
  });

  return { subject: "Taskora email notifications are working", text, html };
}

module.exports = { notificationTestEmail };