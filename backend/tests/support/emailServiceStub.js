"use strict";

/**
 * Brevo (transactional email) stand-in.
 *
 * Email is the one external service these tests would otherwise need a real
 * credential for: AuthService.forgotPassword() calls EmailService.assertConfigured()
 * before it looks the address up, so without a stub the endpoint would answer
 * 503 rather than the 200 the code actually returns when mail is configured.
 *
 * `sent` records what would have gone out, so a test can assert that a reset
 * code was sent without asserting anything about a third party's API.
 */

const sent = [];

class EmailServiceStub {
  constructor() {
    this.sent = sent;
  }

  isConfigured() {
    return true;
  }

  assertConfigured() {}

  async send() {
    return { queued: true };
  }

  async sendTemplate(to, render) {
    return { to, queued: true, ...(render ? {} : {}) };
  }

  async sendPasswordResetCode(email, code) {
    sent.push({ kind: "password-reset", email, code });
    return { queued: true };
  }

  async sendChangePasswordCode(email, code) {
    sent.push({ kind: "change-password", email, code });
    return { queued: true };
  }

  async sendChangeEmailCode(email, code, meta = {}) {
    sent.push({ kind: "change-email", email, code, ...meta });
    return { queued: true };
  }

  async sendNotification({ email, title }) {
    sent.push({ kind: "notification", email, title });
    return { queued: true };
  }
}

module.exports = EmailServiceStub;
module.exports.sent = sent;
