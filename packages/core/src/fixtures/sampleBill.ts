import type { EobLine, LineItem } from "../index.js";

/**
 * A realistic synthetic ER-visit bill used as the "Audit sample bill" demo
 * input and as a test fixture. Engineered so each rule fires exactly once,
 * with no overlap between findings:
 *
 *  - 99284 charged $1,850 vs Medicare $190  → above_fair_price (~$1,280)
 *  - 70450 CT head billed twice on one day  → duplicate_charge  ($300)
 *  - 71046 balance-billed past the EOB      → eob_mismatch      ($65)
 *
 * The remaining lines are within thresholds — they demonstrate the engine is
 * selective, not trigger-happy. No PHI: entirely fabricated.
 */
export const sampleLineItems: LineItem[] = [
  {
    id: "li_99284",
    code: "99284",
    description: "Emergency department visit, level 4",
    units: 1,
    charge: 1850,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_70450_a",
    code: "70450",
    description: "CT head/brain without contrast",
    units: 1,
    charge: 300,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_70450_b",
    code: "70450",
    description: "CT head/brain without contrast",
    units: 1,
    charge: 300,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_71046",
    code: "71046",
    description: "Chest X-ray, 2 views",
    units: 1,
    charge: 85,
    patientCharge: 85,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_85025",
    code: "85025",
    description: "Complete blood count with differential",
    units: 1,
    charge: 30,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_93000",
    code: "93000",
    description: "Electrocardiogram (EKG)",
    units: 1,
    charge: 50,
    serviceDate: "2026-05-14",
  },
  {
    id: "li_36415",
    code: "36415",
    description: "Blood draw (venipuncture)",
    units: 1,
    charge: 8,
    serviceDate: "2026-05-14",
  },
];

export const sampleEobLines: EobLine[] = [
  {
    code: "71046",
    billed: 85,
    allowedAmount: 45,
    patientResponsibility: 20,
  },
];
