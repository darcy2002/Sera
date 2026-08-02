import type { Finding, RuleContext } from "../index.js";
import { duplicateRule } from "./duplicate.js";
import { eobMismatchRule } from "./eobMismatch.js";
import { fairPriceRule } from "./fairPrice.js";
import { round2 } from "./util.js";

/** All active rules. Order doesn't matter — findings are sorted by impact. */
const RULES = [duplicateRule, fairPriceRule, eobMismatchRule];

export interface AuditOutcome {
  findings: Finding[];
  totalOvercharge: number;
}

/** Run every rule over a structured bill and total the estimated overcharges. */
export function runAudit(ctx: RuleContext): AuditOutcome {
  const findings = RULES.flatMap((rule) => rule(ctx)).sort(
    (a, b) => b.estimatedOvercharge - a.estimatedOvercharge,
  );
  const totalOvercharge = round2(
    findings.reduce((sum, f) => sum + f.estimatedOvercharge, 0),
  );
  return { findings, totalOvercharge };
}
