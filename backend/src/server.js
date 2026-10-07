const dotenv = require("dotenv");
dotenv.config();

const { createServer } = require("http");
const { Server } = require("socket.io");

const prisma = require("./config/prisma");
const { redis } = require("./config/redis");
const { verifyAccessToken } = require("./utils/jwt");
const {
  startTaskReminderWorker,
  taskReminderQueue,
} = require("./queues/taskReminderQueue");
const {
  startPatternSuggestionWorker,
  schedulePatternCheck,
  patternSuggestionQueue,
} = require("./queues/patternSuggestionQueue");
const {
  startAiGenerationWorker,
  aiGenerationQueue,
} = require("./queues/aiGenerationQueue");
const { startEmailWorker, emailQueue } = require("./queues/emailQueue");
const {
  startDailySummaryWorker,
  scheduleDailySummaryScan,
  dailySummaryQueue,
} = require("./queues/dailySummaryQueue");
const {
  startAdminCopilotWorker,
} = require("./queues/adminCopilotQueue");
const {
  taskSuggestionService,
  dailySummaryService,
  aiService,
  emailService,
  emailValidationService,
  adminCopilotService,
  pushService,
} = require("./config/container");

// The Express app lives in app.js so a test can require it without this file's
// side effects. Everything below is the process around it: the HTTP server,
// Socket.IO, the queue workers and the signal handlers. Nothing here changed —
// the app construction simply moved, unchanged, into its own module.
const app = require("./app");

// The HTTP server wrapping that app. Socket.IO is attached to this exact
// instance rather than to its own listener, so realtime pushes and ordinary
// HTTP traffic share one port — which is why `createServer` is here and not
// inside app.js.
const server = createServer(app);

const PORT = Number(process.env.PORT || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";


const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});

function readAccessToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (fromAuth) {
    return fromAuth;
  }

  const cookieHeader = socket.handshake.headers?.cookie;
  const match = cookieHeader?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("accessToken="));

  return match ? match.slice("accessToken=".length) : null;
}

io.use((socket, next) => {
  const token = readAccessToken(socket);

  if (!token) {
    return next(new Error("Access token is required"));
  }

  try {
    const payload = verifyAccessToken(token);

    if (payload.type !== "access") {
      return next(new Error("Invalid access token"));
    }

    socket.userId = payload.userId;
    next();
  } catch {
    next(new Error("Invalid or expired access token"));
  }
});

io.on("connection", (socket) => {
  const { realtimeService, prisma } = require("./config/container");
  const room = realtimeService.roomForUser(socket.userId);

  socket.join(room);
  console.log(`WebSocket client connected: ${socket.id} (user ${socket.userId})`);

  socket.emit("connected", {
    userId: socket.userId,
    message: "Socket.IO connected",
  });

  const { registerChatSocket } = require("./sockets/communitySocket");
  registerChatSocket(socket, { prisma, realtimeService });

  socket.on("disconnect", (reason) => {
    console.log(`WebSocket client disconnected: ${socket.id} (${reason})`);
  });
});

