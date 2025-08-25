const { createClient } = require("redis");

// Log credentials for debugging
console.log("🔍 [TEST] Redis connection details:");
console.log(
  "  - Host: redis-17897.crce176.me-central-1-1.ec2.redns.redis-cloud.com"
);
console.log("  - Port: 17897");
console.log("  - Username: default");
console.log("  - Password preview: 9CSHi9SdcJ... (32 chars)");

const client = createClient({
  socket: {
    host: "redis-17897.crce176.me-central-1-1.ec2.redns.redis-cloud.com",
    port: 17897,
  },
  username: "default",
  password: "9CSHi9SdcJty6lpvwP13mJn6eMxa0wWE",
});

client.on("error", (error) => console.log("❌ Test Redis Client Error", error));
client.on("connect", () => console.log("✅ Test Redis connected"));
client.on("ready", () => console.log("🚀 Test Redis ready"));

async function testRedis() {
  try {
    console.log("🔄 [TEST] Attempting to connect...");
    await client.connect();
    console.log("✅ Redis connected successfully");

    // Test basic operations
    console.log("🔄 [TEST] Testing basic operations...");
    await client.set("test:ocean", "working");
    const result = await client.get("test:ocean");
    console.log("✅ Test result:", result);

    // Test job queue operations
    console.log("🔄 [TEST] Testing queue operations...");
    await client.lPush("jobs:queue", "job1");
    const queueLength = await client.lLen("jobs:queue");
    console.log("✅ Queue length:", queueLength);

    // Clean up
    await client.del("test:ocean", "jobs:queue");
    console.log("✅ Redis is ready for job processing!");

    // Test environment variable loading
    console.log("\n🔍 [TEST] Environment variable check:");
    console.log("  - NODE_ENV:", process.env.NODE_ENV || "not set");
  } catch (error) {
    console.error("❌ Redis test failed:", error);
    console.error("❌ Error details:", error.message);
  } finally {
    await client.disconnect();
    console.log("🔌 [TEST] Disconnected from Redis");
  }
}

testRedis();
