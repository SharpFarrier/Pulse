"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeAccountView, type AccountDailyRow, type MetricKey, type Grain, type Bucket, type MetricCard } from "@/lib/reports/account";
import { MonthPicker } from "./drum-picker";

/* ---------- formatting ---------- */
const inr = (n: number) => { const a = Math.abs(n); const s = n < 0 ? "−" : ""; return a >= 1e7 ? `${s}₹${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `${s}₹${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${s}₹${(a / 1e3).toFixed(1)}k` : `${s}₹${Math.round(a)}`; };
const knum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const mFull = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const mShort = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const dShort = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

const META: Record<MetricKey, { label: string; sub?: string; fmt: (n: number) => string; goodUp: boolean; hasTotal: boolean }> = {
  revenue: { label: "Revenue / day", fmt: inr, goodUp: true, hasTotal: true },
  orders: { label: "Orders / day", fmt: (n) => Math.round(n).toLocaleString("en-IN"), goodUp: true, hasTotal: true },
  pageviews: { label: "Page views / day", fmt: (n) => Math.round(n).toLocaleString("en-IN"), goodUp: true, hasTotal: true },
  conversion: { label: "Conversion rate", sub: "units ÷ page views", fmt: (n) => `${n.toFixed(2)}%`, goodUp: true, hasTotal: false },
  offers: { label: "Offer count", fmt: (n) => Math.round(n).toLocaleString("en-IN"), goodUp: true, hasTotal: false },
};

function deltaStr(p: number | null) { return p === null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}%`; }
function deltaColor(p: number | null, goodUp: boolean) {
  if (p === null || Math.abs(p) < 1) return "var(--muted)";
  const worse = goodUp ? p < 0 : p > 0;
  return worse ? "var(--worsefg)" : "var(--betterfg)";
}
function barColor(p: number | null, goodUp: boolean) {
  if (p === null || Math.abs(p) < 1) return "#9A978E";
  const worse = goodUp ? p < 0 : p > 0;
  return worse ? "#E58B45" : "#5B93C7";
}

/* ---------- paired comparison bar ---------- */
function Pair({ rowLabel, cur, prev, pct, fmt, goodUp }: { rowLabel: string; cur: number | null; prev: number | null; pct: number | null; fmt: (n: number) => string; goodUp: boolean }) {
  const max = Math.max(cur ?? 0, prev ?? 0, 1);
  const curW = cur === null ? 0 : Math.max(3, (cur / max) * 100);
  const prevW = prev === null ? 0 : Math.max(3, (prev / max) * 100);
  const col = barColor(pct, goodUp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
      <span style={{ fontSize: 11, color: "#8A8C86", width: 60, flex: "none" }}>{rowLabel}</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 9, borderRadius: 5, width: `${curW}%`, background: col }} /><span style={{ fontSize: 10, color: "#8A8C86" }}>{cur === null ? "—" : fmt(cur)}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 9, borderRadius: 5, width: `${prevW}%`, background: "#D8D4C9" }} /><span style={{ fontSize: 10, color: "#8A8C86" }}>{prev === null ? "—" : fmt(prev)}</span></div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, width: 48, flex: "none", textAlign: "right", color: deltaColor(pct, goodUp) }}>{deltaStr(pct)}</span>
    </div>
  );
}

function Card({ k, card, prevLabel, yoyLabel, showTotal }: { k: MetricKey; card: MetricCard; prevLabel: string; yoyLabel: string; showTotal: boolean }) {
  const meta = META[k];
  const headline = showTotal && meta.hasTotal ? card.monthTotal : card.perDay;
  return (
    <div className="dbd-card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{showTotal && meta.hasTotal ? meta.label.replace(" / day", " · month") : meta.label}{meta.sub ? <span style={{ color: "#8A8C86" }}> · {meta.sub}</span> : null}</div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", margin: "2px 0", lineHeight: 1.1 }}>{headline === null ? "—" : meta.fmt(headline)}</div>
      <Pair rowLabel={prevLabel} cur={card.mom.cur} prev={card.mom.prev} pct={card.mom.pct} fmt={meta.fmt} goodUp={meta.goodUp} />
      <Pair rowLabel={yoyLabel} cur={card.yoy.cur} prev={card.yoy.prev} pct={card.yoy.pct} fmt={meta.fmt} goodUp={meta.goodUp} />
    </div>
  );
}

