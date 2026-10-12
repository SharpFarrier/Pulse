import { parseDailyAccountReport, parseDate } from "../lib/reports/dailyAccount";
import { computeAccountView, type AccountDailyRow } from "../lib/reports/account";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
}
function csv(rows: (string | number)[][]): Buffer {
  const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return Buffer.from(rows.map((r) => r.map(cell).join(",")).join("\n"), "utf-8");
}

console.log("1. Date parsing");
check("ISO", parseDate("2026-10-09") === "2026-10-09");
check("Mon d, yyyy", parseDate("Oct 9, 2026") === "2026-10-09", String(parseDate("Oct 9, 2026")));
check("d Mon yyyy", parseDate("9 Oct 2026") === "2026-10-09", String(parseDate("9 Oct 2026")));
check("dd/mm/yyyy (day>12)", parseDate("13/09/2026") === "2026-09-13", String(parseDate("13/09/2026")));
check("mm/dd/yyyy (US, 2nd>12)", parseDate("09/13/2026") === "2026-09-13", String(parseDate("09/13/2026")));
check("excel serial", parseDate(46000) !== null);
check("blank → null", parseDate("") === null);

console.log("\n2. Parsing a by-date report with B2B + split columns");
// Mirrors Amazon's real header: B2B variants present and must be ignored for
// the plain metric; "- Total" variants must win over any mobile/browser split.
const report = csv([
  ["Date", "Ordered Product Sales", "Ordered Product Sales - B2B", "Units Ordered", "Units Ordered - B2B", "Total Order Items", "Average Selling Price", "Sessions - Total", "Page Views - Total", "Average Offer Count", "Buy Box Percentage"],
  ["2026-09-01", "₹7,00,000", "₹10,000", 90, 2, 95, "₹7,777", "20,000", "22,000", 123, "98%"],
  ["2026-09-02", "₹5,00,000", "₹5,000", 70, 1, 72, "₹7,142", "18,000", "19,000", 125, "97%"],
  ["Total", "₹12,00,000", "", 160, "", 167, "", "38,000", "41,000", "", ""],
]);
const parsed = parseDailyAccountReport(report, "BusinessReport-by-date.csv");
check("trailing Total row skipped (2 rows)", parsed.rows.length === 2, `got ${parsed.rows.length}`);
check("revenue summed", parsed.revenue === 1200000, String(parsed.revenue));
check("B2B column not folded into plain sales", parsed.rows[0].ordered_product_sales === 700000, String(parsed.rows[0].ordered_product_sales));
check("b2b captured separately", parsed.rows[0].ordered_product_sales_b2b === 10000, String(parsed.rows[0].ordered_product_sales_b2b));
check("page views parsed with comma", parsed.rows[0].page_views === 22000, String(parsed.rows[0].page_views));
check("offer count parsed", parsed.rows[0].avg_offer_count === 123, String(parsed.rows[0].avg_offer_count));
check("date range", parsed.dateStart === "2026-09-01" && parsed.dateEnd === "2026-09-02");

console.log("\n3. Account view — MoM / YoY on a per-day basis");
// Build 3 months: Sep'25 (YoY), Aug'26 (MoM), Sep'26 (selected). Different day
// counts so per-day normalisation is actually exercised.
const rows: AccountDailyRow[] = [];
const mk = (date: string, rev: number, units: number, pv: number, off: number): AccountDailyRow =>
  ({ date, ordered_product_sales: rev, units_ordered: units, total_order_items: units, page_views: pv, sessions: pv, avg_offer_count: off });
// Sep 2025: 30 days, rev 800k/day, 100 units/day, 45000 pv/day, offers 147
for (let d = 1; d <= 30; d++) rows.push(mk(`2025-09-${String(d).padStart(2, "0")}`, 800000, 100, 45000, 147));
// Aug 2026: 31 days, rev 750k/day, 93 units/day, 22000 pv/day, offers 123
for (let d = 1; d <= 31; d++) rows.push(mk(`2026-08-${String(d).padStart(2, "0")}`, 750000, 93, 22000, 123));
// Sep 2026: 30 days, rev 526k/day, 63 units/day, 16000 pv/day, offers 143
for (let d = 1; d <= 30; d++) rows.push(mk(`2026-09-${String(d).padStart(2, "0")}`, 526000, 63, 16000, 143));

const v = computeAccountView(rows, "2026-09")!;
check("months listed ascending", v.months.join(",") === "2025-09,2026-08,2026-09", v.months.join(","));
check("selected month", v.selectedMonth === "2026-09");
check("prev month resolved", v.prevMonth === "2026-08");
check("yoy month resolved", v.yoyMonth === "2025-09");
check("revenue per-day", Math.round(v.cards.revenue.perDay!) === 526000, String(v.cards.revenue.perDay));
check("revenue MoM% ≈ -30", Math.abs(v.cards.revenue.mom.pct! - (-29.87)) < 0.5, String(v.cards.revenue.mom.pct));
check("revenue YoY% ≈ -34", Math.abs(v.cards.revenue.yoy.pct! - (-34.25)) < 0.5, String(v.cards.revenue.yoy.pct));
check("orders per-day = 63", Math.round(v.cards.orders.perDay!) === 63);
check("conversion = units/pv (63/16000*100≈0.394)", Math.abs(v.cards.conversion.perDay! - 0.39375) < 0.001, String(v.cards.conversion.perDay));
check("conversion YoY positive (0.394 vs 0.222)", v.cards.conversion.yoy.pct! > 0, String(v.cards.conversion.yoy.pct));
check("offers per-day = 143", Math.round(v.cards.offers.perDay!) === 143);
check("offers MoM% ≈ +16", Math.abs(v.cards.offers.mom.pct! - 16.26) < 0.5, String(v.cards.offers.mom.pct));
check("revenue month total = perDay*days", Math.round(v.cards.revenue.monthTotal!) === 526000 * 30);
check("conversion has no month total", v.cards.conversion.monthTotal === null);

console.log("\n4. Lifecycle grains");
check("daily points = total days", v.lifecycle.daily.length === 91, String(v.lifecycle.daily.length));
check("monthly points = 3", v.lifecycle.monthly.length === 3);
check("yearly points = 2 (2025,2026)", v.lifecycle.yearly.length === 2, v.lifecycle.yearly.map(b => b.key).join(","));
const y2026 = v.lifecycle.yearly.find((b) => b.key === "2026")!;
check("2026 yearly flagged partial", y2026.partial === true);
check("yearly conversion aggregates across the year", y2026.conversion > 0);

console.log("\n5. Offer-count gap handling (0 offers = missing, not plotted as 0)");
const gap: AccountDailyRow[] = [
  mk("2026-07-01", 100000, 10, 5000, 0),
  mk("2026-07-02", 100000, 10, 5000, 100),
];
const vg = computeAccountView(gap, "2026-07")!;
check("offer avg ignores the 0 day", vg.cards.offers.perDay === 100, String(vg.cards.offers.perDay));

console.log("\n6. Default month = last fully-elapsed month");
const vdef = computeAccountView(rows)!;
check("defaults to a sane month", v.months.includes(vdef.selectedMonth));

console.log("\n7. Sale-day annotations surface");
const sd: AccountDailyRow[] = [
  { ...mk("2026-09-20", 1500000, 180, 30000, 143), sale_participation: true, discount_pct: 20 },
  mk("2026-09-21", 500000, 60, 16000, 143),
];
const vs = computeAccountView(sd, "2026-09")!;
check("sale day captured", vs.saleDays.join(",") === "2026-09-20", vs.saleDays.join(","));

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
