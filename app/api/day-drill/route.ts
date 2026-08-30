import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import { acos } from "@/lib/reports/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_LIMIT = 50;
const TERM_LIMIT = 25;

interface Agg { spend: number; sales: number; orders: number; }
function bump(m: Map<string, Agg & { label: string; match_type: string }>, key: string, label: string, match_type: string, r: { spend?: number; sales?: number; orders?: number }) {
  const a = m.get(key) ?? { spend: 0, sales: 0, orders: 0, label, match_type };
  a.spend += r.spend || 0; a.sales += r.sales || 0; a.orders += r.orders || 0;
  m.set(key, a);
}

export async function POST(req: NextRequest) {
  let body: { campaign?: string; date?: string; target?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const { campaign, date, target } = body;
  if (!campaign || !date) return NextResponse.json({ error: "campaign and date required" }, { status: 400 });

  const db = supabaseAdmin();

  try {
    if (target === undefined) {
      // Target breakdown for this campaign + day
      const { data, error } = await db
        .from("pulse_target_daily")
        .select("target, match_type, spend, sales, orders")
        .eq("campaign_name", campaign)
        .eq("date", date)
        .limit(5000);
      if (error) throw new Error(error.message);
      const m = new Map<string, Agg & { label: string; match_type: string }>();
      let totalSpend = 0;
      for (const r of data ?? []) {
        totalSpend += r.spend || 0;
        bump(m, `${r.target}||${r.match_type}`, r.target, r.match_type ?? "", r);
      }
      const targets = [...m.values()]
        .map((a) => ({ target: a.label, match_type: a.match_type, spend: a.spend, sales: a.sales, orders: a.orders, acos: acos(a.spend, a.sales) }))
        .sort((x, y) => y.spend - x.spend)
        .slice(0, TARGET_LIMIT);
      return NextResponse.json({ targets, totalSpend, shown: targets.length, total: m.size });
    } else {
      // Search terms this target matched on this campaign + day
      const { data, error } = await db
        .from("pulse_search_term_daily")
        .select("search_term, match_type, spend, sales, orders")
        .eq("campaign_name", campaign)
        .eq("date", date)
        .eq("target", target)
        .limit(5000);
      if (error) throw new Error(error.message);
      const m = new Map<string, Agg & { label: string; match_type: string }>();
      for (const r of data ?? []) bump(m, r.search_term, r.search_term, r.match_type ?? "", r);
      const searchTerms = [...m.values()]
        .map((a) => ({ search_term: a.label, spend: a.spend, sales: a.sales, orders: a.orders, acos: acos(a.spend, a.sales) }))
        .sort((x, y) => y.spend - x.spend)
        .slice(0, TERM_LIMIT);
      return NextResponse.json({ searchTerms });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "drill failed" }, { status: 500 });
  }
}
