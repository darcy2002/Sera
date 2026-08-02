import "./env.js"; // must be first: loads .env before @sera/db reads DATABASE_URL

import {
  AUDIT_QUEUE,
  progressChannel,
  runAudit,
  sampleEobLines,
  sampleLineItems,
  type AuditJobData,
  type ProgressEvent,
  type ProgressStage,
} from "@sera/core";
import {
  auditJobs,
  db,
  eobLines,
  lineItems,
  medicareRates,
} from "@sera/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usd = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE,
  async (job) => {
    const { jobId } = job.data;

    await db
      .update(auditJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(auditJobs.id, jobId));

    // Phase 3: uploads aren't extracted yet, so every job audits the synthetic
    // sample bill. Phase 2 will replace this with OCR/LLM-extracted line items.
    const bill = sampleLineItems;
    const eob = sampleEobLines;

    await publish(jobId, "parsing", "Reading the itemized bill…", 0.2);
    await sleep(500);
    await publish(jobId, "parsing", `Parsed ${bill.length} line items`, 0.35);

    // Persist the parsed bill.
    await db
      .insert(lineItems)
      .values(
        bill.map((li) => ({
          jobId,
          code: li.code,
          description: li.description,
          units: li.units,
          unitCharge: li.unitCharge ?? null,
          charge: li.charge,
          serviceDate: li.serviceDate,
          patientCharge: li.patientCharge ?? null,
        })),
      );
    if (eob.length > 0) {
      await db.insert(eobLines).values(eob.map((e) => ({ jobId, ...e })));
    }

    await publish(jobId, "checking", "Loading Medicare reference rates…", 0.5);
    const rateRows = await db
      .select({ code: medicareRates.code, rate: medicareRates.nationalRate })
      .from(medicareRates);
    const rates = new Map(rateRows.map((r) => [r.code, r.rate]));
    await sleep(400);

    await publish(
      jobId,
      "checking",
      "Checking duplicates, fair price, and EOB…",
      0.7,
    );
    await sleep(500);

    const { findings, totalOvercharge } = runAudit({
      lineItems: bill,
      eobLines: eob,
      medicareRates: rates,
    });

    await publish(jobId, "scoring", "Scoring findings…", 0.9);
    await sleep(300);

    await db
      .update(auditJobs)
      .set({
        status: "done",
        findings,
        totalOvercharge,
        updatedAt: new Date(),
      })
      .where(eq(auditJobs.id, jobId));

    await publish(
      jobId,
      "done",
      `Found ${usd(totalOvercharge)} across ${findings.length} issues`,
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
