"use client";

import { useMemo, useState, useCallback } from "react";
import type { CampaignDailyRow } from "@/lib/reports/preview";
import { computeMonthlyReview, type MonthlyReview, type TrendMetric } from "@/lib/reports/monthly";
import { ollamaChat, OllamaError } from "./llm-client";

const inr = (n: number) => { const a = Math.abs(n), s = n < 0 ? "−" : ""; return a >= 1e7 ? `${s}₹${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `${s}₹${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${s}₹${(a / 1e3).toFixed(1)}k` : `${s}₹${Math.round(a)}`; };
const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const mLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const mFull = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtV = (v: number, f: string) => f === "money" ? inr(v) : f === "int" ? Math.round(v).toLocaleString("en-IN") : f === "pct2" ? v.toFixed(2) + "%" : f === "rupee" ? rupee(v) : f === "x" ? v.toFixed(1) + "x" : String(v);

function pill(cur: number | null, prev: number | null, meaning: "up" | "down" | "neutral", unit: "pct" | "pp" = "pct") {
  if (cur === null || prev === null || prev === 0) return null;
  const diff = unit === "pp" ? cur - prev : (cur / prev - 1) * 100;
  let col = "var(--muted)";
  if (meaning !== "neutral" && Math.abs(diff) >= (unit === "pp" ? 0.05 : 1)) { const worse = meaning === "up" ? diff < 0 : diff > 0; col = worse ? "var(--worsefg)" : "var(--betterfg)"; }
  return <span style={{ fontSize: 12, fontWeight: 600, color: col }}>{diff >= 0 ? "+" : ""}{unit === "pp" ? diff.toFixed(2) + "pp" : diff.toFixed(0) + "%"}</span>;
}

export default function MonthlyClient({ rows, businessRevenue }: { rows: CampaignDailyRow[]; businessRevenue: Record<string, number> }) {
  const [product, setProduct] = useState<"ALL" | "SP" | "SB">("ALL");
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [lens, setLens] = useState<"day" | "total">("day");
  const [ai, setAi] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const v = useMemo(() => computeMonthlyReview(rows, businessRevenue, product, month), [rows, businessRevenue, product, month]);
  const hasSB = useMemo(() => rows.some(r => (r.ad_product ?? "SP") === "SB"), [rows]);

  const rewrite = useCallback(async () => {
    if (!v) return; setAiLoading(true); setAiErr(null); setAi(null);
    const sys = "You are an Amazon ads analyst. Write a 3-4 sentence month-on-month summary from the JSON (already-computed, per-day normalised). Use only these numbers; be concrete.";
    try { setAi(await ollamaChat(sys, JSON.stringify({ headline: v.headline, kpis: v.kpis.map(k => ({ label: k.label, perDay: k.perDay, rate: k.rate })), review: v.review }))); }
    catch (e) { setAiErr(e instanceof OllamaError ? e.message : "failed"); } finally { setAiLoading(false); }
  }, [v]);

  if (!v) return <div className="dbd"><div style={{ fontSize: 20, fontWeight: 600 }}>Monthly review</div><div style={{ marginTop: 16, color: "var(--muted)" }}>No data yet.</div></div>;

  const incomplete = v.anyIncomplete;
  const showTacos = !v.cur.incomplete && (v.month in businessRevenue);

  const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => <div className="dbd-card" style={{ padding: "14px 16px", ...style }}>{children}</div>;

  return (
    <div className="dbd">
      {/* 1 header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div><div style={{ fontSize: 20, fontWeight: 600 }}>Monthly review</div><div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{mFull(v.month)}{v.prevMonth ? ` vs ${mLabel(v.prevMonth)}` : ""}</div></div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={v.month} onChange={e => { setMonth(e.target.value); setAi(null); }} style={sel}>{v.months.map(m => <option key={m} value={m}>{mFull(m)}</option>)}</select>
          {hasSB && (["ALL", "SP", "SB"] as const).map(pk => <button key={pk} onClick={() => setProduct(pk)} style={btn(product === pk)}>{pk === "ALL" ? "Combined" : pk === "SB" ? "Brands" : "Products"}</button>)}
          <button onClick={() => window.print()} style={btn(false)}>Export PDF</button>
        </div>
      </div>

      {/* 2 coverage banner + lens */}
      {incomplete && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "var(--worsebg)", color: "var(--worsefg)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12 }}>
          <span>{v.cur.incomplete ? `${mLabel(v.month)} ad data covers ${v.cur.days} of ${v.cur.calDays} days` : `${mLabel(v.prevMonth!)} was partial`} — comparisons shown per day.</span>
          <div className="no-print" style={{ display: "inline-flex", gap: 3, background: "#fff", borderRadius: 7, padding: 2 }}>{(["day", "total"] as const).map(k => <button key={k} onClick={() => setLens(k)} style={{ fontSize: 11, fontWeight: lens === k ? 600 : 400, border: "none", borderRadius: 5, padding: "4px 9px", cursor: "pointer", background: lens === k ? "var(--card)" : "transparent", color: "var(--ink)" }}>{k === "day" ? "Per day" : "Month total"}</button>)}</div>
        </div>
      )}

      {/* 3 headline + KPIs */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 3 }}>{v.headline.title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{v.headline.sentence}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          {v.kpis.map(k => {
            const isRate = k.isRate;
            const show = isRate ? (k.rate ?? null) : (lens === "day" ? k.perDay : k.total);
            const prevShow = isRate ? (k.prevRate ?? null) : (lens === "day" ? k.prevPerDay : (k.prevPerDay !== null && v.prev ? k.prevPerDay * v.prev.days : null));
            return <div key={k.label}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{k.label}{!isRate && lens === "total" ? " (total)" : ""}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 18, fontWeight: 600 }}>{show === null ? "—" : fmtV(show, k.fmt)}</span>{pill(isRate ? (k.rate ?? null) : (lens === "day" ? k.perDay : k.total), isRate ? (k.prevRate ?? null) : (lens === "day" ? k.prevPerDay : (k.prevPerDay !== null && v.prev ? k.prevPerDay * v.prev.days : null)), k.meaning, k.fmt === "pct2" && isRate ? "pp" : "pct")}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{isRate ? `was ${prevShow === null ? "—" : fmtV(prevShow, k.fmt)}` : `month ${inr(k.total)}`}</div>
            </div>;
          })}
        </div>
      </Card>

      {/* 4 waterfall */}
      {v.waterfall && (
        <><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Why ad sales changed</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{inr(v.waterfall.startPerDay)}/day → {inr(v.waterfall.endPerDay)}/day · split across impressions × CTR × conversion × AOV</div>
        <Card style={{ marginBottom: 20 }}>
          {v.waterfall.steps.map(s => { const w = Math.min(50, Math.abs(s.contribution) / Math.max(1, Math.abs(v.waterfall!.delta)) * 50 + 6), neg = s.contribution < 0; return (
            <div key={s.name} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr 2fr 1fr", gap: 8, alignItems: "center", padding: "7px 0", fontSize: 12, borderTop: "1px solid var(--bd)" }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>{s.name === "Impressions" ? inr(s.from) + " → " + inr(s.to) : s.name === "AOV" ? rupee(s.from) + " → " + rupee(s.to) : s.from.toFixed(2) + "% → " + s.to.toFixed(2) + "%"} · {s.pct! >= 0 ? "+" : ""}{s.pct!.toFixed(1)}%</span>
              <div style={{ position: "relative", height: 14 }}><div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--bd)" }} /><div style={{ position: "absolute", top: 2, height: 10, borderRadius: 2, background: neg ? "#E58B45" : "#5B93C7", ...(neg ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }) }} /></div>
              <span style={{ textAlign: "right", color: neg ? "var(--worsefg)" : "var(--betterfg)", fontWeight: 600 }}>{s.contribution >= 0 ? "+" : "−"}{inr(Math.abs(s.contribution))}</span>
            </div>); })}
        </Card></>
      )}

      {/* 5 ACOS decomposition */}
      {v.acos && (
        <><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Why ACOS moved</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>ACOS {v.acos.from?.toFixed(2)}% → {v.acos.to?.toFixed(2)}% · ACOS = CPC ÷ (conversion × AOV)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 6 }}>
          {v.acos.levers.map(l => <div key={l.name} className="dbd-card" style={{ padding: "12px 14px", position: "relative", borderColor: l.main ? "var(--spend)" : "var(--bd)", borderWidth: l.main ? 2 : 1 }}>
            {l.main && <span style={{ position: "absolute", top: -9, left: 12, fontSize: 9, fontWeight: 700, background: "var(--spend)", color: "#fff", borderRadius: 4, padding: "2px 6px" }}>MAIN CAUSE</span>}
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.name}</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{l.name === "AOV" ? rupee(l.to) : l.name === "CPC" ? rupee(l.to) : l.to.toFixed(2) + "%"} <span style={{ fontSize: 12, color: l.worse ? "var(--worsefg)" : "var(--betterfg)" }}>{(l.pct ?? 0) >= 0 ? "+" : ""}{(l.pct ?? 0).toFixed(1)}%</span></div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>was {l.name === "AOV" || l.name === "CPC" ? rupee(l.from) : l.from.toFixed(2) + "%"} · {l.worse ? "worse" : "better"}</div>
          </div>)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>{v.acos.levers.find(l => l.main)?.name} is the lever to check.</div></>
      )}

      {/* 6 three-month trend */}
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Three-month trend</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        {v.trend.map(tm => <TrendCard key={tm.label} tm={tm} />)}
      </div>

      {/* 7 dumbbell */}
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Campaign ROAS · {v.prevMonth ? mLabel(v.prevMonth) + " → " + mLabel(v.month) : mLabel(v.month)}</div>
      <Card style={{ marginBottom: 20 }}>
        {v.dumbbell.map(d => { const lo = 0, hi = Math.max(14, ...v.dumbbell.flatMap(x => [x.prevRoas ?? 0, x.curRoas ?? 0])); const pos = (r: number | null) => r === null ? null : (r - lo) / (hi - lo) * 100; const pp = pos(d.prevRoas), cp = pos(d.curRoas); const up = (d.delta ?? 0) >= 0; return (
          <div key={d.name} style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 1fr", gap: 10, alignItems: "center", padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--bd)" }}>
            <span><div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{inr(d.spendPerDay)}/day {d.spendChangePct !== null ? `(${d.spendChangePct >= 0 ? "+" : ""}${d.spendChangePct.toFixed(0)}%)` : ""}</div></span>
            <div style={{ position: "relative", height: 16 }}>
              {pp !== null && cp !== null && <div style={{ position: "absolute", top: 7, height: 2, background: up ? "#5B93C7" : "#E58B45", left: `${Math.min(pp, cp)}%`, width: `${Math.abs(cp - pp)}%` }} />}
              {pp !== null && <div style={{ position: "absolute", top: 3, left: `calc(${pp}% - 5px)`, width: 10, height: 10, borderRadius: 5, border: "2px solid var(--muted)", background: "var(--card)" }} />}
              {cp !== null && <div style={{ position: "absolute", top: 3, left: `calc(${cp}% - 5px)`, width: 10, height: 10, borderRadius: 5, background: up ? "#1B4F7A" : "#8A3F0A" }} />}
            </div>
            <span style={{ textAlign: "right", color: up ? "var(--betterfg)" : "var(--worsefg)", fontWeight: 600 }}>{d.curRoas?.toFixed(1)}x {d.delta !== null ? `(${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(1)})` : ""}</span>
          </div>); })}
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>hollow = {v.prevMonth ? mLabel(v.prevMonth) : "prev"}, filled = {mLabel(v.month)} · sorted worst Δ first</div>
      </Card>

      {/* 8 ads vs total */}
      {v.adsVsTotal.length > 0 && (
        <><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Ads vs total revenue</div>
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", height: 130 }}>
            {v.adsVsTotal.map(a => { const max = Math.max(1, ...v.adsVsTotal.map(x => x.bizRev ?? 0)); const h = (a.bizRev! / max) * 100; const adH = a.adSales / a.bizRev! * h; return (
              <div key={a.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.adSharePct?.toFixed(0)}% ad{showTacos && !a.incomplete ? ` · TACOS ${a.tacos?.toFixed(1)}%` : ""}</div>
                <div style={{ width: "100%", maxWidth: 60, height: `${h}px`, background: "#E4E0D6", borderRadius: "4px 4px 0 0", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", border: a.incomplete ? "1.5px dashed var(--muted)" : "none", marginTop: 6 }}>
                  <div style={{ height: `${adH}px`, background: "#5B93C7", borderRadius: "0 0 4px 4px" }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{mLabel(a.month)}{a.incomplete ? " ·partial" : ""}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{inr(a.bizRev!)}</div>
              </div>); })}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>blue = ad-attributed sales · grey = total business revenue</div>
        </Card></>
      )}

      {/* 9 written review */}
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>The month in review</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
        {([["Worked", v.review.worked, "var(--betterfg)"], ["Watch", v.review.watch, "var(--worsefg)"], ["Next month", v.review.next, "var(--muted)"]] as const).map(([t, items, col]) => (
          <Card key={t}><div style={{ fontSize: 12, fontWeight: 600, color: col, marginBottom: 6 }}>{t}</div>{items.length ? items.map((x, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>• {x}</div>) : <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>}</Card>
        ))}
      </div>
      <div className="no-print">
        {!ai && <button onClick={rewrite} disabled={aiLoading} style={btn(false)}>{aiLoading ? "Writing…" : "◆ Rewrite with AI"}</button>}
        {aiErr && <div style={{ fontSize: 12, color: "var(--worsefg)", marginTop: 6 }}>{aiErr}</div>}
      </div>
      {ai && <Card style={{ marginTop: 12 }}><div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>◆ AI</div><div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{ai}</div></Card>}
    </div>
  );
}

function TrendCard({ tm }: { tm: TrendMetric }) {
  const max = Math.max(1, ...tm.points.map(p => p.perDay));
  return <div className="dbd-card" style={{ padding: "10px 12px" }}>
    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{tm.label}</div>
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 46 }}>
      {tm.points.map((p, i) => { const last = i === tm.points.length - 1; const col = last ? (p.good === null ? "var(--ink)" : p.good ? "#5B93C7" : "#E58B45") : "#CFCABA"; return (
        <div key={p.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
          <span style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>{fmtV(p.perDay, tm.fmt)}</span>
          <div style={{ width: "100%", maxWidth: 24, height: `${Math.max(3, p.perDay / max * 32)}px`, background: col, borderRadius: "3px 3px 0 0" }} />
          <span style={{ fontSize: 9, color: last ? "var(--ink)" : "var(--muted)", marginTop: 2 }}>{mLabel(p.month)}</span>
        </div>); })}
    </div>
  </div>;
}

const sel: React.CSSProperties = { fontSize: 13, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--bd)", background: "var(--card)", fontFamily: "inherit" };
function btn(active: boolean): React.CSSProperties { return { fontSize: 13, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontWeight: active ? 600 : 400, background: active ? "var(--ink)" : "var(--card)", color: active ? "#fff" : "var(--ink)", border: "1px solid var(--bd)" }; }
