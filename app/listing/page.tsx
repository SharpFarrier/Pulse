import { supabaseAdmin } from "@/lib/reports/supabaseStore";
import ListingClient from "../listing-client";
import type { BusinessMonthlyRow } from "@/lib/reports/listing";

export const dynamic = "force-dynamic";

async function getBusinessRows(): Promise<BusinessMonthlyRow[]> {
  try {
    const db = supabaseAdmin();
    const all: BusinessMonthlyRow[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await db
        .from("pulse_business_monthly")
        .select("period, asin, sku, title, ordered_product_sales, units_ordered")
        .order("period", { ascending: true })
        .range(from, from + size - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as BusinessMonthlyRow[]));
      if (data.length < size) break;
    }
    return all;
  } catch { return []; }
}

export default async function ListingPage() {
  const rows = await getBusinessRows();
  return <ListingClient rows={rows} />;
}
