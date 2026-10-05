const AppError = require("../../utils/AppError.js");

// Retry policy for transient provider failures (503 high-demand spikes, 429
// rate limits, timeouts). Applied to every provider so inline processing
// doesn't fail on the first attempt.
//
// Delays are deliberately long. A "high demand" 503 from Gemini is a capacity
// condition that clears over minutes, not over milliseconds, so a 1s/2s ladder
// exhausted every attempt inside ~3s and turned a blip into a hard failure.
//
// A quota 429 is NOT in that category and must never be retried on the same
// provider. Gemini's free tier is `GenerateRequestsPerDayPerProjectPerModel`
// with a limit of 20, and the provider says so in the error body. Once that is
// spent it stays spent for the window; retrying at 4s or 15s cannot succeed and
// each attempt only delays the fallback that would have answered the request.
// So quota exhaustion skips the retry ladder entirely and goes straight to the
// backup provider.
const MAX_PROVIDER_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 4000;
const RETRY_MAX_DELAY_MS = 60000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_MARKERS = [
  "unavailable",
  "resource_exhausted",
  "high demand",
  "rate limit",
  "throttl",
  "too many requests",
  "temporarily unavailable",
];
const QUOTA_MARKERS = [
  "quota",
  "exceeded your current quota",
  "billing",
  "resource_exhausted",
  "generate_requests_perday",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Internal key carrying the providers already tried for one request. A symbol
// keeps it out of anything that iterates the input, and off the wire.
const VISITED = Symbol("aiProvidersVisited");

function statusOf(err) {
  const raw = err?.status ?? err?.statusCode ?? err?.error?.code ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function haystackOf(err) {
  return `${err?.message ?? ""} ${err?.error?.message ?? ""}`.toLowerCase();
}

/**
 * How long the provider asked us to wait, in ms.
 *
 * Google puts this in a `RetryInfo` detail on a 429, but the SDK surfaces the
 * whole response as a JSON *string* in `message` rather than as structured
 * fields, so the only way to read it is to parse that string. Best-effort: a
 * missing value just falls back to our own delay.
 *
 * The units are the trap here. Google sends `retryDelay` as a duration *string*
 * ("47s"); our own `details.retryAfterMs` is already milliseconds; and a bare
 * number off the wire is seconds. Converting a millisecond value as though it
 * were seconds turned "retry in 47s" into "retry in 47000s", so each unit is
 * read on its own terms instead of through one shared guess.
 */
function parseRetryAfterMs(err) {
  // Named in ms on our own errors — read verbatim.
  for (const value of [err?.retryAfterMs, err?.details?.retryAfterMs]) {
    const ms = Number(value);
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms);
  }

  // Google sends these as duration strings, or a bare number meaning seconds.
  const candidates = [
    err?.retryDelay,
    err?.error?.retryDelay,
    err?.details?.retryDelay,
  ];

  for (const value of candidates) {
    const ms = parseDurationMs(value);
    if (ms !== null) return ms;
  }

  // `details` is an array of google.rpc entries on the wire.
  const detailList = err?.details;
  if (Array.isArray(detailList)) {
    for (const detail of detailList) {
      const ms = parseDurationMs(detail?.retryDelay);
      if (ms !== null) return ms;
    }
  }

  if (typeof err?.message === 'string') {
    const open = err.message.indexOf('{');
    if (open !== -1) {
      try {
        const parsed = JSON.parse(err.message.slice(open));
        const found = findRetryDelay(parsed);
        if (found !== null) return found;
      } catch {
        // Not JSON. Nothing to extract.
      }
    }
  }

  return null;
}

function findRetryDelay(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRetryDelay(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const direct = parseDurationMs(node.retryDelay ?? node.retryAfter);
  if (direct !== null) return direct;
  for (const value of Object.values(node)) {
    const found = findRetryDelay(value, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

// Duration string ("47s", "1500ms") or a bare number, which the wire format
// defines as seconds.
function parseDurationMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
  }
  const match = String(value).trim().match(/^([\d.]+)\s*(ms|s)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2]?.toLowerCase() === 'ms' ? Math.round(amount) : Math.round(amount * 1000);
}

/**
 * Whether this failure is a spent quota rather than a transient blip.
 *
 * Reads the classification that `mapError` attached, because by the time the
 * retry layer sees the error it is an AppError whose own message is a generic
 * "The AI service request failed" — checking only that text is what made a 20/day
 * quota look like an ordinary blip and get retried three times before failing.
 */
function isQuotaError(err) {
  if (err?.isQuota === true || err?.details?.isQuota === true) return true;
  const status = statusOf(err);
  if (status === 429) {
    // 429 is ambiguous on its own: some providers use it for a short rate limit
    // that a retry does clear. The body is what disambiguates.
    return QUOTA_MARKERS.some((marker) => haystackOf(err).includes(marker));
  }
  return QUOTA_MARKERS.some((marker) => haystackOf(err).includes(marker));
}

function isTransientError(err) {
  if (err?.isTransient === true || err?.details?.isTransient === true) {
    return true;
  }
  if (isQuotaError(err)) return true;
  if (RETRYABLE_STATUS.has(statusOf(err))) return true;
  return TRANSIENT_MARKERS.some((marker) => haystackOf(err).includes(marker));
}

// Full jitter. Without it every retry in a burst leaves at the same instant and
// re-hits the same overloaded backend in lockstep. The provider's own
// RetryInfo wins when it supplied one, capped so a bad value cannot hang a job.
function retryDelay(err, attempt) {
  const requested = parseRetryAfterMs(err);
  if (requested !== null) {
    return Math.min(Math.max(requested, 1000), RETRY_MAX_DELAY_MS);
  }
  const ceiling = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

// Contract every AI provider must satisfy:
//   - this.name        -> string
//   - generateText({ systemPrompt, messages }) -> Promise<{ text }>
class AIProvider {
  constructor() {
    this.name = "ai";
  }

  async generateText() {
    throw new AppError("AIProvider.generateText is not implemented", 500);
  }

  /**
   * The other configured provider, if any. Resolved lazily through the factory
   * so a provider module never has to import the factory that imports it.
   *
   * `visited` carries the providers already tried on this request. Without it
   * two providers that are both out of quota hand the request back and forth
   * forever — GEMINI falls back to OPENROUTER, which falls back to GEMINI, and
   * the call never returns. Only the providers not yet tried are candidates,
   * which also bounds the failover chain at one hop per configured provider.
   *
   * A Gemini capacity spike or an exhausted free-tier quota is an
   * infrastructure event, not a reason for the user to get no answer at all:
   * OpenRouter is already configured and working, so routing around a dead
   * provider degrades to a slower reply instead of an error.
   */
  getFallbackProvider(visited) {
    try {
      const AIProviderFactory = require("./aiProviderFactory.js");
      const candidate = AIProviderFactory.getFallbackFor?.(this.name, visited);
      return candidate && candidate.name !== this.name ? candidate : null;
    } catch {
      return null;
    }
  }

  notifyFallback(input, providerName) {
    if (typeof input?.onFallback !== 'function') return;
    try {
      input.onFallback(providerName);
    } catch {
      // Cosmetic only.
    }
  }

  /**
   * Runs the backup provider after the primary failed transiently.
   *
   * Returns the backup's error when there is no backup, or when the backup also
   * failed, so the caller always surfaces one coherent failure rather than
   * silently swallowing the reason the request did not succeed.
   */
  async failOver(primaryError, input, { emitted = false } = {}) {
    const visited = input?.[VISITED] instanceof Set
      ? input[VISITED]
      : new Set();
    visited.add(this.name);

    const fallback = this.getFallbackProvider(visited);

    if (!fallback) {
      // Nothing left to try: either none is configured, or the only candidate
      // was already used earlier in this same request. Thrown, not returned —
      // this method resolves only when a provider actually answered, so a
      // returned failure would be mistaken for a successful response.
      throw this.limitError(primaryError, "no-fallback");
    }

    if (emitted) {
      // Partial text is already on the user's screen. Handing the request to a
      // different model would replace what they have read, so the turn ends here
      // with the text that did arrive.
      throw this.limitError(primaryError, "emitted");
    }

    const retryAfterMs = parseRetryAfterMs(primaryError);
    console.warn(
      `[AIProvider:${this.name}] falling back to ${fallback.name}` +
        `${isQuotaError(primaryError) ? ' (quota exhausted)' : ''}` +
        `${retryAfterMs ? ` — provider says retry in ${Math.ceil(retryAfterMs / 1000)}s` : ''}`
    );
    this.notifyFallback(input, fallback.name);

    // The backup gets its own retry ladder. It is a different provider on a
    // different quota, so the primary's exhausted budget says nothing about it.
    // The visited set rides along so it cannot hand the request straight back.
    try {
      return await fallback.generateTextWithRetry({ ...input, [VISITED]: visited });
    } catch (fallbackError) {
      console.error(
        `[AIProvider:${this.name}] fallback to ${fallback.name} also failed: ${fallbackError.message}`
      );
      throw this.limitError(fallbackError, "fallback-failed");
    }
  }

  // The failure the caller actually sees once no provider could answer.
  limitError(cause, reason) {
    const retryAfterMs = parseRetryAfterMs(cause);
    const quota = isQuotaError(cause) || reason === "no-fallback";
    const wait =
      quota && retryAfterMs && retryAfterMs >= 1000
        ? ` (about ${Math.ceil(retryAfterMs / 1000)}s)`
        : "";

    const messages = {
      "no-fallback": `The AI provider has reached its request limit for this window${wait}, and no backup provider is configured.`,
      "fallback-failed": `Both AI providers have reached their request limit${wait}.`,
      emitted: `The AI provider stopped part-way through this answer${wait}.`,
    };

    return new AppError(messages[reason] ?? "The AI service request failed", 502, {
      isTransient: true,
      isQuota: quota,
      retryAfterMs,
      provider: this.name,
    });
  }

  async generateTextWithRetry(input) {
    let attempt = 0;
    for (;;) {
      try {
        return await this.generateText(input);
      } catch (err) {
        attempt += 1;

        // Permanent — a malformed request or a bug in our own payload fails
        // identically on every provider, so failing over would only double the
        // latency before reporting the same thing.
        if (!isTransientError(err)) throw err;

        // Spent quota cannot be waited out by retrying the same provider, and
        // the provider told us how long the window lasts. Go to the backup
        // immediately rather than spending attempts that cannot succeed.
        //
        // Returned rather than thrown: failOver resolves with the backup's
        // answer when the backup works, and throws only when nothing is left.
        if (isQuotaError(err)) {
          return this.failOver(err, input);
        }

        // A capacity spike that outlived its retry ladder is also the
        // provider's problem, not the user's, and the backup is a different
        // pool of capacity. Retrying harder would only add seconds.
        if (attempt >= MAX_PROVIDER_RETRIES) {
          return this.failOver(err, input);
        }

        const delay = retryDelay(err, attempt);
        console.warn(
          `[AIProvider:${this.name}] transient failure (attempt ${attempt}/${MAX_PROVIDER_RETRIES}) — retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  }

  /**
   * Streaming equivalent. Falls back to the backup provider only while nothing
   * has been emitted yet: once partial text is on the user's screen, silently
   * restarting under a different model would replace text they already read.
   */
  async generateTextStreamedWithRetry(input) {
    if (typeof this.generateTextStreamed !== 'function') {
      return this.generateTextWithRetry(input);
    }

    let emitted = false;
    const onChunk = input.onChunk
      ? (delta, text) => {
          emitted = true;
          input.onChunk(delta, text);
        }
      : undefined;

    try {
      return await this.generateTextStreamed({ ...input, onChunk });
    } catch (err) {
      if (emitted || !isTransientError(err)) throw err;
      return this.failOver(err, input, { emitted });
    }
  }

  /**
   * Shared, safe error mapping.
   *
   * The provider's own body never reaches the client, but its *classification*
   * does: quota-vs-blip and the requested retry delay are carried on `details`
   * because the retry and fallback layers above need them. Flattening a 429
   * into a bare 502 is what previously made a daily quota indistinguishable
   * from a momentary overload.
   */
  mapError(err) {
    const quota = isQuotaError(err);
    const retryAfterMs = parseRetryAfterMs(err);
    const status = statusOf(err);

    if (quota) {
      console.warn(
        `[AIProvider:${this.name}] quota exhausted (status ${status || 'unknown'})` +
          `${retryAfterMs ? ` — retry in ${Math.ceil(retryAfterMs / 1000)}s` : ''}`
      );
    } else {
      console.error(`[AIProvider:${this.name}]`, err?.message);
    }

    return new AppError("The AI service request failed", 502, {
      isTransient: true,
      isQuota: quota,
      retryAfterMs,
    });
  }
}

module.exports = AIProvider;
module.exports.isTransientError = isTransientError;
module.exports.isQuotaError = isQuotaError;
module.exports.parseRetryAfterMs = parseRetryAfterMs;