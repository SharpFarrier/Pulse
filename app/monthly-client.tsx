"use client";

import { useMemo, useState, useCallback } from "react";
import { computeMonthly, type Blended, type CampaignMonth } from "@/lib/reports/monthly";
import type { CampaignDailyRow } from "@/lib/reports/preview";

const GREEN = "#0F6E56", RED = "#A32D2D";

function inr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}
const int = (n: number) => Math.round(n).toLocaleString("en-IN");
const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

type Dir = "up" | "down" | "flat";
function change(cur: number | null, prev: number | null, kind: "pct" | "pp", good: Dir) {
  if (cur === null || prev === null || (kind === "pct" && prev === 0)) return null;
  const diff = kind === "pp" ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  const up = diff > 0.0001, down = diff < -0.0001;
  const color = good === "flat" ? "var(--text-muted)" : (up && good === "up") || (down && good === "down") ? GREEN : (up || down) ? RED : "var(--text-muted)";
  const txt = kind === "pp" ? `${diff > 0 ? "+" : ""}${diff.toFixed(2)} pp` : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
  return { txt, color };
}

interface Narrative { headline: string; winners: { name: string; note: string }[]; watch: { name: string; note: string }[]; strategic: string; }

export default function MonthlyClient({ rows }: { rows: CampaignDailyRow[] }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [narr, setNarr] = useState<Narrative | null>(null);
  const [nLoading, setNLoading] = useState(false);
  const [nError, setNError] = useState<string | null>(null);
  const m = useMemo(() => computeMonthly(rows, month), [rows, month]);

  const genNarrative = useCallback(async () => {
    if (!m.month) return;
    setNLoading(true); setNError(null); setNarr(null);
    const summary = {
      month: m.month, prevMonth: m.hasPrev ? m.prevMonth : null,
      current: m.cur, previous: m.prev,
      campaigns: m.campaigns.slice(0, 15).map((c) => ({ name: c.campaign_name, current: c.cur, previous: c.prev })),
    };
    try {
      const res = await fetch("/api/monthly-narrative", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary }) });
      const j = await res.json();
      if (res.ok && j.narrative) setNarr(j.narrative);
      else setNError(j.error || "Could not generate the narrative.");
    } catch { setNError("Could not reach the narrative service."); } finally { setNLoading(false); }
  }, [m]);

  if (!m.month) {
    return <div style={{ fontSize: 20, fontWeight: 500 }}>Monthly review<div style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 400, marginTop: 16 }}>No data yet — ingest your reports first.</div></div>;
  }

  const { cur, prev, hasPrev } = m;
  const chartCamps = m.campaigns.slice(0, 8);
  const chartMax = Math.max(6, ...chartCamps.flatMap((c) => [c.cur.roas ?? 0, c.prev?.roas ?? 0]));

  const kpis: { label: string; val: string; ch: ReturnType<typeof change> }[] = [
    { label: "AD SPEND", val: inr(cur.spend), ch: change(cur.spend, prev?.spend ?? null, "pct", "flat") },
    { label: "AD SALES", val: inr(cur.sales), ch: change(cur.sales, prev?.sales ?? null, "pct", "up") },
    { label: "BLENDED ACOS", val: cur.acos === null ? "—" : cur.acos.toFixed(2) + "%", ch: change(cur.acos, prev?.acos ?? null, "pp", "down") },
    { label: "BLENDED ROAS", val: cur.roas === null ? "—" : cur.roas.toFixed(2) + "x", ch: change(cur.roas, prev?.roas ?? null, "pct", "up") },
  ];

  const rowsDef: { label: string; get: (b: Blended) => number | null; fmt: (n: number | null) => string; kind: "pct" | "pp"; good: Dir }[] = [
    { label: "Ad spend", get: (b) => b.spend, fmt: (n) => (n === null ? "—" : inr(n)), kind: "pct", good: "flat" },
    { label: "Ad sales", get: (b) => b.sales, fmt: (n) => (n === null ? "—" : inr(n)), kind: "pct", good: "up" },
    { label: "Orders", get: (b) => b.orders, fmt: (n) => (n === null ? "—" : int(n)), kind: "pct", good: "up" },
    { label: "Clicks", get: (b) => b.clicks, fmt: (n) => (n === null ? "—" : int(n)), kind: "pct", good: "flat" },
    { label: "Impressions", get: (b) => b.impressions, fmt: (n) => (n === null ? "—" : int(n)), kind: "pct", good: "flat" },
    { label: "CTR", get: (b) => b.ctr, fmt: (n) => (n === null ? "—" : n.toFixed(2) + "%"), kind: "pp", good: "up" },
    { label: "Blended ACOS", get: (b) => b.acos, fmt: (n) => (n === null ? "—" : n.toFixed(2) + "%"), kind: "pp", good: "down" },
    { label: "Blended ROAS", get: (b) => b.roas, fmt: (n) => (n === null ? "—" : n.toFixed(2) + "x"), kind: "pct", good: "up" },
    { label: "Blended CPC", get: (b) => b.cpc, fmt: (n) => (n === null ? "—" : "₹" + n.toFixed(2)), kind: "pct", good: "down" },
    { label: "Conv. rate", get: (b) => b.cvr, fmt: (n) => (n === null ? "—" : n.toFixed(2) + "%"), kind: "pp", good: "up" },
    { label: "Cost / order", get: (b) => b.costPerOrder, fmt: (n) => (n === null ? "—" : "₹" + Math.round(n)), kind: "pct", good: "down" },
    { label: "AOV", get: (b) => b.aov, fmt: (n) => (n === null ? "—" : "₹" + Math.round(n)), kind: "pct", good: "flat" },
  ];

  const AiBlock = ({ tone, label, children }: { tone: "green" | "red"; label: string; children: React.ReactNode }) => (
    <div style={{ background: tone === "green" ? "#F3F7F5" : "#FBF4F3", borderLeft: `3px solid ${tone === "green" ? GREEN : RED}`, borderRadius: 6, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: tone === "green" ? GREEN : RED, fontWeight: 500, marginBottom: 6 }}>◆ PULSE AI · {label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={m.month} onChange={(e) => { setMonth(e.target.value); setNarr(null); setNError(null); }} style={{ fontSize: 13, padding: "6px 10px", borderRadius: "var(--radius)", border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontFamily: "var(--font-sans)" }}>
          {m.availableMonths.map((mo) => <option key={mo} value={mo}>{monthName(mo)}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          {!narr && <button onClick={genNarrative} disabled={nLoading} style={{ fontSize: 13, padding: "7px 14px", borderRadius: "var(--radius)", border: `0.5px solid ${GREEN}`, background: "transparent", color: GREEN, fontWeight: 500 }}>{nLoading ? "Writing…" : "◆ Generate narrative"}</button>}
          <button onClick={() => window.print()} style={{ fontSize: 13, padding: "7px 14px", borderRadius: "var(--radius)", border: "none", background: "var(--text-primary)", color: "var(--surface-2)", fontWeight: 500 }}>Export PDF</button>
        </div>
      </div>

      <div style={{ borderBottom: `2px solid ${GREEN}`, paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.2 }}>Amazon Advertising — Month-on-Month Review</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Honey Touch · {hasPrev ? `${monthShort(m.prevMonth!)} → ` : ""}<b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{monthName(m.month)}</b> · India · ad-attributed · <span style={{ color: GREEN }}>Sponsored Products</span></div>
      </div>

      {!hasPrev && <div className="no-print" style={{ fontSize: 12, color: "var(--okay-fg)", background: "var(--okay-bg)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 16 }}>Only {monthName(m.month)} is loaded — ingest the prior month to see month-on-month changes.</div>}

      {nError && <div className="no-print" style={{ fontSize: 12, color: RED, marginBottom: 12 }}>{nError}</div>}
      {narr && <div style={{ background: "#F3F7F5", borderLeft: `3px solid ${GREEN}`, borderRadius: 6, padding: "12px 14px", marginBottom: 18 }}><div style={{ fontSize: 10, color: GREEN, fontWeight: 500, marginBottom: 4 }}>◆ PULSE AI · HEADLINE</div><div style={{ fontSize: 13, lineHeight: 1.6 }}>{narr.headline}</div></div>}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{k.label}</div>
            {k.ch && <div style={{ fontSize: 12, color: k.ch.color, marginTop: 6 }}>{k.ch.txt}</div>}
          </div>
        ))}
      </div>

      {/* Blended table */}
      <div style={{ fontSize: 15, fontWeight: 500, color: GREEN, marginBottom: 8 }}>Blended performance</div>
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr", gap: 8, padding: "8px 14px", background: GREEN, color: "#fff", fontSize: 12 }}>
          <span>Metric</span><span style={{ textAlign: "right" }}>{hasPrev ? monthShort(m.prevMonth!) : "Prior"}</span><span style={{ textAlign: "right" }}>{monthShort(m.month)}</span><span style={{ textAlign: "right" }}>Change</span>
        </div>
        {rowsDef.map((r, i) => {
          const cv = r.get(cur), pv = prev ? r.get(prev) : null;
          const ch = change(cv, pv, r.kind, r.good);
          return (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr", gap: 8, padding: "8px 14px", fontSize: 12, background: i % 2 ? "var(--surface-1)" : "transparent", borderTop: i ? "0.5px solid var(--border)" : "none" }}>
              <span style={{ fontWeight: 500 }}>{r.label}</span>
              <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{pv === null ? "—" : r.fmt(pv)}</span>
              <span style={{ textAlign: "right" }}>{r.fmt(cv)}</span>
              <span style={{ textAlign: "right", fontWeight: 500, color: ch?.color ?? "var(--text-muted)" }}>{ch?.txt ?? "—"}</span>
            </div>
          );
        })}
      </div>

      {/* ROAS by campaign */}
      <div style={{ fontSize: 15, fontWeight: 500, color: GREEN, marginBottom: 4 }}>ROAS by top campaign</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
        {hasPrev && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 12 }}><span style={{ width: 10, height: 10, background: "#C9CFCB", borderRadius: 2 }} />{monthShort(m.prevMonth!)}</span>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, background: GREEN, borderRadius: 2 }} />{monthShort(m.month)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160, marginBottom: 6 }}>
        {chartCamps.map((c) => (
          <div key={c.campaign_name} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: "100%" }}>
            {hasPrev && <Bar v={c.prev?.roas ?? null} max={chartMax} color="#C9CFCB" />}
            <Bar v={c.cur.roas} max={chartMax} color={GREEN} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        {chartCamps.map((c) => <span key={c.campaign_name} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--text-muted)", lineHeight: 1.2, overflow: "hidden" }}>{c.campaign_name.length > 16 ? c.campaign_name.slice(0, 15) + "…" : c.campaign_name}</span>)}
      </div>

      {/* Narrative blocks */}
      {narr && (
        <>
          {narr.winners?.length > 0 && <AiBlock tone="green" label="WINNERS — SCALE THESE"><div style={{ fontSize: 12, lineHeight: 1.7 }}>{narr.winners.map((w, i) => <div key={i}><b style={{ fontWeight: 500 }}>{w.name}</b> — {w.note}</div>)}</div></AiBlock>}
          {narr.watch?.length > 0 && <AiBlock tone="red" label="WATCH / FIX"><div style={{ fontSize: 12, lineHeight: 1.7 }}>{narr.watch.map((w, i) => <div key={i}><b style={{ fontWeight: 500 }}>{w.name}</b> — {w.note}</div>)}</div></AiBlock>}
          {narr.strategic && <AiBlock tone="green" label="THE STRATEGIC QUESTION"><div style={{ fontSize: 12, lineHeight: 1.6 }}>{narr.strategic}</div></AiBlock>}
        </>
      )}
      {!narr && !nLoading && <div className="no-print" style={{ fontSize: 12, color: "var(--text-muted)", border: "0.5px dashed var(--border-strong)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>The written analysis (headline, winners, watch, strategic take) is generated on demand — hit “Generate narrative” above.</div>}

      <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, borderTop: "0.5px solid var(--border)", paddingTop: 10 }}>Data note: ad-attributed figures only, excludes organic. Sponsored Products only{/* becomes SP+SB once Sponsored Brands is ingested */}.</div>
    </div>
  );
}

function Bar({ v, max, color }: { v: number | null; max: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
      <span style={{ fontSize: 9, color: color === "#C9CFCB" ? "var(--text-muted)" : GREEN, marginBottom: 2 }}>{v === null ? "—" : v.toFixed(1)}</span>
      <div style={{ width: 16, height: `${Math.max(2, ((v ?? 0) / max) * 130)}px`, background: color, borderRadius: "3px 3px 0 0" }} />
    </div>
  );
}
