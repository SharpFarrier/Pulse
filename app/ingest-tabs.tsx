"use client";
import { useState } from "react";
import UploadClient, { type RecentUpload } from "./upload-client";
import BusinessUploadClient from "./business-upload-client";

export default function IngestTabs({ recent }: { recent: RecentUpload[] }) {
  const [mode, setMode] = useState<"ads" | "business">("ads");
  const tabs: [typeof mode, string][] = [["ads", "Advertising"], ["business", "Business report"]];
  return (
    <div>
      <div style={{ display: "inline-flex", gap: 4, background: "var(--surface-1)", borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{ fontSize: 13, fontWeight: mode === k ? 500 : 400, color: mode === k ? "var(--surface-2)" : "var(--text-secondary)", background: mode === k ? "var(--text-primary)" : "transparent", border: "none", borderRadius: 8, padding: "6px 16px", cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      {mode === "ads" ? <UploadClient recent={recent} /> : <BusinessUploadClient recent={recent} />}
    </div>
  );
}
