import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/reports/supabaseStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().rpc("pulse_coverage");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "coverage failed" }, { status: 500 });
  }
}
