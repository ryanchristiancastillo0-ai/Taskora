const { Queue, Worker, UnrecoverableError } = require("bullmq");
const { redis } = require("../config/redis");
const { isQuotaError } = require("../services/user/ai/aiProvider.js");

const AI_GENERATION_QUEUE = "ai-generation";
const AI_GENERATION_JOB = "ai-generate";

const aiGenerationQueue = new Queue(AI_GENERATION_QUEUE, {
  connection: redis,
});

aiGenerationQueue.on("error", (error) => {
  if (error?.code !== "ECONNREFUSED") {
    console.error(
      `[queue:${AI_GENERATION_QUEUE}] queue error: ${error.message}`
    );
  }
});

function startAiGenerationWorker({ aiService }) {
  const worker = new Worker(
    AI_GENERATION_QUEUE,
    async (job) => {
      try {
        await aiService.processAiMessage({ ...job.data, jobId: job.id }, job);
      } catch (error) {
        // Both providers were out of budget, so this is not a blip that a second
        // and third attempt can clear — the provider layer has already routed
        // around the exhausted one. Retrying here would only re-run the same
        // doomed call against a daily quota while the user watches a spinner.
        // processAiMessage has already told the client to drop any partial reply.
        if (isQuotaError(error)) {
          throw new UnrecoverableError(
            error?.message || "AI provider quota exhausted"
          );
        }
        throw error;
      }
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[queue:${AI_GENERATION_QUEUE}] job ${job?.id} failed: ${error.message}`
    );
  });

  worker.on("error", (error) => {
    if (error?.code !== "ECONNREFUSED") {
      console.error(
        `[queue:${AI_GENERATION_QUEUE}] worker error: ${error.message}`
      );
    }
  });

  return worker;
}

module.exports = {
  aiGenerationQueue,
  AI_GENERATION_QUEUE,
  AI_GENERATION_JOB,
  startAiGenerationWorker,
};