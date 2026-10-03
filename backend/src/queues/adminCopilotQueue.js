const { Queue, Worker, UnrecoverableError } = require("bullmq");
const { redis } = require("../config/redis");
const { isQuotaError } = require("../services/user/ai/aiProvider.js");

const ADMIN_COPILOT_QUEUE = "admin-copilot";
const ADMIN_COPILOT_JOB = "admin-copilot-ask";

// The same shape as the other queues in this folder, for the same reason: the
// queue object is created once at require time and the worker is started
// explicitly from server.js, so a test can construct the service with a fake
// queue and never touch Redis.
const adminCopilotQueue = new Queue(ADMIN_COPILOT_QUEUE, {
  connection: redis,
});

adminCopilotQueue.on("error", (error) => {
  // A refused connection is Redis simply not running yet, which is a normal
  // state for this app (the ask falls back to inline processing) and not worth
  // a stack trace on every boot.
  if (error?.code !== "ECONNREFUSED") {
    console.error(
      `[queue:${ADMIN_COPILOT_QUEUE}] queue error: ${error.message}`
    );
  }
});

/**
 * The worker that actually calls the provider.
 *
 * `concurrency: 1` rather than the 2 the user-side generation queue uses. The
 * copilot is a small population of admins, and every job in it re-reads the
 * same six aggregate queries before it reaches the provider — so running two at
 * once mostly doubles the database load for no latency win. The user-side queue
 * is per-user and each job touches a different workspace, which is the opposite
 * situation.
 */
function startAdminCopilotWorker({ adminCopilotService }) {
  const worker = new Worker(
    ADMIN_COPILOT_QUEUE,
    async (job) => {
      // Only the two ids travel in the payload. The question itself is read
      // back from the row rather than copied into the job, so the job can never
      // disagree with what is on screen, and a retry re-reads the same text the
      // admin actually asked.
      //
      // The failure is recorded on the row *before* it is rethrown. Rethrowing
      // is what lets BullMQ apply the exponential backoff and retry; marking
      // the row here is what stops the admin watching a spinner for a question
      // that has already failed. markFailed is a no-op once the row is
      // ANSWERED, so a retry that loses the race to an earlier success cannot
      // overwrite a real answer with an error.
      try {
        await adminCopilotService.answerExchange({
          exchangeId: job.data.exchangeId,
          adminId: job.data.adminId,
          job,
        });
      } catch (error) {
        // A spent provider quota is final for this window. The provider has
        // already routed around it once via the backup provider, and the
        // provider layer deliberately does not retry it, so BullMQ's three
        // attempts would repeat the same doomed call against a 20/day free tier
        // and spend the queue's backoff budget doing it. Mark it unrecoverable
        // so the row fails now and the admin is told immediately, rather than
        // sitting behind two pointless retries.
        const quotaExhausted = isQuotaError(error);
        const finalAttempt = job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);

        if (quotaExhausted || finalAttempt) {
          await adminCopilotService.markFailed(
            job.data.exchangeId,
            error?.message || "The assistant could not answer that.",
            quotaExhausted
              ? { quotaExhausted: true, retryAfterMs: error?.details?.retryAfterMs ?? null }
              : undefined
          );
        }

        if (quotaExhausted) {
          throw new UnrecoverableError(error?.message || "Provider quota exhausted");
        }

        throw error;
      }
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    // BullMQ logs this too, but the exchange id is what ties the failure to the
    // row the admin can see, so it is worth having in the server log as well.
    console.error(
      `[queue:${ADMIN_COPILOT_QUEUE}] exchange ${job?.data?.exchangeId} failed: ${error.message}`
    );
  });

  worker.on("error", (error) => {
    if (error?.code !== "ECONNREFUSED") {
      console.error(
        `[queue:${ADMIN_COPILOT_QUEUE}] worker error: ${error.message}`
      );
    }
  });

  return worker;
}

module.exports = {
  adminCopilotQueue,
  ADMIN_COPILOT_QUEUE,
  ADMIN_COPILOT_JOB,
  startAdminCopilotWorker,
};
