import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import UploadClient, { type RecentUpload } from "../upload-client";

export const dynamic = "force-dynamic";

async function getRecentUploads(): Promise<RecentUpload[]> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("pulse_uploads")
      .select("uploaded_at, report_types, date_range_start, date_range_end, row_count")
      .order("uploaded_at", { ascending: false })
      .limit(8);
    if (error || !data) return [];
    return data as RecentUpload[];
  } catch {
    return [];
  }
}

export default async function IngestPage() {
  const recent = await getRecentUploads();
  return <UploadClient recent={recent} />;
}
