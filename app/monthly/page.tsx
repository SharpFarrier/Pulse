import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import MonthlyClient from "../monthly-client";
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

async function getBusinessRevenue(): Promise<Record<string, number>> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("pulse_business_monthly").select("period, ordered_product_sales");
    if (error || !data) return {};
    const m: Record<string, number> = {};
    for (const r of data as { period: string; ordered_product_sales: number }[]) {
      const k = (r.period as string).slice(0, 7);
      m[k] = (m[k] ?? 0) + (r.ordered_product_sales || 0);
    }
    return m;
  } catch { return {}; }
}

export default async function MonthlyPage() {
  const [rows, businessRevenue] = await Promise.all([getCampaignRows(), getBusinessRevenue()]);
  return <MonthlyClient rows={rows} businessRevenue={businessRevenue} />;
}
