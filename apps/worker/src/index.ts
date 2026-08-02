import "./env.js"; // must be first: loads .env before @sera/db reads DATABASE_URL

import {
  AUDIT_QUEUE,
  progressChannel,
  runAudit,
  sampleEobLines,
  sampleLineItems,
  type AuditJobData,
  type EobLine,
  type LineItem,
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
import { extractBill } from "@sera/llm";
import { mediaTypeForRef, readUpload } from "@sera/storage";
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

interface Bill {
  lineItems: LineItem[];
  eobLines: EobLine[];
}

/** Obtain a structured bill: extract from the upload, or use the sample. */
async function loadBill(
  jobId: string,
  source: string,
  fileRef: string | null,
): Promise<Bill> {
  if (source === "upload" && fileRef) {
    await publish(jobId, "parsing", "Reading the document…", 0.15);
    const bytes = await readUpload(fileRef);
    await publish(jobId, "parsing", "Extracting line items with AI…", 0.35);
    try {
      return await extractBill({ data: bytes, mediaType: mediaTypeForRef(fileRef) });
    } catch (err) {
      throw new Error(
        "Couldn't read that document — please upload a clear PDF or photo of an itemized bill.",
        { cause: err },
      );
    }
  }
  await publish(jobId, "parsing", "Reading the itemized bill…", 0.2);
  await sleep(400);
  return { lineItems: sampleLineItems, eobLines: sampleEobLines };
}

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE,
  async (job) => {
    const { jobId } = job.data;

    const [row] = await db
      .select()
      .from(auditJobs)
      .where(eq(auditJobs.id, jobId));
    if (!row) throw new Error(`audit job ${jobId} not found`);

    await db
      .update(auditJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(auditJobs.id, jobId));

    const bill = await loadBill(jobId, row.source, row.fileRef);
    await publish(
      jobId,
      "parsing",
      `Parsed ${bill.lineItems.length} line items`,
      0.45,
    );

    // Persist the parsed bill.
    if (bill.lineItems.length > 0) {
      await db.insert(lineItems).values(
        bill.lineItems.map((li) => ({
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
    }
    if (bill.eobLines.length > 0) {
      await db.insert(eobLines).values(bill.eobLines.map((e) => ({ jobId, ...e })));
    }

    await publish(jobId, "checking", "Loading Medicare reference rates…", 0.6);
    const rateRows = await db
      .select({ code: medicareRates.code, rate: medicareRates.nationalRate })
      .from(medicareRates);
    const rates = new Map(rateRows.map((r) => [r.code, r.rate]));

    await publish(
      jobId,
      "checking",
      "Checking duplicates, fair price, and EOB…",
      0.75,
    );
    await sleep(300);

    const { findings, totalOvercharge } = runAudit({
      lineItems: bill.lineItems,
      eobLines: bill.eobLines,
      medicareRates: rates,
    });

    await publish(jobId, "scoring", "Scoring findings…", 0.9);
    await sleep(200);

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