/* ---------- lifecycle ---------- */
function bVal(b: Bucket, k: MetricKey): number | null { return k === "offers" ? b.offers : (b.days ? (b[k] as number) : null); }

function LifecycleBars({ buckets, k, labelOf }: { buckets: Bucket[]; k: MetricKey; labelOf: (key: string) => string }) {
  const vals = buckets.map((b) => bVal(b, k));
  const max = Math.max(1, ...vals.map((v) => v ?? 0));
  const fmt = META[k].fmt;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: buckets.length > 14 ? 4 : 14, height: 160, padding: "0 2px" }}>
      {buckets.map((b, i) => {
        const v = vals[i];
        const h = v === null ? 0 : Math.max(2, (v / max) * 128);
        const col = b.partial ? "#5B93C7" : "#C9C6BC";
        return (
          <div key={b.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
            {buckets.length <= 14 && <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{v === null ? "—" : fmt(v)}</span>}
            <div title={`${labelOf(b.key)}: ${v === null ? "—" : fmt(v)}`} style={{ width: "100%", maxWidth: 46, height: h, background: v === null ? "#ECE8DE" : col, borderRadius: "5px 5px 0 0" }} />
            {buckets.length <= 14 && <span style={{ fontSize: 10, color: "#8A8C86", whiteSpace: "nowrap" }}>{labelOf(b.key)}{b.partial ? "*" : ""}</span>}
          </div>
        );
      })}
    </div>
  );
}

