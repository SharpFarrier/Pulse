import { acos, roas, verdictFromAcos, type Verdict } from "./metrics";

// Everything here is derived from the CAMPAIGN table only — the totals source of
// truth. Pure functions so they can be unit-tested against real files.

export interface CampaignDailyRow {
  date: string;
  campaign_name: string;
  ad_product?: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

export interface Metric {
  spend: number;
  sales: number;
  orders: number;
  acos: number | null;
  roas: number | null;
}

export interface DayPoint { date: string; spend: number; sales: number; orders: number; acos: number | null; verdict: Verdict; }
export interface StripCell { date: string; acos: number | null; verdict: Verdict; hasSpend: boolean; }

export interface CampaignAgg {
  campaign_name: string;
  spend: number;
  sales: number;
  orders: number;
  acos: number | null;
  roas: number | null;
  verdict: Verdict;
  acosDeltaPp: number | null; // period ACOS minus prior-period ACOS, in percentage points
  strip: StripCell[];         // recent-week daily ACOS bands
  days: DayPoint[];           // per-day detail for the expand
}

export interface Preview {
  maxDate: string | null;
  windowDays: number;
  periodStart: string | null;
  periodEnd: string | null;
  kpi: { cur: Metric; prev: Metric } | null;
  trend: DayPoint[];
  campaigns: CampaignAgg[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function metric(rows: CampaignDailyRow[]): Metric {
  let spend = 0, sales = 0, orders = 0;
  for (const r of rows) { spend += r.spend || 0; sales += r.sales || 0; orders += r.orders || 0; }
  return { spend, sales, orders, acos: acos(spend, sales), roas: roas(spend, sales) };
}

function dayPoint(date: string, rows: CampaignDailyRow[]): DayPoint {
  const m = metric(rows);
  return { date, spend: m.spend, sales: m.sales, orders: m.orders, acos: m.acos, verdict: verdictFromAcos(m.acos) };
}

// windowDays = KPI/table period (7 or 30). stripDays = the recent-week strip length.
export type Period = number | { start: string; end: string };

function dayspan(start: string, end: string): number {
  return Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;
}

export function computePreview(all: CampaignDailyRow[], period: Period, stripDays = 7): Preview {
  const windowDays = typeof period === "number" ? period : dayspan(period.start, period.end);
  if (all.length === 0) {
    return { maxDate: null, windowDays, periodStart: null, periodEnd: null, kpi: null, trend: [], campaigns: [] };
  }
  const maxDate = all.reduce((m, r) => (r.date > m ? r.date : m), all[0].date);
  const periodEnd = typeof period === "number" ? maxDate : period.end;
  const periodStart = typeof period === "number" ? addDays(periodEnd, -(windowDays - 1)) : period.start;
  const prevEnd = addDays(periodStart, -1);
  const prevStart = addDays(prevEnd, -(windowDays - 1));
  const stripStart = addDays(periodEnd, -(stripDays - 1));

  const inCur = (d: string) => d >= periodStart && d <= periodEnd;
  const inPrev = (d: string) => d >= prevStart && d <= prevEnd;

  const cur = all.filter((r) => inCur(r.date));
  const prev = all.filter((r) => inPrev(r.date));

  // KPI strip
  const kpi = { cur: metric(cur), prev: metric(prev) };

  // Daily trend across the current period
  const byDate = new Map<string, CampaignDailyRow[]>();
  for (const r of cur) { (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r); }
  const trend: DayPoint[] = [...byDate.keys()].sort().map((d) => dayPoint(d, byDate.get(d)!));

  // Per-campaign aggregation
  const byCamp = new Map<string, CampaignDailyRow[]>();
  for (const r of cur) { (byCamp.get(r.campaign_name) ?? byCamp.set(r.campaign_name, []).get(r.campaign_name)!).push(r); }
  const prevByCamp = new Map<string, CampaignDailyRow[]>();
  for (const r of prev) { (prevByCamp.get(r.campaign_name) ?? prevByCamp.set(r.campaign_name, []).get(r.campaign_name)!).push(r); }

  // recent-week strip dates (fixed length, most recent stripDays)
  const stripDates: string[] = [];
  for (let i = 0; i < stripDays; i++) stripDates.push(addDays(stripStart, i));

  const campaigns: CampaignAgg[] = [...byCamp.entries()].map(([name, rows]) => {
    const m = metric(rows);
    const prevM = prevByCamp.has(name) ? metric(prevByCamp.get(name)!) : null;
    const acosDeltaPp = m.acos !== null && prevM?.acos != null ? m.acos - prevM.acos : null;

    const dayMap = new Map<string, CampaignDailyRow[]>();
    for (const r of rows) { (dayMap.get(r.date) ?? dayMap.set(r.date, []).get(r.date)!).push(r); }
    const days: DayPoint[] = [...dayMap.keys()].sort().map((d) => dayPoint(d, dayMap.get(d)!));

    const strip: StripCell[] = stripDates.map((d) => {
      const dr = dayMap.get(d) ?? [];
      const mm = metric(dr);
      return { date: d, acos: mm.acos, verdict: verdictFromAcos(mm.acos), hasSpend: mm.spend > 0 };
    });

    return { campaign_name: name, ...m, verdict: verdictFromAcos(m.acos), acosDeltaPp, strip, days };
  }).sort((a, b) => b.spend - a.spend);

  return { maxDate, windowDays, periodStart, periodEnd, kpi, trend, campaigns };
}
