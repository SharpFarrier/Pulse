"use client";

import { useMemo, useState, useCallback } from "react";
import { diagnoseDay, type RangeCtx, type Driver } from "@/lib/reports/daybyday";

const inr = (n: number) => n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : `₹${Math.round(n)}`;
const dlabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const acosChip = (a: number | null) => a === null ? { bg: "var(--chip-red)", c: "#fff", t: "—" } : a <= 10 ? { bg: "var(--chip-green)", c: "#13341F", t: a.toFixed(0) + "%" } : a <= 20 ? { bg: "var(--chip-amber)", c: "#4A370B", t: a.toFixed(0) + "%" } : { bg: "var(--chip-red)", c: "#fff", t: a.toFixed(0) + "%" };

function Pill({ pct, kind }: { pct: number | null; kind: "spend" | "orders" | "ov" }) {
  if (pct === null) return <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  let bg = "var(--bd)", fg = "var(--muted)";
  if (kind !== "spend") { const worse = pct < 0; bg = worse ? "var(--worsebg)" : "var(--betterbg)"; fg = worse ? "var(--worsefg)" : "var(--betterfg)"; }
  return <span style={{ fontSize: 11, fontWeight: 600, background: bg, color: fg, borderRadius: 5, padding: "1px 6px" }}>{pct >= 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
}

function DriverTile({ label, d, fmt, kind, main, selectedDate }: { label: string; d: Driver; fmt: (n: number) => string; kind: "spend" | "orders" | "ov"; main: boolean; selectedDate: string }) {
  const max = Math.max(1, ...d.series.map(s => s.value));
  return (
    <div className="dbd-card" style={{ padding: "12px 14px", position: "relative", borderColor: main ? "var(--spend)" : "var(--bd)", borderWidth: main ? 2 : 1 }}>
      {main && <span style={{ position: "absolute", top: -9, left: 12, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, background: "var(--spend)", color: "#fff", borderRadius: 4, padding: "2px 6px" }}>MAIN CAUSE</span>}
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "3px 0 2px" }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{fmt(d.value)}</span>
        <Pill pct={d.pct} kind={kind} />
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>avg {fmt(d.avg)}</div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 28 }}>
        {d.series.map((s) => <div key={s.date} title={`${s.date}: ${fmt(s.value)}`} style={{ flex: 1, height: `${Math.max(2, (s.value / max) * 28)}px`, background: s.date === selectedDate ? (main ? "var(--spend)" : "var(--accent)") : "var(--bd)", borderRadius: 2 }} />)}
      </div>
    </div>
  );
}

interface Target { target: string; match_type: string; spend: number; sales: number; orders: number; acos: number | null; }

