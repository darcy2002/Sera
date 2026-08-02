/**
 * @sera/core — shared domain types + constants.
 * Imported by the API, worker, and web so the contract can never drift.
 */

// ---- Job lifecycle ----

export type AuditStatus = "queued" | "processing" | "done" | "error";

export type ProgressStage =
  | "queued"
  | "parsing"
  | "checking"
  | "scoring"
  | "done"
  | "error";

/** A single progress update pushed from the worker → Redis → SSE → browser. */
export interface ProgressEvent {
  jobId: string;
  stage: ProgressStage;
  message: string;
  /** 0..1 */
  progress: number;
  at: string; // ISO timestamp
}

// ---- Findings ----

export type FindingType =
  | "duplicate_charge"
  | "above_fair_price"
  | "eob_mismatch"
  | "unbundling"
  | "upcoding"
  | "quantity_error"
  | "surprise_billing";

export type FindingSource = "rule" | "llm";

export interface Finding {
  id: string;
  type: FindingType;
  title: string;
  explanation: string;
  /** Estimated dollars overcharged for this finding (USD). */
  estimatedOvercharge: number;
  /** 0..1 model/rule confidence. */
  confidence: number;
  source: FindingSource;
}

export interface AuditResult {
  jobId: string;
  status: AuditStatus;
  currency: "USD";
  totalOvercharge: number;
  findings: Finding[];
}

// ---- Queue / pub-sub contract ----

/** BullMQ queue name for audit jobs. */
export const AUDIT_QUEUE = "audit" as const;

/** Payload enqueued for each audit job. */
export interface AuditJobData {
  jobId: string;
}

/** Redis pub/sub channel carrying progress events for a given job. */
export const progressChannel = (jobId: string): string =>
  `audit:progress:${jobId}`;
