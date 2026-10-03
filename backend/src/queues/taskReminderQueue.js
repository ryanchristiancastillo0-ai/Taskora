const { Queue, Worker } = require("bullmq");
const { redis } = require("../config/redis");

const TASK_REMINDER_QUEUE = "task-reminders";
const TASK_REMINDER_JOB = "task-reminder";

const taskReminderQueue = new Queue(TASK_REMINDER_QUEUE, {
  connection: redis,
});

taskReminderQueue.on("error", (error) => {
  if (error?.code !== "ECONNREFUSED") {
    console.error(`[queue:${TASK_REMINDER_QUEUE}] queue error: ${error.message}`);
  }
});

function startTaskReminderWorker({ notificationService }) {
  const worker = new Worker(
    TASK_REMINDER_QUEUE,
    async (job) => {
      const { userId, taskId, title } = job.data;

      await notificationService.create(userId, {
        taskId,
        title: "Task due reminder",
        message: `Reminder: "${title}" is due now.`,
        // TASK_REMINDER, not TASK_DUE. The enum has carried both for a while and
        // this was the only place using the deadline value for a reminder, which
        // made "Task reminders" and "Deadline reminders" the same switch in
        // practice. The value already exists, so this needs no migration.
        type: "TASK_REMINDER",
      });
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on("failed", (job, error) => {
    console.error(`[queue:${TASK_REMINDER_QUEUE}] job ${job?.id} failed: ${error.message}`);
  });

  worker.on("error", (error) => {
    if (error.code !== "ECONNREFUSED") {
      console.error(`[queue:${TASK_REMINDER_QUEUE}] worker error: ${error.message}`);
    }
  });

  return worker;
}

module.exports = {
  taskReminderQueue,
  TASK_REMINDER_QUEUE,
  TASK_REMINDER_JOB,
  startTaskReminderWorker,
};