export default function DbdDiagnosis({ ctx, selectedDate, hasTargeting, product }: { ctx: RangeCtx; selectedDate: string; hasTargeting: boolean; product: string }) {
  const dg = useMemo(() => diagnoseDay(ctx, selectedDate), [ctx, selectedDate]);
  const [openCamp, setOpenCamp] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, Target[]>>({});

  const drill = useCallback(async (name: string) => {
    if (openCamp === name) { setOpenCamp(null); return; }
    setOpenCamp(name);
    if (targets[name]) return;
    try {
      const res = await fetch("/api/day-drill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign: name, date: selectedDate }) });
      const j = await res.json();
      if (res.ok) setTargets((t) => ({ ...t, [name]: j.targets ?? [] }));
    } catch { /* ignore */ }
  }, [openCamp, targets, selectedDate]);

  const t = dg.totals;
  const avgCpo = ctx.dayAvg.orders > 0 ? ctx.dayAvg.spend / ctx.dayAvg.orders : null;
  const maxAbs = Math.max(1, ...dg.gap.bars.map(b => Math.abs(b.gap)));

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{dlabel(selectedDate)} — why was ACOS {t.acos === null ? "—" : t.acos.toFixed(0) + "%"}?</div>

      {/* verdict */}
      <div className="dbd-card" style={{ padding: "12px 14px", marginBottom: 14, fontSize: 13, lineHeight: 1.55, background: dg.main ? "#FCF4EC" : "var(--card)" }}>{dg.verdict}</div>

      {/* equation strip */}
      <div className="dbd-card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <span><b style={{ fontWeight: 600 }}>ACOS {t.acos === null ? "—" : t.acos.toFixed(0) + "%"}</b></span>
        <span style={{ color: "var(--muted)" }}>=</span>
        <span>cost/order <b style={{ fontWeight: 600 }}>{t.costPerOrder === null ? "—" : inr(t.costPerOrder)}</b> <span style={{ color: "var(--muted)", fontSize: 11 }}>(avg {avgCpo === null ? "—" : inr(avgCpo)})</span></span>
        <span style={{ color: "var(--muted)" }}>÷</span>
        <span>order value <b style={{ fontWeight: 600 }}>{t.orderValue === null ? "—" : inr(t.orderValue)}</b> <span style={{ color: "var(--muted)", fontSize: 11 }}>(avg {ctx.dayAvg.orderValue === null ? "—" : inr(ctx.dayAvg.orderValue)})</span></span>
      </div>

      {/* driver tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <DriverTile label="Ad spend" d={dg.drivers.spend} fmt={inr} kind="spend" main={dg.main === "spend"} selectedDate={selectedDate} />
        <DriverTile label="Orders" d={dg.drivers.orders} fmt={(n) => Math.round(n).toString()} kind="orders" main={dg.main === "orders"} selectedDate={selectedDate} />
        <DriverTile label="Order value" d={dg.drivers.orderValue} fmt={inr} kind="ov" main={dg.main === "orderValue"} selectedDate={selectedDate} />
      </div>

      {/* gap chart */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Sales vs what each campaign usually earns</div>
      <div style={{ fontSize: 12, color: dg.gap.net < 0 ? "var(--worsefg)" : "var(--betterfg)", marginBottom: 10 }}>net {dg.gap.net >= 0 ? "+" : "−"}{inr(Math.abs(dg.gap.net))} vs expected</div>
      <div className="dbd-card" style={{ padding: "10px 14px", marginBottom: 20 }}>
        {dg.gap.bars.map((b) => {
          const w = (Math.abs(b.gap) / maxAbs) * 50;
          const neg = b.gap < 0;
          return (
            <div key={b.name} style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 0.8fr", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
              <div style={{ position: "relative", height: 14 }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--bd)" }} />
                <div style={{ position: "absolute", top: 2, height: 10, borderRadius: 2, background: neg ? "var(--worsebg)" : "var(--betterbg)", ...(neg ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }) }} />
              </div>
              <span style={{ textAlign: "right", color: neg ? "var(--worsefg)" : "var(--betterfg)" }}>{neg ? "−" : "+"}{inr(Math.abs(b.gap))}</span>
            </div>
          );
        })}
      </div>

      {/* campaign table */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Each campaign on {dlabel(selectedDate).split(",")[0]}{hasTargeting ? " · click for keywords" : ""}</div>
      <div className="dbd-card" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1.1fr 1.3fr 1.4fr", gap: 6, padding: "8px 12px", fontSize: 11, color: "var(--muted)", background: "var(--bg)" }}>
          <span>Campaign</span><span style={{ textAlign: "right" }}>Spend</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>Order val</span><span style={{ textAlign: "center" }}>ACOS</span><span>What happened</span>
        </div>
        {dg.rows.map((r) => {
          const chip = acosChip(r.acos);
          const canDrill = hasTargeting;
          return (
            <div key={r.name}>
              <div onClick={() => canDrill && drill(r.name)} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1.1fr 1.3fr 1.4fr", gap: 6, padding: "9px 12px", fontSize: 12, alignItems: "center", borderTop: "1px solid var(--bd)", cursor: canDrill ? "pointer" : "default", background: openCamp === r.name ? "var(--bg)" : "transparent" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ textAlign: "right" }}>{inr(r.spend)} <span style={{ fontSize: 10, color: "var(--muted)" }}>{r.spendPct === null ? "" : `${r.spendPct >= 0 ? "+" : ""}${r.spendPct.toFixed(0)}%`}</span></span>
                <span style={{ textAlign: "right", color: r.ordersPct !== null && r.ordersPct < -15 ? "var(--worsefg)" : "var(--ink)" }}>{r.orders} <span style={{ fontSize: 10, color: "var(--muted)" }}>{r.ordersPct === null ? "" : `${r.ordersPct >= 0 ? "+" : ""}${r.ordersPct.toFixed(0)}%`}</span></span>
                <span style={{ textAlign: "right" }}>{r.orderValue === null ? "—" : inr(r.orderValue)}</span>
                <span style={{ textAlign: "center" }}><span style={{ fontSize: 11, background: chip.bg, color: chip.c, borderRadius: 5, padding: "1px 7px" }}>{chip.t}</span> <span style={{ fontSize: 10, color: "var(--muted)" }}>usual {r.usualAcos === null ? "—" : r.usualAcos.toFixed(0) + "%"}</span></span>
                <span style={{ fontSize: 11, color: r.tag === "No sale" || r.tag === "Fewer orders" || r.tag.startsWith("Spent") || r.tag === "Cheaper orders" ? "var(--worsefg)" : "var(--muted)" }}>{r.tag}</span>
              </div>
              {openCamp === r.name && (
                <div style={{ padding: "6px 12px 10px 24px", background: "var(--bg)", borderTop: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Keywords this day</div>
                  {!targets[r.name] && <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>}
                  {targets[r.name] && targets[r.name].length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No targeting rows for this campaign that day.</div>}
                  {targets[r.name]?.slice(0, 8).map((tg, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.6fr 0.7fr", gap: 8, fontSize: 12, padding: "3px 0" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tg.target}</span>
                      <span style={{ textAlign: "right" }}>{inr(tg.spend)}</span>
                      <span style={{ textAlign: "right", color: tg.orders === 0 ? "var(--worsefg)" : "var(--ink)" }}>{tg.orders}</span>
                      <span style={{ textAlign: "right", color: "var(--muted)" }}>{tg.acos === null ? "—" : tg.acos.toFixed(0) + "%"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!hasTargeting && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          No targeting report loaded for {ctx.from} – {ctx.to}. <a href="/ingest" style={{ color: "var(--accent)", fontWeight: 600 }}>Ingest targeting report →</a>
        </div>
      )}
    </div>
  );
}
