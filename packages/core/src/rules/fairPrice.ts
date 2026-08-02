import { FAIR_PRICE_MULTIPLE } from "../constants.js";
import type { Finding, Rule } from "../index.js";
import { round2, usd } from "./util.js";

/**
 * Flags line items charged above FAIR_PRICE_MULTIPLE × the Medicare rate.
 * Overcharge = charge minus that ceiling. Lower confidence than the exact
 * rules, since "reasonable" is a judgement call.
 */
export const fairPriceRule: Rule = ({ lineItems, medicareRates }) => {
  const findings: Finding[] = [];
  for (const li of lineItems) {
    const rate = medicareRates.get(li.code);
    if (rate === undefined || rate <= 0) continue;

    const benchmark = rate * li.units;
    const ceiling = FAIR_PRICE_MULTIPLE * benchmark;
    if (li.charge <= ceiling) continue;

    const multiple = li.charge / benchmark;
    findings.push({
      id: `fair:${li.id}`,
      type: "above_fair_price",
      title: `${li.description} billed ${multiple.toFixed(1)}× the Medicare rate (CPT ${li.code})`,
      explanation: `Charged ${usd(li.charge)} versus a Medicare rate of ${usd(rate)}${
        li.units > 1 ? ` × ${li.units} units` : ""
      } — about ${multiple.toFixed(1)}×. Anything above ${FAIR_PRICE_MULTIPLE}× the benchmark is flagged.`,
      estimatedOvercharge: round2(li.charge - ceiling),
      confidence: 0.6,
      source: "rule",
    });
  }
  return findings;
};
