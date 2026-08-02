/** Round to cents. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Format a USD amount for human-readable explanations. */
export const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
