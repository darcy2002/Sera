/**
 * Charges above this multiple of the Medicare rate are flagged as unreasonable.
 * 3× is a common patient-advocate threshold. Tunable.
 *
 * Kept in a leaf module (no imports) so the rules can use it without creating a
 * circular runtime dependency with the re-exporting barrel in index.ts.
 */
export const FAIR_PRICE_MULTIPLE = 3;
