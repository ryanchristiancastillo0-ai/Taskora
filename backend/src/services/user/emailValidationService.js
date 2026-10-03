const AppError = require("../../utils/AppError.js");

const DEFAULT_VALIDATE_URL = "https://api.zerobounce.net/v2/validate";

// ZeroBounce answers 96-98% of domains in 1-5s but accepts a `timeout` of up
// to 60s, after which it reports "unknown". We ask it to give up first so a
// slow mail server degrades into an allowed signup instead of tripping our own
// abort and failing an otherwise good registration with a 503.
const PROVIDER_TIMEOUT_SECONDS = 15;
const REQUEST_TIMEOUT_MS = (PROVIDER_TIMEOUT_SECONDS + 5) * 1000;

// The v2 status vocabulary from the official validate API. catch-all and
// unknown are accepted on purpose: both describe real, reachable people, and
// unknown costs no credit.
const ACCEPTED_STATUSES = new Set(["valid", "catch-all", "unknown"]);
const REJECTED_STATUSES = new Set(["invalid", "spamtrap", "abuse", "do_not_mail"]);
// v2 reports disposable and toxic mailboxes under do_not_mail, but also repeats
// them in sub_status, so both signals are checked.
const REJECTED_SUB_STATUSES = new Set(["disposable", "toxic"]);

const UNREACHABLE_MESSAGE =
  "Email validation is temporarily unavailable. Please try again.";
const REJECTED_MESSAGE = "This email address cannot be used to create an account.";

/**
 * Server-side deliverability gate for the addresses people sign up with.
 *
 * This class owns the ZeroBounce conversation only: when to run, how to call
 * the API, and how to map its answer onto the app's error vocabulary. It never
 * decides policy beyond the two status sets above and never returns an upstream
 * message to the caller, so a provider change cannot leak provider detail or
 * the API key into an HTTP response.
 */
class EmailValidationService {
  constructor(env = process.env) {
    this.env = env;
  }

  isProduction() {
    return (this.env.NODE_ENV || "development") === "production";
  }

  isEnabled() {
    return this.isProduction();
  }

  isConfigured() {
    return Boolean(this.env.ZEROBOUNCE_API_KEY);
  }

  get validateUrl() {
    return this.env.ZEROBOUNCE_API_URL || DEFAULT_VALIDATE_URL;
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      console.error("[EmailValidationService] ZEROBOUNCE_API_KEY is not set");
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }
  }

  // Keeps the key out of any log line. The request URL carries it as a query
  // parameter, and some fetch failures quote the URL back in their message.
  mask(value) {
    const key = this.env.ZEROBOUNCE_API_KEY;
    const text = String(value ?? "");
    return key ? text.split(key).join("***") : text;
  }

  async validate(email) {
    // Development and test never touch the network, even with a key present, so
    // placeholder addresses keep working on a local machine.
    if (!this.isEnabled()) {
      return { checked: false, status: "skipped" };
    }

    this.assertConfigured();

    const address = String(email ?? "").trim();
    if (!address) {
      throw new AppError(REJECTED_MESSAGE, 400);
    }

    const payload = await this.requestValidation(address);
    const status =
      typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    const subStatus =
      typeof payload.sub_status === "string"
        ? payload.sub_status.toLowerCase()
        : "";

    if (!status) {
      console.error(
        `[EmailValidationService] response carried no status field: ${this.mask(
          Object.keys(payload).join(",")
        )}`
      );
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    if (REJECTED_STATUSES.has(status) || REJECTED_SUB_STATUSES.has(subStatus)) {
      console.warn(
        `[EmailValidationService] rejected ${address} (status=${status} sub_status=${
          subStatus || "none"
        })`
      );
      throw new AppError(REJECTED_MESSAGE, 400);
    }

    // Fail closed rather than guessing if the provider ever adds a status.
    if (!ACCEPTED_STATUSES.has(status)) {
      console.warn(
        `[EmailValidationService] unrecognised status=${status} for ${address}`
      );
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    if (status === "unknown") {
      console.warn(
        `[EmailValidationService] ${address} returned unknown (sub_status=${
          subStatus || "none"
        }); allowing signup`
      );
    }

    return { checked: true, status, subStatus };
  }

  async requestValidation(address) {
    const url = new URL(this.validateUrl);
    url.searchParams.set("api_key", this.env.ZEROBOUNCE_API_KEY);
    url.searchParams.set("email", address);
    url.searchParams.set("timeout", String(PROVIDER_TIMEOUT_SECONDS));

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error(
        `[EmailValidationService] request failed: ${this.mask(
          error && error.message
        )}`
      );
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    if (!response.ok) {
      const detail = await response
        .text()
        .catch(() => `${response.status} ${response.statusText}`);
      console.error(
        `[EmailValidationService] upstream ${
          response.status
        }: ${this.mask(detail).slice(0, 300)}`
      );
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      console.error("[EmailValidationService] upstream returned a non-JSON body");
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    if (!payload || typeof payload !== "object") {
      console.error("[EmailValidationService] upstream returned a non-object body");
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    // An invalid key or an exhausted balance answers
    // {"error":"Invalid API Key or your account ran out of credits"} with no
    // status field. The detail stays in the server log.
    if (payload.error) {
      console.error(
        `[EmailValidationService] upstream error: ${this.mask(payload.error)}`
      );
      throw new AppError(UNREACHABLE_MESSAGE, 503);
    }

    return payload;
  }
}

module.exports = EmailValidationService;
