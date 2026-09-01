"use client";

import { useMemo, useState, useCallback } from "react";
import type { CampaignDailyRow } from "@/lib/reports/preview";
import { acos, roas } from "@/lib/reports/metrics";
import { ollamaChat, OllamaError, OLLAMA_MODEL } from "./llm-client";

const GREEN = "#0F6E56";

function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function agg(rows: CampaignDailyRow[], start: string, end: string, perCampaign: boolean) {
  const inr = rows.filter((r) => r.date >= start && r.date <= end);
  let spend = 0, sales = 0, orders = 0, clicks = 0;
  const byC = new Map<string, { spend: number; sales: number; orders: number }>();
  for (const r of inr) {
    spend += r.spend || 0; sales += r.sales || 0; orders += r.orders || 0; clicks += r.clicks || 0;
    if (perCampaign) { const a = byC.get(r.campaign_name) ?? { spend: 0, sales: 0, orders: 0 }; a.spend += r.spend || 0; a.sales += r.sales || 0; a.orders += r.orders || 0; byC.set(r.campaign_name, a); }
  }
  const r1 = (n: number) => Math.round(n);
  const blended = { spend: r1(spend), sales: r1(sales), orders, acos: acos(spend, sales), roas: roas(spend, sales) };
  const campaigns = perCampaign
    ? [...byC.entries()].map(([name, a]) => ({ name, spend: r1(a.spend), sales: r1(a.sales), orders: a.orders, acos: acos(a.spend, a.sales), roas: roas(a.spend, a.sales) })).sort((x, y) => y.spend - x.spend).slice(0, 15)
    : undefined;
  return { start, end, blended, campaigns };
}

const CHIPS = ["What's my ACOS for the last week?", "What's pulling ACOS up this week?", "Which campaigns improved vs last week?", "How is spend tracking vs the previous week?"];

export default function AskClient({ rows }: { rows: CampaignDailyRow[] }) {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ctx = useMemo(() => {
    if (rows.length === 0) return null;
    const maxDate = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
    return {
      currency: "INR", latestDate: maxDate,
      last7: agg(rows, addDays(maxDate, -6), maxDate, true),
      previousWeek: agg(rows, addDays(maxDate, -13), addDays(maxDate, -7), true),
      last30: agg(rows, addDays(maxDate, -29), maxDate, false),
    };
  }, [rows]);

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || !ctx || loading) return;
    setErr(null); setLoading(true); setQ("");
    const system = `You are Pulse, an assistant answering questions about this Amazon Advertising account using ONLY the JSON data provided. Amounts are INR. Lead with the number, be concise (2-5 sentences), and cite actual figures from the data. For "what's pulling ACOS up/down", compare last7 vs previousWeek per campaign and name the biggest movers with their figures. Thresholds: ACOS <=10% good, 10-20% okay, >20% high (ROAS >=10/5-10/<5). If the question needs data not in the JSON (specific search terms, months not shown), answer what you can and say what's out of scope. Do not invent numbers.`;
    try {
      const a = await ollamaChat(system, `DATA:\n${JSON.stringify(ctx)}\n\nQUESTION: ${question}`);
      setThread((t) => [...t, { q: question, a }]);
    } catch (e) { setErr(e instanceof OllamaError ? e.message : "Something went wrong."); }
    finally { setLoading(false); }
  }, [ctx, loading]);

  if (!ctx) {
    return <div><div style={{ fontSize: 20, fontWeight: 500 }}>Ask</div><div style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 14 }}>No data yet — ingest your reports first.</div></div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontSize: 20, fontWeight: 500 }}>Ask your ads</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2, marginBottom: 18 }}>Answered from your snapshot by Llama running on your Mac — nothing leaves your machine. Snapshot to {ctx.latestDate}.</div>

      {thread.map((t, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <span style={{ fontSize: 14, background: "var(--surface-1)", borderRadius: "14px 14px 4px 14px", padding: "9px 14px", maxWidth: "80%" }}>{t.q}</span>
          </div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", background: "var(--surface-2)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t.a}</div>
        </div>
      ))}

      {loading && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>Llama is thinking… (first question after a while can take a few seconds)</div>}
      {err && <div style={{ fontSize: 13, color: "var(--pause-fg)", marginBottom: 14 }}>{err}</div>}

      {thread.length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {CHIPS.map((c) => <button key={c} onClick={() => ask(c)} style={{ fontSize: 12, color: "var(--text-secondary)", border: "0.5px solid var(--border)", borderRadius: 16, padding: "6px 12px", background: "transparent", cursor: "pointer" }}>{c}</button>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", border: "0.5px solid var(--border-strong)", borderRadius: 12, padding: "6px 6px 6px 14px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
          placeholder="Ask about spend, ACOS, campaigns…" disabled={loading}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent", fontFamily: "var(--font-sans)", color: "var(--text-primary)" }} />
        <button onClick={() => ask(q)} disabled={loading || !q.trim()} style={{ background: "var(--text-primary)", color: "var(--surface-2)", border: "none", borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)", cursor: "pointer", opacity: loading || !q.trim() ? 0.5 : 1 }}>Ask</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Runs on {OLLAMA_MODEL} locally · campaign-level for now (search-term Q&A next)</div>
    </div>
  );
}
