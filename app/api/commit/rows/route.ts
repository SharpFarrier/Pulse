import { NextRequest, NextResponse } from "next/server";
import { SupabaseStore } from "@/lib/reports/supabaseStore";
import { TABLE } from "@/lib/reports/ingest";
import type { AnyRow } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TABLES = new Set(Object.values(TABLE));

interface RowsBody {
  uploadId: string;
  table: string;
  rows: AnyRow[];
}

export async function POST(req: NextRequest) {
  let body: RowsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!body.uploadId) return NextResponse.json({ error: "Missing uploadId" }, { status: 400 });
  if (!VALID_TABLES.has(body.table)) {
    return NextResponse.json({ error: `Unknown table ${body.table}` }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows" }, { status: 400 });
  }

  try {
    const store = new SupabaseStore();
    const inserted = await store.insertRows(body.table, body.rows, body.uploadId);
    return NextResponse.json({ inserted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "insert failed" },
      { status: 500 }
    );
  }
}
