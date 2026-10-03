"use client";

import { useMemo, useState } from "react";
import { computeListingView, type BusinessMonthlyRow, type SkuView, type Status, type Mode, type MetricMove } from "@/lib/reports/listing";

const inr = (n: number) => { const a = Math.abs(n); const s = n < 0 ? "−" : ""; return a >= 1e7 ? `${s}₹${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `${s}₹${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${s}₹${(a / 1e3).toFixed(1)}k` : `${s}₹${Math.round(a)}`; };
const mLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const mFull = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const TAG_PURPLE = "Check data";
const STATUS_LABEL: Record<Status, string> = { worse: "Worse than account", beat: "Beat account", inline: "In line", stopped: "Stopped selling", new: "New", tiny: "Tiny" };

function pctStr(p: number | null, pp = false) { return p === null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(0)}${pp ? "pp" : "%"}`; }
function moveColor(p: number | null, goodUp = true) { if (p === null || Math.abs(p) < 1) return "var(--muted)"; const worse = goodUp ? p < 0 : p > 0; return worse ? "var(--worsefg)" : "var(--betterfg)"; }

function Spark({ series, mi, gain }: { series: number[]; mi: number; gain: boolean }) {
  const max = Math.max(1, ...series);
  return <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24 }}>
    {series.map((v, i) => <span key={i} style={{ width: 5, height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 24)}px`, background: i === mi ? (gain ? "#5B93C7" : "#E58B45") : "#B9B4A6", borderRadius: 1 }} />)}
  </span>;
}

function Move({ label, mm, fmt, main, goodUp = true }: { label: string; mm: MetricMove; fmt: (n: number) => string; main?: boolean; goodUp?: boolean }) {
  return (
    <div className="dbd-card" style={{ padding: "12px 14px", position: "relative", borderColor: main ? "var(--spend)" : "var(--bd)", borderWidth: main ? 2 : 1 }}>
      {main && <span style={{ position: "absolute", top: -9, left: 12, fontSize: 9, fontWeight: 700, background: "var(--spend)", color: "#fff", borderRadius: 4, padding: "2px 6px" }}>MAIN CAUSE</span>}
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 600, margin: "2px 0" }}>{fmt(mm.m)} <span style={{ fontSize: 13, fontWeight: 600, color: moveColor(mm.pct, goodUp) }}>{pctStr(mm.pct)}</span></div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>usual {fmt(mm.base)}</div>
    </div>
  );
}

function tagStyle(tag: string): React.CSSProperties {
  if (!tag) return { display: "none" };
  const purple = tag === TAG_PURPLE, gain = tag === "More traffic" || tag === "Better conversion";
  const bg = purple ? "#ECE6F5" : gain ? "var(--betterbg)" : "var(--worsebg)";
  const fg = purple ? "#4B2F7A" : gain ? "var(--betterfg)" : "var(--worsefg)";
  return { fontSize: 11, background: bg, color: fg, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" };
}

export default function ListingClient({ rows }: { rows: BusinessMonthlyRow[] }) {
  const months = useMemo(() => [...new Set(rows.map(r => r.period.slice(0, 7)))].sort(), [rows]);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("3mo");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openFam, setOpenFam] = useState<Set<string>>(new Set());
  const [openSku, setOpenSku] = useState<string | null>(null);
  const v = useMemo(() => computeListingView(rows, month, mode), [rows, month, mode]);

  if (!v) return <div className="dbd"><div style={{ fontSize: 20, fontWeight: 600 }}>Listing</div><div style={{ marginTop: 16, color: "var(--muted)" }}>No business data yet — ingest a Business report first.</div></div>;

  const mi = v.months.indexOf(v.month);
  const accDown = v.account.pct < 0;
  const baseMax = Math.max(1, ...v.account.revByMonth);
  const baseLineY = v.account.baseline; // avg baseline revenue (dashed line)
  const famMaxAbs = Math.max(1, ...v.families.map(f => Math.abs(f.change)));
  const sessMain = Math.abs(v.account.sessions.pct ?? 0) >= Math.abs(v.account.conversion.pct ?? 0) && Math.abs(v.account.sessions.pct ?? 0) >= Math.abs(v.account.price.pct ?? 0);

  const filtered = filter === "all" ? v.skus : v.skus.filter(s => s.status === filter);
  const byFamily = useMemo(() => {
    const m = new Map<string, SkuView[]>();
    for (const s of filtered) { const g = m.get(s.family) ?? []; g.push(s); m.set(s.family, g); }
    for (const g of m.values()) g.sort((a, b) => a.change - b.change);
    return [...m.entries()].sort((a, b) => a[1].reduce((s, k) => s + k.change, 0) - b[1].reduce((s, k) => s + k.change, 0));
  }, [filtered]);

  const MoverRow = ({ s }: { s: SkuView }) => (
    <div className="dbd-card" style={{ padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{inr(s.baseline)} → {inr(s.m)}{s.tag ? " · " : ""}<span style={tagStyle(s.tag)}>{s.tag}</span></div>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: s.change < 0 ? "var(--worsefg)" : "var(--betterfg)" }}>{inr(s.change)}</div>
          <Spark series={s.revSeries} mi={mi} gain={s.change >= 0} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span>sessions <b style={{ color: moveColor(s.sess.pct) }}>{pctStr(s.sess.pct)}</b></span>
        <span>conv <b style={{ color: moveColor(s.conv.pct) }}>{pctStr(s.conv.pct)}</b></span>
        <span>price <b style={{ color: moveColor(s.price.pct, false) }}>{pctStr(s.price.pct)}</b></span>
      </div>
    </div>
  );

  return (
    <div className="dbd">
      {/* 1. header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Listing</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Business report · {mFull(v.month)} · {v.skuCount} SKUs</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={v.month} onChange={e => setMonth(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--bd)", background: "var(--card)", fontFamily: "inherit" }}>
            {v.months.map(m => <option key={m} value={m}>{mFull(m)}</option>)}
          </select>
          <div style={{ display: "inline-flex", gap: 3, background: "var(--bd)", borderRadius: 7, padding: 2 }}>
            {(["3mo", "last"] as Mode[]).map(k => <button key={k} onClick={() => setMode(k)} style={{ fontSize: 12, fontWeight: mode === k ? 600 : 400, border: "none", borderRadius: 5, padding: "5px 10px", cursor: "pointer", background: mode === k ? "var(--card)" : "transparent", color: "var(--ink)" }}>{k === "3mo" ? "vs 3-mo avg" : "vs last month"}</button>)}
          </div>
        </div>
      </div>

      {/* 2. account panel */}
      <div className="dbd-card" style={{ padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{inr(v.account.m)} in {mLabel(v.month)} — {accDown ? `${Math.abs(v.account.pct).toFixed(0)}% below` : `${v.account.pct.toFixed(0)}% above`} the usual {inr(v.account.baseline)}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 14 }}>{v.account.sentence}</div>
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 10, height: 90, marginBottom: 6 }}>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(baseLineY / baseMax) * 78}px`, borderTop: "1px dashed var(--muted)", opacity: 0.5 }} />
          {v.account.revByMonth.map((r, i) => {
            const isM = i === mi, isBase = v.baselineMonths.includes(v.months[i]);
            return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", zIndex: 1 }}>
              <span style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>{inr(r)}</span>
              <div style={{ width: "100%", maxWidth: 42, height: `${Math.max(3, (r / baseMax) * 78)}px`, background: isM ? "var(--spend)" : isBase ? "#8C8777" : "#CFCABA", borderRadius: "3px 3px 0 0" }} />
            </div>;
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>{v.months.map(m => <span key={m} style={{ flex: 1, textAlign: "center", fontSize: 10, color: m === v.month ? "var(--ink)" : "var(--muted)", fontWeight: m === v.month ? 600 : 400 }}>{mLabel(m)}</span>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <Move label="Sessions" mm={v.account.sessions} fmt={(n) => (n / 1e5).toFixed(2) + "L"} main={sessMain && accDown} />
          <Move label="Conversion" mm={v.account.conversion} fmt={(n) => n.toFixed(2) + "%"} />
          <Move label="Avg price" mm={v.account.price} fmt={inr} goodUp={false} />
        </div>
      </div>

      {/* 3. families */}
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Where the {inr(Math.abs(v.account.m - v.account.baseline))} went</div>
      <div className="dbd-card" style={{ padding: "6px 14px", marginBottom: 20 }}>
        {v.families.map(f => {
          const w = (Math.abs(f.change) / famMaxAbs) * 50, neg = f.change < 0;
          return <div key={f.family} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 2fr 1fr", gap: 8, alignItems: "center", padding: "7px 0", fontSize: 12, borderTop: "1px solid var(--bd)" }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{f.family}</span>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>{inr(f.baseline)} → {inr(f.m)}</span>
            <div style={{ position: "relative", height: 14 }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--bd)" }} />
              <div style={{ position: "absolute", top: 2, height: 10, borderRadius: 2, background: neg ? "#E58B45" : "#5B93C7", ...(neg ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }) }} />
            </div>
            <span style={{ textAlign: "right" }}>
              <span style={{ color: neg ? "var(--worsefg)" : "var(--betterfg)", fontWeight: 600 }}>{inr(f.change)}</span>
              {f.relativePts !== null && <div style={{ fontSize: 10, color: "var(--muted)" }}>{Math.abs(f.relativePts) < 10 ? "in line" : `${Math.round(Math.abs(f.relativePts))}pts ${f.relativePts < 0 ? "worse" : "better"}`}</div>}
            </span>
          </div>;
        })}
      </div>

      {/* 4. signal cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        {v.signals.siblings.slice(0, 1).map((sb, i) => (
          <div key={i} className="dbd-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Sibling shift · {sb.family}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}><span style={{ color: "var(--betterfg)" }}>{sb.up.name} {inr(sb.up.change)}</span> vs <span style={{ color: "var(--worsefg)" }}>{sb.down.name} {inr(sb.down.change)}</span> — demand moved between variants, not lost.</div>
          </div>
        ))}
        {v.signals.stopped.count > 0 && (
          <div className="dbd-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Stopped selling</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.signals.stopped.count} SKU{v.signals.stopped.count > 1 ? "s" : ""} went to zero. Largest: {v.signals.stopped.largest?.name} (was {inr(v.signals.stopped.largest?.baseline ?? 0)}).</div>
          </div>
        )}
        {v.signals.priceMovedTop >= 4 && (
          <div className="dbd-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Price moved</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Price changed ≥5% on {v.signals.priceMovedTop} of your top 12 SKUs this month.</div>
          </div>
        )}
        {v.signals.checkData > 0 && (
          <div className="dbd-card" style={{ padding: "12px 14px", borderColor: "#C9B8E0" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#4B2F7A" }}>Check data</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.signals.checkData} SKU{v.signals.checkData > 1 ? "s" : ""} have sessions counted inconsistently across months — not diagnosed.</div>
          </div>
        )}
      </div>

      {/* 5. movers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--worsefg)" }}>Lost the most rupees</div>
          {v.losers.map(s => <MoverRow key={s.asin} s={s} />)}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--betterfg)" }}>Gained the most rupees</div>
          {v.gainers.length ? v.gainers.map(s => <MoverRow key={s.asin} s={s} />) : <div style={{ fontSize: 12, color: "var(--muted)" }}>No gainers this month.</div>}
        </div>
      </div>

      {/* 6. all SKUs grouped */}
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>All products</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(["all", "worse", "inline", "beat", "stopped", "new"] as const).map(k => {
          const n = k === "all" ? v.skus.length : v.counts[k as Status];
          const active = filter === k;
          return <button key={k} onClick={() => setFilter(k as Status | "all")} style={{ fontSize: 12, borderRadius: 14, padding: "5px 11px", cursor: "pointer", border: "1px solid var(--bd)", background: active ? "var(--ink)" : "var(--card)", color: active ? "#fff" : "var(--ink)" }}>{k === "all" ? "All" : STATUS_LABEL[k as Status]} {n}</button>;
        })}
      </div>
      <div className="dbd-card" style={{ overflow: "hidden" }}>
        {byFamily.map(([fam, list]) => {
          const famChange = list.reduce((s, k) => s + k.change, 0), famM = list.reduce((s, k) => s + k.m, 0);
          const open = openFam.has(fam);
          return <div key={fam}>
            <div onClick={() => setOpenFam(p => { const n = new Set(p); n.has(fam) ? n.delete(fam) : n.add(fam); return n; })} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.6fr", gap: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, alignItems: "center", borderTop: "1px solid var(--bd)", background: "var(--bg)", cursor: "pointer" }}>
              <span>{open ? "▾" : "▸"} {fam} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>({list.length})</span></span>
              <span style={{ textAlign: "right" }}>{inr(famM)}</span>
              <span style={{ textAlign: "right", color: famChange < 0 ? "var(--worsefg)" : "var(--betterfg)" }}>{inr(famChange)}</span>
              <span />
            </div>
            {open && list.map(s => (
              <div key={s.asin}>
                <div onClick={() => setOpenSku(openSku === s.asin ? null : s.asin)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.9fr 1.1fr 1.3fr", gap: 6, padding: "8px 12px 8px 24px", fontSize: 12, alignItems: "center", borderTop: "1px solid var(--bd)", cursor: "pointer" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ textAlign: "right" }}>{inr(s.m)}</span>
                  <span style={{ textAlign: "right", color: "var(--muted)" }}>{inr(s.baseline)}</span>
                  <span style={{ textAlign: "right", color: (s.pct ?? 0) < 0 ? "var(--worsefg)" : "var(--betterfg)" }}>{pctStr(s.pct)}</span>
                  <span style={{ justifySelf: "end" }}><Spark series={s.revSeries} mi={mi} gain={s.change >= 0} /></span>
                  <span style={s.tag ? tagStyle(s.tag) : { fontSize: 11, color: "var(--muted)" }}>{s.tag || STATUS_LABEL[s.status]}</span>
                </div>
                {openSku === s.asin && (
                  <div style={{ padding: "8px 12px 12px 24px", background: "var(--bg)", borderTop: "1px solid var(--bd)", fontSize: 12 }}>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", color: "var(--muted)" }}>
                      <span>Sessions {Math.round(s.sess.m).toLocaleString("en-IN")} <b style={{ color: moveColor(s.sess.pct) }}>{pctStr(s.sess.pct)}</b> <span style={{ fontSize: 10 }}>(usual {Math.round(s.sess.base).toLocaleString("en-IN")})</span></span>
                      <span>Conversion {s.conv.m.toFixed(2)}% <b style={{ color: moveColor(s.conv.pct) }}>{pctStr(s.conv.pct)}</b></span>
                      <span>Price {inr(s.price.m)} <b style={{ color: moveColor(s.price.pct, false) }}>{pctStr(s.price.pct)}</b></span>
                      {s.buybox.pp !== null && <span>Buy-box <b style={{ color: moveColor(s.buybox.pp) }}>{pctStr(s.buybox.pp, true)}</b></span>}
                    </div>
                    <div style={{ marginTop: 8, color: "var(--ink)" }}>{s.status === "worse" ? "Worse than the account. " : s.status === "beat" ? "Beat the account. " : ""}{s.tag ? `Driver: ${s.tag}.` : "No single driver stands out."}</div>
                  </div>
                )}
              </div>
            ))}
          </div>;
        })}
      </div>
    </div>
  );
}
