import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import type { DailyAccountRow } from "@/lib/reports/dailyAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the metric columns — NOT sale_participation / discount_pct, which are
// Adi's annotations and must survive a CSV re-upload. An upsert updates just the
// columns in the payload, so omitting the annotations leaves them untouched.
const METRIC_COLS: (keyof DailyAccountRow)[] = [
  "ordered_product_sales", "units_ordered", "total_order_items", "avg_selling_price",
  "page_views", "sessions", "avg_offer_count", "ordered_product_sales_b2b", "units_ordered_b2b",
];

export async function POST(req: NextRequest) {
  let body: { filename?: string; rows?: DailyAccountRow[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const { filename, rows } = body;
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No rows." }, { status: 400 });

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (dates.length === 0) return NextResponse.json({ error: "No dated rows." }, { status: 400 });
  const start = dates[0], end = dates[dates.length - 1];

  try {
    const db = supabaseAdmin();
    const { data: up, error: upErr } = await db.from("pulse_uploads").insert({
      report_types: ["daily_account"], source_filenames: [filename ?? "business-by-date.csv"],
      date_range_start: start, date_range_end: end, row_count: rows.length,
    }).select("id").single();
    if (upErr) throw new Error(upErr.message);
    const uploadId = up!.id as string;

    const clean = rows.map((r) => {
      const o: Record<string, unknown> = { date: r.date, upload_id: uploadId, updated_at: new Date().toISOString() };
      for (const c of METRIC_COLS) if ((r as unknown as Record<string, unknown>)[c] !== undefined) o[c] = (r as unknown as Record<string, unknown>)[c];
      return o;
    });
    const { error: insErr } = await db.from("pulse_daily_account").upsert(clean, { onConflict: "date" });
    if (insErr) {
      await db.from("pulse_uploads").delete().eq("id", uploadId);
      throw new Error(insErr.message);
    }
    return NextResponse.json({ inserted: rows.length, start, end });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "commit failed" }, { status: 500 });
  }
}
