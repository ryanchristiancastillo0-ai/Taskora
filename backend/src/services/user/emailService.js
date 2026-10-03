const AppError = require("../../utils/AppError.js");
const { passwordResetEmail } = require("../../utils/emails/passwordResetEmail.js");
const { notificationEmail } = require("../../utils/emails/notificationEmail.js");
const { notificationTestEmail } = require("../../utils/emails/notificationTestEmail.js");
const { changeEmailEmail } = require("../../utils/emails/changeEmailEmail.js");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10000;

/**
 * The single delivery path for Taskora mail.
 *
 * This class owns transport only: configuration, the Brevo request, and error
 * mapping. Every byte of email content comes from a template in
 * src/utils/emails, so callers never pass HTML and never learn how mail leaves
 * the server. Adding a new email kind means adding a template plus one method
 * here, not editing this file's internals.
 */
class EmailService {
  constructor(env = process.env) {
    this.env = env;
  }

  isConfigured() {
    return Boolean(this.env.BREVO_API_KEY && this.env.BREVO_SENDER_EMAIL);
  }

  get sender() {
    return {
      email: this.env.BREVO_SENDER_EMAIL,
      name: this.env.BREVO_SENDER_NAME || "Taskora",
    };
  }

  /**
   * Fails fast before any per-account work so a missing API key produces the
   * same failure for every address. That keeps a misconfigured deployment from
   * turning the forgot-password endpoint into an account-existence oracle.
   */
  assertConfigured() {
    if (!this.isConfigured()) {
      console.error("[EmailService] BREVO_API_KEY / BREVO_SENDER_EMAIL is not set");
      throw new AppError("Email service is not configured", 503);
    }
  }

  async send({ to, subject, html, text }) {
    this.assertConfigured();

    const recipient = String(to ?? "").trim();
    if (!recipient) {
      throw new AppError("Email recipient is required", 500);
    }

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "api-key": this.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: recipient }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Provider payloads can echo addresses and keys, so only a truncated
      // prefix is logged and the client never sees the upstream detail.
      const detail = await response
        .text()
        .catch(() => `${response.status} ${response.statusText}`);
      console.error(
        `[EmailService] delivery to ${recipient} failed (${response.status}): ${detail.slice(0, 500)}`
      );
      throw new AppError("Email could not be sent. Please try again.", 502);
    }

    return true;
  }

  /**
   * Sends an already-rendered template. The single place transport meets
   * content, so the three public senders below stay one-liners.
   */
  async sendTemplate(to, render) {
    const { subject, html, text } = render();
    return this.send({ to, subject, html, text });
  }

  /** Signed-out reset, reached from Login -> Forgot Password and Profile. */
  async sendPasswordResetCode(email, code) {
    return this.sendTemplate(email, () =>
      passwordResetEmail({ code, variant: "forgot" })
    );
  }

  /** Signed-in password change, confirmed with an emailed code. */
  async sendChangePasswordCode(email, code) {
    return this.sendTemplate(email, () =>
      passwordResetEmail({ code, variant: "confirm" })
    );
  }

  /** Confirmation code for changing the account email address. */
  async sendChangeEmailCode(email, code, { newEmail, currentEmail } = {}) {
    return this.sendTemplate(email, () =>
      changeEmailEmail({ code, newEmail, currentEmail })
    );
  }

  /** Queued notification mail, driven by NotificationService. */
  async sendNotification({ email, title, message, type, actionUrl, actionLabel, details }) {
    return this.sendTemplate(email, () =>
      notificationEmail({ title, message, type, actionUrl, actionLabel, details })
    );
  }

  /**
   * The "Send test email" mail from Settings.
   *
   * Sent inline rather than through the queue, unlike notification mail. The
   * user is standing in front of the button waiting to see whether their inbox
   * lights up, so a delivery failure has to become an error message now rather
   * than three failed jobs in a worker log; and a wrong address should not be
   * retried, since it is not going to become right.
   */
  async sendTestEmail({ email, enabledTypes = [] }) {
    return this.sendTemplate(email, () =>
      notificationTestEmail({ email, enabledTypes })
    );
  }
}

module.exports = EmailService;
