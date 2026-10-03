import type { CampaignDailyRow } from "./preview";

// ---- helpers ---------------------------------------------------------------
export const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const pctChange = (cur: number, base: number | null) => (base && base > 0 ? ((cur - base) / base) * 100 : null);

export interface Totals { spend: number; sales: number; orders: number; }
export interface Metrics extends Totals { acos: number | null; roas: number | null; orderValue: number | null; costPerOrder: number | null; }
function metrics(t: Totals): Metrics {
  return { ...t, acos: t.sales > 0 ? (t.spend / t.sales) * 100 : null, roas: div(t.sales, t.spend), orderValue: div(t.sales, t.orders), costPerOrder: div(t.spend, t.orders) };
}
function totalsOf(rows: CampaignDailyRow[]): Totals { return { spend: sum(rows.map(r => r.spend || 0)), sales: sum(rows.map(r => r.sales || 0)), orders: sum(rows.map(r => r.orders || 0)) }; }

export interface DayCard { date: string; spend: number; sales: number; orders: number; acos: number | null; orderValue: number | null; reason: string; isBest: boolean; }
export interface CampaignRange {
  name: string; spend: number; sales: number; orders: number;
  roas: number | null; acos: number | null; costPerOrder: number | null;
  avgSpend: number; avgOrders: number; avgOrderValue: number | null;
  byDate: Record<string, Totals>;
  zeroSale: boolean;
}
export interface RangeCtx {
  from: string; to: string; days: string[]; dayCount: number;
  week: { cur: Metrics; prev: Metrics | null };
  dayAvg: { spend: number; orders: number; orderValue: number | null; sales: number };
  dayCards: DayCard[];
  campaigns: CampaignRange[]; // sorted by spend desc
}

// day main cause vs range daily average
function dayCause(spend: number, orders: number, orderValue: number | null, avg: RangeCtx["dayAvg"]): "orders" | "orderValue" | "spend" | null {
  const dSpend = pctChange(spend, avg.spend), dOrders = pctChange(orders, avg.orders), dOV = pctChange(orderValue ?? 0, avg.orderValue);
  if (dOrders !== null && dOrders <= -20 && dSpend !== null && Math.abs(dSpend) < 15) return "orders";
  if (dOV !== null && dOV <= -15) return "orderValue";
  if (dSpend !== null && dSpend >= 25 && (dOrders === null || dOrders < dSpend)) return "spend";
  return null;
}

