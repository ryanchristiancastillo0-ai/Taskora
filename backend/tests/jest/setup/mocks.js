"use strict";

/**
 * Module mocks, applied to every test file before the app is required.
 *
 * `setupFiles` (not `setupFilesAfterEnv`) is what makes this work: these mocks
 * have to exist before `src/app.js` pulls in `config/container.js`, because the
 * container constructs Prisma-backed services, the Redis-backed CacheService,
 * five BullMQ queues and the Brevo mailer at import time.
 *
 * Nothing here changes production code. Each mock replaces one module with the
 * smallest thing that keeps that module's public shape intact, so the code under
 * test is still the real middleware, the real controllers and the real services.
 *
 * Every factory requires its helper lazily. Jest rejects a mock factory that
 * closes over a variable from the enclosing scope — the guard exists so a
 * factory cannot capture something half-initialised — and `require` inside the
 * factory is the supported way to reach a helper.
 */

jest.mock("../../../src/config/prisma.js", () => require("../../support/memoryDb").prisma);

jest.mock("../../../src/config/redis.js", () => require("../../support/redisStub"));

// The five queues. Each exports its queue under several constant names that the
// services read, so the stub hands the same object to every one of them.
jest.mock("../../../src/queues/taskReminderQueue.js", () => {
  const { buildQueueModule } = require("../../support/queueStub");
  const module = buildQueueModule({
    queueName: "taskReminderQueue",
    moduleName: "task-reminders",
    constantNames: ["TASK_REMINDER_QUEUE"],
    workerNames: ["startTaskReminderWorker"],
  });
  module.TASK_REMINDER_JOB = { name: "TASK_REMINDER_JOB" };
  return module;
});

jest.mock("../../../src/queues/aiGenerationQueue.js", () => {
  const { buildQueueModule } = require("../../support/queueStub");
  const module = buildQueueModule({
    queueName: "aiGenerationQueue",
    moduleName: "ai-generation",
    constantNames: ["AI_GENERATION_QUEUE"],
    workerNames: ["startAiGenerationWorker"],
  });
  module.AI_GENERATION_JOB = { name: "AI_GENERATION_JOB" };
  return module;
});

jest.mock("../../../src/queues/emailQueue.js", () => {
  const { buildQueueModule } = require("../../support/queueStub");
  const module = buildQueueModule({
    queueName: "emailQueue",
    moduleName: "email",
    constantNames: ["EMAIL_QUEUE"],
    workerNames: ["startEmailWorker"],
  });
  module.EMAIL_JOB = { name: "EMAIL_JOB" };
  return module;
});

jest.mock("../../../src/queues/adminCopilotQueue.js", () => {
  const { buildQueueModule } = require("../../support/queueStub");
  const module = buildQueueModule({
    queueName: "adminCopilotQueue",
    moduleName: "admin-copilot",
    constantNames: ["ADMIN_COPILOT_QUEUE"],
    workerNames: ["startAdminCopilotWorker"],
  });
  module.ADMIN_COPILOT_JOB = { name: "ADMIN_COPILOT_JOB" };
  return module;
});

jest.mock("../../../src/queues/patternSuggestionQueue.js", () => {
  const { buildQueueModule } = require("../../support/queueStub");
  const module = buildQueueModule({
    queueName: "patternSuggestionQueue",
    moduleName: "pattern-suggestions",
    constantNames: ["PATTERN_SUGGESTION_QUEUE"],
    workerNames: ["startPatternSuggestionWorker", "schedulePatternCheck"],
  });
  module.PATTERN_SUGGESTION_JOB = { name: "PATTERN_SUGGESTION_JOB" };
  return module;
});

// Brevo. Replaces the class, so EmailService's constructor signature and every
// method the services call stay identical.
jest.mock("../../../src/services/user/emailService.js", () => require("../../support/emailServiceStub"));
