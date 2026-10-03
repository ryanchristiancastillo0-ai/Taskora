"use strict";

/**
 * BullMQ queue stand-ins.
 *
 * Requiring a real queue module constructs a Queue, which opens a Redis
 * connection at import time — so a Jest worker would hold a live socket and a
 * reconnect timer whether or not any test used the queue. These stubs make the
 * queue a plain object, which is also why the suite finishes and exits cleanly
 * with no "open handle" warning.
 *
 * `add` resolves with a job-shaped object because ReminderScheduler treats a
 * truthy result as "the reminder is queued"; a test that creates a task with a
 * due date therefore takes the reminder path rather than the notification
 * fallback.
 */

function makeQueue(name) {
  return {
    name,
    async add() {
      return { id: `${name}-stub-job`, name: `${name}-stub` };
    },
    async getJob() {
      return undefined;
    },
    async getJobCounts() {
      return {};
    },
    async remove() {
      return 1;
    },
    async close() {},
    async obliterate() {},
    on() {
      return this;
    },
  };
}

/**
 * Builds a queue module's exports.
 *
 * `queueNames` are the values that should all share one queue instance — every
 * real module exports its queue under two or three constant names and the
 * services read whichever one. `workerNames` are the `start*Worker` /
 * `schedulePatternCheck` entry points server.js calls; they are inert here
 * because no test starts a worker.
 */
function buildQueueModule({ queueName, moduleName, constantNames = [], workerNames = [] }) {
  const queue = makeQueue(moduleName);
  const module = {};

  for (const name of [queueName, ...constantNames]) module[name] = queue;
  for (const name of workerNames) module[name] = async () => ({ close: async () => {} });

  return module;
}

module.exports = { makeQueue, buildQueueModule };
