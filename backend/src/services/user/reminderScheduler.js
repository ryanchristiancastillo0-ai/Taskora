const { TASK_REMINDER_QUEUE, TASK_REMINDER_JOB } = require("../../queues/taskReminderQueue.js");

const OPERATION_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    if (timer.unref) {
      timer.unref();
    }
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class ReminderScheduler {
  constructor(queue, client = null) {
    this.queue = queue;
    this.client = client;
    this.enabled = Boolean(queue);
  }

  isAvailable() {
    if (!this.enabled) {
      return false;
    }
    if (!this.client) {
      return true;
    }
    return this.client.status === "ready";
  }

  jobId(taskId) {
    return `task-${taskId}`;
  }

  async scheduleTaskReminder({ taskId, userId, title, dueDate }) {
    if (!this.isAvailable()) {
      return false;
    }

    const target = new Date(dueDate).getTime();
    const delay = Math.max(0, target - Date.now());

    try {
      const addPromise = this.queue.add(
        TASK_REMINDER_JOB,
        { userId, taskId, title, dueDate: target },
        {
          jobId: this.jobId(taskId),
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800 },
        }
      );
      addPromise.catch(() => {});
      await withTimeout(addPromise, OPERATION_TIMEOUT_MS, "queue.add");
      return true;
    } catch (error) {
      console.warn(
        `[reminder-scheduler] failed to schedule task ${taskId}: ${error.message}`
      );
      return false;
    }
  }

  async cancelTaskReminder(taskId) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const removePromise = this.queue.remove(this.jobId(taskId));
      removePromise.catch(() => {});
      await withTimeout(removePromise, OPERATION_TIMEOUT_MS, "queue.remove");
      return true;
    } catch (error) {
      console.warn(
        `[reminder-scheduler] failed to cancel task ${taskId}: ${error.message}`
      );
      return false;
    }
  }
}

module.exports = ReminderScheduler;