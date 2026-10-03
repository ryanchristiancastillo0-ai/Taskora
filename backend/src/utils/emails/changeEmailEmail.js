const {
  layout,
  paragraph,
  codeBlock,
  notice,
  detailList,
} = require("./layout");

const EXPIRY_MINUTES = 10;

/**
 * Confirms a change of the account email address.
 *
 * The code is sent to the NEW address, not the current one, so completing the
 * flow proves the requester controls the mailbox they are switching to. The old
 * address is shown as context so a typo in the new one is obvious before the
 * code is typed.
 */
function changeEmailEmail({ code, newEmail, currentEmail }) {
  const text = [
    "Use this code to confirm your new Taskora email address.",
    "",
    `New email: ${newEmail}`,
    `Your verification code is: ${code}`,
    "",
    `It expires in ${EXPIRY_MINUTES} minutes.`,
    "If you did not request this, ignore this email. Your current address stays unchanged and no code was needed to keep it.",
  ].join("\n");

  const html = layout({
    title: "Confirm your new email",
    preheader: "Enter this code in Taskora to finish changing your email address.",
    footerText: `This code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`,
    bodyHtml: [
      paragraph(
        "Confirm this change to move your Taskora account to a new email address. Once confirmed, sign-in codes and password resets go to the new address."
      ),
      detailList([
        { label: "New email", value: newEmail },
        currentEmail ? { label: "Current email", value: currentEmail } : null,
      ]),
      paragraph("Your verification code:"),
      codeBlock(code),
      paragraph(
        `The code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`
      ),
      notice(
        "Did not request this? Ignore this email. Your current email address stays unchanged.",
        "warning"
      ),
    ].join(""),
  });

  return {
    subject: "Confirm your new Taskora email",
    text,
    html,
  };
}

module.exports = { changeEmailEmail, EMAIL_CHANGE_EXPIRY_MINUTES: EXPIRY_MINUTES };
