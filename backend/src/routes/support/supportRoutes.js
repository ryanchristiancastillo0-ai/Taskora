const express = require("express");

const { SupportService } = require("../../services/support/supportService.js");
const SupportController = require("../../controllers/support/supportController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");
const {
  prisma,
  notificationService,
} = require("../../config/container.js");

/**
 * The caller's support desk: open a ticket, read your own history, rate the
 * experience.
 *
 * A self-building router that pulls the container itself, which is how every
 * non-admin router in this project is wired. Only adminRoutes is a factory,
 * because it needs its services to be shared with a BullMQ worker.
 *
 * Ownership is not enforced here — it is enforced in the service, by scoping
 * every query with the caller's userId. A route-level check would have to be
 * repeated on each handler and could be forgotten on the next one.
 *
 * `/feedback/mine` is declared before `/:id`-style paths on purpose, so the
 * literal segment is not swallowed by a parameter pattern.
 */
const router = express.Router();

const supportService = new SupportService(prisma, notificationService);
const supportController = new SupportController(supportService);

router.get("/feedback/mine", authMiddleware, supportController.getMyFeedback);
router.post("/feedback", authMiddleware, supportController.submitFeedback);

router.get("/requests", authMiddleware, supportController.listRequests);
router.post("/requests", authMiddleware, supportController.createRequest);
router.get("/requests/:id", authMiddleware, supportController.getRequest);

module.exports = router;