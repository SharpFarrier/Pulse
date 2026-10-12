// Account view engine. Drives the Listing tab's "Account" view from the daily
// Sales-&-Traffic rows: five metrics for a selected month, each compared
// month-on-month and year-on-year, plus a lifecycle (daily / monthly / yearly)
// since 2021. Conversion is units ÷ page views (Adi's convention — sessions are
// unreliable and gappy). Months are compared per-day so unequal / partial
// months are fair.

export interface AccountDailyRow {
  date: string; // 'YYYY-MM-DD'
  ordered_product_sales: number;
  units_ordered: number;
  total_order_items: number;
  page_views: number;
  sessions: number;
  avg_offer_count: number | null;
  sale_participation?: boolean | null;
  discount_pct?: number | null;
}

export type MetricKey = "revenue" | "orders" | "pageviews" | "conversion" | "offers";
export type Grain = "daily" | "monthly" | "yearly";

export interface Bucket {
  key: string;          // 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'
  days: number;         // days with data in the bucket
  revenue: number;      // per-day avg (₹)
  orders: number;       // per-day avg (units ordered)
  pageviews: number;    // per-day avg
  conversion: number;   // aggregate units ÷ page views × 100
  offers: number | null; // mean of avg_offer_count over days that report it
  partial: boolean;     // bucket not fully elapsed (current month / current year)
}

export interface Compare { cur: number | null; prev: number | null; pct: number | null; }
export interface MetricCard {
  key: MetricKey;
  perDay: number | null;      // selected month, per-day
  monthTotal: number | null;  // selected month, total (null for conversion/offers)
  mom: Compare;               // vs previous calendar month (per-day basis)
  yoy: Compare;               // vs same calendar month previous year
}

export interface AccountView {
  months: string[];            // 'YYYY-MM' available, ascending
  selectedMonth: string;       // chosen month
  prevMonth: string | null;
  yoyMonth: string | null;
  selected: Bucket;
  cards: Record<MetricKey, MetricCard>;
  lifecycle: { daily: Bucket[]; monthly: Bucket[]; yearly: Bucket[] };
  offersVsPageviews: { mom: { offersPct: number | null; pageviewsPct: number | null } };
  saleDays: string[];          // dates flagged as sale participation
  latestDate: string;
}

const ym = (d: string) => d.slice(0, 7);
const yy = (d: string) => d.slice(0, 4);
const pctChange = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0 ? null : (cur / prev - 1) * 100;

function todayISO(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

// Roll a set of daily rows into one bucket. `partial` is decided by the caller.
function bucketOf(key: string, rows: AccountDailyRow[], partial: boolean): Bucket {
  const days = rows.length;
  let rev = 0, ord = 0, pv = 0, units = 0, offSum = 0, offN = 0;
  for (const r of rows) {
    rev += r.ordered_product_sales || 0;
    ord += r.units_ordered || 0;
    pv += r.page_views || 0;
    units += r.units_ordered || 0;
    if (r.avg_offer_count !== null && r.avg_offer_count !== undefined && r.avg_offer_count > 0) { offSum += r.avg_offer_count; offN++; }
  }
  return {
    key, days, partial,
    revenue: days ? rev / days : 0,
    orders: days ? ord / days : 0,
    pageviews: days ? pv / days : 0,
    conversion: pv > 0 ? (units / pv) * 100 : 0,
    offers: offN ? offSum / offN : null,
    // keep totals reachable via days * perDay; conversion/offers have no total
  };
}

function metricVal(b: Bucket | null, k: MetricKey): number | null {
  if (!b) return null;
  if (k === "offers") return b.offers;
  if (b.days === 0) return null;
  return b[k];
}

function monthCard(k: MetricKey, sel: Bucket | null, prev: Bucket | null, yoyB: Bucket | null): MetricCard {
  const cur = metricVal(sel, k);
  const p = metricVal(prev, k);
  const y = metricVal(yoyB, k);
  const monthTotal = (k === "conversion" || k === "offers") ? null : (sel && sel.days ? (sel[k] as number) * sel.days : null);
  return {
    key: k,
    perDay: cur,
    monthTotal,
    mom: { cur, prev: p, pct: pctChange(cur, p) },
    yoy: { cur, prev: y, pct: pctChange(cur, y) },
  };
}

export function listAccountMonths(rows: AccountDailyRow[]): string[] {
  return [...new Set(rows.map((r) => ym(r.date)))].sort();
}

export function computeAccountView(rows: AccountDailyRow[], month?: string): AccountView | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].filter((r) => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length === 0) return null;
  const latestDate = sorted[sorted.length - 1].date;
  const today = todayISO();

  // group by month once
  const byMonth = new Map<string, AccountDailyRow[]>();
  for (const r of sorted) { const k = ym(r.date); const g = byMonth.get(k) ?? []; g.push(r); byMonth.set(k, g); }
  const months = [...byMonth.keys()].sort();

  // default selected month = last FULLY elapsed month if present, else latest
  const curMonth = today.slice(0, 7);
  const defaultMonth = months.filter((m) => m < curMonth).pop() ?? months[months.length - 1];
  const M = month && months.includes(month) ? month : defaultMonth;

  const prevM = (() => { const [y, m] = M.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();
  const yoyM = (() => { const [y, m] = M.split("-").map(Number); return `${y - 1}-${String(m).padStart(2, "0")}`; })();

  const monthPartial = (m: string) => m === curMonth || ym(latestDate) === m;
  const sel = bucketOf(M, byMonth.get(M) ?? [], monthPartial(M));
  const prevB = byMonth.has(prevM) ? bucketOf(prevM, byMonth.get(prevM)!, monthPartial(prevM)) : null;
  const yoyB = byMonth.has(yoyM) ? bucketOf(yoyM, byMonth.get(yoyM)!, monthPartial(yoyM)) : null;

  const keys: MetricKey[] = ["revenue", "orders", "pageviews", "conversion", "offers"];
  const cards = {} as Record<MetricKey, MetricCard>;
  for (const k of keys) cards[k] = monthCard(k, sel, prevB, yoyB);

  // lifecycle
  const daily: Bucket[] = sorted.map((r) => bucketOf(r.date, [r], r.date === today));
  const monthly: Bucket[] = months.map((m) => bucketOf(m, byMonth.get(m)!, monthPartial(m)));
  const byYear = new Map<string, AccountDailyRow[]>();
  for (const r of sorted) { const k = yy(r.date); const g = byYear.get(k) ?? []; g.push(r); byYear.set(k, g); }
  const curYear = today.slice(0, 4);
  const yearly: Bucket[] = [...byYear.keys()].sort().map((y) => bucketOf(y, byYear.get(y)!, y === curYear || yy(latestDate) === y));

  const saleDays = sorted.filter((r) => r.sale_participation).map((r) => r.date);

  return {
    months, selectedMonth: M, prevMonth: byMonth.has(prevM) ? prevM : null, yoyMonth: byMonth.has(yoyM) ? yoyM : null,
    selected: sel, cards,
    lifecycle: { daily, monthly, yearly },
    offersVsPageviews: { mom: { offersPct: cards.offers.mom.pct, pageviewsPct: cards.pageviews.mom.pct } },
    saleDays, latestDate,
  };
}
