import type { CampaignDailyRow } from "./preview";

const mkey = (p: string) => p.slice(0, 7);
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const daysInMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const prevKey = (m: string) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export interface Rates { ctr: number | null; cvr: number | null; cpc: number | null; aov: number | null; acos: number | null; roas: number | null; }
export interface MonthAgg {
  month: string; days: number; calDays: number; incomplete: boolean;
  spend: number; sales: number; orders: number; clicks: number; impressions: number;
  rates: Rates;
  perDay: { spend: number; sales: number; orders: number; impressions: number };
}
function aggMonth(rows: CampaignDailyRow[], month: string): MonthAgg | null {
  const rs = rows.filter(r => mkey(r.date) === month);
  if (rs.length === 0) return null;
  const days = new Set(rs.map(r => r.date)).size;
  let spend = 0, sales = 0, orders = 0, clicks = 0, impressions = 0;
  for (const r of rs) { spend += r.spend || 0; sales += r.sales || 0; orders += r.orders || 0; clicks += r.clicks || 0; impressions += r.impressions || 0; }
  const calDays = daysInMonth(month);
  return {
    month, days, calDays, incomplete: days < calDays,
    spend, sales, orders, clicks, impressions,
    rates: { ctr: clicks && impressions ? clicks / impressions * 100 : null, cvr: orders && clicks ? orders / clicks * 100 : null, cpc: div(spend, clicks), aov: div(sales, orders), acos: sales > 0 ? spend / sales * 100 : null, roas: div(sales, spend) },
    perDay: { spend: spend / days, sales: sales / days, orders: orders / days, impressions: impressions / days },
  };
}

export interface WaterStep { name: string; contribution: number; pct: number | null; from: number; to: number; }
export interface Waterfall { startPerDay: number; endPerDay: number; delta: number; steps: WaterStep[]; }
export function waterfall(prev: MonthAgg, cur: MonthAgg): Waterfall | null {
  const r = cur.rates, p = prev.rates;
  if (!r.ctr || !r.cvr || !r.aov || !p.ctr || !p.cvr || !p.aov) return null;
  const drivers: { name: string; from: number; to: number }[] = [
    { name: "Impressions", from: prev.perDay.impressions, to: cur.perDay.impressions },
    { name: "CTR", from: p.ctr, to: r.ctr },
    { name: "Conversion", from: p.cvr, to: r.cvr },
    { name: "AOV", from: p.aov, to: r.aov },
  ];
  const lns = drivers.map(d => (d.from > 0 && d.to > 0 ? Math.log(d.to / d.from) : 0));
  const lnSum = lns.reduce((a, b) => a + b, 0);
  const delta = cur.perDay.sales - prev.perDay.sales;
  const steps = drivers.map((d, i) => ({ name: d.name, from: d.from, to: d.to, pct: d.from > 0 ? (d.to / d.from - 1) * 100 : null, contribution: lnSum !== 0 ? delta * (lns[i] / lnSum) : delta / 4 }));
  return { startPerDay: prev.perDay.sales, endPerDay: cur.perDay.sales, delta, steps };
}

export interface AcosLever { name: string; from: number; to: number; pct: number | null; worse: boolean; main: boolean; }
export interface AcosDecomp { from: number | null; to: number | null; levers: AcosLever[]; }
export function acosDecomp(prev: MonthAgg, cur: MonthAgg): AcosDecomp | null {
  const r = cur.rates, p = prev.rates;
  if (!r.cpc || !r.cvr || !r.aov || !p.cpc || !p.cvr || !p.aov) return null;
  // ACOS = CPC / (CVR * AOV); unfavourable ln-change pushes ACOS up
  const unfav = { CPC: Math.log(r.cpc / p.cpc), Conversion: -Math.log(r.cvr / p.cvr), AOV: -Math.log(r.aov / p.aov) };
  const mainKey = (Object.entries(unfav).sort((a, b) => b[1] - a[1])[0] || ["", 0])[0];
  const mk = (name: string, from: number, to: number, higherWorse: boolean): AcosLever => ({ name, from, to, pct: (to / from - 1) * 100, worse: higherWorse ? to > from : to < from, main: name === mainKey });
  return { from: p.acos, to: r.acos, levers: [mk("CPC", p.cpc, r.cpc, true), mk("Conversion", p.cvr, r.cvr, false), mk("AOV", p.aov, r.aov, false)] };
}

