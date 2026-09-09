// Pure listing-trend + drop-diagnosis logic over the monthly Business report.
export interface BusinessMonthlyRow {
  period: string;
  asin: string;
  sku: string | null;
  title: string | null;
  ordered_product_sales: number;
  units_ordered: number;
  sessions: number;
  featured_offer_pct: number | null;
}

export type ListingStatus = "growing" | "steady" | "slipping" | "declining" | "new";

export interface SkuTrend {
  asin: string; sku: string | null; title: string | null;
  series: number[]; sessionsSeries: number[]; unitsSeries: number[]; buyboxSeries: (number | null)[];
  latest: number; prior: number | null; momPct: number | null; recentAvg: number | null;
  monthsDown: number; latestUnits: number; status: ListingStatus;
}

export interface ListingData { months: string[]; revenueByMonth: number[]; latestMonth: string | null; skus: SkuTrend[]; attention: SkuTrend[]; }

const SLIP_DROP = 0.15;
const GROW_RISE = 0.10;
const mkey = (period: string) => period.slice(0, 7);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function statusFor(series: number[]): { status: ListingStatus; monthsDown: number; recentAvg: number | null } {
  const present = series.filter((v) => v > 0);
  if (present.length < 2) return { status: "new", monthsDown: 0, recentAvg: present.length ? present[present.length - 1] : null };
  const latest = present[present.length - 1], prior = present[present.length - 2];
  let monthsDown = 0;
  for (let i = present.length - 1; i > 0; i--) { if (present[i] < present[i - 1]) monthsDown++; else break; }
  const before = present.slice(0, present.length - 1);
  const window = before.slice(Math.max(0, before.length - 3));
  const recentAvg = window.length ? avg(window) : null;
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
  interface Acc { asin: string; sku: string | null; title: string | null; rev: number[]; units: number[]; sess: number[]; bb: (number | null)[]; }
  const byAsin = new Map<string, Acc>();
  for (const r of rows) {
    let a = byAsin.get(r.asin);
    if (!a) { a = { asin: r.asin, sku: r.sku, title: r.title, rev: Array(months.length).fill(0), units: Array(months.length).fill(0), sess: Array(months.length).fill(0), bb: Array(months.length).fill(null) }; byAsin.set(r.asin, a); }
    const i = idx.get(mkey(r.period))!;
    a.rev[i] += r.ordered_product_sales || 0;
    a.units[i] += r.units_ordered || 0;
    a.sess[i] += r.sessions || 0;
    a.bb[i] = r.featured_offer_pct;
    if (!a.sku && r.sku) a.sku = r.sku;
    if (!a.title && r.title) a.title = r.title;
  }
  const revenueByMonth = Array(months.length).fill(0);
  const skus: SkuTrend[] = [...byAsin.values()].map((a) => {
    a.rev.forEach((v, i) => (revenueByMonth[i] += v));
    const { status, monthsDown, recentAvg } = statusFor(a.rev);
    const present = a.rev.filter((v) => v > 0);
    const latest = present.length ? present[present.length - 1] : 0;
    const prior = present.length >= 2 ? present[present.length - 2] : null;
    const momPct = prior && prior > 0 ? ((latest - prior) / prior) * 100 : null;
    let latestUnits = 0;
    for (let i = a.rev.length - 1; i >= 0; i--) { if (a.rev[i] > 0) { latestUnits = a.units[i]; break; } }
    return { asin: a.asin, sku: a.sku, title: a.title, series: a.rev, sessionsSeries: a.sess, unitsSeries: a.units, buyboxSeries: a.bb, latest, prior, momPct, recentAvg, monthsDown, latestUnits, status };
  }).sort((x, y) => y.latest - x.latest);
  const rank: Record<ListingStatus, number> = { declining: 0, slipping: 1, steady: 2, growing: 3, new: 4 };
  const attention = skus.filter((s) => s.status === "slipping" || s.status === "declining").sort((a, b) => (rank[a.status] - rank[b.status]) || (b.latest - a.latest));
  return { months, revenueByMonth, latestMonth: months[months.length - 1] ?? null, skus, attention };
}

export interface Driver { baseline: number | null; latest: number; pct: number | null; series: number[]; }
export type VerdictKind = "traffic" | "conversion" | "price" | "buybox" | "healthy" | "insufficient";
export interface Diagnosis {
  revPct: number | null; dropping: boolean;
  drivers: { sessions: Driver; conversion: Driver; price: Driver; buybox: Driver };
  primary: "sessions" | "conversion" | "price" | "buybox" | null;
  kind: VerdictKind; verdict: string;
}
const pctc = (latest: number, base: number | null) => (base && base > 0 ? ((latest - base) / base) * 100 : null);

