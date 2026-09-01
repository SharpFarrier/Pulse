"use client";

import { useMemo, useState, useCallback } from "react";
import { computePreview, type CampaignDailyRow, type CampaignAgg, type DayPoint } from "@/lib/reports/preview";
import DateRangePicker, { parseIso } from "./drum-picker";

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
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const num = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const d2 = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const dd = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" });

interface DrillTarget { target: string; match_type: string; spend: number; sales: number; orders: number; acos: number | null; }
interface DrillTerm { search_term: string; spend: number; sales: number; orders: number; acos: number | null; }

function Delta({ cur, prev, invert = false, unit = "%" }: { cur: number | null; prev: number | null; invert?: boolean; unit?: string }) {
  if (cur === null || prev === null || prev === 0) return null;
  const diff = unit === "pp" ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  const up = diff > 0;
  const good = invert ? !up : up;
  const color = Math.abs(diff) < 0.05 ? "var(--text-muted)" : good ? "var(--good-fg)" : "var(--pause-fg)";
  const val = unit === "pp" ? `${Math.abs(diff).toFixed(1)}pp` : `${Math.abs(diff).toFixed(0)}%`;
  return <div style={{ fontSize: 12, color, marginTop: 2 }}>{up ? "▲" : "▼"} {val} vs last {unit === "pp" ? "week" : "wk"}</div>;
}

export default function PreviewClient({ rows }: { rows: CampaignDailyRow[] }) {
  const [windowDays, setWindowDays] = useState(7);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const hasSB = useMemo(() => rows.some((r) => (r.ad_product ?? "SP") === "SB"), [rows]);
  const [product, setProduct] = useState<"ALL" | "SP" | "SB">("ALL");
  const filtered = useMemo(() => (product === "ALL" ? rows : rows.filter((r) => (r.ad_product ?? "SP") === product)), [rows, product]);
  const bounds = useMemo(() => {
    if (rows.length === 0) return null;
    let mn = rows[0].date, mx = rows[0].date;
    for (const r of rows) { if (r.date < mn) mn = r.date; if (r.date > mx) mx = r.date; }
    return { mn, mx };
  }, [rows]);
  const pv = useMemo(() => computePreview(filtered, customRange ?? windowDays), [filtered, windowDays, customRange]);
  const productLabel = product === "ALL" ? "Combined · SP + Brands" : product === "SB" ? "Sponsored Brands" : "Sponsored Products";

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
  const tableCols = "1.7fr 0.8fr 0.7fr 214px 0.8fr";
  const periods: [number, string][] = [[7, "Last 7 days"], [30, "Last 30"]];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>Pulse · Amazon ads — daily preview</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Snapshot to {d2(pv.maxDate)} · {productLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasSB && (["ALL", "SP", "SB"] as const).map((pk) => (
            <button key={pk} onClick={() => setProduct(pk)} style={{ fontSize: 13, borderRadius: "var(--radius)", padding: "6px 12px", cursor: "pointer", fontWeight: product === pk ? 500 : 400, background: product === pk ? "var(--good-fg)" : "transparent", color: product === pk ? "#fff" : "var(--text-secondary)", border: product === pk ? "none" : "0.5px solid var(--border)" }}>{pk === "ALL" ? "Combined" : pk === "SB" ? "Brands" : "Products"}</button>
          ))}
          {periods.map(([d, label]) => {
            const active = !customRange && windowDays === d;
            return (
            <button key={d} onClick={() => { setWindowDays(d); setCustomRange(null); setPickerOpen(false); }} style={{ fontSize: 13, borderRadius: "var(--radius)", padding: "6px 12px", cursor: "pointer", fontWeight: active ? 500 : 400, background: active ? "var(--text-primary)" : "transparent", color: active ? "var(--surface-2)" : "var(--text-secondary)", border: active ? "none" : "0.5px solid var(--border)" }}>{label}</button>
          );})}
          <button onClick={() => setPickerOpen((o) => !o)} style={{ fontSize: 13, borderRadius: "var(--radius)", padding: "6px 12px", cursor: "pointer", fontWeight: customRange ? 500 : 400, background: customRange ? "var(--text-primary)" : "transparent", color: customRange ? "var(--surface-2)" : "var(--text-secondary)", border: customRange ? "none" : "0.5px solid var(--border)" }}>{customRange ? `${d2(customRange.start)} – ${d2(customRange.end)}` : "Custom"}</button>
        </div>
      </div>

      {pickerOpen && bounds && (
        <div style={{ marginBottom: "1.5rem" }}>
          <DateRangePicker
            start={customRange?.start ?? (pv.periodStart ?? bounds.mn)}
            end={customRange?.end ?? (pv.periodEnd ?? bounds.mx)}
            min={bounds.mn}
            max={bounds.mx}
            onApply={(st, en) => { setCustomRange({ start: st, end: en }); setPickerOpen(false); }}
            onCancel={() => setPickerOpen(false)}
          />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--good-bg)", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
          <div style={{ fontSize: 13, color: "var(--good-fg)" }}>ACOS</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: "#04342C", lineHeight: 1.2 }}>{pct(cur.acos)}</div>
          <Delta cur={cur.acos} prev={prev.acos} invert unit="pp" />
        </div>
        {([["Spend", inr(cur.spend), cur.spend, prev.spend, false], ["Sales", inr(cur.sales), cur.sales, prev.sales, true], ["ROAS", num(cur.roas), cur.roas, prev.roas, true], ["Orders", String(cur.orders), cur.orders, prev.orders, true]] as [string, string, number, number, boolean][]).map(([label, val, c, p, goodUp]) => (
          <div key={label} style={{ background: "var(--surface-1)", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.3 }}>{val}</div>
            <Delta cur={c} prev={p} invert={!goodUp} />
          </div>
        ))}
      </div>

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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>By campaign · day-on-day</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>click a day to see where the spend went · sorted by spend</span>
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
          <CampaignRow key={c.campaign_name} c={c} cols={tableCols} open={openRow === c.campaign_name} onToggle={() => setOpenRow(openRow === c.campaign_name ? null : c.campaign_name)} />
        ))}
      </div>
    </div>
  );
}

