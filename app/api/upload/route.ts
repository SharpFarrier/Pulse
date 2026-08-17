import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook, ReportParseError } from "@/lib/reports/parse";
import { stage, commit } from "@/lib/reports/ingest";
import { SupabaseStore } from "@/lib/reports/supabaseStore";
import type { ParsedReport } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const doCommit = req.nextUrl.searchParams.get("commit") === "1";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with files." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  const reports: ParsedReport[] = [];
  const parseErrors: string[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      reports.push(parseWorkbook(buf, file.name));
    } catch (e) {
      parseErrors.push(
        e instanceof ReportParseError ? e.message : `${file.name}: could not read file`
      );
    }
  }

  const summary = stage(reports);
  summary.errors.push(...parseErrors);
  if (parseErrors.length) summary.ok = false;

  if (!doCommit) {
    return NextResponse.json({ mode: "preview", summary });
  }

  if (!summary.ok) {
    return NextResponse.json({ mode: "commit", summary, error: "Not saved — fix the issues above." }, { status: 400 });
  }

  try {
    const result = await commit(reports, new SupabaseStore());
    return NextResponse.json({ mode: "commit", summary, result });
  } catch (e) {
    return NextResponse.json(
      { mode: "commit", summary, error: e instanceof Error ? e.message : "Commit failed" },
      { status: 500 }
    );
  }
}
