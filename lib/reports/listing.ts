// Pure listing-trend logic over the monthly Business report. Detects, per SKU,
// whether it's Growing / Steady / Slipping (first meaningful dip below its own
// recent run) / Declining (two+ months down). Baseline is each SKU's own 3-month
// average, so a naturally small SKU isn't falsely flagged.

export interface BusinessMonthlyRow {
  period: string; // 'YYYY-MM-DD' (first of month)
  asin: string;
  sku: string | null;
  title: string | null;
  ordered_product_sales: number;
  units_ordered: number;
}

export type ListingStatus = "growing" | "steady" | "slipping" | "declining" | "new";

export interface SkuTrend {
  asin: string;
  sku: string | null;
  title: string | null;
  series: number[];         // revenue per month, aligned to `months`, 0 where absent
  latest: number;
  prior: number | null;
  momPct: number | null;
  recentAvg: number | null; // avg of up to 3 months before latest
  monthsDown: number;       // consecutive declines ending at the latest month
  latestUnits: number;
  status: ListingStatus;
}

export interface ListingData {
  months: string[];         // 'YYYY-MM' ascending
  revenueByMonth: number[]; // total revenue aligned to months
  latestMonth: string | null;
  skus: SkuTrend[];         // sorted by latest revenue desc
  attention: SkuTrend[];    // slipping + declining, worst first
}

const SLIP_DROP = 0.15;   // >=15% below its own recent average = meaningful dip
const GROW_RISE = 0.10;

const mkey = (period: string) => period.slice(0, 7);

function statusFor(series: number[]): { status: ListingStatus; monthsDown: number; recentAvg: number | null } {
  // Judge on the trailing run of present (>0) months; keep the full series for the sparkline.
  const present = series.filter((v) => v > 0);
  if (present.length < 2) return { status: "new", monthsDown: 0, recentAvg: present.length ? present[present.length - 1] : null };

  const latest = present[present.length - 1];
  const prior = present[present.length - 2];

  // consecutive declines ending at latest
  let monthsDown = 0;
  for (let i = present.length - 1; i > 0; i--) { if (present[i] < present[i - 1]) monthsDown++; else break; }

  const before = present.slice(0, present.length - 1);
  const window = before.slice(Math.max(0, before.length - 3));
  const recentAvg = window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
  const belowTrend = recentAvg !== null && recentAvg > 0 && latest < recentAvg * (1 - SLIP_DROP);

  let status: ListingStatus;
  if (monthsDown >= 2) status = "declining";
  else if (belowTrend) status = "slipping";
  else if (recentAvg !== null && latest > recentAvg * (1 + GROW_RISE)) status = "growing";
  else if (prior > 0 && latest > prior * (1 + GROW_RISE)) status = "growing";
  else status = "steady";

  return { status, monthsDown, recentAvg };
}

export function computeListing(rows: BusinessMonthlyRow[]): ListingData {
  if (rows.length === 0) return { months: [], revenueByMonth: [], latestMonth: null, skus: [], attention: [] };

  const months = [...new Set(rows.map((r) => mkey(r.period)))].sort();
  const idx = new Map(months.map((m, i) => [m, i]));

  const byAsin = new Map<string, { asin: string; sku: string | null; title: string | null; rev: number[]; units: number[] }>();
  for (const r of rows) {
    const a = byAsin.get(r.asin) ?? { asin: r.asin, sku: r.sku, title: r.title, rev: Array(months.length).fill(0), units: Array(months.length).fill(0) };
    const i = idx.get(mkey(r.period))!;
    a.rev[i] += r.ordered_product_sales || 0;
    a.units[i] += r.units_ordered || 0;
    if (!a.sku && r.sku) a.sku = r.sku;
    if (!a.title && r.title) a.title = r.title;
    byAsin.set(r.asin, a);
  }

  const revenueByMonth = Array(months.length).fill(0);
  const skus: SkuTrend[] = [...byAsin.values()].map((a) => {
    a.rev.forEach((v, i) => (revenueByMonth[i] += v));
    const { status, monthsDown, recentAvg } = statusFor(a.rev);
    const present = a.rev.filter((v) => v > 0);
    const latest = present.length ? present[present.length - 1] : 0;
    const prior = present.length >= 2 ? present[present.length - 2] : null;
    const momPct = prior && prior > 0 ? ((latest - prior) / prior) * 100 : null;
    // latest units = units in the last month that has revenue
    let latestUnits = 0;
    for (let i = a.rev.length - 1; i >= 0; i--) { if (a.rev[i] > 0) { latestUnits = a.units[i]; break; } }
    return { asin: a.asin, sku: a.sku, title: a.title, series: a.rev, latest, prior, momPct, recentAvg, monthsDown, latestUnits, status };
  }).sort((x, y) => y.latest - x.latest);

  const rank: Record<ListingStatus, number> = { declining: 0, slipping: 1, steady: 2, growing: 3, new: 4 };
  const attention = skus.filter((s) => s.status === "slipping" || s.status === "declining")
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.latest - a.latest));

  return { months, revenueByMonth, latestMonth: months[months.length - 1] ?? null, skus, attention };
}
