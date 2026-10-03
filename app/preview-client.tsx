"use client";

import { useEffect, useMemo, useState } from "react";
import type { CampaignDailyRow } from "@/lib/reports/preview";
import { computeRange, addDays, daysBetween } from "@/lib/reports/daybyday";
import DbdDiagnosis from "./dbd-diagnosis";
import DbdMatrix from "./dbd-matrix";
import DateRangePicker from "./drum-picker";

const inr = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : `₹${Math.round(n)}`;
const d2 = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
const wd = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const acosChip = (a: number | null) => a === null ? { bg: "var(--chip-red)", c: "#fff" } : a <= 10 ? { bg: "var(--chip-green)", c: "#13341F" } : a <= 20 ? { bg: "var(--chip-amber)", c: "#4A370B" } : { bg: "var(--chip-red)", c: "#fff" };

function Change({ cur, prev, kind }: { cur: number | null; prev: number | null | undefined; kind: "acos" | "neutral" | "up" }) {
  if (cur === null || prev === null || prev === undefined || prev === 0) return <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>;
  const diff = ((cur - prev) / Math.abs(prev)) * 100;
  if (kind === "neutral") return <span style={{ fontSize: 11, color: "var(--muted)" }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>;
  const worse = kind === "acos" ? diff > 0 : diff < 0;
  const col = Math.abs(diff) < 1 ? "var(--muted)" : worse ? "var(--worsefg)" : "var(--betterfg)";
  return <span style={{ fontSize: 11, fontWeight: 600, color: col }}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>;
}

export default function PreviewClient({ rows }: { rows: CampaignDailyRow[] }) {
  const [product, setProduct] = useState<"ALL" | "SP" | "SB">("ALL");
  const [windowDays, setWindowDays] = useState(7);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [targetingDates, setTargetingDates] = useState<Set<string> | null>(null);

  const hasSB = useMemo(() => rows.some(r => (r.ad_product ?? "SP") === "SB"), [rows]);
  const maxDate = useMemo(() => rows.length ? rows.reduce((m, r) => r.date > m ? r.date : m, rows[0].date) : null, [rows]);
  const minDate = useMemo(() => rows.length ? rows.reduce((m, r) => r.date < m ? r.date : m, rows[0].date) : null, [rows]);

  const filtered = useMemo(() => product === "ALL" ? rows : rows.filter(r => (r.ad_product ?? "SP") === product), [rows, product]);
  const range = useMemo(() => {
    if (!maxDate) return null;
    if (customRange) return { from: customRange.start, to: customRange.end };
    return { from: addDays(maxDate, -(windowDays - 1)), to: maxDate };
  }, [maxDate, windowDays, customRange]);

  const ctx = useMemo(() => range ? computeRange(filtered, range.from, range.to) : null, [filtered, range]);

  useEffect(() => {
    fetch("/api/coverage").then(r => r.json()).then(j => {
      const s = new Set<string>();
      for (const k of ["sp_targeting", "sb_targeting"]) (j?.streams?.[k] ?? []).forEach((d: string) => s.add(d));
      setTargetingDates(s);
    }).catch(() => setTargetingDates(new Set()));
  }, []);

  // default selection: latest day that isn't "Normal", else latest
  useEffect(() => {
    if (!ctx) return;
    if (selected && ctx.days.includes(selected)) return;
    const flagged = [...ctx.dayCards].reverse().find(c => c.reason !== "Normal" && c.spend > 0);
    setSelected((flagged ?? ctx.dayCards[ctx.dayCards.length - 1])?.date ?? null);
  }, [ctx]); // eslint-disable-line

  if (!ctx || !range || !maxDate) {
    return <div className="dbd"><div style={{ fontSize: 20, fontWeight: 600 }}>Amazon ads · day by day</div><div style={{ marginTop: 16, color: "var(--muted)" }}>No data yet — ingest your reports first.</div></div>;
  }

  const ageDays = daysBetween(maxDate, todayISO());
  const hasTargeting = !!targetingDates && ctx.days.some(d => targetingDates.has(d));
  const w = ctx.week;
  const maxSales = Math.max(1, ...ctx.dayCards.map(c => c.sales));
  const periods: [number, string][] = [[7, "7 days"], [30, "30 days"]];
  const productLabel = product === "ALL" ? "Combined" : product === "SB" ? "Brands" : "Products";

  const weekMetrics: { label: string; val: string; cur: number | null; prev: number | null | undefined; kind: "acos" | "neutral" | "up" }[] = [
    { label: "ACOS", val: w.cur.acos === null ? "—" : w.cur.acos.toFixed(1) + "%", cur: w.cur.acos, prev: w.prev?.acos, kind: "acos" },
    { label: "Spend", val: inr(w.cur.spend), cur: w.cur.spend, prev: w.prev?.spend, kind: "neutral" },
    { label: "Sales", val: inr(w.cur.sales), cur: w.cur.sales, prev: w.prev?.sales, kind: "up" },
    { label: "Orders", val: String(w.cur.orders), cur: w.cur.orders, prev: w.prev?.orders, kind: "up" },
    { label: "ROAS", val: w.cur.roas === null ? "—" : w.cur.roas.toFixed(1) + "x", cur: w.cur.roas, prev: w.prev?.roas, kind: "up" },
  ];

  return (
    <div className="dbd">
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Amazon ads · day by day</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{d2(range.from)} – {d2(range.to)} · {productLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasSB && (["ALL", "SP", "SB"] as const).map(pk => (
            <button key={pk} onClick={() => setProduct(pk)} style={btn(product === pk)}>{pk === "ALL" ? "Combined" : pk === "SB" ? "Brands" : "Products"}</button>
          ))}
          {periods.map(([n, label]) => <button key={n} onClick={() => { setWindowDays(n); setCustomRange(null); setPickerOpen(false); }} style={btn(!customRange && windowDays === n)}>{label}</button>)}
          <button onClick={() => setPickerOpen(o => !o)} style={btn(!!customRange)}>{customRange ? `${d2(customRange.start)}–${d2(customRange.end)}` : "Custom"}</button>
        </div>
      </div>
      {ageDays > 1 && <a href="/ingest" style={{ display: "inline-block", fontSize: 12, color: "var(--worsefg)", background: "var(--worsebg)", borderRadius: 6, padding: "4px 10px", marginBottom: 14, textDecoration: "none" }}>Data is {ageDays} days old → ingest latest</a>}
      {pickerOpen && minDate && (
        <div style={{ marginBottom: 16 }}>
          <DateRangePicker start={customRange?.start ?? range.from} end={customRange?.end ?? range.to} min={minDate} max={maxDate}
            onApply={(s, e) => { setCustomRange({ start: s, end: e }); setPickerOpen(false); }} onCancel={() => setPickerOpen(false)} />
        </div>
      )}

      {/* week summary line */}
      <div className="dbd-card" style={{ display: "flex", gap: 0, flexWrap: "wrap", marginBottom: 20 }}>
        {weekMetrics.map((m, i) => (
          <div key={m.label} style={{ flex: "1 1 110px", padding: "10px 14px", borderLeft: i ? "1px solid var(--bd)" : "none" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 17, fontWeight: 600 }}>{m.val}</span><Change cur={m.cur} prev={m.prev} kind={m.kind} /></div>
          </div>
        ))}
      </div>

      {/* pick a day */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pick a day</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(ctx.days.length, 7)}, 1fr)`, gap: 8, marginBottom: 4 }}>
        {ctx.dayCards.map((c) => {
          const sel = selected === c.date;
          const barH = (c.sales / maxSales) * 46;
          const orangeH = c.sales > 0 ? Math.min(barH, (c.spend / c.sales) * barH) : 0;
          const chip = acosChip(c.acos);
          return (
            <div key={c.date} onClick={() => setSelected(c.date)} className="dbd-card" style={{ padding: "10px 8px", cursor: "pointer", border: sel ? "2px solid var(--ink)" : "1px solid var(--bd)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{wd(c.date)} {d2(c.date).split(" ")[0]}</div>
              <div style={{ height: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", margin: "6px 0" }}>
                <div style={{ width: 22, height: `${Math.max(3, barH)}px`, background: "var(--betterbg)", borderRadius: "3px 3px 0 0", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ height: `${orangeH}px`, background: "var(--spend)", borderRadius: "0 0 3px 3px" }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{inr(c.sales)}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{c.orders} ord · {inr(c.spend)}</div>
              <div style={{ marginTop: 4 }}><span style={{ fontSize: 10, background: chip.bg, color: chip.c, borderRadius: 4, padding: "1px 6px" }}>{c.acos === null ? "—" : c.acos.toFixed(0) + "%"}</span></div>
              <div style={{ fontSize: 10, color: c.reason === "Normal" ? "var(--muted)" : c.isBest ? "var(--betterfg)" : "var(--worsefg)", marginTop: 4, minHeight: 24, lineHeight: 1.3 }}>{c.reason}</div>
            </div>
          );
        })}
      </div>

      {selected && <DbdDiagnosis ctx={ctx} selectedDate={selected} hasTargeting={hasTargeting} product={product} />}
      <DbdMatrix ctx={ctx} selectedDate={selected ?? ctx.days[ctx.days.length - 1]} />
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return { fontSize: 13, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontWeight: active ? 600 : 400, background: active ? "var(--ink)" : "var(--card)", color: active ? "#fff" : "var(--ink)", border: "1px solid var(--bd)" };
}
