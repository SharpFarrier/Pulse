import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/reports/supabaseStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Writes ONLY the annotation columns (sale_participation, discount_pct) for one
// or more dates. Upsert on date leaves the metric columns untouched. If a date
// has no metric row yet, a row is created with the table's metric defaults.
interface Annot { date: string; sale_participation?: boolean; discount_pct?: number | null; }

export async function POST(req: NextRequest) {
  let body: { annotations?: Annot[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const annotations = body.annotations;
  if (!Array.isArray(annotations) || annotations.length === 0) return NextResponse.json({ error: "No annotations." }, { status: 400 });
  for (const a of annotations) if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return NextResponse.json({ error: `Bad date: ${a.date}` }, { status: 400 });

  try {
    const db = supabaseAdmin();
    const clean = annotations.map((a) => {
      const o: Record<string, unknown> = { date: a.date, updated_at: new Date().toISOString() };
      if (a.sale_participation !== undefined) o.sale_participation = !!a.sale_participation;
      if (a.discount_pct !== undefined) o.discount_pct = a.discount_pct;
      return o;
    });
    const { error } = await db.from("pulse_daily_account").upsert(clean, { onConflict: "date" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ updated: clean.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "annotate failed" }, { status: 500 });
  }
}
