"use client";

import { useMemo, useState } from "react";
import { buildMatrix, type RangeCtx, type MatrixMetric, type MatrixCell } from "@/lib/reports/daybyday";

const METRICS: [MatrixMetric, string][] = [["acos", "ACOS %"], ["orders", "Orders"], ["spend", "Spend"], ["cpo", "Cost per order"]];
const dd = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" });

function cellStyle(c: MatrixCell, highlight: boolean): React.CSSProperties {
  const base: React.CSSProperties = { padding: "7px 4px", textAlign: "center", fontSize: 12, fontWeight: c.bold ? 600 : 400, borderLeft: highlight ? "2px solid var(--ink)" : "1px solid var(--bd)", borderTop: "1px solid var(--bd)" };
  if (c.tone === "worse") return { ...base, background: "var(--worsebg)", color: "var(--worsefg)" };
  if (c.tone === "better") return { ...base, background: "var(--betterbg)", color: "var(--betterfg)" };
  if (c.tone === "empty") return { ...base, background: "transparent", color: "var(--muted)", opacity: 0.4 };
  return { ...base, background: "var(--card)", color: "var(--ink)" };
}

export default function DbdMatrix({ ctx, selectedDate }: { ctx: RangeCtx; selectedDate: string }) {
  const [metric, setMetric] = useState<MatrixMetric>("acos");
  const m = useMemo(() => buildMatrix(ctx, metric), [ctx, metric]);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>All campaigns, all days</span>
        <div style={{ display: "inline-flex", gap: 3, background: "var(--bd)", borderRadius: 8, padding: 2 }}>
          {METRICS.map(([k, label]) => (
            <button key={k} onClick={() => setMetric(k)} style={{ fontSize: 12, fontWeight: metric === k ? 600 : 400, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", background: metric === k ? "var(--card)" : "transparent", color: "var(--ink)" }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `minmax(130px, 1.6fr) repeat(${m.days.length}, minmax(44px, 1fr))`, minWidth: 100 + m.days.length * 46 }}>
          <div style={{ padding: "7px 8px", fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--bd)", background: "var(--bg)" }}>Campaign</div>
          {m.days.map((d) => <div key={d} style={{ padding: "7px 4px", textAlign: "center", fontSize: 11, color: d === selectedDate ? "var(--ink)" : "var(--muted)", fontWeight: d === selectedDate ? 600 : 400, borderTop: "1px solid var(--bd)", borderLeft: d === selectedDate ? "2px solid var(--ink)" : "1px solid var(--bd)", background: "var(--bg)" }}>{dd(d)}</div>)}
          {m.rows.map((row) => (
            <div key={row.name} style={{ display: "contents" }}>
              <div style={{ padding: "7px 8px", fontSize: 12, borderTop: "1px solid var(--bd)", background: "var(--card)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
              {row.cells.map((c, i) => <div key={i} style={cellStyle(c, m.days[i] === selectedDate)}>{c.text}</div>)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--worsebg)", borderRadius: 2, verticalAlign: "middle" }} /> worse than its own average</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--betterbg)", borderRadius: 2, verticalAlign: "middle" }} /> better</span>
        <span>coloured against each campaign's own range average, not fixed thresholds</span>
      </div>
    </div>
  );
}
