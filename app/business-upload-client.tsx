"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, Info, Loader2, CalendarClock } from "lucide-react";
import { parseBusinessReport, BusinessParseError, type ParsedBusiness } from "@/lib/reports/business";
import { MonthPicker } from "./drum-picker";
import type { RecentUpload } from "./upload-client";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const inr = (n: number) => n >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
function monthLabel(p: string) { const [y, m] = p.split("-").map(Number); return `${MONTHS_SHORT[m-1]} ${y}`; }
function prevMonth(p: string, n: number) { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m-1-n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; }

interface Staged { parsed: ParsedBusiness; period: string; } // period 'YYYY-MM'

export default function BusinessUploadClient({ recent }: { recent: RecentUpload[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const now = new Date();
  const lastMonth = prevMonth(`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`, 1);

  const handleFiles = useCallback(async (fl: File[]) => {
    setSaved(null); setErrors([]);
    if (fl.length === 0) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const staged: Staged[] = [];
    const errs: string[] = [];
    let idx = files.length;
    for (const f of fl) {
      try {
        const parsed = parseBusinessReport(new Uint8Array(await f.arrayBuffer()), f.name);
        staged.push({ parsed, period: prevMonth(lastMonth, idx) }); // backfill: newest = last month, then back
        idx++;
      } catch (e) { errs.push(e instanceof BusinessParseError ? e.message : `${f.name}: could not read file`); }
    }
    setFiles((prev) => [...prev, ...staged]);
    setErrors(errs);
    setBusy(false);
  }, [files.length, lastMonth]);

  const periods = files.map((s) => s.period);
  const dupes = periods.filter((p, i) => periods.indexOf(p) !== i);
  const canSave = files.length > 0 && dupes.length === 0 && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true); setErrors([]);
    try {
      let total = 0;
      for (const s of files) {
        const res = await fetch("/api/business-commit", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ period: `${s.period}-01`, filename: s.parsed.filename, rows: s.parsed.rows }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "save failed");
        total += j.inserted;
      }
      setSaved(`Saved ${total.toLocaleString("en-IN")} SKU rows across ${files.length} month${files.length>1?"s":""}.`);
      setFiles([]); router.refresh();
    } catch (e) { setErrors([e instanceof Error ? e.message : "save failed"]); }
    finally { setSaving(false); }
  }, [canSave, files, router]);

  const businessRecent = recent.filter((u) => u.report_types.includes("business"));
  const card: React.CSSProperties = { border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 500 }}>Business report · listing & revenue</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2, marginBottom: 18 }}>Drop your Amazon Business reports (by ASIN). The report has no date, so set each file&apos;s month.</div>

      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `1px dashed ${dragOver ? "var(--good-cell)" : "var(--border-strong)"}`, borderRadius: 12, padding: "1.9rem 1rem", textAlign: "center", background: dragOver ? "var(--good-bg)" : "var(--surface-1)", marginBottom: "1.25rem", cursor: "pointer" }}>
        <Upload size={24} color="var(--text-secondary)" />
        <div style={{ fontSize: 14, marginTop: 8 }}>Drop one or more Business reports</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>CSV or XLSX · set a month per file · one month at a time is safest</div>
        <input ref={inputRef} type="file" multiple accept=".csv,.xlsx,.xls" hidden onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
      </div>

      {busy && <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}><Loader2 size={16} className="spin" /> Reading…</div>}

      {files.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Files — set each month</div>
          <div style={{ ...card, marginBottom: 16 }}>
            {files.map((s, i) => {
              const isDupe = periods.indexOf(s.period) !== i || periods.lastIndexOf(s.period) !== i;
              return (
                <div key={i} style={{ borderTop: i ? "0.5px solid var(--border)" : "none" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1fr 0.3fr", gap: 8, padding: "11px 14px", fontSize: 13, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.parsed.filename}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{s.parsed.rows.length} SKUs · {inr(s.parsed.revenue)}</span>
                    <button onClick={() => setOpenPicker(openPicker === i ? null : i)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, borderRadius: "var(--radius)", padding: "5px 12px", cursor: "pointer", background: isDupe ? "var(--pause-bg)" : "var(--surface-1)", color: isDupe ? "var(--pause-fg)" : "var(--text-primary)", border: "0.5px solid var(--border)" }}>
                      <CalendarClock size={14} /> {monthLabel(s.period)}
                    </button>
                    <span style={{ textAlign: "right", color: "var(--good-fg)" }}><Check size={15} /></span>
                  </div>
                  {openPicker === i && (
                    <div style={{ padding: "0 14px 14px 14px" }}>
                      <MonthPicker value={s.period} minYear={now.getUTCFullYear() - 3} maxYear={now.getUTCFullYear()}
                        onChange={(v) => setFiles((prev) => prev.map((x, j) => j === i ? { ...x, period: v } : x))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {dupes.length > 0 && <div style={{ fontSize: 13, color: "var(--pause-fg)", marginBottom: 10 }}>Two files are set to the same month ({[...new Set(dupes)].map(monthLabel).join(", ")}). Give each file a distinct month before saving.</div>}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            <Info size={14} style={{ marginTop: 1 }} /><span>Re-uploading a month replaces that month&apos;s data (last-write-wins).</span>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button onClick={save} disabled={!canSave} style={{ background: canSave ? "var(--text-primary)" : "var(--border-strong)", color: "var(--surface-2)", border: "none", borderRadius: "var(--radius)", padding: "9px 18px", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Accept and save"}</button>
            <button onClick={() => { setFiles([]); setOpenPicker(null); }} disabled={saving} style={{ background: "transparent", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, color: "var(--text-primary)" }}>Cancel</button>
          </div>
        </>
      )}

      {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: "var(--pause-fg)", marginBottom: 6 }}>{e}</div>)}
      {saved && <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--good-bg)", color: "var(--good-fg)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13, marginBottom: 24 }}><Check size={16} /> {saved}</div>}

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Recent business uploads</div>
      <div style={card}>
        {businessRecent.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No business uploads yet.</div>
          : businessRecent.map((u, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gap: 8, padding: "10px 14px", borderTop: i ? "0.5px solid var(--border)" : "none", fontSize: 13 }}>
              <span>{new Date(u.uploaded_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ color: "var(--text-secondary)" }}>{monthLabel(u.date_range_start.slice(0, 7))}</span>
              <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{u.row_count.toLocaleString("en-IN")} SKUs</span>
            </div>
          ))}
      </div>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