export function diagnose(s: SkuTrend): Diagnosis {
  const presentIdx = s.series.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const empty: Driver = { baseline: null, latest: 0, pct: null, series: [] };
  if (presentIdx.length < 2) return { revPct: null, dropping: false, drivers: { sessions: empty, conversion: empty, price: empty, buybox: empty }, primary: null, kind: "insufficient", verdict: "Not enough history yet — needs at least two months to compare." };
  const li = presentIdx[presentIdx.length - 1];
  const baseIdx = presentIdx.slice(0, presentIdx.length - 1).slice(-3);
  const baseRev = avg(baseIdx.map((i) => s.series[i]));
  const baseSess = avg(baseIdx.map((i) => s.sessionsSeries[i]));
  const baseUnits = avg(baseIdx.map((i) => s.unitsSeries[i]));
  const baseBBvals = baseIdx.map((i) => s.buyboxSeries[i]).filter((v): v is number => v !== null);
  const baseBB = baseBBvals.length ? avg(baseBBvals) : null;
  const latRev = s.series[li], latSess = s.sessionsSeries[li], latUnits = s.unitsSeries[li], latBB = s.buyboxSeries[li];
  const cvrLat = latSess > 0 ? (latUnits / latSess) * 100 : 0;
  const cvrBase = baseSess > 0 ? (baseUnits / baseSess) * 100 : null;
  const priceLat = latUnits > 0 ? latRev / latUnits : 0;
  const priceBase = baseUnits > 0 ? baseRev / baseUnits : null;
  const drivers = {
    sessions:   { baseline: baseSess || null, latest: latSess, pct: pctc(latSess, baseSess), series: s.sessionsSeries },
    conversion: { baseline: cvrBase, latest: cvrLat, pct: pctc(cvrLat, cvrBase), series: s.sessionsSeries.map((se, i) => (se > 0 ? (s.unitsSeries[i] / se) * 100 : 0)) },
    price:      { baseline: priceBase, latest: priceLat, pct: pctc(priceLat, priceBase), series: s.series.map((r, i) => (s.unitsSeries[i] > 0 ? r / s.unitsSeries[i] : 0)) },
    buybox:     { baseline: baseBB, latest: latBB ?? 0, pct: baseBB ? (latBB ?? 0) - baseBB : null, series: s.buyboxSeries.map((v) => v ?? 0) },
  };
  const revPct = pctc(latRev, baseRev);
  const dropping = revPct !== null && revPct < -5;
  const cand: [Diagnosis["primary"], number][] = [["sessions", drivers.sessions.pct ?? 0], ["conversion", drivers.conversion.pct ?? 0], ["price", drivers.price.pct ?? 0]];
  cand.sort((a, b) => a[1] - b[1]);
  const primary = cand[0][0];
  const bbDrop = drivers.buybox.pct !== null && drivers.buybox.pct <= -5;
  const f = (n: number | null) => (n === null ? "—" : `${Math.abs(n).toFixed(0)}%`);
  let kind: VerdictKind, verdict: string;
  if (!dropping) {
    kind = "healthy";
    verdict = revPct !== null && revPct > 5 ? "Growing — revenue above its recent run, led by " + (primary === "sessions" ? "more traffic." : primary === "conversion" ? "better conversion." : "higher price.") : "Holding — revenue within its recent range; nothing dragging.";
  } else if (bbDrop && (drivers.conversion.pct ?? 0) < -5) {
    kind = "buybox"; verdict = `Buy-box loss — featured-offer share dropped ${Math.abs(drivers.buybox.pct!).toFixed(0)}pp and conversion fell with it. Check your price against other sellers on the listing.`;
  } else if (primary === "sessions") {
    kind = "traffic"; verdict = `Traffic problem — sessions down ${f(drivers.sessions.pct)} while conversion and price held. Look at ranking, ad support, or category demand, not the listing.`;
  } else if (primary === "conversion") {
    kind = "conversion"; verdict = `Conversion problem — traffic held but ${f(drivers.conversion.pct)} fewer visits convert. Check price, reviews, content, or competition.`;
  } else {
    kind = "price"; verdict = `Lower selling price — revenue per unit down ${f(drivers.price.pct)} (discounting or a mix shift), even as traffic held.`;
  }
  return { revPct, dropping, drivers, primary, kind, verdict };
}
