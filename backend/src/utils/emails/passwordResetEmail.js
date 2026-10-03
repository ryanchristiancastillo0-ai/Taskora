const {
  layout,
  paragraph,
  codeBlock,
  notice,
} = require("./layout");

const EXPIRY_MINUTES = 10;

/**
 * The two password-code emails are the same message with different framing, so
 * they share one template and differ only by variant:
 *
 *   "forgot"  -> nobody is signed in; someone typed this address into
 *                Forgot Password and is proving they own it.
 *   "confirm" -> the user is signed in and asked to change their password.
 *
 * Anything else falls back to "forgot", which is the safer wording: it tells the
 * reader that no action was taken rather than implying a session change.
 */
const VARIANTS = {
  forgot: {
    subject: "Your Taskora password reset code",
    title: "Reset your password",
    preheader: "Use this code in Taskora to choose a new password.",
    intro:
      "We received a request to reset your Taskora password. Enter this code in the app to choose a new one.",
    expiry: `The code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`,
    warning:
      "Did not request this? Ignore this email and your current password will stay unchanged.",
    warningTone: "neutral",
    footer: `For your security this code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`,
    textLead: "We received a request to reset your Taskora password.",
    textWarning:
      "If you did not request a password reset, you can ignore this email and your password will stay unchanged.",
  },
  confirm: {
    subject: "Confirm your new Taskora password",
    title: "Confirm your new password",
    preheader: "Use this code in Taskora to confirm the change.",
    intro:
      "You are signed in and asked to change the password on your Taskora account. Enter this code to confirm it is you.",
    expiry: `The code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`,
    warning:
      "If you did not request this, do not share the code. Change your password right away and review your active sessions.",
    warningTone: "danger",
    footer: `For your security this code expires in ${EXPIRY_MINUTES} minutes and can only be used once.`,
    textLead: "You are signed in and asked to change your Taskora password.",
    textWarning:
      "If this was not you, change your password immediately and review your account.",
  },
};

function passwordResetEmail({ code, variant = "forgot" }) {
  const copy = VARIANTS[variant] || VARIANTS.forgot;

  const text = [
    copy.textLead,
    "",
    `Your verification code is: ${code}`,
    "",
    `It expires in ${EXPIRY_MINUTES} minutes.`,
    copy.textWarning,
  ].join("\n");

  const html = layout({
    title: copy.title,
    preheader: copy.preheader,
    footerText: copy.footer,
    bodyHtml: [
      paragraph(copy.intro),
      codeBlock(code),
      paragraph(copy.expiry),
      notice(copy.warning, copy.warningTone),
    ].join(""),
  });

  return { subject: copy.subject, text, html };
}

module.exports = { passwordResetEmail, PASSWORD_CODE_EXPIRY_MINUTES: EXPIRY_MINUTES };
