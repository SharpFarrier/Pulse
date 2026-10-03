// Listing engine, rebuilt around a SELECTED month M vs a baseline, answering
// "account problem or listing problem, and where did the rupees go?"
export interface BusinessMonthlyRow {
  period: string; asin: string; sku: string | null; title: string | null;
  ordered_product_sales: number; units_ordered: number; sessions: number; featured_offer_pct: number | null;
}
export type Mode = "3mo" | "last";
export type Status = "worse" | "beat" | "inline" | "stopped" | "new" | "tiny";
export type Tag = "Traffic" | "Conversion" | "Traffic + conversion" | "Price cut" | "Buy box" | "More traffic" | "Better conversion" | "Check data" | "";

const mkey = (p: string) => p.slice(0, 7);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (cur: number, base: number) => (base > 0 ? (cur / base - 1) * 100 : null);
const TINY = 5000;

export interface MetricMove { m: number; base: number; pct: number | null; }
export interface SkuView {
  asin: string; sku: string | null; title: string | null; family: string; name: string;
  revSeries: number[];
  m: number; baseline: number; change: number; pct: number | null; relative: number | null;
  status: Status; tag: Tag;
  sess: MetricMove; conv: MetricMove; price: MetricMove; buybox: { m: number | null; base: number | null; pp: number | null };
}
export interface FamilyRow { family: string; m: number; baseline: number; change: number; pct: number | null; relativePts: number | null; expectedM: number; }
export interface Sibling { base: string; family: string; up: { name: string; change: number }; down: { name: string; change: number }; }
export interface ListingView {
  months: string[]; month: string; mode: Mode; baselineMonths: string[];
  skuCount: number;
  account: { m: number; baseline: number; pct: number; sentence: string; sessions: MetricMove; conversion: MetricMove; price: MetricMove; revByMonth: number[] };
  families: FamilyRow[];
  signals: { siblings: Sibling[]; stopped: { count: number; largest: SkuView | null }; priceMovedTop: number; checkData: number };
  losers: SkuView[]; gainers: SkuView[];
  skus: SkuView[]; counts: Record<Status, number>;
}

function familyOf(title: string | null): string {
  if (!title) return "Other";
  const m = title.match(/honey\s*touch\s+([A-Za-z]+)/i);
  return m ? m[1] : "Other";
}
function readableName(title: string | null, sku: string | null): string {
  if (!title) return sku ?? "—";
  const t = title.replace(/^honey\s*touch\s+/i, "").split("|")[0].trim();
  return t.length > 48 ? t.slice(0, 47) + "…" : t;
}
function skuBase(sku: string | null): string | null { if (!sku) return null; const p = sku.split("-"); return p.length > 1 ? p.slice(0, -1).join("-") : sku; }

function diagnose(sess: MetricMove, conv: MetricMove, price: MetricMove, buyboxPp: number | null, gaining: boolean): Tag {
  const s = sess.pct, c = conv.pct, p = price.pct;
  if ((s !== null && s <= -35 && c !== null && c >= 40) || (c !== null && c <= -35 && s !== null && s >= 40)) return "Check data";
  if (gaining) {
    if (s !== null && s >= 15) return "More traffic";
    if (c !== null && c >= 15) return "Better conversion";
    return "";
  }
  if (s !== null && s <= -15 && c !== null && c <= -15) return "Traffic + conversion";
  if (s !== null && s <= -20 && (c === null || c > -10)) return "Traffic";
  if (c !== null && c <= -20 && (s === null || s > -10)) return "Conversion";
  if (p !== null && p <= -10) return "Price cut";
  if (buyboxPp !== null && buyboxPp <= -5) return "Buy box";
  return "";
}

export function listMonths(rows: BusinessMonthlyRow[]): string[] { return [...new Set(rows.map(r => mkey(r.period)))].sort(); }

