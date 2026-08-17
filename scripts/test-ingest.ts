import { parseWorkbook } from "../lib/reports/parse";
import { stage, commit, TABLE, type Store, type UploadMeta } from "../lib/reports/ingest";
import { sumTotals, acos, verdictFromAcos } from "../lib/reports/metrics";
import type { AnyRow, ParsedReport } from "../lib/reports/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}  ${detail}`); }
}

function csv(rows: (string | number)[][]): Buffer {
  return Buffer.from(rows.map((r) => r.join(",")).join("\n"), "utf-8");
}

// --- Synthetic Amazon SP reports (batch 1) --------------------------------
const campaign1 = csv([
  ["Date","Campaign Name","Portfolio name","Ad Type","State","Budget","Impressions","Clicks","Spend","7 Day Total Sales","7 Day Total Orders (#)","7 Day Total Units (#)"],
  ["2026-08-11","Folding Beds","Beds","SP","enabled",2000,1000,50,1000,15000,3,3],
  ["2026-08-11","Trolley","Beds","SP","enabled",800,200,10,400,2000,1,1],
  ["2026-08-12","Folding Beds","Beds","SP","enabled",2000,1100,55,1100,16000,3,3],
  ["2026-08-12","Trolley","Beds","SP","enabled",800,150,8,500,0,0,0],          // spend, no sales
  ["Total","","","","","",2450,123,3000,33000,7,7],                             // Amazon trailing total row
]);

const targeting1 = csv([
  ["Date","Campaign Name","Ad Group Name","Targeting","Match Type","Impressions","Clicks","Spend","7 Day Total Sales","7 Day Total Orders (#)","Bid"],
  ["2026-08-11","Folding Beds","AG1","folding bed double","exact",600,30,700,9000,2,12],
  ["2026-08-11","Folding Beds","AG1","folding bed","phrase",400,20,800,6000,1,10],  // targeting spend > campaign on purpose
  ["2026-08-12","Folding Beds","AG1","folding bed double","exact",700,35,900,10000,2,12],
  ["2026-08-12","Trolley","AG2","trolley bed","exact",150,8,1800,0,0,9],
]);

const searchTerm1 = csv([
  ["Date","Campaign Name","Ad Group Name","Customer Search Term","Match Type","Impressions","Clicks","Spend","7 Day Total Sales","7 Day Total Orders (#)"],
  ["2026-08-12","Trolley","AG2","folding table steel","exact",120,6,320,0,0],
  ["2026-08-12","Trolley","AG2","study table foldable","exact",90,4,210,800,1],
]);

const product1 = csv([
  ["Date","Campaign Name","Ad Group Name","Advertised ASIN","Advertised SKU","Impressions","Clicks","Spend","7 Day Total Sales","7 Day Total Orders (#)"],
  ["2026-08-11","Folding Beds","AG1","B09Z6CZFPQ","HT-R-B-B-36-2IN",1000,50,1000,15000,3],
]);

console.log("1. Detection + parsing");
const p_campaign = parseWorkbook(campaign1, "Campaign_report.csv");
const p_target = parseWorkbook(targeting1, "Targeting_report.csv");
const p_search = parseWorkbook(searchTerm1, "Search_term_report.csv");
const p_product = parseWorkbook(product1, "Advertised_product.csv");
check("campaign report detected", p_campaign.reportType === "campaign", p_campaign.reportType);
check("targeting report detected", p_target.reportType === "targeting", p_target.reportType);
check("search-term report detected", p_search.reportType === "search_term", p_search.reportType);
check("advertised-product report detected", p_product.reportType === "advertised_product", p_product.reportType);
check("trailing 'Total' row skipped (4 data rows, not 5)", p_campaign.rows.length === 4, `got ${p_campaign.rows.length}`);
check("7-day sales alias mapped", (p_campaign.rows[0] as any).sales === 15000, String((p_campaign.rows[0] as any).sales));
check("date range parsed", p_campaign.dateStart === "2026-08-11" && p_campaign.dateEnd === "2026-08-12");

