"use client";

import { useEffect, useState } from "react";

type Kind = "daily" | "monthly";
interface StreamDef { key: string; group: string; label: string; kind: Kind; }
const STREAMS: StreamDef[] = [
  { group: "Sponsored Products", key: "sp_campaign", label: "Campaign", kind: "daily" },
  { group: "Sponsored Products", key: "sp_targeting", label: "Targeting", kind: "daily" },
  { group: "Sponsored Products", key: "sp_search_term", label: "Search-term", kind: "daily" },
  { group: "Sponsored Products", key: "sp_product", label: "Advertised-product", kind: "daily" },
  { group: "Sponsored Brands", key: "sb_campaign", label: "Campaign", kind: "daily" },
  { group: "Sponsored Brands", key: "sb_targeting", label: "Keyword", kind: "daily" },
  { group: "Sponsored Brands", key: "sb_search_term", label: "Search-term", kind: "daily" },
  { group: "Listing", key: "business", label: "Business report", kind: "monthly" },
];

interface Coverage { today: string; last_upload: string | null; streams: Record<string, string[]>; }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const dLabel = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
const mKey = (s: string) => s.slice(0, 7);
const mLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const prevM = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

// compress a sorted list of ISO dates into "Jul 05–07, Aug 01"
function ranges(dates: string[]): string {
  if (!dates.length) return "";
  const out: [string, string][] = [];
  let start = dates[0], prev = dates[0];
  for (let i = 1; i < dates.length; i++) { if (daysBetween(prev, dates[i]) === 1) { prev = dates[i]; } else { out.push([start, prev]); start = prev = dates[i]; } }
  out.push([start, prev]);
  return out.map(([a, b]) => (a === b ? dLabel(a) : `${dLabel(a)}–${dLabel(b)}`)).join(", ");
}

function DailyRow({ def, dates, today }: { def: StreamDef; dates: string[]; today: string }) {
  if (!dates.length) return <Row name={def.label} status="none" have="nothing yet" next={`pull a recent range`} />;
  const min = dates[0], max = dates[dates.length - 1];
  const have = new Set(dates);
  const gaps: string[] = [];
  for (let c = addDays(min, 1); c < max; c = addDays(c, 1)) if (!have.has(c)) gaps.push(c);
  const behind = daysBetween(max, today);
  const parts: string[] = [];
  if (gaps.length) parts.push(`gaps ${ranges(gaps)}`);
  if (behind > 0) parts.push(`${dLabel(addDays(max, 1))} – ${dLabel(today)}`);
  const status = gaps.length ? "gap" : behind > 1 ? "behind" : "ok";
  const spanDays = Math.max(1, daysBetween(min, today));
  const greenPct = (daysBetween(min, max) / spanDays) * 100;
  return (
    <Row name={def.label} status={status}
      have={`${dLabel(min)} – ${dLabel(max)}${gaps.length ? " · has gaps" : ""}`}
      next={parts.length ? parts.join(" · ") : "up to date"}
      bar={<div style={{ position: "relative", height: 8, background: "var(--surface-1)", borderRadius: 4, overflow: "hidden", width: 90 }}>
        <div style={{ position: "absolute", left: 0, width: `${greenPct}%`, top: 0, bottom: 0, background: gaps.length ? "#F0A93A" : "#4FC79E" }} />
      </div>} />
  );
}

function MonthlyRow({ def, dates, today }: { def: StreamDef; dates: string[]; today: string }) {
  const months = [...new Set(dates.map(mKey))].sort();
  const thisM = mKey(today);
  const lastComplete = prevM(thisM, 1);
  if (!months.length) return <Row name={def.label} status="none" have="nothing yet" next={`pull ${mLabel(lastComplete)}`} />;
  const have = new Set(months);
  const missing: string[] = [];
  // missing months between earliest and last complete
  for (let m = months[0]; m <= lastComplete; m = prevM(m, -1)) if (!have.has(m)) missing.push(m);
  const nextMonth = have.has(lastComplete) ? null : lastComplete;
  const parts: string[] = [];
  if (nextMonth) parts.push(mLabel(nextMonth));
  const backfill = missing.filter((m) => m !== nextMonth);
  const status = missing.length ? "gap" : "ok";
  return (
    <Row name={def.label} status={status}
      have={months.map(mLabel).join(", ")}
      next={parts.length || backfill.length ? [...parts, backfill.length ? `backfill ${backfill.map(mLabel).join(", ")}` : ""].filter(Boolean).join(" · ") : "up to date"} />
  );
}

function Row({ name, status, have, next, bar }: { name: string; status: string; have: string; next: string; bar?: React.ReactNode }) {
  const dot = status === "ok" ? "#4FC79E" : status === "behind" ? "#F0A93A" : status === "gap" ? "#E8615F" : "#C9CFCB";
  const upToDate = next === "up to date";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 90px 1.6fr 1.8fr", gap: 10, padding: "8px 14px", borderTop: "0.5px solid var(--border)", fontSize: 12, alignItems: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--text-primary)" }}><span style={{ width: 7, height: 7, borderRadius: 4, background: dot }} />{name}</span>
      <span>{bar ?? <span style={{ fontSize: 10, color: "var(--text-muted)" }}>monthly</span>}</span>
      <span style={{ color: "var(--text-secondary)" }}>{have}</span>
      <span style={{ color: upToDate ? "var(--text-muted)" : "#0F6E56", fontWeight: upToDate ? 400 : 500 }}>{upToDate ? "up to date" : `download: ${next}`}</span>
    </div>
  );
}

export default function CoveragePanel() {
  const [cov, setCov] = useState<Coverage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/coverage").then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else setCov(j); }).catch(() => setErr("Could not load coverage."));
  }, []);

  if (err) return <div style={{ fontSize: 12, color: "var(--pause-fg)", marginBottom: 16 }}>Coverage: {err}</div>;
  if (!cov) return <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Loading coverage…</div>;

  const groups = [...new Set(STREAMS.map((s) => s.group))];
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surface-1)", cursor: "pointer" }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Data coverage · what to download next</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>today {dLabel(cov.today)}{cov.last_upload ? ` · last ingest ${dLabel(cov.last_upload.slice(0, 10))}` : ""} · {open ? "hide" : "show"}</span>
      </div>
      {open && groups.map((g) => (
        <div key={g}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 14px 2px", borderTop: "0.5px solid var(--border)", background: "var(--surface-2)" }}>{g}</div>
          {STREAMS.filter((s) => s.group === g).map((s) =>
            s.kind === "daily"
              ? <DailyRow key={s.key} def={s} dates={cov.streams[s.key] ?? []} today={cov.today} />
              : <MonthlyRow key={s.key} def={s} dates={cov.streams[s.key] ?? []} today={cov.today} />
          )}
        </div>
      ))}
    </div>
  );
}
