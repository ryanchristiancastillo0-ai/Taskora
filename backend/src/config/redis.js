const { Redis } = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let warned = false;

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy: (times) => {
    if (times > 10) {
      return null;
    }
    return Math.min(times * 200, 3000);
  },
});

redis.on("error", (error) => {
  if (!warned) {
    console.warn(
      `[redis] unavailable at ${REDIS_URL}: ${error.message} — caching and queues will fail open`
    );
    warned = true;
  }
});

redis.on("ready", () => {
  warned = false;
});

module.exports = { redis, REDIS_URL };