export interface TrendPoint { month: string; perDay: number; raw: number; good: boolean | null; }
export interface TrendMetric { label: string; fmt: "money" | "int" | "pct2" | "x" | "rupee"; points: TrendPoint[]; }
export interface Dumbbell { name: string; prevRoas: number | null; curRoas: number | null; delta: number | null; spendPerDay: number; spendChangePct: number | null; }
export interface AdsVsTotal { month: string; bizRev: number | null; adSales: number; adSpend: number; adSharePct: number | null; tacos: number | null; incomplete: boolean; }
export interface MonthlyReview {
  months: string[]; month: string; prevMonth: string | null;
  cur: MonthAgg; prev: MonthAgg | null; anyIncomplete: boolean;
  headline: { title: string; sentence: string };
  kpis: { label: string; perDay: number | null; prevPerDay: number | null; total: number; fmt: "money" | "int" | "pct2" | "rupee"; meaning: "up" | "down" | "neutral"; isRate?: boolean; rate?: number | null; prevRate?: number | null }[];
  waterfall: Waterfall | null;
  acos: AcosDecomp | null;
  trend: TrendMetric[];
  dumbbell: Dumbbell[];
  adsVsTotal: AdsVsTotal[];
  review: { worked: string[]; watch: string[]; next: string[] };
}

function campRoas(rows: CampaignDailyRow[], month: string): Map<string, { spend: number; sales: number }> {
  const m = new Map<string, { spend: number; sales: number }>();
  for (const r of rows) { if (mkey(r.date) !== month) continue; const a = m.get(r.campaign_name) ?? { spend: 0, sales: 0 }; a.spend += r.spend || 0; a.sales += r.sales || 0; m.set(r.campaign_name, a); }
  return m;
}

