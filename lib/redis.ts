import { createClient } from "redis";
import { Queue } from "bullmq";

// This file only runs on the server-side
console.log("🔍 [REDIS] Server-side Redis initialization...");

const REDIS_HOST =
  process.env.REDIS_HOST ||
  "redis-17897.crce176.me-central-1-1.ec2.redns.redis-cloud.com";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "17897");
const REDIS_USERNAME = process.env.REDIS_USERNAME || "default";
const REDIS_PASSWORD =
  process.env.REDIS_PASSWORD || "9CSHi9SdcJty6lpvwP13mJn6eMxa0wWE";

console.log("🔍 [REDIS] Environment check:");
console.log("  - REDIS_HOST:", REDIS_HOST);
console.log("  - REDIS_PORT:", REDIS_PORT);
console.log("  - REDIS_PASSWORD exists:", !!REDIS_PASSWORD);

const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  username: REDIS_USERNAME,
  password: REDIS_PASSWORD,
};

export const redis = createClient({
  socket: {
    host: redisConnection.host,
    port: redisConnection.port,
  },
  username: redisConnection.username,
  password: redisConnection.password,
});

redis.on("error", (error) => console.log("❌ Redis Client Error", error));
redis.on("connect", () => console.log("✅ Redis connected successfully"));

export const documentProcessingQueue = new Queue("document-processing", {
  connection: redisConnection,
});

// Auto-connect with error handling
redis.connect().catch((error) => {
  console.error("❌ Redis connection failed:", error);
});
