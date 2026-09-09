"use client";

import { useMemo, useState } from "react";
import { computeListing, type BusinessMonthlyRow, type SkuTrend, type ListingStatus } from "@/lib/reports/listing";

const CELL = { green: "#4FC79E", amber: "#F0A93A", red: "#E8615F", gray: "#C9CFCB" };
const BADGE: Record<ListingStatus, { bg: string; fg: string; label: string }> = {
  growing:   { bg: "var(--good-bg)", fg: "var(--good-fg)", label: "Growing" },
  steady:    { bg: "var(--surface-1)", fg: "var(--text-secondary)", label: "Steady" },
  slipping:  { bg: "var(--okay-bg)", fg: "var(--okay-fg)", label: "Slipping" },
  declining: { bg: "var(--pause-bg)", fg: "var(--pause-fg)", label: "Declining" },
  new:       { bg: "var(--surface-1)", fg: "var(--text-muted)", label: "New" },
};
const inr = (n: number) => n >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${Math.round(n/1e3)}k` : `₹${Math.round(n)}`;
const mLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
const shortTitle = (t: string | null, sku: string | null) => { const s = (t ?? sku ?? "—"); return s.length > 46 ? s.slice(0, 45) + "…" : s; };

function Spark({ s }: { s: SkuTrend }) {
  const max = Math.max(1, ...s.series);
  const vals = s.series;
  const color = (i: number) => {
    if (vals[i] === 0) return "transparent";
    const last = i === vals.length - 1, second = i === vals.length - 2;
    if (s.status === "growing") return CELL.green;
    if (s.status === "declining") return last ? CELL.red : second ? CELL.amber : CELL.gray;
    if (s.status === "slipping") return last ? CELL.amber : CELL.gray;
    return CELL.gray;
  };
  return (
    <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 22, justifyContent: "center" }}>
      {vals.map((v, i) => <span key={i} style={{ width: 5, height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 22)}px`, background: color(i), borderRadius: 1 }} />)}
    </span>
  );
}

export default function ListingClient({ rows }: { rows: BusinessMonthlyRow[] }) {
  const d = useMemo(() => computeListing(rows), [rows]);
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return <div><div style={{ fontSize: 20, fontWeight: 500 }}>Listing · sales trend</div>
      <div style={{ marginTop: 16, padding: "2rem", border: "0.5px solid var(--border)", borderRadius: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No business data yet. Ingest a Business report (Ingest → Business report), then come back.</div></div>;
  }

  const revMax = Math.max(1, ...d.revenueByMonth);
  const oneMonth = d.months.length < 2;
  const visible = showAll ? d.skus : d.skus.slice(0, 20);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 20, fontWeight: 500 }}>Listing · sales trend</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Honey Touch · Amazon · Business report · {d.months.length} month{d.months.length > 1 ? "s" : ""} loaded</div>
      </div>

      {/* total revenue trend */}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Total revenue by month</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginBottom: 6, padding: "0 2px" }}>
        {d.revenueByMonth.map((v, i) => {
          const last = i === d.revenueByMonth.length - 1;
          const up = i > 0 ? v >= d.revenueByMonth[i - 1] : true;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{inr(v)}</span>
              <div style={{ width: "100%", maxWidth: 42, height: `${Math.max(4, (v / revMax) * 92)}px`, background: last ? (up ? CELL.green : CELL.amber) : "#BFD9CF", borderRadius: "4px 4px 0 0" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem" }}>
        {d.months.map((m) => <span key={m} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>{mLabel(m)}</span>)}
      </div>

      {oneMonth && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--okay-fg)", background: "var(--okay-bg)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: "1.5rem" }}>Only one month loaded — upload a few more months and the trend, sparklines and slip-detection turn on.</div>}

      {/* attention */}
      {d.attention.length > 0 && (
        <div style={{ border: "0.5px solid var(--pause-cell)", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--pause-bg)" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pause-fg)" }}>{d.attention.length} listing{d.attention.length > 1 ? "s" : ""} to watch</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>— slipping or declining, caught before the totals hide it</span>
          </div>
          {d.attention.slice(0, 8).map((s) => (
            <div key={s.asin} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 0.9fr 0.9fr", gap: 8, padding: "9px 14px", borderTop: "0.5px solid var(--border)", fontSize: 12, alignItems: "center" }}>
              <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortTitle(s.title, s.sku)}</span>
              <span style={{ justifySelf: "center" }}><Spark s={s} /></span>
              <span style={{ textAlign: "right", color: s.status === "declining" ? "var(--pause-fg)" : "var(--okay-fg)" }}>{s.momPct === null ? "—" : `▼ ${Math.abs(s.momPct).toFixed(0)}%`}{s.monthsDown > 1 ? ` · ${s.monthsDown}mo` : ""}</span>
              <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{inr(s.latest)}</span>
            </div>
          ))}
        </div>
      )}

      {/* full table */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>All products</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>sorted by revenue · {d.skus.length} SKUs</span>
      </div>
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.6fr 1.2fr 0.9fr 0.8fr 1fr", gap: 8, padding: "9px 14px", background: "var(--surface-1)", fontSize: 12, color: "var(--text-muted)" }}>
          <span>Product</span><span style={{ textAlign: "center" }}>Trend</span><span style={{ textAlign: "right" }}>Revenue</span><span style={{ textAlign: "right" }}>MoM</span><span style={{ textAlign: "right" }}>Status</span>
        </div>
        {visible.map((s) => {
          const b = BADGE[s.status];
          const rowBg = s.status === "declining" ? "var(--pause-bg)" : s.status === "slipping" ? "var(--okay-bg)" : "transparent";
          return (
            <div key={s.asin} style={{ display: "grid", gridTemplateColumns: "2.6fr 1.2fr 0.9fr 0.8fr 1fr", gap: 8, padding: "11px 14px", borderTop: "0.5px solid var(--border)", fontSize: 13, alignItems: "center", background: rowBg }}>
              <span style={{ overflow: "hidden" }}>
                <span style={{ color: "var(--text-primary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortTitle(s.title, s.sku)}</span>
                {s.sku && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{s.sku}</span>}
              </span>
              <span style={{ justifySelf: "center" }}><Spark s={s} /></span>
              <span style={{ textAlign: "right" }}>{inr(s.latest)}</span>
              <span style={{ textAlign: "right", color: s.momPct === null ? "var(--text-muted)" : s.momPct >= 0 ? "var(--good-fg)" : s.momPct < -15 ? "var(--pause-fg)" : "var(--okay-fg)" }}>{s.momPct === null ? "—" : `${s.momPct >= 0 ? "▲" : "▼"} ${Math.abs(s.momPct).toFixed(0)}%`}</span>
              <span style={{ textAlign: "right" }}><span style={{ fontSize: 11, color: b.fg, background: b.bg, borderRadius: "var(--radius)", padding: "2px 8px" }}>{b.label}</span></span>
            </div>
          );
        })}
      </div>
      {d.skus.length > 20 && <button onClick={() => setShowAll((v) => !v)} style={{ marginTop: 12, fontSize: 13, background: "transparent", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "7px 14px", color: "var(--text-primary)", cursor: "pointer" }}>{showAll ? "Show top 20" : `Show all ${d.skus.length}`}</button>}
    </div>
  );
}