export function computeListingView(rows: BusinessMonthlyRow[], month?: string, mode: Mode = "3mo"): ListingView | null {
  if (rows.length === 0) return null;
  const months = listMonths(rows);
  const M = month && months.includes(month) ? month : months[months.length - 1];
  const mi = months.indexOf(M);
  const baseIdx = mode === "last" ? (mi >= 1 ? [mi - 1] : []) : months.slice(Math.max(0, mi - 3), mi).map((_, k) => Math.max(0, mi - 3) + k);
  const baselineMonths = baseIdx.map(i => months[i]);

  // per ASIN series
  interface Acc { asin: string; sku: string | null; title: string | null; rev: number[]; sess: number[]; units: number[]; bb: (number | null)[]; }
  const byAsin = new Map<string, Acc>();
  const idx = new Map(months.map((m, i) => [m, i]));
  for (const r of rows) {
    let a = byAsin.get(r.asin);
    if (!a) { a = { asin: r.asin, sku: r.sku, title: r.title, rev: Array(months.length).fill(0), sess: Array(months.length).fill(0), units: Array(months.length).fill(0), bb: Array(months.length).fill(null) }; byAsin.set(r.asin, a); }
    const i = idx.get(mkey(r.period))!;
    a.rev[i] += r.ordered_product_sales || 0; a.sess[i] += r.sessions || 0; a.units[i] += r.units_ordered || 0; a.bb[i] = r.featured_offer_pct;
    if (!a.sku && r.sku) a.sku = r.sku; if (!a.title && r.title) a.title = r.title;
  }

  const baseAvg = (arr: number[]) => avg(baseIdx.map(i => arr[i]));
  const skus: SkuView[] = [...byAsin.values()].map(a => {
    const m = a.rev[mi], baseline = baseAvg(a.rev);
    const sessM = a.sess[mi], sessB = baseAvg(a.sess), unitsM = a.units[mi], unitsB = baseAvg(a.units);
    const convM = sessM > 0 ? unitsM / sessM * 100 : 0, convB = sessB > 0 ? unitsB / sessB * 100 : 0;
    const priceM = unitsM > 0 ? m / unitsM : 0, priceB = unitsB > 0 ? baseline / unitsB : 0;
    const bbVals = baseIdx.map(i => a.bb[i]).filter((v): v is number => v !== null);
    const bbB = bbVals.length ? avg(bbVals) : null, bbM = a.bb[mi];
    const sess = { m: sessM, base: sessB, pct: pct(sessM, sessB) };
    const conv = { m: convM, base: convB, pct: pct(convM, convB) };
    const price = { m: priceM, base: priceB, pct: pct(priceM, priceB) };
    const buyboxPp = bbB !== null && bbM !== null ? bbM - bbB : null;
    const change = m - baseline, pctv = pct(m, baseline);
    const gaining = pctv !== null && pctv > 0;
    let status: Status;
    if (m === 0 && baseline > 0) status = "stopped";
    else if (baseline === 0 && m > 0) status = "new";
    else if (m < TINY && baseline < TINY) status = "tiny";
    else status = "inline"; // relative computed after account
    const tag: Tag = status === "stopped" ? "" : diagnose(sess, conv, price, buyboxPp, gaining);
    return { asin: a.asin, sku: a.sku, title: a.title, family: familyOf(a.title), name: readableName(a.title, a.sku), revSeries: a.rev, m, baseline, change, pct: pctv, relative: null, status, tag, sess, conv, price, buybox: { m: bbM, base: bbB, pp: buyboxPp } };
  });

  // account
  const accM = skus.reduce((s, k) => s + k.m, 0);
  const accBase = skus.reduce((s, k) => s + k.baseline, 0);
  const accPct = accBase > 0 ? (accM / accBase - 1) * 100 : 0;
  // relative + final status
  for (const k of skus) {
    if (k.status === "stopped" || k.status === "new" || k.status === "tiny") continue;
    k.relative = k.pct !== null ? k.pct - accPct : null;
    k.status = k.relative === null ? "inline" : k.relative < -15 ? "worse" : k.relative > 15 ? "beat" : "inline";
  }

  // account driver tiles (from SKUs with sessions data)
  const withSess = skus.filter(k => k.sess.base > 0 || k.sess.m > 0);
  const sM = withSess.reduce((s, k) => s + k.sess.m, 0), sB = withSess.reduce((s, k) => s + k.sess.base, 0);
  const uM = withSess.reduce((s, k) => s + (k.m > 0 && k.price.m > 0 ? k.m / k.price.m : 0), 0);
  const uB = withSess.reduce((s, k) => s + (k.baseline > 0 && k.price.base > 0 ? k.baseline / k.price.base : 0), 0);
  const convAccM = sM > 0 ? uM / sM * 100 : 0, convAccB = sB > 0 ? uB / sB * 100 : 0;
  const priceAccM = uM > 0 ? accM / uM : 0, priceAccB = uB > 0 ? accBase / uB : 0;
  const revByMonth = months.map((_, i) => skus.reduce((s, k) => s + k.revSeries[i], 0));

  // families
  const famMap = new Map<string, { m: number; baseline: number }>();
  for (const k of skus) { const f = famMap.get(k.family) ?? { m: 0, baseline: 0 }; f.m += k.m; f.baseline += k.baseline; famMap.set(k.family, f); }
  let families: FamilyRow[] = [...famMap.entries()].map(([family, v]) => ({ family, m: v.m, baseline: v.baseline, change: v.m - v.baseline, pct: pct(v.m, v.baseline), relativePts: pct(v.m, v.baseline) !== null ? pct(v.m, v.baseline)! - accPct : null, expectedM: v.baseline * (1 + accPct / 100) }));
  families.sort((a, b) => a.change - b.change);
  // keep top 8 by |change|, group rest as "Other"
  const bySize = [...families].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const keep = new Set(bySize.slice(0, 8).map(f => f.family));
  const grouped = families.filter(f => keep.has(f.family));
  const rest = families.filter(f => !keep.has(f.family));
  if (rest.length) { const r = rest.reduce((a, f) => ({ m: a.m + f.m, baseline: a.baseline + f.baseline }), { m: 0, baseline: 0 }); grouped.push({ family: `${rest.length} others`, m: r.m, baseline: r.baseline, change: r.m - r.baseline, pct: pct(r.m, r.baseline), relativePts: pct(r.m, r.baseline) !== null ? pct(r.m, r.baseline)! - accPct : null, expectedM: r.baseline * (1 + accPct / 100) }); }
  families = grouped.sort((a, b) => a.change - b.change);

  // signals
  const baseGroups = new Map<string, SkuView[]>();
  for (const k of skus) { const b = skuBase(k.sku); if (!b) continue; const key = k.family + "|" + b; const g = baseGroups.get(key) ?? []; g.push(k); baseGroups.set(key, g); }
  const siblings: Sibling[] = [];
  for (const [key, g] of baseGroups) {
    if (g.length < 2) continue;
    const up = g.filter(k => k.change >= 1e5).sort((a, b) => b.change - a.change)[0];
    const down = g.filter(k => k.change <= -1e5).sort((a, b) => a.change - b.change)[0];
    if (up && down) siblings.push({ base: key.split("|")[1], family: g[0].family, up: { name: up.name, change: up.change }, down: { name: down.name, change: down.change } });
  }
  const stoppedList = skus.filter(k => k.status === "stopped").sort((a, b) => b.baseline - a.baseline);
  const topSkus = [...skus].sort((a, b) => b.baseline - a.baseline).slice(0, 12);
  const priceMovedTop = topSkus.filter(k => k.price.pct !== null && Math.abs(k.price.pct) >= 5).length;
  const checkData = skus.filter(k => k.tag === "Check data").length;

  // movers (exclude stopped/new/tiny for gainers/losers by rupee change, but stopped are big losers — keep them)
  const sorted = [...skus].sort((a, b) => a.change - b.change);
  const losers = sorted.filter(k => k.change < 0).slice(0, 8);
  const gainers = [...sorted].reverse().filter(k => k.change > 0).slice(0, 5);

  const counts: Record<Status, number> = { worse: 0, beat: 0, inline: 0, stopped: 0, new: 0, tiny: 0 };
  for (const k of skus) counts[k.status]++;

  // account sentence
  const worstFam = families[0];
  const dropShare = worstFam && accM - accBase < 0 ? worstFam.change / (accM - accBase) : 0;
  const downFams = families.filter(f => (f.pct ?? 0) < -5).length;
  let sentence: string;
  if (accPct >= -5) sentence = "Revenue held broadly in line with its usual run.";
  else if (dropShare > 0.5) sentence = `This is concentrated: ${worstFam.family} alone accounts for about ${Math.round(dropShare * 100)}% of the fall.`;
  else sentence = `This is account-wide — ${downFams} of your families fell together, so it's more likely a demand/listing shift than any one product.`;

  const account = { m: accM, baseline: accBase, pct: accPct, sentence, sessions: { m: sM, base: sB, pct: pct(sM, sB) }, conversion: { m: convAccM, base: convAccB, pct: pct(convAccM, convAccB) }, price: { m: priceAccM, base: priceAccB, pct: pct(priceAccM, priceAccB) }, revByMonth };

  return { months, month: M, mode, baselineMonths, skuCount: skus.filter(k => k.m > 0).length, account, families, signals: { siblings, stopped: { count: stoppedList.length, largest: stoppedList[0] ?? null }, priceMovedTop, checkData }, losers, gainers, skus, counts };
}
