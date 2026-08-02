import "./env.js"; // must be first: loads .env before @sera/db reads DATABASE_URL

import { randomUUID } from "node:crypto";
import {
  AUDIT_QUEUE,
  progressChannel,
  type AuditJobData,
  type Finding,
  type ProgressEvent,
  type ProgressStage,
} from "@sera/core";
import { auditJobs, db } from "@sera/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publish(
  jobId: string,
  stage: ProgressStage,
  message: string,
  progress: number,
): Promise<void> {
  const evt: ProgressEvent = {
    jobId,
    stage,
    message,
    progress,
    at: new Date().toISOString(),
  };
  await publisher.publish(progressChannel(jobId), JSON.stringify(evt));
}

/**
 * Placeholder findings so the UI has something real-shaped to render.
 * Phase 2 (extraction) + Phase 3 (rule engine) replace this entirely.
 */
function dummyFindings(): Finding[] {
  return [
    {
      id: randomUUID(),
      type: "duplicate_charge",
      title: "Duplicate metabolic panel (CPT 80053)",
      explanation:
        "A comprehensive metabolic panel was billed twice on the same date of service.",
      estimatedOvercharge: 120,
      confidence: 0.92,
      source: "rule",
    },
    {
      id: randomUUID(),
      type: "above_fair_price",
      title: "ER visit billed 3.2× the Medicare rate (CPT 99284)",
      explanation:
        "Charged $612 versus a Medicare reference of ~$190 for the same code.",
      estimatedOvercharge: 180,
      confidence: 0.7,
      source: "rule",
    },
    {
      id: randomUUID(),
      type: "eob_mismatch",
      title: "Balance billed beyond EOB patient responsibility",
      explanation:
        "The provider billed $40 more than the patient-responsibility amount on the insurer's EOB.",
      estimatedOvercharge: 40,
      confidence: 0.8,
      source: "rule",
    },
  ];
}

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE,
  async (job) => {
    const { jobId } = job.data;

    await db
      .update(auditJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(auditJobs.id, jobId));

    await publish(jobId, "parsing", "Reading the bill…", 0.2);
    await sleep(700);
    await publish(jobId, "parsing", "Parsed 14 line items", 0.35);
    await sleep(500);
    await publish(jobId, "checking", "Checking duplicates & unbundling…", 0.55);
    await sleep(700);
    await publish(jobId, "checking", "Comparing charges to Medicare rates…", 0.7);
    await sleep(700);
    await publish(jobId, "scoring", "Scoring findings…", 0.9);
    await sleep(500);

    const findings = dummyFindings();
    const total = findings.reduce((s, f) => s + f.estimatedOvercharge, 0);

    await db
      .update(auditJobs)
      .set({
        status: "done",
        findings,
        totalOvercharge: total,
        updatedAt: new Date(),
      })
      .where(eq(auditJobs.id, jobId));

    await publish(
      jobId,
      "done",
      `Found $${total} across ${findings.length} issues`,
      1,
    );
  },
  { connection },
);

worker.on("failed", async (job, err) => {
  if (!job) return;
  const { jobId } = job.data;
  await db
    .update(auditJobs)
    .set({ status: "error", error: err.message, updatedAt: new Date() })
    .where(eq(auditJobs.id, jobId))
    .catch(() => {});
  await publish(jobId, "error", err.message, 1).catch(() => {});
});

worker.on("ready", () => {
  console.log(`[worker] listening on queue "${AUDIT_QUEUE}"`);
});