console.log("\n2. Totals come from the campaign report only");
const campTotals = sumTotals(p_campaign.rows as any);
const targetTotals = sumTotals(p_target.rows as any);
check("campaign spend total = 3000", campTotals.spend === 3000, String(campTotals.spend));
check("campaign sales total = 33000", campTotals.sales === 33000, String(campTotals.sales));
check("blended ACOS ~9.09%", Math.abs((acos(campTotals.spend, campTotals.sales) as number) - 9.0909) < 0.01);
check("targeting total differs from campaign (why it must not feed totals)", targetTotals.spend !== campTotals.spend, `targeting=${targetTotals.spend}`);

console.log("\n3. Undefined ACOS for spend-but-no-sales");
const trolley812 = (p_campaign.rows as any[]).find((r) => r.campaign_name === "Trolley" && r.date === "2026-08-12");
check("Trolley 08-12 has spend", trolley812.spend === 500);
check("Trolley 08-12 ACOS is null, not a huge number", acos(trolley812.spend, trolley812.sales) === null);
check("null ACOS verdicts as pause", verdictFromAcos(acos(trolley812.spend, trolley812.sales)) === "pause");

console.log("\n4. Accept gate");
const okStage = stage([p_campaign, p_target, p_search, p_product]);
check("batch with campaign report is ok", okStage.ok && okStage.hasCampaignReport);
const noCampaign = stage([p_target, p_search]);
check("batch without campaign report is rejected", noCampaign.ok === false);
check("rejection explains why", noCampaign.errors.some((e) => e.includes("Campaign report")));

// --- In-memory store to exercise commit + last-write-wins -----------------
class MemStore implements Store {
  uploads: UploadMeta[] = [];
  tables: Record<string, (AnyRow & { upload_id: string })[]> = {};
  async createUpload(meta: UploadMeta) { this.uploads.push(meta); return `up_${this.uploads.length}`; }
  async deleteRange(table: string, start: string, end: string) {
    const rows = this.tables[table] ?? [];
    const before = rows.length;
    this.tables[table] = rows.filter((r) => !(r.date >= start && r.date <= end));
    return before - this.tables[table].length;
  }
  async insertRows(table: string, rows: AnyRow[], uploadId: string) {
    this.tables[table] = this.tables[table] ?? [];
    for (const r of rows) this.tables[table].push({ ...r, upload_id: uploadId });
    return rows.length;
  }
}

console.log("\n5. Commit writes raw rows");
const store = new MemStore();
const c1 = await commit([p_campaign, p_target, p_search, p_product], store, { uploadedBy: "adi" });
check("commit inserted all rows", c1.inserted === p_campaign.rows.length + p_target.rows.length + p_search.rows.length + p_product.rows.length);
check("campaign table has 4 rows", store.tables[TABLE.campaign].length === 4, String(store.tables[TABLE.campaign].length));
check("upload registry recorded", store.uploads.length === 1 && store.uploads[0].date_range_start === "2026-08-11");

console.log("\n6. Last-write-wins on re-upload of an overlapping range");
// Batch 2: corrected 08-12 (spend 1100 -> 1150) + new day 08-13.
const campaign2 = csv([
  ["Date","Campaign Name","Ad Type","State","Budget","Impressions","Clicks","Spend","7 Day Total Sales","7 Day Total Orders (#)","7 Day Total Units (#)"],
  ["2026-08-12","Folding Beds","SP","enabled",2000,1100,55,1150,16000,3,3],   // corrected spend
  ["2026-08-13","Folding Beds","SP","enabled",2000,1200,60,1200,17000,4,4],   // new day
]);
const p_campaign2 = parseWorkbook(campaign2, "Campaign_report_v2.csv");
const c2 = await commit([p_campaign2], store, { uploadedBy: "adi" });
const campRows = store.tables[TABLE.campaign];
const fb812 = campRows.filter((r: any) => r.campaign_name === "Folding Beds" && r.date === "2026-08-12");
const fb811 = campRows.filter((r: any) => r.campaign_name === "Folding Beds" && r.date === "2026-08-11");
check("08-12 not duplicated", fb812.length === 1, `found ${fb812.length}`);
check("08-12 shows corrected spend 1150", (fb812[0] as any).spend === 1150, String((fb812[0] as any)?.spend));
check("08-11 (outside re-upload range) untouched", fb811.length === 1 && (fb811[0] as any).spend === 1000);
check("deleted count reflects superseded rows", c2.deleted >= 1, String(c2.deleted));

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
