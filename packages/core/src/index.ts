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

// ---- Structured bill (input to the rule engine) ----

/** One line on an itemized medical bill. */
export interface LineItem {
  id: string;
  /** CPT / HCPCS procedure code, e.g. "99284". */
  code: string;
  description: string;
  /** Number of units billed (usually 1). */
  units: number;
  /** Charge per unit, if the bill itemizes it. */
  unitCharge?: number;
  /** Total charge for the line (USD). */
  charge: number;
  /** ISO date of service, e.g. "2026-05-14". */
  serviceDate: string;
  /** Amount the provider is billing the patient for this line, if known. */
  patientCharge?: number;
}

/** One line from an insurer's Explanation of Benefits (EOB). */
export interface EobLine {
  code: string;
  /** What the provider billed. */
  billed: number;
  /** What the insurer allows for the code. */
  allowedAmount: number;
  /** What the patient is actually responsible for per the EOB. */
  patientResponsibility: number;
}

// ---- Rule engine contract ----

/** Everything a rule needs to evaluate a bill. Pure data, no I/O. */
export interface RuleContext {
  lineItems: LineItem[];
  eobLines: EobLine[];
  /** code → Medicare national rate (USD). */
  medicareRates: Map<string, number>;
}

/** A rule is a pure function from a bill to zero or more findings. */
export type Rule = (ctx: RuleContext) => Finding[];

/**
 * Charges above this multiple of the Medicare rate are flagged as
 * unreasonable. 3× is a common patient-advocate threshold. Tunable.
 */
export const FAIR_PRICE_MULTIPLE = 3;
