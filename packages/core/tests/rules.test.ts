import { describe, expect, it } from "vitest";
import {
  duplicateRule,
  eobMismatchRule,
  fairPriceRule,
  runAudit,
  type EobLine,
  type LineItem,
  type RuleContext,
} from "../src/index";

const li = (
  o: Partial<LineItem> & Pick<LineItem, "id" | "code" | "charge">,
): LineItem => ({
  description: "Service",
  units: 1,
  serviceDate: "2026-05-14",
  ...o,
});

const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  lineItems: [],
  eobLines: [],
  medicareRates: new Map(),
  ...over,
});

describe("duplicateRule", () => {
  it("flags the same code billed twice on the same day", () => {
    const findings = duplicateRule(
      ctx({
        lineItems: [
          li({ id: "a", code: "80053", charge: 90 }),
          li({ id: "b", code: "80053", charge: 90 }),
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("duplicate_charge");
    expect(findings[0]!.estimatedOvercharge).toBe(90);
  });

  it("does not flag the same code on different days", () => {
    const findings = duplicateRule(
      ctx({
        lineItems: [
          li({ id: "a", code: "80053", charge: 90, serviceDate: "2026-05-14" }),
          li({ id: "b", code: "80053", charge: 90, serviceDate: "2026-05-15" }),
        ],
      }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe("fairPriceRule", () => {
  it("flags charges above 3x the Medicare rate", () => {
    const findings = fairPriceRule(
      ctx({
        lineItems: [li({ id: "c", code: "99284", charge: 1800 })],
        medicareRates: new Map([["99284", 190]]),
      }),
    );
    expect(findings).toHaveLength(1);
    // 1800 - 3 * 190 = 1230
    expect(findings[0]!.estimatedOvercharge).toBe(1230);
  });

  it("ignores charges within 3x", () => {
    const findings = fairPriceRule(
      ctx({
        lineItems: [li({ id: "c", code: "99284", charge: 500 })],
        medicareRates: new Map([["99284", 190]]), // 3x = 570
      }),
    );
    expect(findings).toHaveLength(0);
  });

  it("ignores codes with no Medicare rate", () => {
    const findings = fairPriceRule(
      ctx({ lineItems: [li({ id: "c", code: "ZZZ", charge: 9999 })] }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe("eobMismatchRule", () => {
  const eob = (o: Partial<EobLine> & Pick<EobLine, "code">): EobLine => ({
    billed: 0,
    allowedAmount: 0,
    patientResponsibility: 0,
    ...o,
  });

  it("flags balance billing beyond the EOB responsibility", () => {
    const findings = eobMismatchRule(
      ctx({
        lineItems: [li({ id: "c", code: "99284", charge: 1800, patientCharge: 400 })],
        eobLines: [eob({ code: "99284", patientResponsibility: 150 })],
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.estimatedOvercharge).toBe(250);
  });

  it("does not flag when the patient charge is within responsibility", () => {
    const findings = eobMismatchRule(
      ctx({
        lineItems: [li({ id: "c", code: "99284", charge: 1800, patientCharge: 100 })],
        eobLines: [eob({ code: "99284", patientResponsibility: 150 })],
      }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe("runAudit", () => {
  it("aggregates findings and totals overcharges, sorted by impact", () => {
    const out = runAudit(
      ctx({
        lineItems: [
          li({ id: "a", code: "80053", charge: 90 }),
          li({ id: "b", code: "80053", charge: 90 }),
          li({ id: "c", code: "99284", charge: 1800, patientCharge: 400 }),
        ],
        eobLines: [
          { code: "99284", billed: 1800, allowedAmount: 250, patientResponsibility: 150 },
        ],
        medicareRates: new Map([["99284", 190]]),
      }),
    );
    expect(out.findings).toHaveLength(3);
    // 1230 (fair) + 250 (eob) + 90 (dup)
    expect(out.totalOvercharge).toBe(1570);
    // sorted by estimatedOvercharge desc
    expect(out.findings[0]!.estimatedOvercharge).toBe(1230);
    expect(out.findings.at(-1)!.estimatedOvercharge).toBe(90);
  });
});
