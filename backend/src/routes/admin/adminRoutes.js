const express = require("express");

const AdminController = require("../../controllers/admin/adminController.js");
const AdminSupportController = require("../../controllers/admin/supportController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const adminGuard = require("../../middleware/adminGuard.js");

/**
 * Builds the admin router.
 *
 * A factory rather than a bare module because the services are constructed in
 * config/container.js. That matters most for the copilot: the HTTP path and the
 * BullMQ worker must share one instance, and a router that built its own would
 * silently give the worker a second one whose realtime pushes came from an
 * object the router knew nothing about. Requiring the container from here
 * instead would work too, but it would drag Redis, five BullMQ queues and the
 * email service into a router that needs none of them, and would make this file
 * impossible to load in a test without those side effects. The caller already
 * has the container, so it passes the two services in.
 *
 * supportService is a third argument for the same DI reason rather than a
 * special case: it is built in the container because authService also holds it,
 * and the router must not construct a second instance or the notifications it
 * writes would come from an object the registration path knows nothing about.
 */
function createAdminRouter({ adminService, adminCopilotService, supportService }) {
  const router = express.Router();

  const adminController = new AdminController(adminService, adminCopilotService);
  const supportController = new AdminSupportController(supportService);

  // authMiddleware answers "is this a signed-in account"; adminGuard answers "is
  // it an admin, and is it still active". Both are required on every route here —
  // the guard fails closed on its own, and authMiddleware is what gives the guard
  // a userId to look up.
  router.use(authMiddleware, adminGuard);

  router.get("/overview", adminController.overview);

  // Declared before "/users/:id" and the other param routes on purpose: a search
  // term is not a cuid, and matching it against an :id pattern would answer a
  // dropdown with a 400 from the id validator.
  router.get("/search", adminController.search);

  router.get("/users", adminController.listUsers);
  router.get("/users/:id", adminController.getUser);
  router.patch("/users/:id", adminController.updateUser);

  router.get("/tasks", adminController.listTasks);
  router.get("/projects", adminController.listProjects);

  router.get("/ai-usage", adminController.aiUsage);
  router.get("/notifications", adminController.notifications);
  router.get("/reports", adminController.reports);
  router.get("/audit-logs", adminController.auditLogs);

  router.get("/growth", adminController.growth);
  router.get("/task-mix", adminController.taskMix);
  router.get("/weekly", adminController.weekly);
  router.get("/activity", adminController.activity);

  // Support triage. Behind the same two middlewares as everything else here:
  // every one of these reads support requests filed by arbitrary users.
  //
  // The rating endpoints are declared before "/support/requests/:id" so the
  // literal segments are not captured by the parameter route. A PATCH on
  // "/support/requests/:id" rather than a "/status" sub-path, because an admin
  // changes status and writes the resolution note in one edit of one form, and
  // splitting them would mean two round trips that could disagree.
  router.get("/support/summary", supportController.feedbackSummary);
  router.get("/support/feedback", supportController.listFeedback);
  router.get("/support/requests", supportController.listRequests);
  router.get("/support/requests/:id", supportController.getRequest);
  router.patch("/support/requests/:id", supportController.updateRequest);

  // The copilot. Declared last so a future "/ask/:something" style path cannot
  // shadow a collection route added above it. Behind the same two middlewares as
  // everything else: it reads platform-wide data.
  //
  // The thread endpoints exist so a closed tab is recoverable. The widget calls
  // GET /copilot/thread on mount to rehydrate, which is the only way an answer
  // that landed while the admin was elsewhere on the console can be shown at
  // all — the 202 response to POST /ask carries no answer, by design.
  router.get("/copilot/thread", adminController.copilotThread);
  router.delete("/copilot/thread", adminController.clearCopilotThread);
  router.post("/ask", adminController.ask);

  return router;
}

module.exports = createAdminRouter;
