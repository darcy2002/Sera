import type { Finding } from "@sera/core";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const auditStatus = pgEnum("audit_status", [
  "queued",
  "processing",
  "done",
  "error",
]);

export const auditSource = pgEnum("audit_source", ["sample", "upload"]);

/**
 * One audit run. Findings are kept inline as JSONB (small, read together);
 * the parsed bill is persisted in line_item / eob_line below.
 */
export const auditJobs = pgTable("audit_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: auditStatus("status").notNull().default("queued"),
  source: auditSource("source").notNull().default("sample"),
  fileRef: text("file_ref"),
  findings: jsonb("findings").$type<Finding[]>().notNull().default([]),
  totalOvercharge: real("total_overcharge").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ttlExpiresAt: timestamp("ttl_expires_at", { withTimezone: true }),
});

export type AuditJobRow = typeof auditJobs.$inferSelect;
export type NewAuditJobRow = typeof auditJobs.$inferInsert;

/**
 * Reference: Medicare national payment rates by procedure code. Seeded from a
 * curated subset (see packages/db/seed/medicare_rates.csv); production would
 * load the full CMS Physician Fee Schedule.
 */
export const medicareRates = pgTable("medicare_rate", {
  code: text("code").primaryKey(),
  description: text("description").notNull().default(""),
  nationalRate: real("national_rate").notNull(),
  source: text("source").notNull().default("cms-pfs-subset"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MedicareRateRow = typeof medicareRates.$inferSelect;

/** A parsed line item belonging to an audit job. */
export const lineItems = pgTable("line_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => auditJobs.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  description: text("description").notNull().default(""),
  units: integer("units").notNull().default(1),
  unitCharge: real("unit_charge"),
  charge: real("charge").notNull(),
  serviceDate: text("service_date"),
  patientCharge: real("patient_charge"),
});

export type LineItemRow = typeof lineItems.$inferSelect;
export type NewLineItemRow = typeof lineItems.$inferInsert;

/** A parsed EOB line belonging to an audit job. */
export const eobLines = pgTable("eob_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => auditJobs.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  billed: real("billed").notNull().default(0),
  allowedAmount: real("allowed_amount").notNull().default(0),
  patientResponsibility: real("patient_responsibility").notNull().default(0),
});

export type EobLineRow = typeof eobLines.$inferSelect;
export type NewEobLineRow = typeof eobLines.$inferInsert;
