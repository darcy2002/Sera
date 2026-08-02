import { runAudit } from "@sera/core";
import { beforeAll, describe, expect, it } from "vitest";
import { extractBill } from "../src/index";

beforeAll(() => {
  process.env.LLM_PROVIDER = "mock";
});

const input = { data: new Uint8Array([1, 2, 3]), mediaType: "application/pdf" };

describe("extractBill (mock provider)", () => {
  it("returns a structured bill with assigned ids", async () => {
    const bill = await extractBill(input);
    expect(bill.lineItems).toHaveLength(7);
    expect(bill.lineItems[0]!.id).toBe("li_0");
    expect(bill.lineItems.every((li) => typeof li.id === "string")).toBe(true);
    expect(bill.eobLines).toHaveLength(1);
  });

  it("feeds runAudit to the three expected findings", async () => {
    const bill = await extractBill(input);
    const out = runAudit({
      lineItems: bill.lineItems,
      eobLines: bill.eobLines,
      medicareRates: new Map([
        ["99284", 190],
        ["70450", 110],
        ["71046", 30],
      ]),
    });
    expect(out.findings.map((f) => f.type).sort()).toEqual([
      "above_fair_price",
      "duplicate_charge",
      "eob_mismatch",
    ]);
    expect(out.totalOvercharge).toBe(1645);
  });
});
