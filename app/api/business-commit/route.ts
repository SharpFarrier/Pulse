import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import type { BusinessRow } from "@/lib/reports/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = ["period", "parent_asin", "asin", "sku", "title", "sessions", "page_views", "featured_offer_pct", "units_ordered", "ordered_product_sales", "total_order_items"];

export async function POST(req: NextRequest) {
  let body: { period?: string; filename?: string; rows?: BusinessRow[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const { period, filename, rows } = body;
  if (!period || !/^\d{4}-\d{2}-01$/.test(period)) return NextResponse.json({ error: "A valid month (period) is required." }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No rows." }, { status: 400 });

  try {
    const db = supabaseAdmin();
    // month-end for the upload log
    const [y, m] = period.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const { data: up, error: upErr } = await db.from("pulse_uploads").insert({
      report_types: ["business"], source_filenames: [filename ?? "business.csv"],
      date_range_start: period, date_range_end: end, row_count: rows.length,
    }).select("id").single();
    if (upErr) throw new Error(upErr.message);
    const uploadId = up!.id as string;

    // last-write-wins for this month
    const { data: del } = await db.from("pulse_business_monthly").delete().eq("period", period).select("id");

    const clean = rows.map((r) => {
      const o: Record<string, unknown> = { upload_id: uploadId, period };
      for (const c of COLS) if (c !== "period" && (r as unknown as Record<string, unknown>)[c] !== undefined) o[c] = (r as unknown as Record<string, unknown>)[c];
      return o;
    });
    const { error: insErr } = await db.from("pulse_business_monthly").upsert(clean, { onConflict: "period,asin" });
    if (insErr) {
      await db.from("pulse_uploads").delete().eq("id", uploadId); // don't leave a phantom log row
      throw new Error(insErr.message);
    }

    return NextResponse.json({ inserted: rows.length, deleted: del?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "commit failed" }, { status: 500 });
  }
}
