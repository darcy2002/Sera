import type { Finding } from "@sera/core";
import {
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
 * One audit run. Phases 2–3 will add related tables (line_items, findings,
 * eob_lines); for the skeleton we keep findings inline as JSONB.
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
