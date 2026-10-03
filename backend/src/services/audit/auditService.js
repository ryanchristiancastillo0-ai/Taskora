const REDACTED = "[redacted]";

// The action vocabulary, defined once.
//
// The strings are what get written to `AuditLog.action` and what the admin page
// filters on, so a typo at a call site would be invisible until someone went
// looking for an event that was filed under a name no filter offers. Exporting
// them as constants rather than repeating the literals is what keeps the writer,
// the reader and the UI describing the same set of events.
const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: "AUTH_LOGIN_SUCCEEDED",
  LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  LOGOUT: "AUTH_LOGOUT",
  PASSWORD_RESET_REQUESTED: "AUTH_PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "AUTH_PASSWORD_RESET_COMPLETED",
  EMAIL_CHANGED: "AUTH_EMAIL_CHANGED",
  ADMIN_ROLE_CHANGED: "ADMIN_ROLE_CHANGED",
  ADMIN_STATUS_CHANGED: "ADMIN_STATUS_CHANGED",
  TASK_DELETED: "TASK_DELETED",
  PROJECT_DELETED: "PROJECT_DELETED",
};

// The entity names the console groups by. Kept alongside the actions so the pair
// (action, entity) is always written from one list.
const AUDIT_ENTITIES = {
  USER: "User",
  TASK: "Task",
  PROJECT: "Project",
};

/**
 * Key names that must never reach the log, whatever the call site intended.
 *
 * Matched case-insensitively as a substring, so `passwordHash`, `refreshToken`
 * and `X-Api-Key` are all caught without this list having to enumerate every
 * spelling. `pin` and `otp` are here because a six-digit verification code is
 * the exact value an attacker replaying a compromised session would want, and
 * `hash` is here because a password hash is a password with extra steps.
 */
const SENSITIVE_KEY =
  /password|passcode|token|secret|authorization|cookie|credential|api[-_]?key|private[-_]?key|hash|salt|otp|pin/i;

/**
 * Values that are a secret by shape, regardless of the key they arrived under.
 *
 * A defence in depth over SENSITIVE_KEY: it catches a bearer token or a long
 * hex digest that reached a log field under an innocuous key name, which is
 * exactly how credentials leak. A cuid is 25 mixed-case alphanumerics, well
 * under the hex lengths below, so ordinary ids are untouched.
 */
const SECRET_VALUE =
  /^(?:[A-Za-z0-9_-]{8,}\.){2}[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$|^[a-f0-9]{40,}$/i;

// Bounds. A log that can grow without limit is a denial-of-service vector, and
// these are generous for the small, hand-picked objects the call sites pass —
// anything bigger is a bug in the call site, not a real payload.
const MAX_DEPTH = 4;
const MAX_ARRAY = 50;
const MAX_KEYS = 40;
const MAX_STRING = 500;

function truncate(value, max) {
  if (value === null || value === undefined) return null;

  const text = String(value);
  if (text.length === 0) return null;

  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Recursively strips secrets and clamps size from anything about to be stored.
 *
 * Applied on write rather than trusted from the call site on purpose. There are
 * seven call sites today and they will not all be written by the same person,
 * so "nobody passes a password here" is a property that decays; this makes the
 * log's safety independent of every one of them.
 */
function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return null;

  if (depth > MAX_DEPTH) return "[truncated]";

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) return REDACTED;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING - 1)}…` : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => sanitize(entry, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};

    for (const [key, entry] of Object.entries(value).slice(0, MAX_KEYS)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(entry, depth + 1);
    }

    return out;
  }

  return null;
}

/**
 * Writes the audit trail. Read-only counterpart is AdminService.listAuditLogs —
 * the split is deliberate: this is the one thing every other feature needs, the
 * other is a thing only the console needs, and neither should depend on the
 * other to exist.
 */
class AuditService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Records one event.
   *
   * `req` is taken whole rather than as an extracted { ipAddress, userAgent }
   * pair. That is the one place in this codebase where a request object is
   * itself the input: a connecting address exists nowhere else, and passing the
   * pair instead would make every call site responsible for remembering to
   * extract it — and one that forgets logs a permanent blank.
   *
   * It never throws. An audit failure must not be able to fail the operation
   * being audited: a user should not be unable to delete a task because the
   * log table is unavailable, and this table is not yet guaranteed to be
   * migrated in every environment. The error is printed instead, so a
   * systematically broken trail is visible in the server log rather than
   * invisible.
   */
  async record({
    actorId = null,
    action,
    entity,
    entityId = null,
    details = null,
    oldValue = null,
    newValue = null,
    req = null,
  } = {}) {
    try {
      if (!action || !entity) {
        // A blank action would be unfilterable and unreadable, which is worse
        // than no row: it looks like the log is working.
        throw new Error("record() requires an action and an entity");
      }

      return await this.prisma.auditLog.create({
        data: {
          userId: actorId ?? null,
          action: truncate(action, 191),
          entity: truncate(entity, 191),
          entityId: truncate(entityId, 191),
          details: sanitize(details),
          oldValue: sanitize(oldValue),
          newValue: sanitize(newValue),
          // `req.ip` and not X-Forwarded-For. The app does not set
          // `trust proxy`, so Express ignores that header entirely — which is
          // the safe default here. Trusting it without configuring a trusted
          // proxy would let any caller write an arbitrary address into the
          // audit trail. Behind a real proxy this column will show the proxy's
          // address until `trust proxy` is configured to match the topology.
          ipAddress: truncate(req?.ip, 191),
          userAgent: truncate(req?.get?.("user-agent"), 512),
        },
      });
    } catch (error) {
      console.error(
        `[audit] could not record ${action} on ${entity}:`,
        error.message
      );
      return null;
    }
  }
}

module.exports = { AuditService, AUDIT_ACTIONS, AUDIT_ENTITIES, sanitize };
