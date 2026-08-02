import "./env.js"; // must be first: loads .env before @sera/db reads DATABASE_URL

import { serve } from "@hono/node-server";
import {
  AUDIT_QUEUE,
  progressChannel,
  type AuditJobData,
  type ProgressEvent,
  type ProgressStage,
} from "@sera/core";
import { auditJobs, db, lineItems } from "@sera/db";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const port = Number(process.env.API_PORT ?? 8787);

// Producer connection + queue.
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue<AuditJobData>(AUDIT_QUEUE, { connection });

const app = new Hono();
app.use("/*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// Create an audit job and enqueue it.
app.post("/api/audits", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { source?: string };
  const source = body.source === "upload" ? "upload" : "sample";

  const [job] = await db.insert(auditJobs).values({ source }).returning();
  if (!job) return c.json({ error: "failed to create job" }, 500);

  await queue.add(
    "audit",
    { jobId: job.id },
    { removeOnComplete: true, removeOnFail: 100 },
  );
  return c.json({ jobId: job.id });
});

// Fetch a job (status + findings + parsed line items).
app.get("/api/audits/:id", async (c) => {
  const id = c.req.param("id");
  const [job] = await db.select().from(auditJobs).where(eq(auditJobs.id, id));
  if (!job) return c.json({ error: "not found" }, 404);
  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.jobId, id));
  return c.json({ ...job, lineItems: items });
});

// Stream live progress via SSE (backed by Redis pub/sub from the worker).
app.get("/api/audits/:id/stream", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const sub = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    stream.onAbort(() => resolveDone());

    sub.on("message", (_channel, payload) => {
      void stream.writeSSE({ event: "progress", data: payload });
      try {
        const evt = JSON.parse(payload) as ProgressEvent;
        if (evt.stage === "done" || evt.stage === "error") resolveDone();
      } catch {
        /* ignore malformed payloads */
      }
    });

    await sub.subscribe(progressChannel(id));

    // Snapshot current state in case we connect mid- or post-processing.
    const [job] = await db.select().from(auditJobs).where(eq(auditJobs.id, id));
    if (job) {
      const stage: ProgressStage =
        job.status === "done"
          ? "done"
          : job.status === "error"
            ? "error"
            : job.status === "processing"
              ? "checking"
              : "queued";
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify({
          jobId: id,
          stage,
          message: "connected",
          progress: job.status === "done" ? 1 : 0,
          at: new Date().toISOString(),
        } satisfies ProgressEvent),
      });
      if (job.status === "done" || job.status === "error") resolveDone();
    }

    await done;
    await stream.writeSSE({ event: "end", data: "done" });
    await sub.quit().catch(() => {});
  });
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
