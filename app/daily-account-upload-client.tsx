"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, Info, Loader2 } from "lucide-react";
import { parseDailyAccountReport, DailyAccountParseError, type ParsedDailyAccount } from "@/lib/reports/dailyAccount";
import type { RecentUpload } from "./upload-client";

const inr = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtD = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function DailyAccountUploadClient({ recent }: { recent: RecentUpload[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ParsedDailyAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = useCallback(async (fl: File[]) => {
    setSaved(null); setErrors([]);
    if (fl.length === 0) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const staged: ParsedDailyAccount[] = [];
    const errs: string[] = [];
    for (const f of fl) {
      try { staged.push(parseDailyAccountReport(new Uint8Array(await f.arrayBuffer()), f.name)); }
      catch (e) { errs.push(e instanceof DailyAccountParseError ? e.message : `${f.name}: could not read file`); }
    }
    setFiles((prev) => [...prev, ...staged]);
    setErrors(errs);
    setBusy(false);
  }, []);

  const totalRows = files.reduce((s, f) => s + f.rows.length, 0);
  const canSave = files.length > 0 && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true); setErrors([]);
    try {
      let total = 0;
      for (const f of files) {
        const res = await fetch("/api/daily-account-commit", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: f.filename, rows: f.rows }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "save failed");
        total += j.inserted;
      }
      setSaved(`Saved ${total.toLocaleString("en-IN")} day${total > 1 ? "s" : ""} of account data.`);
      setFiles([]); router.refresh();
    } catch (e) { setErrors([e instanceof Error ? e.message : "save failed"]); }
    finally { setSaving(false); }
  }, [canSave, files, router]);

  const daRecent = recent.filter((u) => u.report_types.includes("daily_account"));
  const card: React.CSSProperties = { border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 500 }}>Account daily · sales &amp; traffic by date</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2, marginBottom: 18 }}>Drop the Business report you download by date (the whole-account one). It already carries its dates — no month to set. Re-uploading a day replaces it; sale-day flags you set in Pulse are kept.</div>

      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `1px dashed ${dragOver ? "var(--good-cell)" : "var(--border-strong)"}`, borderRadius: 12, padding: "1.9rem 1rem", textAlign: "center", background: dragOver ? "var(--good-bg)" : "var(--surface-1)", marginBottom: "1.25rem", cursor: "pointer" }}>
        <Upload size={24} color="var(--text-secondary)" />
        <div style={{ fontSize: 14, marginTop: 8 }}>Drop your “by date” Business report</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>CSV or XLSX · covers any date range · multiple files fine</div>
        <input ref={inputRef} type="file" multiple accept=".csv,.xlsx,.xls" hidden onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
      </div>

      {busy && <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}><Loader2 size={16} className="spin" /> Reading…</div>}

      {files.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Files</div>
          <div style={{ ...card, marginBottom: 16 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1fr 0.3fr", gap: 8, padding: "11px 14px", fontSize: 13, alignItems: "center", borderTop: i ? "0.5px solid var(--border)" : "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</span>
                <span style={{ color: "var(--text-secondary)" }}>{fmtD(f.dateStart)} → {fmtD(f.dateEnd)}</span>
                <span style={{ color: "var(--text-secondary)" }}>{f.rows.length} days · {inr(f.revenue)}</span>
                <span style={{ textAlign: "right", color: "var(--good-fg)" }}><Check size={15} /></span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            <Info size={14} style={{ marginTop: 1 }} /><span>Re-uploading a date replaces that day (last-write-wins). Your sale-day and discount annotations are preserved.</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button onClick={save} disabled={!canSave} style={{ background: canSave ? "var(--text-primary)" : "var(--border-strong)", color: "var(--surface-2)", border: "none", borderRadius: "var(--radius)", padding: "9px 18px", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : `Accept and save ${totalRows} day${totalRows > 1 ? "s" : ""}`}</button>
            <button onClick={() => setFiles([])} disabled={saving} style={{ background: "transparent", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, color: "var(--text-primary)" }}>Cancel</button>
          </div>
        </>
      )}

      {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: "var(--pause-fg)", marginBottom: 6 }}>{e}</div>)}
      {saved && <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--good-bg)", color: "var(--good-fg)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13, marginBottom: 24 }}><Check size={16} /> {saved}</div>}

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Recent account uploads</div>
      <div style={card}>
        {daRecent.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No account uploads yet.</div>
          : daRecent.map((u, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 0.7fr", gap: 8, padding: "10px 14px", borderTop: i ? "0.5px solid var(--border)" : "none", fontSize: 13 }}>
              <span>{new Date(u.uploaded_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ color: "var(--text-secondary)" }}>{fmtD(u.date_range_start)} → {fmtD(u.date_range_end)}</span>
              <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{u.row_count.toLocaleString("en-IN")} days</span>
            </div>
          ))}
      </div>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