function CampaignRow({ c, cols, open, onToggle }: { c: CampaignAgg; cols: string; open: boolean; onToggle: () => void }) {
  const badge = BADGE[c.verdict];
  const [day, setDay] = useState<string | null>(null);
  const [targets, setTargets] = useState<DrillTarget[] | null>(null);
  const [meta, setMeta] = useState<{ totalSpend: number; shown: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [terms, setTerms] = useState<Record<string, DrillTerm[]>>({});
  const [termsLoading, setTermsLoading] = useState<string | null>(null);

  const drill = useCallback(async (date: string) => {
    setDay(date); setOpenTarget(null); setTargets(null); setMeta(null); setLoading(true);
    try {
      const res = await fetch("/api/day-drill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign: c.campaign_name, date }) });
      const j = await res.json();
      if (res.ok) { setTargets(j.targets); setMeta({ totalSpend: j.totalSpend, shown: j.shown, total: j.total }); }
      else setTargets([]);
    } catch { setTargets([]); } finally { setLoading(false); }
  }, [c.campaign_name]);

  const loadTerms = useCallback(async (target: string) => {
    if (openTarget === target) { setOpenTarget(null); return; }
    setOpenTarget(target);
    if (terms[target] || !day) return;
    setTermsLoading(target);
    try {
      const res = await fetch("/api/day-drill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign: c.campaign_name, date: day, target }) });
      const j = await res.json();
      if (res.ok) setTerms((t) => ({ ...t, [target]: j.searchTerms }));
    } catch { /* ignore */ } finally { setTermsLoading(null); }
  }, [openTarget, terms, day, c.campaign_name]);

  const clickCell = (e: React.MouseEvent, date: string) => {
    e.stopPropagation();
    if (!open) onToggle();
    if (day === date) setDay(null); else drill(date);
  };
  const clickRow = () => { if (open) { setDay(null); } onToggle(); };

  const dayPt: DayPoint | undefined = day ? c.days.find((x) => x.date === day) : undefined;
  const noSalesSpend = targets ? targets.filter((t) => t.sales <= 0).reduce((s, t) => s + t.spend, 0) : 0;
  const noSalesCount = targets ? targets.filter((t) => t.sales <= 0).length : 0;

  return (
    <>
      <div onClick={clickRow} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "11px 14px", borderTop: "0.5px solid var(--border)", fontSize: 13, alignItems: "center", cursor: "pointer", background: open ? "var(--surface-1)" : "transparent" }}>
        <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.campaign_name}</span>
        <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{inr(c.spend)}</span>
        <span style={{ textAlign: "right" }}>{pct(c.acos)}</span>
        <span style={{ display: "flex", gap: 3 }}>
          {c.strip.map((s) => {
            const bg = !s.hasSpend ? "var(--surface-1)" : s.acos === null ? "#D3D1C7" : CELL[s.verdict];
            const selected = day === s.date;
            return <span key={s.date} onClick={(e) => clickCell(e, s.date)} title={`${s.date}: ${s.acos === null ? (s.hasSpend ? "spend, no sales" : "no spend") : s.acos.toFixed(1) + "%"} — click to drill`}
              style={{ width: 26, height: 22, borderRadius: 4, background: bg, border: !s.hasSpend ? "0.5px solid var(--border)" : "none", cursor: "pointer", boxShadow: selected ? "0 0 0 2px var(--text-primary)" : "none" }} />;
          })}
        </span>
        <span style={{ textAlign: "right" }}>
          <span style={{ fontSize: 11, color: badge.fg, background: badge.bg, borderRadius: "var(--radius)", padding: "2px 8px", textTransform: "capitalize" }}>{c.verdict}</span>
        </span>
      </div>

      {open && !day && (
        <div style={{ padding: "10px 14px 16px 34px", borderTop: "0.5px solid var(--border)", background: "var(--surface-1)" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            <span>Sales <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{inr(c.sales)}</b></span>
            <span>ROAS <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{num(c.roas)}</b></span>
            <span>Orders <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.orders}</b></span>
            {c.acosDeltaPp !== null && <span>ACOS vs last wk <b style={{ color: c.acosDeltaPp > 0 ? "var(--pause-fg)" : "var(--good-fg)", fontWeight: 500 }}>{c.acosDeltaPp > 0 ? "+" : ""}{c.acosDeltaPp.toFixed(1)}pp</b></span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Per-day · click a day for where the spend went</div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 0.8fr", gap: 8, padding: "7px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--surface-1)" }}>
              <span>Day</span><span style={{ textAlign: "right" }}>Spend</span><span style={{ textAlign: "right" }}>Sales</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>ACOS</span>
            </div>
            {c.days.map((dp) => (
              <div key={dp.date} onClick={() => drill(dp.date)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 0.8fr", gap: 8, padding: "6px 12px", fontSize: 12, borderTop: "0.5px solid var(--border)", cursor: "pointer" }}>
                <span style={{ color: "var(--text-secondary)" }}>{d2(dp.date)}</span>
                <span style={{ textAlign: "right" }}>{inr(dp.spend)}</span>
                <span style={{ textAlign: "right" }}>{inr(dp.sales)}</span>
                <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{dp.orders}</span>
                <span style={{ textAlign: "right", color: dp.acos === null ? "var(--text-muted)" : BADGE[dp.verdict].fg }}>{dp.acos === null ? "—" : pct(dp.acos)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && day && (
        <div style={{ padding: "12px 14px 18px 34px", borderTop: "0.5px solid var(--border)", background: "var(--surface-1)" }}>
          <div onClick={() => setDay(null)} style={{ fontSize: 12, color: "var(--text-accent)", cursor: "pointer", marginBottom: 10 }}>← all days</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{d2(day)}</div>
            {dayPt && (
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)" }}>
                <span>Spend <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{inr(dayPt.spend)}</b></span>
                <span>Sales <b style={{ color: "var(--text-primary)", fontWeight: 500 }}>{inr(dayPt.sales)}</b></span>
                <span>ACOS <b style={{ color: dayPt.acos === null ? "var(--text-muted)" : BADGE[dayPt.verdict].fg, fontWeight: 500 }}>{pct(dayPt.acos)}</b>
                  {dayPt.acos !== null && c.acos !== null && <span style={{ color: "var(--text-muted)" }}> vs {pct(c.acos)} typical <span style={{ color: dayPt.acos > c.acos ? "var(--pause-fg)" : "var(--good-fg)" }}>{dayPt.acos > c.acos ? "▲" : "▼"}</span></span>}
                </span>
              </div>
            )}
          </div>

          {loading && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading the day…</div>}

          {targets && targets.length > 0 && (
            <>
              {noSalesSpend > 0 && meta && meta.totalSpend > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--pause-bg)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: "var(--pause-fg)" }}>{inr(noSalesSpend)} — {Math.round((noSalesSpend / meta.totalSpend) * 100)}% of the day — went to {noSalesCount} target{noSalesCount > 1 ? "s" : ""} with no sales.</span>
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Where the spend went</div>
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.8fr 0.8fr 0.5fr 0.7fr", gap: 8, padding: "7px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--surface-1)" }}>
                  <span>Target</span><span>Match</span><span style={{ textAlign: "right" }}>Spend</span><span style={{ textAlign: "right" }}>Sales</span><span style={{ textAlign: "right" }}>Ord</span><span style={{ textAlign: "right" }}>ACOS</span>
                </div>
                {targets.map((t, i) => {
                  const bad = t.sales <= 0;
                  const isOpen = openTarget === t.target;
                  return (
                    <div key={i}>
                      <div onClick={() => loadTerms(t.target)} style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.8fr 0.8fr 0.5fr 0.7fr", gap: 8, padding: "8px 12px", fontSize: 12, borderTop: "0.5px solid var(--border)", alignItems: "center", cursor: "pointer", background: bad ? "var(--pause-bg)" : isOpen ? "var(--surface-1)" : "transparent" }}>
                        <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.target}</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{(t.match_type || "").toLowerCase()}</span>
                        <span style={{ textAlign: "right" }}>{inr(t.spend)}</span>
                        <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{inr(t.sales)}</span>
                        <span style={{ textAlign: "right", color: t.orders === 0 ? "var(--pause-fg)" : "inherit" }}>{t.orders}</span>
                        <span style={{ textAlign: "right", color: t.acos === null ? "var(--text-muted)" : t.acos > 20 ? "var(--pause-fg)" : t.acos <= 10 ? "var(--good-fg)" : "var(--okay-fg)" }}>{pct(t.acos)}</span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: "6px 12px 10px 22px", background: "var(--surface-1)", borderTop: "0.5px solid var(--border)" }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Search terms it matched</div>
                          {termsLoading === t.target && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>}
                          {terms[t.target] && terms[t.target].length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No search-term rows for this target that day.</div>}
                          {terms[t.target] && terms[t.target].map((st, j) => (
                            <div key={j} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.5fr 0.7fr", gap: 8, padding: "4px 0", fontSize: 12 }}>
                              <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.search_term}</span>
                              <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{inr(st.spend)}</span>
                              <span style={{ textAlign: "right", color: st.orders === 0 ? "var(--pause-fg)" : "inherit" }}>{st.orders}</span>
                              <span style={{ textAlign: "right", color: st.acos === null ? "var(--text-muted)" : st.acos > 20 ? "var(--pause-fg)" : "var(--text-secondary)" }}>{pct(st.acos)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {meta && meta.total > meta.shown && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Showing top {meta.shown} of {meta.total} targets by spend.</div>}
            </>
          )}
          {targets && targets.length === 0 && !loading && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No target rows for this day — the spend may be from auto-targeting only.</div>}
        </div>
      )}
    </>
  );
}
