import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AnyRow } from "./types";
import type { Store, UploadMeta } from "./ingest";
import { COLUMNS } from "./ingest";

// Real Store backed by Supabase. Use the SERVICE ROLE key — server-side only,
// never expose it to the browser. Reuses the shared project that AdsLens /
// DispatchLens already use; Pulse only writes its own pulse_ tables.
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const CHUNK = 500;

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient = supabaseAdmin()) {}

  async createUpload(meta: UploadMeta): Promise<string> {
    const { data, error } = await this.db
      .from("pulse_uploads")
      .insert({
        uploaded_by: meta.uploaded_by ?? null,
        report_types: meta.report_types,
        source_filenames: meta.source_filenames,
        date_range_start: meta.date_range_start,
        date_range_end: meta.date_range_end,
        row_count: meta.row_count,
      })
      .select("id")
      .single();
    if (error) throw new Error(`createUpload: ${error.message}`);
    return data!.id as string;
  }

  async deleteRange(table: string, start: string, end: string): Promise<number> {
    const { data, error } = await this.db
      .from(table)
      .delete()
      .gte("date", start)
      .lte("date", end)
      .select("id");
    if (error) throw new Error(`deleteRange ${table}: ${error.message}`);
    return data?.length ?? 0;
  }

  async insertRows(table: string, rows: AnyRow[], uploadId: string): Promise<number> {
    const cols = COLUMNS[table];
    if (!cols) throw new Error(`insertRows: unknown table ${table}`);
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => {
        const src = r as unknown as Record<string, unknown>;
        const clean: Record<string, unknown> = { upload_id: uploadId };
        for (const c of cols) {
          if (src[c] !== undefined) clean[c] = src[c];
        }
        return clean;
      });
      const { error } = await this.db.from(table).insert(chunk);
      if (error) throw new Error(`insertRows ${table}: ${error.message}`);
      inserted += chunk.length;
    }
    return inserted;
  }
}
