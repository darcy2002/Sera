import type { EobLine, LineItem } from "@sera/core";
import { generateObject } from "ai";
import { z } from "zod";
import { getLlmConfig } from "./config.js";
import { getModel } from "./providers.js";

// ---- Schema the model must return ----

export const extractedLineItemSchema = z.object({
  code: z.string().describe("CPT or HCPCS procedure code, e.g. 99284"),
  description: z.string(),
  units: z.number().int().positive().default(1),
  unitCharge: z.number().optional(),
  charge: z.number().describe("total charge for the line, in USD"),
  serviceDate: z
    .string()
    .describe("ISO date of service YYYY-MM-DD, or empty if not shown"),
  patientCharge: z
    .number()
    .optional()
    .describe("amount billed to the patient for this line, if shown"),
});

export const extractedEobLineSchema = z.object({
  code: z.string(),
  billed: z.number().default(0),
  allowedAmount: z.number().default(0),
  patientResponsibility: z.number().default(0),
});

export const billExtractionSchema = z.object({
  lineItems: z.array(extractedLineItemSchema),
  eobLines: z.array(extractedEobLineSchema).default([]),
});

type RawBill = z.infer<typeof billExtractionSchema>;

/** Structured bill ready for the rule engine (ids assigned). */
export interface ExtractedBill {
  lineItems: LineItem[];
  eobLines: EobLine[];
}

export interface ExtractInput {
  /** File bytes (or a base64 string). */
  data: Uint8Array | Buffer | string;
  /** IANA media type, e.g. "application/pdf" or "image/png". */
  mediaType: string;
}

const EXTRACTION_PROMPT = `You are a medical-billing data extractor. Extract every line item from this itemized US medical bill, and any Explanation of Benefits (EOB) if present.

For each line item return: the CPT/HCPCS code, a short description, units, the total charge (USD), the date of service (YYYY-MM-DD), and the amount billed to the patient if shown.
If an EOB is present, return its lines with billed, allowed, and patient-responsibility amounts.

Only extract values that actually appear on the document. Do not invent codes or amounts.`;

/**
 * Extract a structured bill from a document. The `mock` provider returns canned
 * data (no network/key); every real provider runs the same generateObject call.
 */
export async function extractBill(input: ExtractInput): Promise<ExtractedBill> {
  const { provider } = getLlmConfig();
  const raw =
    provider === "mock" ? mockExtraction() : await modelExtraction(input);
  return finalize(raw);
}

async function modelExtraction(input: ExtractInput): Promise<RawBill> {
  const { object } = await generateObject({
    model: getModel(),
    schema: billExtractionSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: input.data, mediaType: input.mediaType },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });
  return object;
}

/**
 * Deterministic canned extraction used by the `mock` provider — a realistic ER
 * bill so uploads produce real findings offline. Mirrors the core sample bill.
 */
function mockExtraction(): RawBill {
  return {
    lineItems: [
      { code: "99284", description: "Emergency department visit, level 4", units: 1, charge: 1850, serviceDate: "2026-05-14" },
      { code: "70450", description: "CT head/brain without contrast", units: 1, charge: 300, serviceDate: "2026-05-14" },
      { code: "70450", description: "CT head/brain without contrast", units: 1, charge: 300, serviceDate: "2026-05-14" },
      { code: "71046", description: "Chest X-ray, 2 views", units: 1, charge: 85, serviceDate: "2026-05-14", patientCharge: 85 },
      { code: "85025", description: "Complete blood count with differential", units: 1, charge: 30, serviceDate: "2026-05-14" },
      { code: "93000", description: "Electrocardiogram (EKG)", units: 1, charge: 50, serviceDate: "2026-05-14" },
      { code: "36415", description: "Blood draw (venipuncture)", units: 1, charge: 8, serviceDate: "2026-05-14" },
    ],
    eobLines: [
      { code: "71046", billed: 85, allowedAmount: 45, patientResponsibility: 20 },
    ],
  };
}

/** Assign ids and map to the core domain types. */
function finalize(raw: RawBill): ExtractedBill {
  const lineItems: LineItem[] = raw.lineItems.map((li, i) => ({
    id: `li_${i}`,
    code: li.code,
    description: li.description,
    units: li.units,
    unitCharge: li.unitCharge,
    charge: li.charge,
    serviceDate: li.serviceDate,
    patientCharge: li.patientCharge,
  }));
  const eobLines: EobLine[] = raw.eobLines.map((e) => ({
    code: e.code,
    billed: e.billed,
    allowedAmount: e.allowedAmount,
    patientResponsibility: e.patientResponsibility,
  }));
  return { lineItems, eobLines };
}
