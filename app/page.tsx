import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import PreviewClient from "./preview-client";
import type { CampaignDailyRow } from "@/lib/reports/preview";

export const dynamic = "force-dynamic";

async function getCampaignRows(): Promise<CampaignDailyRow[]> {
  try {
    const db = supabaseAdmin();
    const all: CampaignDailyRow[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await db
        .from("pulse_campaign_daily")
        .select("date, campaign_name, ad_product, impressions, clicks, spend, sales, orders")
        .order("date", { ascending: true })
        .range(from, from + size - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as CampaignDailyRow[]));
      if (data.length < size) break;
    }
    return all;
  } catch {
    return [];
  }
}

export default async function Home() {
  const rows = await getCampaignRows();
  return <PreviewClient rows={rows} />;
}
