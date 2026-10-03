// End-to-end check that the shared ioredis connection works with BullMQ:
// connect -> enqueue -> worker receives -> completes -> failure is contained.
// Uses a dedicated throwaway queue name so no Taskora business data is touched,
// and obliterates the queue afterwards so no keys are left behind.
const dotenv = require("dotenv");
const assert = require("assert");

dotenv.config();

const { Queue, Worker } = require("bullmq");
const { redis, REDIS_URL } = require("../src/config/redis");

const TEST_QUEUE = "smoke-test-redis";

async function run() {
  console.log(`[smoke] target ${REDIS_URL}`);

  // config/redis.js sets enableOfflineQueue:false, so any command issued before
  // the socket is ready throws "Stream isn't writeable". ReminderScheduler
  // guards the same way via isAvailable(); do the equivalent here.
  await waitFor(() => redis.status === "ready", "redis connection to become ready");

  // 1. Raw connectivity through the shared connection.
  const pong = await redis.ping();
  assert.strictEqual(pong, "PONG");
  console.log("[Redis] Connected (PING -> PONG)");

  const queue = new Queue(TEST_QUEUE, { connection: redis });
  await queue.waitUntilReady();
  console.log(`[BullMQ] Queue initialized (${TEST_QUEUE})`);

  const received = [];
  const worker = new Worker(
    TEST_QUEUE,
    async (job) => {
      received.push({ name: job.name, data: job.data });
      if (job.data.boom) {
        throw new Error("intentional failure");
      }
      return { echoed: job.data.value, at: Date.now() };
    },
    { connection: redis, concurrency: 1 }
  );

  const completed = [];
  const failed = [];
  worker.on("completed", (job, result) => completed.push({ id: job.id, result }));
  worker.on("failed", (job, error) => failed.push({ id: job?.id, message: error.message }));
  console.log("[BullMQ] Worker started");

  try {
    // 2. Happy path.
    const job = await queue.add("echo", { value: "hello" });
    console.log(`[BullMQ] Job enqueued (id ${job.id})`);

    await waitFor(() => completed.length === 1, "job to complete");
    assert.strictEqual(received[0].name, "echo");
    assert.strictEqual(received[0].data.value, "hello");
    assert.strictEqual(completed[0].result.echoed, "hello");
    console.log("[BullMQ] Job received, processed and completed");

    // 3. Failure path: the worker must survive and stay usable.
    await queue.add("boom", { boom: true });
    await waitFor(() => failed.length === 1, "job to fail");
    assert.match(failed[0].message, /intentional failure/);
    console.log(`[BullMQ] Job failed as expected and was contained (${failed[0].message})`);

    // 4. The worker is still alive after a failure.
    await queue.add("echo", { value: "still-alive" });
    await waitFor(() => completed.length === 2, "worker to keep processing");
    assert.strictEqual(completed[1].result.echoed, "still-alive");
    console.log("[BullMQ] Worker still processing after a failure");

    // 5. Queue depth reflects what the worker consumed.
    const counts = await queue.getJobCounts();
    console.log(
      `[BullMQ] Counts waiting=${counts.waiting} active=${counts.active} completed=${counts.completed} failed=${counts.failed}`
    );
  } finally {
    await worker.close();
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  }

  // 6. Confirm the smoke queue left nothing behind.
  const leftover = await redis.exists(`bull:${TEST_QUEUE}:id`);
  assert.strictEqual(leftover, 0, "smoke queue keys were not cleaned up");
  console.log("[BullMQ] Smoke queue cleaned up, no keys left behind");

  console.log("\nAll Redis + BullMQ smoke checks passed.");
}

function waitFor(predicate, what, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`timed out after ${timeoutMs}ms waiting for ${what}`));
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

run()
  .then(async () => {
    redis.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`\n[smoke] FAILED: ${error.message}`);
    redis.disconnect();
    process.exit(1);
  });
