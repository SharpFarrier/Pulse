"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const ITEM = 34; // px per row
const PAD = 3;   // rows of padding above/below the center

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
export function iso(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
export function parseIso(s: string) { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; }

// A single iOS-style wheel. Native scroll-snap; the centered row is the value.
export function Wheel({ items, index, onChange, width, mono }: { items: string[]; index: number; onChange: (i: number) => void; width: string; mono?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = index * ITEM;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [index, items.length]);

  const onScroll = useCallback(() => {
    const el = ref.current; if (!el) return;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      el.scrollTo({ top: i * ITEM, behavior: "smooth" });
      if (i !== index) onChange(i);
    }, 90);
  }, [items.length, index, onChange]);

  return (
    <div ref={ref} onScroll={onScroll}
      style={{ width, height: ITEM * (PAD * 2 + 1), overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", position: "relative" }}
      className="pulse-wheel">
      <div style={{ height: ITEM * PAD }} />
      {items.map((it, i) => {
        const dist = Math.abs(i - index);
        return (
          <div key={i} onClick={() => onChange(i)} style={{
            height: ITEM, lineHeight: `${ITEM}px`, textAlign: "center", scrollSnapAlign: "center", cursor: "pointer",
            fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            fontSize: dist === 0 ? 19 : 16, fontWeight: dist === 0 ? 500 : 400,
            color: dist === 0 ? "var(--text-primary)" : "var(--text-secondary)",
            opacity: dist === 0 ? 1 : dist === 1 ? 0.6 : 0.3,
          }}>{it}</div>
        );
      })}
      <div style={{ height: ITEM * PAD }} />
    </div>
  );
}

function DateWheels({ value, min, max, onChange }: { value: string; min: string; max: string; onChange: (s: string) => void }) {
  const { y, m, d } = parseIso(value);
  const minY = parseIso(min).y, maxY = parseIso(max).y;
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);
  const dim = daysInMonth(y, m);
  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const set = (ny: number, nm: number, nd: number) => {
    const cap = Math.min(nd, daysInMonth(ny, nm));
    onChange(iso(ny, nm, cap));
  };

  return (
    <div style={{ position: "relative", border: "0.5px solid var(--border)", borderRadius: 14, background: "var(--surface-2)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: ITEM, transform: "translateY(-50%)", background: "var(--surface-1)", borderTop: "0.5px solid var(--border-strong)", borderBottom: "0.5px solid var(--border-strong)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ITEM * PAD, background: "linear-gradient(var(--surface-2), transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM * PAD, background: "linear-gradient(transparent, var(--surface-2))", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ display: "flex", justifyContent: "center", gap: 4, position: "relative", zIndex: 1 }}>
        <Wheel items={MONTHS} index={m} width="46%" onChange={(i) => set(y, i, d)} />
        <Wheel items={days.map(String)} index={d - 1} width="20%" mono onChange={(i) => set(y, m, i + 1)} />
        <Wheel items={years.map(String)} index={y - minY} width="28%" mono onChange={(i) => set(minY + i, m, d)} />
      </div>
      <style>{`.pulse-wheel::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}


const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// value / onChange use 'YYYY-MM'. Compact two-wheel month picker in Pulse theme.
export function MonthPicker({ value, minYear, maxYear, onChange }: { value: string; minYear: number; maxYear: number; onChange: (v: string) => void }) {
  const [y, m] = value.split("-").map(Number);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  return (
    <div style={{ position: "relative", border: "0.5px solid var(--border)", borderRadius: 14, background: "var(--surface-2)", overflow: "hidden", width: 240 }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 34, transform: "translateY(-50%)", background: "var(--surface-1)", borderTop: "0.5px solid var(--border-strong)", borderBottom: "0.5px solid var(--border-strong)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 102, background: "linear-gradient(var(--surface-2), transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 102, background: "linear-gradient(transparent, var(--surface-2))", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ display: "flex", justifyContent: "center", gap: 4, position: "relative", zIndex: 1 }}>
        <Wheel items={MONTHS_FULL} index={m - 1} width="58%" onChange={(i) => onChange(`${y}-${String(i + 1).padStart(2, "0")}`)} />
        <Wheel items={years.map(String)} index={Math.max(0, y - minYear)} width="40%" mono onChange={(i) => onChange(`${minYear + i}-${String(m).padStart(2, "0")}`)} />
      </div>
    </div>
  );
}

export default function DateRangePicker({ start, end, min, max, onApply, onCancel }: { start: string; end: string; min: string; max: string; onApply: (s: string, e: string) => void; onCancel: () => void }) {
  const [tab, setTab] = useState<"from" | "to">("from");
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);

  // keep from <= to
  const setFromSafe = (s: string) => { setFrom(s); if (s > to) setTo(s); };
  const setToSafe = (s: string) => { setTo(s); if (s < from) setFrom(s); };

  const fmt = (s: string) => { const { y, m, d } = parseIso(s); return `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m]} ${y}`; };
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

  return (
    <div style={{ maxWidth: 460, border: "0.5px solid var(--border)", borderRadius: 16, background: "var(--surface-2)", padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,0.10)" }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{fmt(from)} &nbsp;→&nbsp; {fmt(to)} <span style={{ color: "var(--text-muted)" }}>· {span} day{span > 1 ? "s" : ""}</span></div>
      <div style={{ display: "inline-flex", gap: 4, background: "var(--surface-1)", borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {(["from", "to"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} style={{ fontSize: 13, fontWeight: tab === k ? 500 : 400, color: tab === k ? "var(--surface-2)" : "var(--text-secondary)", background: tab === k ? "var(--text-primary)" : "transparent", border: "none", borderRadius: 8, padding: "6px 20px", cursor: "pointer", textTransform: "capitalize" }}>{k}</button>
        ))}
      </div>
      {tab === "from"
        ? <DateWheels value={from} min={min} max={max} onChange={setFromSafe} />
        : <DateWheels value={to} min={min} max={max} onChange={setToSafe} />}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={() => onApply(from, to)} style={{ flex: 1, background: "var(--text-primary)", color: "var(--surface-2)", border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)", cursor: "pointer" }}>Apply range</button>
        <button onClick={onCancel} style={{ background: "transparent", border: "0.5px solid var(--border-strong)", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-sans)", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
