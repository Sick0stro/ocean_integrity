import { NextResponse } from "next/server";
import { redis, documentProcessingQueue } from "@/lib/redis";

export async function GET() {
  try {
    console.log("🔍 [API] Testing Redis connection...");

    // Test Redis ping
    const pong = await redis.ping();
    console.log("✅ [API] Redis ping successful:", pong);

    // Test job queue
    const testJob = await documentProcessingQueue.add("test-connection", {
      message: "Redis job queue is working",
      timestamp: new Date().toISOString(),
    });
    console.log("✅ [API] Test job created:", testJob.id);

    return NextResponse.json({
      success: true,
      message: "Redis connection successful",
      jobId: testJob.id,
      ping: pong,
    });
  } catch (error) {
    console.error("❌ [API] Redis test failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
