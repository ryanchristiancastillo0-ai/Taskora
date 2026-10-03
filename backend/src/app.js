const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { uploadDir } = require("./middleware/uploadMiddleware");
const { errorMiddleware, notFoundMiddleware } = require("./middleware/errorMiddleware");
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

// Routes
app.use("/api/auth", require("./routes/user/authRoutes.js"));
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
app.use("/api/users", require("./routes/user/userRoutes.js"));
app.use("/api/profile", require("./routes/user/profileRoutes.js"));
app.use("/api/settings", require("./routes/user/settingsRoutes.js"));
app.use("/api/notifications", require("./routes/user/notificationRoutes.js"));
app.use("/api/support", require("./routes/user/supportRoutes.js"));
app.use("/api/projects", require("./routes/user/projectRoutes.js"));
app.use("/api/tasks", require("./routes/user/taskRoutes.js"));
app.use("/api/task-suggestions", require("./routes/user/taskSuggestionRoutes.js"));
app.use("/api", require("./routes/user/subtaskRoutes.js"));
app.use("/api/tags", require("./routes/user/tagRoutes.js"));
app.use("/api/notes", require("./routes/user/noteRoutes.js"));
app.use("/api/goals", require("./routes/user/goalRoutes.js"));
app.use("/api/habits", require("./routes/user/habitRoutes.js"));
app.use("/api/search", require("./routes/user/searchRoutes.js"));
app.use("/api/community/friends", require("./routes/user/friendshipRoutes.js"));
app.use("/api/community/conversations", require("./routes/user/conversationRoutes.js"));
app.use("/api", require("./routes/user/attachmentRoutes.js"));
app.use("/api/ai", require("./routes/user/aiRoutes.js"));
app.use("/api/tts", require("./routes/user/ttsRoutes.js"));

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "OK" });
});

// 404 + centralized error handling
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