export function computeRange(allForProduct: CampaignDailyRow[], from: string, to: string): RangeCtx {
  const dayCount = Math.max(1, daysBetween(from, to) + 1);
  const inRange = (d: string) => d >= from && d <= to;
  const cur = allForProduct.filter(r => inRange(r.date));
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(dayCount - 1));
  const prev = allForProduct.filter(r => r.date >= prevFrom && r.date <= prevTo);

  const days: string[] = [];
  for (let i = 0; i < dayCount; i++) days.push(addDays(from, i));

  const weekCur = metrics(totalsOf(cur));
  const weekPrev = prev.length ? metrics(totalsOf(prev)) : null;
  const curT = totalsOf(cur);
  const dayAvg = { spend: curT.spend / dayCount, orders: curT.orders / dayCount, sales: curT.sales / dayCount, orderValue: div(curT.sales, curT.orders) };

  // per campaign
  const byCamp = new Map<string, { spend: number; sales: number; orders: number; byDate: Record<string, Totals> }>();
  for (const r of cur) {
    let a = byCamp.get(r.campaign_name);
    if (!a) { a = { spend: 0, sales: 0, orders: 0, byDate: {} }; byCamp.set(r.campaign_name, a); }
    a.spend += r.spend || 0; a.sales += r.sales || 0; a.orders += r.orders || 0;
    const d = a.byDate[r.date] ?? { spend: 0, sales: 0, orders: 0 };
    d.spend += r.spend || 0; d.sales += r.sales || 0; d.orders += r.orders || 0;
    a.byDate[r.date] = d;
  }
  const campaigns: CampaignRange[] = [...byCamp.entries()].map(([name, a]) => ({
    name, spend: a.spend, sales: a.sales, orders: a.orders,
    roas: div(a.sales, a.spend), acos: a.sales > 0 ? (a.spend / a.sales) * 100 : null, costPerOrder: div(a.spend, a.orders),
    avgSpend: a.spend / dayCount, avgOrders: a.orders / dayCount, avgOrderValue: div(a.sales, a.orders),
    byDate: a.byDate, zeroSale: a.spend > 0 && a.sales <= 0,
  })).sort((x, y) => y.spend - x.spend);

  // day cards
  const maxSales = Math.max(0, ...days.map(d => sum(cur.filter(r => r.date === d).map(r => r.sales || 0))));
  const dayCards: DayCard[] = days.map(d => {
    const t = totalsOf(cur.filter(r => r.date === d));
    const ov = div(t.sales, t.orders);
    const isBest = t.sales > 0 && t.sales === maxSales;
    const cause = dayCause(t.spend, t.orders, ov, dayAvg);
    const dOrders = pctChange(t.orders, dayAvg.orders), dSpend = pctChange(t.spend, dayAvg.spend), dOV = pctChange(ov ?? 0, dayAvg.orderValue);
    let reason: string;
    if (cause === "orders") reason = `Orders ${dOrders!.toFixed(0)}%`;
    else if (cause === "orderValue") reason = `Cheaper orders ${dOV!.toFixed(0)}%`;
    else if (cause === "spend") reason = `Spend +${dSpend!.toFixed(0)}%, orders kept up`;
    else if (isBest) reason = `Best day${dOrders !== null && dOrders > 10 ? ` · orders +${dOrders.toFixed(0)}%` : ""}`;
    else reason = "Normal";
    if (isBest && cause === null) reason = reason; // best handled above
    else if (isBest) reason = `Best day · ${reason.toLowerCase()}`;
    return { date: d, spend: t.spend, sales: t.sales, orders: t.orders, acos: t.sales > 0 ? (t.spend / t.sales) * 100 : null, orderValue: ov, reason, isBest };
  });

  return { from, to, days, dayCount, week: { cur: weekCur, prev: weekPrev }, dayAvg, dayCards, campaigns };
}

// ---- per-day diagnosis -----------------------------------------------------
export interface Driver { value: number; avg: number; pct: number | null; series: { date: string; value: number }[]; }
export interface GapBar { name: string; gap: number; }
export interface CampaignDayRow { name: string; spend: number; spendPct: number | null; orders: number; ordersPct: number | null; orderValue: number | null; ovPct: number | null; acos: number | null; usualAcos: number | null; tag: string; }
export interface DayDiagnosis {
  date: string;
  totals: Metrics;
  main: "spend" | "orders" | "orderValue" | null;
  verdict: string;
  drivers: { spend: Driver; orders: Driver; orderValue: Driver };
  gap: { bars: GapBar[]; net: number };
  rows: CampaignDayRow[];
}

const SHOWN = 7;
function shownCampaigns(ctx: RangeCtx): { shown: CampaignRange[]; small: CampaignRange[] } {
  const zero = ctx.campaigns.filter(c => c.zeroSale);
  const rest = ctx.campaigns.filter(c => !c.zeroSale);
  const top = rest.slice(0, SHOWN);
  const shown = [...top, ...zero.filter(z => !top.includes(z))];
  const small = ctx.campaigns.filter(c => !shown.includes(c));
  return { shown, small };
}

function campaignTag(c: CampaignRange, day: Totals): string {
  const dayAcos = day.sales > 0 ? (day.spend / day.sales) * 100 : null;
  const dayOV = div(day.sales, day.orders);
  if (day.spend > 0 && day.orders === 0) return "No sale";
  if (dayAcos !== null && c.acos !== null && dayAcos <= 1.15 * c.acos) return dayAcos < 0.85 * c.acos ? "Better than usual" : "Normal";
  if (c.avgSpend > 0 && day.spend >= 1.3 * c.avgSpend) {
    const spendR = day.spend / c.avgSpend, orderR = c.avgOrders > 0 ? day.orders / c.avgOrders : 0;
    if (orderR < spendR) return "Spent more, orders didn't follow";
  }
  if (c.avgOrderValue && dayOV !== null && dayOV < 0.8 * c.avgOrderValue) return "Cheaper orders";
  return "Fewer orders";
}

