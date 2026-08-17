// Ratios are NEVER stored — always derived from raw counts so they can't drift.
// The key rule: spend with zero sales has an UNDEFINED ACOS (not a huge number).
// We return null for that case; the UI renders it as the "spend, no sales" cell.

export interface RawTotals {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

export function acos(spend: number, sales: number): number | null {
  if (!sales || sales <= 0) return null; // undefined — spend but no sales
  return (spend / sales) * 100;
}

export function roas(spend: number, sales: number): number | null {
  if (!spend || spend <= 0) return null;
  return sales / spend;
}

export function ctr(clicks: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

export function cpc(spend: number, clicks: number): number | null {
  if (!clicks || clicks <= 0) return null;
  return spend / clicks;
}

export type Verdict = "good" | "okay" | "pause";

// Adi's universal thresholds: ROAS >=10 good, 5-10 okay, <5 pause
// (equivalently ACOS <=10% / 10-20% / >20%). Undefined ACOS -> pause.
export function verdictFromAcos(acosPct: number | null): Verdict {
  if (acosPct === null) return "pause";
  if (acosPct <= 10) return "good";
  if (acosPct <= 20) return "okay";
  return "pause";
}

export function sumTotals<T extends RawTotals>(rows: T[]): RawTotals {
  return rows.reduce<RawTotals>(
    (acc, r) => ({
      impressions: acc.impressions + (r.impressions || 0),
      clicks: acc.clicks + (r.clicks || 0),
      spend: acc.spend + (r.spend || 0),
      sales: acc.sales + (r.sales || 0),
      orders: acc.orders + (r.orders || 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 }
  );
}
