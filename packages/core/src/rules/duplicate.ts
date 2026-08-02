import type { Finding, LineItem, Rule } from "../index.js";
import { round2 } from "./util.js";

/**
 * Flags the same procedure code billed more than once on the same date of
 * service. The charges beyond the first are treated as the overcharge.
 */
export const duplicateRule: Rule = ({ lineItems }) => {
  const groups = new Map<string, LineItem[]>();
  for (const li of lineItems) {
    const key = `${li.code}|${li.serviceDate}`;
    const arr = groups.get(key) ?? [];
    arr.push(li);
    groups.set(key, arr);
  }

  const findings: Finding[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const first = items[0]!;
    const extras = items.slice(1);
    const overcharge = extras.reduce((sum, li) => sum + li.charge, 0);
    findings.push({
      id: `dup:${key}`,
      type: "duplicate_charge",
      title: `Duplicate charge: ${first.description} (CPT ${first.code})`,
      explanation: `${first.code} was billed ${items.length} times on ${first.serviceDate}. A code repeated on the same day is often a duplicate; ${extras.length} of these appear to be extra.`,
      estimatedOvercharge: round2(overcharge),
      confidence: 0.95,
      source: "rule",
    });
  }
  return findings;
};
