import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import ListingClient from "../listing-client";
import type { BusinessMonthlyRow } from "@/lib/reports/listing";
import type { AccountDailyRow } from "@/lib/reports/account";

export const dynamic = "force-dynamic";

async function getBusinessRows(): Promise<BusinessMonthlyRow[]> {
  try {
    const db = supabaseAdmin();
    const all: BusinessMonthlyRow[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await db
        .from("pulse_business_monthly")
        .select("period, asin, sku, title, ordered_product_sales, units_ordered, sessions, featured_offer_pct")
        .order("period", { ascending: true })
        .range(from, from + size - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as BusinessMonthlyRow[]));
      if (data.length < size) break;
    }
    return all;
  } catch { return []; }
}

async function getAccountRows(): Promise<AccountDailyRow[]> {
  try {
    const db = supabaseAdmin();
    const all: AccountDailyRow[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await db
        .from("pulse_daily_account")
        .select("date, ordered_product_sales, units_ordered, total_order_items, page_views, sessions, avg_offer_count, sale_participation, discount_pct")
        .order("date", { ascending: true })
        .range(from, from + size - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as unknown as AccountDailyRow[]));
      if (data.length < size) break;
    }
    return all;
  } catch { return []; }
}

export default async function ListingPage() {
  const [businessRows, accountRows] = await Promise.all([getBusinessRows(), getAccountRows()]);
  return <ListingClient businessRows={businessRows} accountRows={accountRows} />;
}
