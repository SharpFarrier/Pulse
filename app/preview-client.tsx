"use client";

import { useMemo, useState } from "react";
import { computePreview, type CampaignDailyRow, type CampaignAgg, type Metric } from "@/lib/reports/preview";

const CELL = { good: "var(--good-cell)", okay: "var(--okay-cell)", pause: "var(--pause-cell)" } as const;
const BADGE = {
  good: { bg: "var(--good-bg)", fg: "var(--good-fg)" },
  okay: { bg: "var(--okay-bg)", fg: "var(--okay-fg)" },
  pause: { bg: "var(--pause-bg)", fg: "var(--pause-fg)" },
} as const;

function inr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}
function pct(n: number | null) { return n === null ? "—" : `${n.toFixed(1)}%`; }
function num(n: number | null) { return n === null ? "—" : n.toFixed(1); }
function d2(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }); }
function dd(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" }); }

function Delta({ cur, prev, invert = false, unit = "%" }: { cur: number | null; prev: number | null; invert?: boolean; unit?: string }) {
  if (cur === null || prev === null || prev === 0) return null;
  const diff = unit === "pp" ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  const up = diff > 0;
  const good = invert ? !up : up; // for ACOS lower is better -> invert
  const color = Math.abs(diff) < 0.05 ? "var(--text-muted)" : good ? "var(--good-fg)" : "var(--pause-fg)";
  const arrow = up ? "▲" : "▼";
  const val = unit === "pp" ? `${Math.abs(diff).toFixed(1)}pp` : `${Math.abs(diff).toFixed(0)}%`;
  return <div style={{ fontSize: 12, color, marginTop: 2 }}>{arrow} {val} vs last {unit === "pp" ? "week" : "wk"}</div>;
}

export default function PreviewClient({ rows }: { rows: CampaignDailyRow[] }) {
  const [windowDays, setWindowDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const pv = useMemo(() => computePreview(rows, windowDays), [rows, windowDays]);

  if (!pv.kpi || pv.maxDate === null) {
    return (
      <div>
        <div style={{ fontSize: 20, fontWeight: 500 }}>Pulse · Amazon ads — daily preview</div>
        <div style={{ marginTop: 16, padding: "2rem", border: "0.5px solid var(--border)", borderRadius: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          No data yet. Upload your Amazon reports in the Ingest tab, then come back.
        </div>
      </div>
    );
  }

  const { cur, prev } = pv.kpi;
  const trendMax = Math.max(12, ...pv.trend.map((t) => t.acos ?? 0));
  const stripLabel = "last 7 days";
  const periods: [number, string][] = [[7, "Last 7 days"], [30, "Last 30"]];

  const tableCols = "1.7fr 0.8fr 0.7fr 214px 0.8fr";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>Pulse · Amazon ads — daily preview</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Snapshot to {d2(pv.maxDate)} · Sponsored Products</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {periods.map(([d, label]) => (
            <button key={d} onClick={() => setWindowDays(d)}
              style={{ fontSize: 13, borderRadius: "var(--radius)", padding: "6px 12px", cursor: "pointer",
                fontWeight: windowDays === d ? 500 : 400,
                background: windowDays === d ? "var(--text-primary)" : "transparent",
                color: windowDays === d ? "var(--surface-2)" : "var(--text-secondary)",
                border: windowDays === d ? "none" : "0.5px solid var(--border)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--good-bg)", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
          <div style={{ fontSize: 13, color: "var(--good-fg)" }}>ACOS</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: "#04342C", lineHeight: 1.2 }}>{pct(cur.acos)}</div>
          <Delta cur={cur.acos} prev={prev.acos} invert unit="pp" />
        </div>
        {([["Spend", inr(cur.spend), cur.spend, prev.spend, false],
           ["Sales", inr(cur.sales), cur.sales, prev.sales, true],
           ["ROAS", num(cur.roas), cur.roas, prev.roas, true],
           ["Orders", String(cur.orders), cur.orders, prev.orders, true]] as [string, string, number, number, boolean][])
          .map(([label, val, c, p, goodUp]) => (
          <div key={label} style={{ background: "var(--surface-1)", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.3 }}>{val}</div>
            <Delta cur={c} prev={p} invert={!goodUp} />
          </div>
        ))}
      </div>

      {/* ACOS trend */}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>ACOS by day</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110, marginBottom: 6, padding: "0 2px" }}>
        {pv.trend.map((t) => (
          <div key={t.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>{t.acos === null ? "—" : t.acos.toFixed(0)}</span>
            <div style={{ width: "100%", maxWidth: 30, height: `${Math.max(4, ((t.acos ?? 0) / trendMax) * 90)}px`, background: t.acos === null ? "var(--border-strong)" : CELL[t.verdict], borderRadius: "4px 4px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, padding: "0 2px" }}>
        {pv.trend.map((t) => <span key={t.date} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>{dd(t.date)}</span>)}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: "1.75rem" }}>≤10% good · 10–20% okay · &gt;20% pause</div>

      {/* Campaign table with day-on-day strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>By campaign · day-on-day</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>strip: {stripLabel} · sorted by spend</span>
      </div>
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: tableCols, gap: 8, padding: "9px 14px", background: "var(--surface-1)", fontSize: 12, color: "var(--text-muted)", alignItems: "end" }}>
          <span>Campaign</span><span style={{ textAlign: "right" }}>Spend</span><span style={{ textAlign: "right" }}>ACOS</span>
          <span style={{ display: "flex", gap: 3, justifyContent: "space-between", padding: "0 1px" }}>
            {pv.campaigns[0]?.strip.map((s) => <span key={s.date} style={{ width: 26, textAlign: "center" }}>{dd(s.date)}</span>)}
          </span>
          <span style={{ textAlign: "right" }}>Verdict</span>
        </div>
        {pv.campaigns.map((c) => (
          <CampaignRow key={c.campaign_name} c={c} cols={tableCols} open={open === c.campaign_name} onToggle={() => setOpen(open === c.campaign_name ? null : c.campaign_name)} />
        ))}
      </div>
    </div>
  );
}

function CampaignRow({ c, cols, open, onToggle }: { c: CampaignAgg; cols: string; open: boolean; onToggle: () => void }) {
  const badge = BADGE[c.verdict];
  return (
    <>
      <div onClick={onToggle} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "11px 14px", borderTop: "0.5px solid var(--border)", fontSize: 13, alignItems: "center", cursor: "pointer", background: open ? "var(--surface-1)" : "transparent" }}>
        <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.campaign_name}</span>
        <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{inr(c.spend)}</span>
        <span style={{ textAlign: "right" }}>{pct(c.acos)}</span>
        <span style={{ display: "flex", gap: 3 }}>
          {c.strip.map((s) => {
            const bg = !s.hasSpend ? "var(--surface-1)" : s.acos === null ? "#D3D1C7" : CELL[s.verdict];
            return <span key={s.date} title={`${s.date}: ${s.acos === null ? (s.hasSpend ? "spend, no sales" : "no spend") : s.acos.toFixed(1) + "%"}`}
              style={{ width: 26, height: 22, borderRadius: 4, background: bg, border: !s.hasSpend ? "0.5px solid var(--border)" : "none" }} />;
          })}
        </span>
        <span style={{ textAlign: "right" }}>
          <span style={{ fontSize: 11, color: badge.fg, background: badge.bg, borderRadius: "var(--radius)", padding: "2px 8px", textTransform: "capitalize" }}>{c.verdict}</span>
        </span>
      </div>
      {open && (
        <div style={{ padding: "10px 14px 16px 34px", borderTop: "0.5px solid var(--border)", background: "var(--surface-1)" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            <span>Sales <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{inr(c.sales)}</b></span>
            <span>ROAS <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{num(c.roas)}</b></span>
            <span>Orders <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.orders}</b></span>
            {c.acosDeltaPp !== null && <span>ACOS vs last wk <b style={{ color: c.acosDeltaPp > 0 ? "var(--pause-fg)" : "var(--good-fg)", fontWeight: 500 }}>{c.acosDeltaPp > 0 ? "+" : ""}{c.acosDeltaPp.toFixed(1)}pp</b></span>}
          </div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 0.8fr", gap: 8, padding: "7px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--surface-1)" }}>
              <span>Day</span><span style={{ textAlign: "right" }}>Spend</span><span style={{ textAlign: "right" }}>Sales</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>ACOS</span>
            </div>
            {c.days.map((day) => (
              <div key={day.date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 0.8fr", gap: 8, padding: "6px 12px", fontSize: 12, borderTop: "0.5px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{d2(day.date)}</span>
                <span style={{ textAlign: "right" }}>{inr(day.spend)}</span>
                <span style={{ textAlign: "right" }}>{inr(day.sales)}</span>
                <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{day.orders}</span>
                <span style={{ textAlign: "right", color: day.acos === null ? "var(--text-muted)" : BADGE[day.verdict].fg }}>{day.acos === null ? "—" : pct(day.acos)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
