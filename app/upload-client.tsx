"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, ShieldCheck, ShieldAlert, Info, Loader2 } from "lucide-react";

const REPORT_LABEL: Record<string, string> = {
  campaign: "Campaign",
  targeting: "Targeting",
  search_term: "Search-term",
  advertised_product: "Advertised-product",
};

export interface RecentUpload {
  uploaded_at: string;
  report_types: string[];
  date_range_start: string;
  date_range_end: string;
  row_count: number;
}

interface PerType {
  reportType: string;
  label: string;
  filename: string;
  rows: number;
}
interface Summary {
  ok: boolean;
  errors: string[];
  warnings: string[];
  hasCampaignReport: boolean;
  dateStart: string | null;
  dateEnd: string | null;
  perType: PerType[];
  totalRows: number;
}

function fmtDate(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function UploadClient({ recent }: { recent: RecentUpload[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const preview = useCallback(async (fs: File[]) => {
    setFiles(fs);
    setSaved(null);
    setSummary(null);
    if (fs.length === 0) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fs.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      setSummary(json.summary ?? { ok: false, errors: [json.error ?? "Upload failed"], warnings: [], hasCampaignReport: false, dateStart: null, dateEnd: null, perType: [], totalRows: 0 });
    } catch {
      setSummary({ ok: false, errors: ["Could not reach the server."], warnings: [], hasCampaignReport: false, dateStart: null, dateEnd: null, perType: [], totalRows: 0 });
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    preview(Array.from(e.dataTransfer.files));
  }, [preview]);

  const acceptAndSave = useCallback(async () => {
    if (!summary?.ok || files.length === 0) return;
    setCommitting(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload?commit=1", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok && json.result) {
        setSaved(`Saved ${json.result.inserted.toLocaleString("en-IN")} rows · ${fmtDate(json.result.dateStart)} – ${fmtDate(json.result.dateEnd)}${json.result.deleted ? ` · replaced ${json.result.deleted} superseded` : ""}`);
        setFiles([]);
        setSummary(null);
        router.refresh();
      } else {
        setSummary((s) => s ? { ...s, ok: false, errors: [json.error ?? "Save failed"] } : s);
      }
    } finally {
      setCommitting(false);
    }
  }, [summary, files, router]);

  const card: React.CSSProperties = { border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" };
  const gridCols = "1.6fr 1.2fr 0.7fr 0.6fr";

  return (
    <div>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 20, fontWeight: 500 }}>Pulse · Amazon ads ingestion</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
          Drop your Sponsored Products reports to accept a new snapshot
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragOver ? "var(--good-cell)" : "var(--border-strong)"}`,
          borderRadius: 12, padding: "1.9rem 1rem", textAlign: "center",
          background: dragOver ? "var(--good-bg)" : "var(--surface-1)",
          marginBottom: "1.25rem", cursor: "pointer",
        }}
      >
        <Upload size={24} color="var(--text-secondary)" />
        <div style={{ fontSize: 14, marginTop: 8 }}>Drop Campaign, Targeting, Search-term and Advertised-product reports</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>XLSX or CSV · daily grain · multiple files at once</div>
        <input
          ref={inputRef} type="file" multiple accept=".csv,.xlsx,.xls" hidden
          onChange={(e) => preview(Array.from(e.target.files ?? []))}
        />
      </div>

      {busy && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: "1.25rem" }}>
          <Loader2 size={16} className="spin" /> Reading reports…
        </div>
      )}

      {summary && (
        <>
          {summary.perType.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Detected files</div>
              <div style={{ ...card, marginBottom: "1.25rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "9px 14px", background: "var(--surface-1)", fontSize: 12, color: "var(--text-muted)" }}>
                  <span>File</span><span>Detected as</span><span style={{ textAlign: "right" }}>Rows</span><span style={{ textAlign: "right" }}>Status</span>
                </div>
                {summary.perType.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "11px 14px", borderTop: "0.5px solid var(--border)", fontSize: 13, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.filename}</span>
                    <span>{REPORT_LABEL[p.reportType] ?? p.reportType}{p.reportType === "campaign" && (
                      <span style={{ fontSize: 11, color: "var(--good-fg)", background: "var(--good-bg)", borderRadius: "var(--radius)", padding: "1px 6px", marginLeft: 6 }}>totals</span>
                    )}</span>
                    <span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{p.rows.toLocaleString("en-IN")}</span>
                    <span style={{ textAlign: "right", color: "var(--good-fg)" }}><Check size={15} /></span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: summary.hasCampaignReport ? "var(--good-bg)" : "var(--pause-bg)", borderRadius: "var(--radius)", padding: "9px 12px", marginBottom: "1.25rem" }}>
            {summary.hasCampaignReport
              ? <><ShieldCheck size={18} color="var(--good-fg)" /><span style={{ fontSize: 13, color: "var(--good-fg)" }}>Campaign report present — headline totals will tie to Amazon</span></>
              : <><ShieldAlert size={18} color="var(--pause-fg)" /><span style={{ fontSize: 13, color: "var(--pause-fg)" }}>No Campaign report — add it before saving so totals tie to Amazon</span></>}
          </div>

          {summary.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--pause-fg)", marginBottom: 6 }}>{e}</div>
          ))}
          {summary.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--okay-fg)", marginBottom: 6 }}>{w}</div>
          ))}

          {summary.perType.length > 0 && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 2px 2px", fontSize: 13, color: "var(--text-secondary)" }}>
              <span><b style={{ fontWeight: 500, color: "var(--text-primary)" }}>{summary.totalRows.toLocaleString("en-IN")}</b> rows staged</span>
              {summary.dateStart && summary.dateEnd && (
                <span>range <b style={{ fontWeight: 500, color: "var(--text-primary)" }}>{fmtDate(summary.dateStart)} – {fmtDate(summary.dateEnd)}</b></span>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--text-muted)", margin: "10px 2px 1.25rem" }}>
            <Info size={14} style={{ marginTop: 1 }} />
            <span>Overlapping dates replace the earlier upload (last-write-wins); the old snapshot stays in the log.</span>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: "2rem" }}>
            <button
              onClick={acceptAndSave}
              disabled={!summary.ok || committing}
              style={{ background: summary.ok ? "var(--text-primary)" : "var(--border-strong)", color: "var(--surface-2)", border: "none", borderRadius: "var(--radius)", padding: "9px 18px", fontSize: 13, fontWeight: 500, opacity: committing ? 0.7 : 1 }}
            >
              {committing ? "Saving…" : "Accept and save"}
            </button>
            <button
              onClick={() => { setFiles([]); setSummary(null); }}
              style={{ background: "transparent", border: "0.5px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "9px 16px", fontSize: 13, color: "var(--text-primary)" }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {saved && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--good-bg)", color: "var(--good-fg)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13, marginBottom: "2rem" }}>
          <Check size={16} /> {saved}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Recent uploads · pulse_uploads</div>
      <div style={card}>
        {recent.length === 0 ? (
          <div style={{ padding: "14px", fontSize: 13, color: "var(--text-muted)" }}>No uploads yet.</div>
        ) : recent.map((u, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.4fr 1.1fr 0.7fr", gap: 8, padding: "10px 14px", borderTop: i ? "0.5px solid var(--border)" : "none", fontSize: 13 }}>
            <span>{fmtDateTime(u.uploaded_at)}</span>
            <span style={{ color: "var(--text-secondary)" }}>{u.report_types.map((t) => REPORT_LABEL[t] ?? t).join(", ")}</span>
            <span style={{ color: "var(--text-secondary)" }}>{fmtDate(u.date_range_start)} – {fmtDate(u.date_range_end)}</span>
            <span style={{ color: "var(--text-secondary)", textAlign: "right" }}>{u.row_count.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>

      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
