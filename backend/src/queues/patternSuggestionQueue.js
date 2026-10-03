const { Queue, Worker } = require("bullmq");
const { redis } = require("../config/redis");

const PATTERN_SUGGESTION_QUEUE = "pattern-suggestions";
const PATTERN_SUGGESTION_JOB = "pattern-suggestion-check";
const CHECK_JOB_ID = "pattern-suggestion-check-main";

const patternSuggestionQueue = new Queue(PATTERN_SUGGESTION_QUEUE, {
  connection: redis,
});

patternSuggestionQueue.on("error", (error) => {
  if (error?.code !== "ECONNREFUSED") {
    console.error(
      `[queue:${PATTERN_SUGGESTION_QUEUE}] queue error: ${error.message}`
    );
  }
});

// Schedules the recurring "check due patterns" job. BullMQ keys repeatable
// jobs by jobId, so re-running this on every server start is idempotent.
async function schedulePatternCheck(
  queue = patternSuggestionQueue,
  intervalMs
) {
  await queue.add(
    PATTERN_SUGGESTION_JOB,
    {},
    {
      jobId: CHECK_JOB_ID,
      repeat: { every: intervalMs },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86_400 },
    }
  );
}

function startPatternSuggestionWorker({ taskSuggestionService }) {
  const worker = new Worker(
    PATTERN_SUGGESTION_QUEUE,
    async () => {
      // Idempotent: generated suggestions are unique per (pattern, date).
      await taskSuggestionService.generateDueSuggestions();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[queue:${PATTERN_SUGGESTION_QUEUE}] job ${job?.id} failed: ${error.message}`
    );
  });

  worker.on("error", (error) => {
    if (error.code !== "ECONNREFUSED") {
      console.error(
        `[queue:${PATTERN_SUGGESTION_QUEUE}] worker error: ${error.message}`
      );
    }
  });

  return worker;
}

module.exports = {
  patternSuggestionQueue,
  PATTERN_SUGGESTION_QUEUE,
  PATTERN_SUGGESTION_JOB,
  schedulePatternCheck,
  startPatternSuggestionWorker,
};