function LifecycleLine({ buckets, k, saleDays }: { buckets: Bucket[]; k: MetricKey; saleDays: Set<string> }) {
  const W = 640, H = 150, P = 6;
  const pts = buckets.map((b, i) => ({ x: buckets.length <= 1 ? W / 2 : P + (i / (buckets.length - 1)) * (W - 2 * P), v: bVal(b, k), key: b.key }));
  const max = Math.max(1, ...pts.map((p) => p.v ?? 0));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = pts.filter((p) => p.v !== null).map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${y(p.v as number).toFixed(1)}`).join(" ");
  const area = pts.filter((p) => p.v !== null).length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - P} L${pts[0].x.toFixed(1)},${H - P} Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150, display: "block" }}>
      {area && <path d={area} fill="#DCEAF7" opacity={0.6} />}
      {line && <path d={line} fill="none" stroke="#1B4F7A" strokeWidth={1.4} />}
      {pts.filter((p) => p.v !== null && saleDays.has(p.key)).map((p) => (
        <circle key={p.key} cx={p.x} cy={y(p.v as number)} r={2.4} fill="#C25E12" />
      ))}
    </svg>
  );
}

/* ---------- sale-day editor ---------- */
function SaleEditor({ rows, month }: { rows: AccountDailyRow[]; month: string }) {
  const router = useRouter();
  const monthRows = useMemo(() => rows.filter((r) => r.date.slice(0, 7) === month).sort((a, b) => (a.date < b.date ? -1 : 1)), [rows, month]);
  const [draft, setDraft] = useState<Record<string, { sale: boolean; disc: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const get = (r: AccountDailyRow) => draft[r.date] ?? { sale: !!r.sale_participation, disc: r.discount_pct != null ? String(r.discount_pct) : "" };
  const set = (date: string, patch: Partial<{ sale: boolean; disc: string }>) => { setSaved(false); setDraft((d) => ({ ...d, [date]: { ...get(monthRows.find((r) => r.date === date)!), ...d[date], ...patch } })); };

  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const annotations = Object.entries(draft).map(([date, v]) => ({ date, sale_participation: v.sale, discount_pct: v.disc === "" ? null : Number(v.disc) }));
      const res = await fetch("/api/daily-account-annotate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ annotations }) });
      if (!res.ok) throw new Error((await res.json()).error || "save failed");
      setDraft({}); setSaved(true); router.refresh();
    } catch { /* keep draft so Adi can retry */ } finally { setSaving(false); }
  };

  if (monthRows.length === 0) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No days stored for {mFull(month)} yet.</div>;
  return (
    <div>
      <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--bd)", borderRadius: 10 }}>
        {monthRows.map((r, i) => { const g = get(r); return (
          <div key={r.date} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "7px 12px", borderTop: i ? "1px solid var(--bd)" : "none", background: g.sale ? "#FBF4EC" : "transparent" }}>
            <span style={{ fontSize: 12 }}>{dShort(r.date)} <span style={{ color: "#8A8C86" }}>· {inr(r.ordered_product_sales)}</span></span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={g.sale} onChange={(e) => set(r.date, { sale: e.target.checked })} /> sale day
            </label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)" }}>
              <input type="number" value={g.disc} onChange={(e) => set(r.date, { disc: e.target.value })} placeholder="—" style={{ width: 52, fontSize: 12, padding: "3px 6px", border: "1px solid var(--bd)", borderRadius: 6, fontFamily: "inherit" }} />% off
            </span>
          </div>
        ); })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button onClick={save} disabled={!dirty || saving} style={{ fontSize: 13, fontWeight: 500, border: "none", borderRadius: 8, padding: "7px 16px", cursor: dirty ? "pointer" : "default", background: dirty ? "var(--ink)" : "var(--bd)", color: dirty ? "#fff" : "var(--muted)" }}>{saving ? "Saving…" : "Save flags"}</button>
        {saved && <span style={{ fontSize: 12, color: "var(--betterfg)" }}>Saved.</span>}
      </div>
    </div>
  );
}

/* ---------- main ---------- */
const METRIC_CHIPS: [MetricKey, string][] = [["conversion", "Conversion"], ["revenue", "Revenue"], ["orders", "Orders"], ["pageviews", "Page views"], ["offers", "Offers"]];

export default function AccountView({ rows }: { rows: AccountDailyRow[] }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [showTotal, setShowTotal] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [lifeMetric, setLifeMetric] = useState<MetricKey>("conversion");
  const [grain, setGrain] = useState<Grain>("yearly");
  const [editSale, setEditSale] = useState(false);

  const v = useMemo(() => computeAccountView(rows, month), [rows, month]);
  const saleSet = useMemo(() => new Set(v?.saleDays ?? []), [v]);

  if (!v) return <div style={{ marginTop: 16, color: "var(--muted)" }}>No account data yet — ingest a “by date” Business report in the Account (daily) tab.</div>;

  const M = v.selectedMonth;
  const prevLabel = v.prevMonth ? `vs ${mShort(v.prevMonth).split(" ")[0]}` : "vs prev";
  const yoyLabel = v.yoyMonth ? `vs ${mShort(v.yoyMonth)}` : "vs last yr";
  const minYear = Number(v.months[0].slice(0, 4));
  const maxYear = Number(v.months[v.months.length - 1].slice(0, 4));

  const buckets = v.lifecycle[grain];
  const labelOf = grain === "yearly" ? (k: string) => k : grain === "monthly" ? mShort : dShort;
  const ovp = v.offersVsPageviews.mom;

  return (
    <div>
      {/* selected-month header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{mFull(M)}{v.selected.partial ? " · so far" : ""}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>daily average · {prevLabel.replace("vs ", "vs ")} · {yoyLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", position: "relative" }}>
          <div style={{ display: "inline-flex", gap: 3, background: "#ECE8DE", borderRadius: 9, padding: 3 }}>
            {([["perday", "Per day"], ["total", "Month total"]] as const).map(([k, lbl]) => {
              const on = (k === "total") === showTotal;
              return <button key={k} onClick={() => setShowTotal(k === "total")} style={{ fontSize: 12, border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? "var(--ink)" : "var(--muted)", fontWeight: on ? 500 : 400 }}>{lbl}</button>;
            })}
          </div>
          <button onClick={() => setPickOpen((o) => !o)} style={{ fontSize: 13, border: "1px solid var(--bd)", background: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "var(--ink)" }}>{mShort(M)} ▾</button>
          {pickOpen && (
            <div style={{ position: "absolute", top: 40, right: 0, zIndex: 20 }}>
              <MonthPicker value={M} minYear={minYear} maxYear={maxYear} onChange={(nv) => { if (v.months.includes(nv)) { setMonth(nv); setPickOpen(false); } }} />
            </div>
          )}
        </div>
      </div>

      {/* metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card k="revenue" card={v.cards.revenue} prevLabel={prevLabel} yoyLabel={yoyLabel} showTotal={showTotal} />
        <Card k="orders" card={v.cards.orders} prevLabel={prevLabel} yoyLabel={yoyLabel} showTotal={showTotal} />
        <Card k="pageviews" card={v.cards.pageviews} prevLabel={prevLabel} yoyLabel={yoyLabel} showTotal={showTotal} />
        <Card k="conversion" card={v.cards.conversion} prevLabel={prevLabel} yoyLabel={yoyLabel} showTotal={showTotal} />
      </div>
      {showTotal && <div style={{ fontSize: 11, color: "#8A8C86", marginTop: 6 }}>Comparison bars stay on a per-day basis so months of different lengths compare fairly.</div>}

      {/* offers vs page views */}
      <div className="dbd-card" style={{ padding: 14, marginTop: 12, background: "#FBFAF6" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Offer count vs page views <span style={{ color: "#8A8C86" }}>· does traffic move with the catalogue?</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Offer count</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{v.cards.offers.perDay === null ? "—" : Math.round(v.cards.offers.perDay).toLocaleString("en-IN")} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>{prevLabel} {deltaStr(ovp.offersPct)} · {yoyLabel} {deltaStr(v.cards.offers.yoy.pct)}</span></div>
          </div>
          <div style={{ borderLeft: "1px solid var(--bd)", paddingLeft: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Page views / day</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{v.cards.pageviews.perDay === null ? "—" : Math.round(v.cards.pageviews.perDay).toLocaleString("en-IN")} <span style={{ fontSize: 12, fontWeight: 400, color: deltaColor(ovp.pageviewsPct, true) }}>{prevLabel} {deltaStr(ovp.pageviewsPct)}</span></div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#8A8C86", marginTop: 10, borderTop: "1px solid #EEEBE2", paddingTop: 8 }}>A lever you watch, not a score — kept neutral. Compare the two arrows to see whether more listings pulled more traffic.</div>
      </div>

      {/* lifecycle */}
      <div style={{ marginTop: 20, borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Lifecycle since {minYear}</div>
          <div style={{ display: "inline-flex", gap: 3, background: "#ECE8DE", borderRadius: 9, padding: 3 }}>
            {(["daily", "monthly", "yearly"] as Grain[]).map((g) => <button key={g} onClick={() => setGrain(g)} style={{ fontSize: 12, textTransform: "capitalize", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer", background: grain === g ? "#fff" : "transparent", color: grain === g ? "var(--ink)" : "var(--muted)", fontWeight: grain === g ? 500 : 400 }}>{g}</button>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
          {METRIC_CHIPS.map(([k, lbl]) => <button key={k} onClick={() => setLifeMetric(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer", border: lifeMetric === k ? "none" : "1px solid var(--bd)", background: lifeMetric === k ? "var(--accent)" : "#fff", color: lifeMetric === k ? "#fff" : "var(--muted)" }}>{lbl}</button>)}
        </div>
        <div className="dbd-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{META[lifeMetric].label.replace(" / day", "")} by {grain === "daily" ? "day" : grain === "monthly" ? "month" : "year"}{lifeMetric === "conversion" ? " · units ÷ page views" : ""}</div>
          {grain === "daily"
            ? <LifecycleLine buckets={buckets} k={lifeMetric} saleDays={saleSet} />
            : <LifecycleBars buckets={buckets} k={lifeMetric} labelOf={labelOf} />}
          <div style={{ fontSize: 11.5, color: "#8A8C86", marginTop: 12, borderTop: "1px solid #EEEBE2", paddingTop: 8 }}>
            {grain === "daily" ? <>Each point is one day. Orange dots mark sale-participation days you’ve flagged.</> : <>Bars in blue are still partial (month/year not fully elapsed).</>}
          </div>
        </div>
      </div>

      {/* sale-day editor */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setEditSale((o) => !o)} style={{ fontSize: 13, border: "1px solid var(--bd)", background: "#fff", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "var(--ink)" }}>{editSale ? "Hide" : "Mark"} sale days for {mShort(M)}</button>
        {editSale && <div style={{ marginTop: 12 }}><SaleEditor rows={rows} month={M} /></div>}
      </div>
    </div>
  );
}
