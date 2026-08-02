import type { EobLine, Finding, Rule } from "../index.js";
import { round2, usd } from "./util.js";

/**
 * Flags lines where the provider bills the patient more than the insurer's EOB
 * says the patient owes — classic balance billing.
 */
export const eobMismatchRule: Rule = ({ lineItems, eobLines }) => {
  const eobByCode = new Map<string, EobLine>(
    eobLines.map((e) => [e.code, e]),
  );

  const findings: Finding[] = [];
  for (const li of lineItems) {
    const eob = eobByCode.get(li.code);
    if (!eob) continue;

    const billedToPatient = li.patientCharge ?? li.charge;
    if (billedToPatient <= eob.patientResponsibility) continue;

    const overcharge = billedToPatient - eob.patientResponsibility;
    findings.push({
      id: `eob:${li.code}`,
      type: "eob_mismatch",
      title: `Balance billed beyond EOB responsibility (CPT ${li.code})`,
      explanation: `The provider is billing you ${usd(billedToPatient)} for ${li.code}, but your EOB lists your responsibility as ${usd(eob.patientResponsibility)}. The ${usd(overcharge)} difference looks like balance billing.`,
      estimatedOvercharge: round2(overcharge),
      confidence: 0.9,
      source: "rule",
    });
  }
  return findings;
};
