const asyncHandler = require("../../utils/asyncHandler.js");

// Every handler here is mounted behind authMiddleware + adminGuard, so by the
// time a method runs the caller is a non-suspended ADMIN. The guard puts the
// verified role on req.user; see middleware/adminGuard.js for why it reads the
// role from the database on every request instead of trusting the access token.
class AdminController {
  constructor(adminService, adminCopilotService) {
    this.adminService = adminService;
    this.adminCopilotService = adminCopilotService;
  }

  /**
   * The admin's copilot history, newest first.
   *
   * Read-only for the asking admin alone: the service scopes every query to the
   * userId the guard put on req.user, so there is no id parameter to tamper with
   * and no way to read another admin's questions.
   */
  copilotThread = asyncHandler(async (req, res) => {
    const data = await this.adminCopilotService.listExchanges(
      req.user.userId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  clearCopilotThread = asyncHandler(async (req, res) => {
    const data = await this.adminCopilotService.clearExchanges(req.user.userId);

    return res.status(200).json({ success: true, data });
  });

  overview = asyncHandler(async (req, res) => {
    const data = await this.adminService.overview(req.query);

    return res.status(200).json({ success: true, data });
  });

  listUsers = asyncHandler(async (req, res) => {
    const data = await this.adminService.listUsers(req.query);

    return res.status(200).json({ success: true, data });
  });

  getUser = asyncHandler(async (req, res) => {
    const data = await this.adminService.getUser(req.params);

    return res.status(200).json({ success: true, data });
  });

  // The acting admin is threaded through from req.user rather than left to the
  // service to work out, because the service needs it to refuse a self-demotion
  // and has no business knowing about request objects.
  updateUser = asyncHandler(async (req, res) => {
    const data = await this.adminService.updateUser(req.user.userId, req.params, req.body);

    return res.status(200).json({ success: true, data });
  });

  growth = asyncHandler(async (req, res) => {
    const data = await this.adminService.growth(req.query);

    return res.status(200).json({ success: true, data });
  });

  taskMix = asyncHandler(async (req, res) => {
    const taskMix = await this.adminService.taskMix();

    return res.status(200).json({ success: true, data: taskMix });
  });

  weekly = asyncHandler(async (req, res) => {
    const data = await this.adminService.weekly(req.query);

    return res.status(200).json({ success: true, data });
  });

  // The header's search box. Same auth story as the lists it previews: it is
  // assembled from them, so anything this returns the caller could have read
  // from /users, /tasks and /projects anyway.
  search = asyncHandler(async (req, res) => {
    const data = await this.adminService.search(req.query);

    return res.status(200).json({ success: true, data });
  });

  listTasks = asyncHandler(async (req, res) => {
    const data = await this.adminService.listTasks(req.query);

    return res.status(200).json({ success: true, data });
  });

  listProjects = asyncHandler(async (req, res) => {
    const data = await this.adminService.listProjects(req.query);

    return res.status(200).json({ success: true, data });
  });

  aiUsage = asyncHandler(async (req, res) => {
    const data = await this.adminService.aiUsage(req.query);

    return res.status(200).json({ success: true, data });
  });

  notifications = asyncHandler(async (req, res) => {
    const data = await this.adminService.notifications(req.query);

    return res.status(200).json({ success: true, data });
  });

  reports = asyncHandler(async (req, res) => {
    const data = await this.adminService.reports(req.query);

    return res.status(200).json({ success: true, data });
  });

  // The audit trail. Read-only by construction: AdminService exposes exactly one
  // method for these rows and none of them writes. Access is decided by the two
  // middlewares this whole router sits behind, so a non-admin gets a 403 from
  // adminGuard before this handler is ever reached — there is no per-request role
  // check here that could be forgotten on a second audit route later.
  auditLogs = asyncHandler(async (req, res) => {
    const data = await this.adminService.listAuditLogs(req.query);

    return res.status(200).json({ success: true, data });
  });

  activity = asyncHandler(async (req, res) => {
    const activity = await this.adminService.activity();

    return res.status(200).json({ success: true, data: activity });
  });

  // The admin copilot. Read-only by construction: the copilot service answers
  // from the same AdminService reads the dashboard uses and is given no write
  // path, so a question can never change platform data. The asking admin is
  // threaded through because the provider is resolved from their own profile.
  //
  // 202, not 200, because the normal case is that the answer does not exist
  // yet. The question has been stored and a job queued; the client polls
  // GET /copilot/thread (or listens for the socket push) for the answer. A 200
  // here would be a lie that only holds when Redis happens to be down.
  ask = asyncHandler(async (req, res) => {
    const data = await this.adminCopilotService.ask(req.user.userId, req.body);

    return res.status(202).json({ success: true, data });
  });
}

module.exports = AdminController;
