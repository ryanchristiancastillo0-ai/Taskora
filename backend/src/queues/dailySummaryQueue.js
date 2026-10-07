const { Queue, Worker } = require("bullmq");
const { redis } = require("../config/redis");

const DAILY_SUMMARY_QUEUE = "daily-summary";
const DAILY_SUMMARY_SCAN_JOB = "daily-summary-scan";
const SCAN_JOB_ID = "daily-summary-scan-main";

const dailySummaryQueue = new Queue(DAILY_SUMMARY_QUEUE, {
  connection: redis,
});

dailySummaryQueue.on("error", (error) => {
  if (error?.code !== "ECONNREFUSED") {
    console.error(`[queue:${DAILY_SUMMARY_QUEUE}] queue error: ${error.message}`);
  }
});

// Schedules the recurring "who gets a summary this hour" scan. BullMQ keys
// repeatable jobs by jobId, so re-running this on every server start is
// idempotent — the same pattern that keeps the pattern-suggestion scan honest.
async function scheduleDailySummaryScan(
  queue = dailySummaryQueue,
  intervalMs
) {
  await queue.add(
    DAILY_SUMMARY_SCAN_JOB,
    {},
    {
      jobId: SCAN_JOB_ID,
      repeat: { every: intervalMs },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86_400 },
    }
  );
}

function startDailySummaryWorker({ dailySummaryService }) {
  const worker = new Worker(
    DAILY_SUMMARY_QUEUE,
    async () => {
      await dailySummaryService.sendDueSummaries();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[queue:${DAILY_SUMMARY_QUEUE}] job ${job?.id} failed: ${error.message}`
    );
  });

  worker.on("error", (error) => {
    if (error.code !== "ECONNREFUSED") {
      console.error(
        `[queue:${DAILY_SUMMARY_QUEUE}] worker error: ${error.message}`
      );
    }
  });

  return worker;
}

module.exports = {
  dailySummaryQueue,
  DAILY_SUMMARY_QUEUE,
  DAILY_SUMMARY_SCAN_JOB,
  scheduleDailySummaryScan,
  startDailySummaryWorker,
};