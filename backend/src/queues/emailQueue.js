const { Queue, Worker } = require("bullmq");
const { redis } = require("../config/redis");

const EMAIL_QUEUE = "emails";
const EMAIL_JOB = "send-email";

const emailQueue = new Queue(EMAIL_QUEUE, {
  connection: redis,
});

emailQueue.on("error", (error) => {
  if (error?.code !== "ECONNREFUSED") {
    console.error(`[queue:${EMAIL_QUEUE}] queue error: ${error.message}`);
  }
});

/**
 * Notification email runs on a worker so a slow or failing provider never adds
 * latency to the request that created the notification. Password and
 * change-password codes are sent inline instead, because those callers must
 * know immediately whether delivery succeeded.
 */
function startEmailWorker({ emailService }) {
  const worker = new Worker(
    EMAIL_QUEUE,
    async (job) => {
      if (job.name !== EMAIL_JOB) return;
      await emailService.sendNotification(job.data);
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on("failed", (job, error) => {
    console.error(`[queue:${EMAIL_QUEUE}] job ${job?.id} failed: ${error.message}`);
  });

  worker.on("error", (error) => {
    if (error.code !== "ECONNREFUSED") {
      console.error(`[queue:${EMAIL_QUEUE}] worker error: ${error.message}`);
    }
  });

  return worker;
}

module.exports = {
  emailQueue,
  EMAIL_QUEUE,
  EMAIL_JOB,
  startEmailWorker,
};