export function diagnoseDay(ctx: RangeCtx, date: string): DayDiagnosis {
  const card = ctx.dayCards.find(c => c.date === date) ?? ctx.dayCards[0];
  const totals = metrics({ spend: card.spend, sales: card.sales, orders: card.orders });
  const main = dayCause(card.spend, card.orders, card.orderValue, ctx.dayAvg);

  const last7 = ctx.days.slice(-7).length >= 7 ? ctx.days.slice(ctx.days.indexOf(date) - 6 < 0 ? 0 : ctx.days.indexOf(date) - 6, ctx.days.indexOf(date) + 1) : ctx.days;
  const serieSpend = last7.map(d => ({ date: d, value: ctx.dayCards.find(c => c.date === d)?.spend ?? 0 }));
  const serieOrders = last7.map(d => ({ date: d, value: ctx.dayCards.find(c => c.date === d)?.orders ?? 0 }));
  const serieOV = last7.map(d => ({ date: d, value: ctx.dayCards.find(c => c.date === d)?.orderValue ?? 0 }));
  const drivers = {
    spend: { value: card.spend, avg: ctx.dayAvg.spend, pct: pctChange(card.spend, ctx.dayAvg.spend), series: serieSpend },
    orders: { value: card.orders, avg: ctx.dayAvg.orders, pct: pctChange(card.orders, ctx.dayAvg.orders), series: serieOrders },
    orderValue: { value: card.orderValue ?? 0, avg: ctx.dayAvg.orderValue ?? 0, pct: pctChange(card.orderValue ?? 0, ctx.dayAvg.orderValue), series: serieOV },
  };

  const { shown, small } = shownCampaigns(ctx);
  const gapBars: GapBar[] = shown.map(c => {
    const day = c.byDate[date] ?? { spend: 0, sales: 0, orders: 0 };
    const expected = c.roas !== null ? day.spend * c.roas : day.sales;
    return { name: c.name, gap: day.sales - expected };
  });
  if (small.length) {
    const g = sum(small.map(c => { const day = c.byDate[date] ?? { spend: 0, sales: 0, orders: 0 }; const exp = c.roas !== null ? day.spend * c.roas : day.sales; return day.sales - exp; }));
    gapBars.push({ name: `${small.length} small campaigns`, gap: g });
  }
  gapBars.sort((a, b) => a.gap - b.gap);
  const net = sum(gapBars.map(b => b.gap));

  const rows: CampaignDayRow[] = shown.map(c => {
    const day = c.byDate[date] ?? { spend: 0, sales: 0, orders: 0 };
    const dayOV = div(day.sales, day.orders);
    return {
      name: c.name, spend: day.spend, spendPct: pctChange(day.spend, c.avgSpend),
      orders: day.orders, ordersPct: pctChange(day.orders, c.avgOrders),
      orderValue: dayOV, ovPct: pctChange(dayOV ?? 0, c.avgOrderValue),
      acos: day.sales > 0 ? (day.spend / day.sales) * 100 : null, usualAcos: c.acos,
      tag: campaignTag(c, day),
    };
  });

  // verdict
  const top6 = ctx.campaigns.slice(0, 6);
  const dropped = top6.filter(c => { const day = c.byDate[date] ?? { orders: 0 } as Totals; return c.avgOrders > 0 && day.orders < c.avgOrders * 0.85; }).length;
  const spendNormal = drivers.spend.pct !== null && Math.abs(drivers.spend.pct) < 15;
  const anythingOff = [drivers.spend.pct, drivers.orders.pct, drivers.orderValue.pct].some(p => p !== null && Math.abs(p) > 15);
  let verdict: string;
  if (spendNormal && dropped >= 4) {
    verdict = `Spend was normal. Orders fell ${Math.abs(drivers.orders.pct ?? 0).toFixed(0)}%, and ${dropped} of your top 6 campaigns dropped at the same time. When everything drops together it's usually the listing (stock, price, Buy Box, delivery date), not bids.`;
  } else if (anythingOff) {
    const worst = gapBars[0], best = gapBars[gapBars.length - 1];
    const bits: string[] = [];
    if (worst && worst.gap < 0) bits.push(`${worst.name} came in about ₹${Math.abs(Math.round(worst.gap / 1000))}k under what its spend usually earns`);
    if (best && best.gap > 0) bits.push(`${best.name} beat its usual by about ₹${Math.round(best.gap / 1000)}k`);
    verdict = bits.length ? bits.join("; ") + "." : "Mixed day across campaigns.";
  } else {
    verdict = "A normal day — nothing moved more than 15% from its usual.";
  }

  return { date, totals, main, verdict, drivers, gap: { bars: gapBars, net }, rows };
}

