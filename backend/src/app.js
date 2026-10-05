const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { uploadDir } = require("./middleware/uploadMiddleware");
const { errorMiddleware, notFoundMiddleware } = require("./middleware/errorMiddleware");
const {
  apiRateLimiter,
  uploadRateLimiter,
  passwordResetRateLimiter,
  authRateLimiter,
  aiRateLimiter,
} = require("./middleware/rateLimiter");
const {
  adminService,
  adminCopilotService,
  supportService,
} = require("./config/container");

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// The Express application, and nothing else.
//
// This is the same middleware stack and the same 20 route mounts that used to
// live inline in server.js, moved out byte-for-byte so that `npm start` behaves
// exactly as before. It exists as its own module for one reason: server.js ends
// by calling start(), which connects Prisma, attaches Redis, starts four BullMQ
// workers and binds a port. Requiring that from a test would mean every test
// file took a listening socket and a queue worker with it, and there is no way
// to un-take them between files.
//
// server.js owns the process (HTTP server, Socket.IO, workers, signals) and now
// imports `app` from here. Supertest requires this module instead and never
// listens on anything.
//
// dotenv is NOT loaded here, on purpose. server.js still loads it before it
// imports this file, so production is unaffected, and a test process gets to
// decide its own environment instead of silently inheriting the developer's
// .env.

// Global middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// Local file storage
app.use("/uploads", express.static(uploadDir));

// Rate limiting.
//
// Redis-backed, so the counters are shared by every instance of this process:
// spreading requests over replicas to get a fresh budget each does not work, and
// nothing is cached in memory between requests. Mounted after cookieParser and
// cors so a limiter can read the access cookie (counting per account rather than
// per address) and so a 429 still carries the CORS headers a browser needs to
// read the response at all.
//
// Ahead of the routes, which is the point: a limited request must never reach a
// controller, Multer or the database. Nothing outside /api is affected — the
// /uploads static mount above and the Socket.IO handshake are untouched, and the
// BullMQ workers in server.js are not in this stack to begin with.
//
// The reset limiter is mounted before the general auth limiter on purpose, so a
// password reset call is counted against both tiers: it is a login-shaped
// attempt as well as a reset-shaped one.
app.use("/api", apiRateLimiter);
app.use("/api", uploadRateLimiter);
app.use("/api/auth", passwordResetRateLimiter);
app.use("/api/auth", authRateLimiter);
app.use("/api/ai", aiRateLimiter);

// Routes
app.use("/api/auth", require("./routes/auth/authRoutes.js"));
// The container already holds one adminCopilotService, and this router takes it
// rather than building a second. The worker is handed the same instance by
// server.js, so the HTTP path and the queue path cannot drift.
app.use(
  "/api/admin",
  require("./routes/admin/adminRoutes.js")({
    adminService,
    adminCopilotService,
    // Passed rather than required from inside the factory for the same reason as
    // the two above: supportService is shared with the registration path, so a
    // router that built its own would give the two halves different instances.
    supportService,
  })
);
app.use("/api/users", require("./routes/users/userRoutes.js"));
app.use("/api/profile", require("./routes/users/profileRoutes.js"));
app.use("/api/settings", require("./routes/users/settingsRoutes.js"));
app.use("/api/notifications", require("./routes/notifications/notificationRoutes.js"));
app.use("/api/support", require("./routes/support/supportRoutes.js"));
app.use("/api/projects", require("./routes/projects/projectRoutes.js"));
app.use("/api/tasks", require("./routes/tasks/taskRoutes.js"));
app.use("/api/task-suggestions", require("./routes/tasks/taskSuggestionRoutes.js"));
app.use("/api", require("./routes/tasks/subtaskRoutes.js"));
app.use("/api/tags", require("./routes/tasks/tagRoutes.js"));
app.use("/api/notes", require("./routes/notes/noteRoutes.js"));
app.use("/api/goals", require("./routes/goals/goalRoutes.js"));
app.use("/api/habits", require("./routes/habits/habitRoutes.js"));
app.use("/api/search", require("./routes/search/searchRoutes.js"));
app.use("/api/community/friends", require("./routes/community/friendshipRoutes.js"));
app.use("/api/community/conversations", require("./routes/community/conversationRoutes.js"));
app.use("/api", require("./routes/attachments/attachmentRoutes.js"));
app.use("/api/ai", require("./routes/ai/aiRoutes.js"));
app.use("/api/tts", require("./routes/ai/ttsRoutes.js"));

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "OK" });
});

// 404 + centralized error handling
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