// Binds the HTTP port as a promise so startup can await it.
//
// Without an `error` listener a port conflict surfaces as an unhandled
// 'error' event and a raw stack dump, and it does so *after* the database
// connection, Redis and four BullMQ workers have already been spun up.
function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);

      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use, so this server did not start. ` +
              `Another copy is probably still running. Stop it, or set a ` +
              `different PORT in backend/.env.`
          )
        );
        return;
      }

      if (error.code === "EACCES") {
        reject(
          new Error(
            `Not allowed to bind port ${port}. Ports below 1024 need elevated ` +
              `privileges; pick a higher PORT in backend/.env.`
          )
        );
        return;
      }

      reject(error);
    };

    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

async function start() {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    console.warn(
      "[AI] No AI provider API key configured (GEMINI_API_KEY / OPENROUTER_API_KEY). AI endpoints will fail until set."
    );
  }

  if (!emailService.isConfigured()) {
    console.warn(
      "[EmailService] BREVO_API_KEY / BREVO_SENDER_EMAIL is not set. Password reset codes and notification email will fail until set."
    );
  }

  if (!pushService.isConfigured()) {
    console.warn(
      "[PushService] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not set. Browser push will be disabled until set."
    );
  }

  if (emailValidationService.isEnabled() && !emailValidationService.isConfigured()) {
    console.warn(
      "[EmailValidationService] NODE_ENV=production but ZEROBOUNCE_API_KEY is not set. Registration will fail with 503 until set."
    );
  }

  try {
    await prisma.$connect();
    console.log("Database connected");

    const { notificationService, realtimeService } = require("./config/container");
    realtimeService.attach(io);

    // Claim the port before the queues and Redis come up, so losing a port race
    // fails immediately instead of after four workers have connected.
    await listen(PORT);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Socket.IO running on http://localhost:${PORT}`);

    let reminderWorker;
    try {
      reminderWorker = startTaskReminderWorker({ notificationService });
      console.log("Task reminder worker started");
    } catch (error) {
      console.warn(
        `[reminders] worker unavailable (${error.message}) — reminder jobs disabled`
      );
      reminderWorker = { close: async () => {} };
    }

    let patternWorker;
    let patternCheckInterval = Math.max(
      60_000,
      Number(process.env.PATTERN_CHECK_INTERVAL_MS) || 3_600_000
    );
    try {
      patternWorker = startPatternSuggestionWorker({ taskSuggestionService });
      console.log("Task pattern suggestion worker started");

      await schedulePatternCheck(patternSuggestionQueue, patternCheckInterval);
      console.log(
        `Task pattern suggestion check scheduled every ${patternCheckInterval}ms`
      );
    } catch (error) {
      console.warn(
        `[patterns] worker/scheduler unavailable (${error.message}) — pattern suggestions disabled`
      );
      patternWorker = { close: async () => {} };
    }

    let aiWorker;
    try {
      aiWorker = startAiGenerationWorker({ aiService });
      console.log("AI generation worker started");
    } catch (error) {
      console.warn(
        `[ai] worker unavailable (${error.message}) — AI generation processed inline`
      );
      aiWorker = { close: async () => {} };
    }

    let emailWorker;
    try {
      emailWorker = startEmailWorker({ emailService, dailySummaryService });
      console.log("Email worker started");
    } catch (error) {
      console.warn(
        `[email] worker unavailable (${error.message}) — notification email disabled`
      );
      emailWorker = { close: async () => {} };
    }

    // The daily summary is the one email that arrives without a user action to
    // trigger it, so it runs on its own clock: a recurring scan enqueues a recap
    // per eligible account for the hour their own timezone has reached. Same
    // degradation contract as every other worker — if the scheduler cannot
    // start, nothing else in the product behaves differently.
    let dailySummaryWorker;
    let dailySummaryInterval = Math.max(
      60_000,
      Number(process.env.DAILY_SUMMARY_CHECK_INTERVAL_MS) || 1_800_000
    );
    try {
      dailySummaryWorker = startDailySummaryWorker({ dailySummaryService });
      console.log("Daily summary worker started");

      await scheduleDailySummaryScan(dailySummaryQueue, dailySummaryInterval);
      console.log(
        `Daily summary scan scheduled every ${dailySummaryInterval}ms`
      );
    } catch (error) {
      console.warn(
        `[daily-summary] worker/scheduler unavailable (${error.message}) — daily summaries disabled`
      );
      dailySummaryWorker = { close: async () => {} };
    }

    // Started last, and for the same reason the copilot degrades rather than
    // fails: if this worker cannot start, `ask` still answers inline. The
    // durability guarantee is weaker — an admin who closes the tab mid-answer
    // has to reload to see it — but the ask itself still succeeds, which is the
    // property that matters.
    let copilotWorker;
    try {
      copilotWorker = startAdminCopilotWorker({ adminCopilotService });
      console.log("Admin copilot worker started");
    } catch (error) {
      console.warn(
        `[admin-copilot] worker unavailable (${error.message}) — answers processed inline`
      );
      copilotWorker = { close: async () => {} };
    }

    async function shutdown(signal) {
      console.log(`${signal} received, shutting down gracefully...`);
      io.close();
      try {
        await reminderWorker.close();
      } catch (error) {
        console.warn(`[reminders] close failed: ${error.message}`);
      }
      try {
        await patternWorker.close();
      } catch (error) {
        console.warn(`[patterns] worker close failed: ${error.message}`);
      }
      try {
        await dailySummaryWorker.close();
      } catch (error) {
        console.warn(`[daily-summary] worker close failed: ${error.message}`);
      }
      try {
        await aiWorker.close();
      } catch (error) {
        console.warn(`[ai] worker close failed: ${error.message}`);
      }
      try {
        await copilotWorker.close();
      } catch (error) {
        console.warn(`[admin-copilot] worker close failed: ${error.message}`);
      }
      try {
        await taskReminderQueue.close();
      } catch (error) {
        console.warn(`[queue] close failed: ${error.message}`);
      }
      try {
        await patternSuggestionQueue.close();
      } catch (error) {
        console.warn(`[patterns] queue close failed: ${error.message}`);
      }
      try {
        await dailySummaryQueue.close();
      } catch (error) {
        console.warn(`[daily-summary] queue close failed: ${error.message}`);
      }
      try {
        await aiGenerationQueue.close();
      } catch (error) {
        console.warn(`[ai] queue close failed: ${error.message}`);
      }
      try {
        await emailWorker.close();
      } catch (error) {
        console.warn(`[email] worker close failed: ${error.message}`);
      }
      try {
        await emailQueue.close();
      } catch (error) {
        console.warn(`[email] queue close failed: ${error.message}`);
      }
      redis.disconnect();
      await prisma.$disconnect();
      server.close(() => process.exit(0));
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    // Release the database handle so a failed start does not leave the pool
    // open behind a process that is about to exit.
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

start();