// ---- matrix ----------------------------------------------------------------
export type MatrixMetric = "acos" | "orders" | "spend" | "cpo";
export interface MatrixCell { text: string; tone: "worse" | "better" | "neutral" | "empty"; bold: boolean; }
export interface MatrixRow { name: string; cells: MatrixCell[]; }
export interface Matrix { days: string[]; rows: MatrixRow[]; }

export function buildMatrix(ctx: RangeCtx, metric: MatrixMetric): Matrix {
  const { shown, small } = shownCampaigns(ctx);
  const rowsDef: { name: string; byDate: Record<string, Totals>; c: CampaignRange | null }[] = shown.map(c => ({ name: c.name, byDate: c.byDate, c }));
  if (small.length) {
    const byDate: Record<string, Totals> = {};
    for (const c of small) for (const [d, t] of Object.entries(c.byDate)) { const x = byDate[d] ?? { spend: 0, sales: 0, orders: 0 }; x.spend += t.spend; x.sales += t.sales; x.orders += t.orders; byDate[d] = x; }
    const agg = small.reduce((a, c) => ({ spend: a.spend + c.spend, sales: a.sales + c.sales, orders: a.orders + c.orders }), { spend: 0, sales: 0, orders: 0 });
    const c: CampaignRange = { name: `${small.length} small`, spend: agg.spend, sales: agg.sales, orders: agg.orders, roas: div(agg.sales, agg.spend), acos: agg.sales > 0 ? agg.spend / agg.sales * 100 : null, costPerOrder: div(agg.spend, agg.orders), avgSpend: agg.spend / ctx.dayCount, avgOrders: agg.orders / ctx.dayCount, avgOrderValue: div(agg.sales, agg.orders), byDate, zeroSale: false };
    rowsDef.push({ name: c.name, byDate, c });
  }

  const rows: MatrixRow[] = rowsDef.map(rd => {
    const cells: MatrixCell[] = ctx.days.map(d => {
      const t = rd.byDate[d];
      if (!t || (t.spend === 0 && t.sales === 0 && t.orders === 0)) return { text: "", tone: "empty", bold: false };
      const c = rd.c!;
      const zeroSale = t.spend > 0 && t.orders === 0;
      if (metric === "spend") {
        const text = `₹${Math.round(t.spend).toLocaleString("en-IN")}`;
        if (zeroSale) return { text: `₹0 sale`, tone: "worse", bold: true };
        return { text, tone: "neutral", bold: c.avgSpend > 0 && t.spend > 1.3 * c.avgSpend };
      }
      if (metric === "orders") {
        if (zeroSale) return { text: "no order", tone: "worse", bold: false };
        const tone = c.avgOrders > 0 ? (t.orders < 0.75 * c.avgOrders ? "worse" : t.orders > 1.25 * c.avgOrders ? "better" : "neutral") : "neutral";
        return { text: `${t.orders}`, tone, bold: false };
      }
      if (metric === "cpo") {
        if (zeroSale) return { text: "₹0 sale", tone: "worse", bold: false };
        const cpo = t.orders > 0 ? t.spend / t.orders : null;
        const base = c.costPerOrder;
        const tone = cpo !== null && base ? (cpo > 1.25 * base ? "worse" : cpo < 0.75 * base ? "better" : "neutral") : "neutral";
        return { text: cpo === null ? "—" : `₹${Math.round(cpo).toLocaleString("en-IN")}`, tone, bold: false };
      }
      // acos
      if (zeroSale) return { text: "₹0 sale", tone: "worse", bold: false };
      const acos = t.sales > 0 ? t.spend / t.sales * 100 : null;
      const base = c.acos;
      const tone = acos !== null && base ? (acos > 1.15 * base ? "worse" : acos < 0.85 * base ? "better" : "neutral") : "neutral";
      return { text: acos === null ? "—" : `${acos.toFixed(0)}%`, tone, bold: false };
    });
    return { name: rd.name, cells };
  });
  return { days: ctx.days, rows };
}
