const prisma = require("./prisma");
const { redis } = require("./redis");
const { taskReminderQueue } = require("../queues/taskReminderQueue");
const { aiGenerationQueue } = require("../queues/aiGenerationQueue");
const { emailQueue } = require("../queues/emailQueue");
const { adminCopilotQueue } = require("../queues/adminCopilotQueue");

const { AdminService } = require("../services/admin/adminService.js");
const AdminCopilotService = require("../services/admin/adminCopilotService.js");
const { AuditService } = require("../services/audit/auditService.js");
const { SupportService } = require("../services/support/supportService.js");

const CacheService = require("../services/platform/cacheService.js");
const EmailService = require("../services/platform/emailService.js");
const EmailValidationService = require("../services/auth/emailValidationService.js");
const NotificationService = require("../services/notifications/notificationService.js");
const PushService = require("../services/notifications/pushService.js");
const DailySummaryService = require("../services/notifications/dailySummaryService.js");
const ReminderScheduler = require("../services/tasks/reminderScheduler.js");
const RealtimeService = require("../services/platform/realtimeService.js");
const FileService = require("../services/platform/fileService.js");
const PersonalizationService = require("../services/users/personalizationService.js");
const TaskService = require("../services/tasks/taskService.js");
const TaskPatternService = require("../services/tasks/taskPatternService.js");
const TaskSuggestionService = require("../services/tasks/taskSuggestionService.js");
const AIService = require("../services/ai/aiService.js");
const WorkspaceSnapshotService = require("../services/ai/workspaceSnapshotService.js");
const TtsService = require("../services/ai/ttsService.js");

const cacheService = new CacheService(redis);
const realtimeService = new RealtimeService();
const pushService = new PushService(prisma);
const emailService = new EmailService();
const emailValidationService = new EmailValidationService();
const notificationService = new NotificationService(prisma, cacheService, realtimeService, {
  queue: emailQueue,
  pushService,
});
const dailySummaryService = new DailySummaryService(prisma, emailService, emailQueue);
const reminderScheduler = new ReminderScheduler(taskReminderQueue, redis);
const fileService = new FileService();

const personalizationService = new PersonalizationService(prisma);
const workspaceSnapshotService = new WorkspaceSnapshotService(prisma);
const aiService = new AIService(prisma, personalizationService, {
  queue: aiGenerationQueue,
  realtimeService,
  fileService,
  workspaceSnapshotService,
});
const ttsService = new TtsService();

const taskPatternService = new TaskPatternService(prisma);

// The admin copilot, built here rather than inside the admin router so the same
// instance backs both the HTTP path and the queue worker. Two instances would
// still work — the service holds no mutable state — but then "which one is
// answering" would depend on which file you were reading, and the realtime
// pushes would come from a service the router does not know about.
const adminService = new AdminService(prisma);
const adminCopilotService = new AdminCopilotService(prisma, adminService, aiService, {
  queue: adminCopilotQueue,
  realtimeService,
});

// Built before taskService below so it can be handed to the services whose
// deletions are audited. The writer itself is stateless, so this is about wiring
// order rather than a dependency the audit code has on anything else.
const auditService = new AuditService(prisma);

const taskService = new TaskService(
  prisma,
  notificationService,
  cacheService,
  reminderScheduler,
  taskPatternService
);
// The support desk, shared by the caller's routes, the admin triage routes and
// authService (which tells admins a new account appeared). Built here for the
// same reason taskService is: one instance, constructed once, so a notification
// it writes is visible to whichever router or worker is holding it. The
// notificationService dependency is the existing one rather than a second
// notifier, so support updates travel the same realtime and email path as
// everything else in the product.
const supportService = new SupportService(prisma, notificationService);

const taskSuggestionService = new TaskSuggestionService(
  prisma,
  notificationService,
  taskPatternService,
  taskService
);

module.exports = {
  prisma,
  redis,
  adminService,
  adminCopilotService,
  adminCopilotQueue,
  auditService,
  supportService,
  cacheService,
  realtimeService,
  pushService,
  emailService,
  emailValidationService,
  notificationService,
  dailySummaryService,
  reminderScheduler,
  fileService,
  personalizationService,
  workspaceSnapshotService,
  aiService,
  ttsService,
  aiGenerationQueue,
  taskService,
  taskPatternService,
  taskSuggestionService,
};