export function computeMonthlyReview(allRows: CampaignDailyRow[], businessRevenue: Record<string, number>, product: "ALL" | "SP" | "SB" = "ALL", month?: string): MonthlyReview | null {
  const rows = product === "ALL" ? allRows : allRows.filter(r => (r.ad_product ?? "SP") === product);
  if (rows.length === 0) return null;
  const months = [...new Set(rows.map(r => mkey(r.date)))].sort();
  const M = month && months.includes(month) ? month : months[months.length - 1];
  const pm = prevKey(M);
  const cur = aggMonth(rows, M)!;
  const prev = months.includes(pm) ? aggMonth(rows, pm) : null;
  const anyIncomplete = cur.incomplete || (prev?.incomplete ?? false);

  // KPIs (per day)
  const kpis: MonthlyReview["kpis"] = [
    { label: "Ad spend / day", perDay: cur.perDay.spend, prevPerDay: prev?.perDay.spend ?? null, total: cur.spend, fmt: "money", meaning: "neutral" },
    { label: "Ad sales / day", perDay: cur.perDay.sales, prevPerDay: prev?.perDay.sales ?? null, total: cur.sales, fmt: "money", meaning: "up" },
    { label: "Orders / day", perDay: cur.perDay.orders, prevPerDay: prev?.perDay.orders ?? null, total: cur.orders, fmt: "int", meaning: "up" },
    { label: "ACOS", perDay: null, prevPerDay: null, total: 0, fmt: "pct2", meaning: "down", isRate: true, rate: cur.rates.acos, prevRate: prev?.rates.acos ?? null },
    { label: "Cost / order", perDay: null, prevPerDay: null, total: 0, fmt: "rupee", meaning: "down", isRate: true, rate: div(cur.spend, cur.orders), prevRate: prev ? div(prev.spend, prev.orders) : null },
  ];

  const wf = prev ? waterfall(prev, cur) : null;
  const ad = prev ? acosDecomp(prev, cur) : null;

  // 3-month trend
  const t3 = months.slice(Math.max(0, months.indexOf(M) - 2), months.indexOf(M) + 1);
  const aggs = t3.map(m => aggMonth(rows, m)!).filter(Boolean);
  const metric = (label: string, fmt: TrendMetric["fmt"], val: (a: MonthAgg) => number | null, higherGood: boolean | null): TrendMetric => {
    const points: TrendPoint[] = aggs.map((a, i) => {
      const v = val(a) ?? 0;
      const prevV = i > 0 ? (val(aggs[i - 1]) ?? v) : v;
      const good = higherGood === null ? null : i === 0 ? null : higherGood ? v >= prevV : v <= prevV;
      return { month: a.month, perDay: v, raw: v, good };
    });
    return { label, fmt, points };
  };
  const trend: TrendMetric[] = [
    metric("Spend / day", "money", a => a.perDay.spend, null),
    metric("Ad sales / day", "money", a => a.perDay.sales, true),
    metric("ACOS", "pct2", a => a.rates.acos, false),
    metric("Impressions / day", "int", a => a.perDay.impressions, true),
    metric("CTR", "pct2", a => a.rates.ctr, true),
    metric("CPC", "rupee", a => a.rates.cpc, false),
    metric("Conversion", "pct2", a => a.rates.cvr, true),
    metric("AOV", "rupee", a => a.rates.aov, true),
  ];

  // dumbbell
  const curC = campRoas(rows, M), prevC = prev ? campRoas(rows, pm) : new Map();
  const names = [...curC.keys()].sort((a, b) => (curC.get(b)!.spend) - (curC.get(a)!.spend)).slice(0, 10);
  const dumbbell: Dumbbell[] = names.map(name => {
    const c = curC.get(name)!, p = prevC.get(name) as { spend: number; sales: number } | undefined;
    const curRoas = div(c.sales, c.spend), prevRoas = p ? div(p.sales, p.spend) : null;
    return { name, prevRoas, curRoas, delta: curRoas !== null && prevRoas !== null ? curRoas - prevRoas : null, spendPerDay: c.spend / cur.days, spendChangePct: p && p.spend > 0 ? ((c.spend / cur.days) / (p.spend / (prev?.days ?? cur.days)) - 1) * 100 : null };
  }).sort((a, b) => (a.delta ?? 99) - (b.delta ?? 99));

  // ads vs total (all months with business revenue)
  const adsVsTotal: AdsVsTotal[] = months.map(m => {
    const a = aggMonth(rows, m)!;
    const biz = businessRevenue[m] ?? null;
    return { month: m, bizRev: biz, adSales: a.sales, adSpend: a.spend, adSharePct: biz ? a.sales / biz * 100 : null, tacos: biz ? a.spend / biz * 100 : null, incomplete: a.incomplete };
  }).filter(x => x.bizRev !== null);

  // review
  const worked: string[] = [], watch: string[] = [], next: string[] = [];
  const gains = dumbbell.filter(d => d.delta !== null && d.delta > 0.5).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 2);
  const drops = dumbbell.filter(d => d.delta !== null && d.delta < -0.5).slice(0, 2);
  for (const g of gains) worked.push(`${g.name}: ROAS ${g.prevRoas?.toFixed(1)} → ${g.curRoas?.toFixed(1)}.`);
  if (!worked.length && cur.rates.acos !== null && prev?.rates.acos != null && cur.rates.acos < prev.rates.acos) worked.push(`Blended ACOS improved to ${cur.rates.acos.toFixed(1)}%.`);
  for (const d of drops) watch.push(`${d.name}: ROAS ${d.prevRoas?.toFixed(1)} → ${d.curRoas?.toFixed(1)}.`);
  // metric falling 2+ months
  for (const tm of trend) {
    if (tm.points.length >= 3 && (tm.label === "Ad sales / day" || tm.label === "Conversion" || tm.label === "CTR")) {
      const [a, b, c] = tm.points.map(p => p.perDay);
      if (c < b && b < a) watch.push(`${tm.label} has fallen two months running (${tm.points[0].perDay.toFixed(tm.fmt === "pct2" ? 2 : 0)} → ${c.toFixed(tm.fmt === "pct2" ? 2 : 0)}).`);
    }
  }
  if (cur.incomplete) next.push(`Finish the ${M} ad upload — it covers ${cur.days} of ${cur.calDays} days.`);
  if (!(M in businessRevenue)) next.push(`Upload the ${M} Business report to unlock TACOS and the ads-vs-total view.`);
  if (!next.length) next.push("Data is complete — keep the monthly cadence.");

  // headline
  const salesCh = prev ? (cur.perDay.sales / prev.perDay.sales - 1) * 100 : null;
  const spendCh = prev ? (cur.perDay.spend / prev.perDay.spend - 1) * 100 : null;
  const mainCause = ad?.levers.find(l => l.main);
  const worstDump = drops[0];
  let title: string, sentence: string;
  if (salesCh === null) { title = `${M}: first month of data`; sentence = `No prior month to compare yet.`; }
  else {
    const eff = cur.rates.acos !== null && prev?.rates.acos != null ? (cur.rates.acos <= prev.rates.acos ? "efficiency held or improved" : "efficiency slipped a little") : "";
    title = `Ad sales ${salesCh >= 0 ? "up" : "down"} ${Math.abs(salesCh).toFixed(0)}% a day on ${Math.abs(spendCh ?? 0).toFixed(0)}% ${(spendCh ?? 0) >= 0 ? "more" : "less"} spend — ${eff}.`;
    sentence = `ACOS ${prev?.rates.acos?.toFixed(2)}% → ${cur.rates.acos?.toFixed(2)}%${mainCause ? `; main cause ${mainCause.name.toLowerCase()} ${mainCause.pct! >= 0 ? "+" : ""}${mainCause.pct!.toFixed(1)}%` : ""}${worstDump ? `; ${worstDump.name} had the biggest ROAS drop (${worstDump.prevRoas?.toFixed(1)} → ${worstDump.curRoas?.toFixed(1)})` : ""}.`;
  }

  return { months, month: M, prevMonth: prev ? pm : null, cur, prev, anyIncomplete, headline: { title, sentence }, kpis, waterfall: wf, acos: ad, trend, dumbbell, adsVsTotal, review: { worked, watch, next } };
}
