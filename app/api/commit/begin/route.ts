import { NextRequest, NextResponse } from "next/server";
import { SupabaseStore } from "@/lib/reports/supabaseStore";
import { TABLE } from "@/lib/reports/ingest";
import type { ReportType } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TABLES = new Set(Object.values(TABLE));

interface BeginBody {
  reportTypes: ReportType[];
  filenames: string[];
  dateStart: string;
  dateEnd: string;
  totalRows: number;
  ranges: { table: string; dateStart: string; dateEnd: string }[];
}

export async function POST(req: NextRequest) {
  let body: BeginBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!body.reportTypes?.includes("campaign")) {
    return NextResponse.json(
      { error: "No Campaign report in this batch — totals come only from the Campaign report." },
      { status: 400 }
    );
  }
  for (const r of body.ranges ?? []) {
    if (!VALID_TABLES.has(r.table)) {
      return NextResponse.json({ error: `Unknown table ${r.table}` }, { status: 400 });
    }
  }

  try {
    const store = new SupabaseStore();
    const uploadId = await store.createUpload({
      report_types: body.reportTypes,
      source_filenames: body.filenames,
      date_range_start: body.dateStart,
      date_range_end: body.dateEnd,
      row_count: body.totalRows,
    });
    let deleted = 0;
    for (const r of body.ranges) {
      deleted += await store.deleteRange(r.table, r.dateStart, r.dateEnd);
    }
    return NextResponse.json({ uploadId, deleted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "begin failed" },
      { status: 500 }
    );
  }
}
