import * as XLSX from "xlsx";

// Parser for Amazon's "Sales and Traffic" Business report *by date* — the CSV
// Adi downloads daily. One row per calendar day for the whole account. Columns
// vary by marketplace/locale and carry B2B + mobile/browser splits, so we match
// headers by normalised name and always prefer the "- Total" variant.

export interface DailyAccountRow {
  date: string; // 'YYYY-MM-DD'
  ordered_product_sales: number;
  units_ordered: number;
  total_order_items: number;
  avg_selling_price: number | null;
  page_views: number;
  sessions: number;
  avg_offer_count: number | null;
  ordered_product_sales_b2b: number | null;
  units_ordered_b2b: number | null;
}

export interface ParsedDailyAccount {
  filename: string;
  rows: DailyAccountRow[];
  dateStart: string;
  dateEnd: string;
  revenue: number;
}

export class DailyAccountParseError extends Error {}

const norm = (h: string) =>
  String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^﻿/, "");

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // Strip everything that isn't a digit, dot or minus — robust to ₹, commas,
  // %, and any currency-symbol mojibake from a mis-detected codepage.
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Amazon's by-date Date column appears as ISO, "Oct 9, 2026", or dd/mm/yyyy
// (IN marketplace). Excel may also hand us a serial number or a Date object.
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return null;
  }
  const s = String(v).trim();
  // ISO: 2026-10-09 (or with time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // "Oct 9, 2026" / "9 Oct 2026" / "October 09, 2026"
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`; }
  // Slash: dd/mm/yyyy or mm/dd/yyyy — disambiguate by which field exceeds 12
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let a = +m[1], b = +m[2]; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day: number, mo: number;
    if (a > 12) { day = a; mo = b; }          // first field is day
    else if (b > 12) { mo = a; day = b; }      // second field is day (US style)
    else { day = a; mo = b; }                   // ambiguous → assume dd/mm (IN)
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return null;
}

// Map a normalised header to a field. Checked in order; the first hit wins, so
// exact "- total" names are listed before looser contains-checks.
type Field = keyof Omit<DailyAccountRow, "date">;
function fieldFor(h: string): Field | "date" | null {
  if (h === "date" || h === "day" || h === "report date") return "date";
  // B2B first so the plain names below don't swallow them
  if (h === "ordered product sales - b2b") return "ordered_product_sales_b2b";
  if (h === "units ordered - b2b") return "units_ordered_b2b";
  if (/\bb2b\b/.test(h)) return null; // ignore any other B2B split column
  if (h === "ordered product sales") return "ordered_product_sales";
  if (h === "units ordered") return "units_ordered";
  if (h === "total order items") return "total_order_items";
  if (h === "average selling price" || h === "avg selling price") return "avg_selling_price";
  if (h === "page views - total" || h === "page views") return "page_views";
  if (h === "sessions - total" || h === "sessions") return "sessions";
  if (h === "average offer count" || h === "avg offer count" || h === "offer count") return "avg_offer_count";
  return null;
}

const INT = new Set<Field>(["units_ordered", "total_order_items", "page_views", "sessions", "units_ordered_b2b"]);

export function parseDailyAccountReport(buf: ArrayBuffer | Uint8Array | Buffer, filename: string): ParsedDailyAccount {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  // XLSX files are zip archives (PK signature); read those as bytes. A CSV/TSV
  // is text — decode it as UTF-8 and read as a string so ₹ and dates survive
  // (reading text bytes as "array" lets XLSX guess a wrong codepage).
  const isZip = data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b;
  const wb = isZip
    ? XLSX.read(data, { type: "array" })
    : XLSX.read(new TextDecoder("utf-8").decode(data).replace(/^﻿/, ""), { type: "string", raw: true });
  // The by-date report lives on the first sheet; a maintained workbook may name
  // it "Data Entry DailyClicks" or "Sheet2" — take the first sheet that has a
  // Date column and a sales column.
  let grid: unknown[][] | null = null;
  let headers: string[] = [];
  let colField: (Field | "date" | null)[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const g = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true });
    // find the header row within the first few rows
    for (let hr = 0; hr < Math.min(5, g.length); hr++) {
      const hs = (g[hr] as unknown[]).map((h) => norm(String(h ?? "")));
      const cf = hs.map(fieldFor);
      if (cf.includes("date") && cf.includes("ordered_product_sales")) {
        grid = g.slice(hr) as unknown[][]; headers = hs; colField = cf; break;
      }
    }
    if (grid) break;
  }
  if (!grid) throw new DailyAccountParseError(`${filename}: doesn't look like a Sales & Traffic "by date" report (needs a Date column and an Ordered Product Sales column).`);

  const rows: DailyAccountRow[] = [];
  let revenue = 0;
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] as unknown[];
    const rec: DailyAccountRow = {
      date: "", ordered_product_sales: 0, units_ordered: 0, total_order_items: 0,
      avg_selling_price: null, page_views: 0, sessions: 0, avg_offer_count: null,
      ordered_product_sales_b2b: null, units_ordered_b2b: null,
    };
    for (let c = 0; c < colField.length; c++) {
      const f = colField[c]; if (!f) continue;
      const v = raw[c];
      if (f === "date") { const d = parseDate(v); if (d) rec.date = d; }
      else if (f === "avg_selling_price" || f === "avg_offer_count" || f === "ordered_product_sales_b2b" || f === "units_ordered_b2b") {
        rec[f] = v === null || v === undefined || v === "" ? null : (INT.has(f) ? Math.round(num(v)) : num(v));
      }
      else if (INT.has(f)) (rec as unknown as Record<string, number>)[f] = Math.round(num(v));
      else (rec as unknown as Record<string, number>)[f] = num(v);
    }
    if (!rec.date) continue; // skips trailing "Total"/blank rows
    revenue += rec.ordered_product_sales;
    rows.push(rec);
  }
  if (rows.length === 0) throw new DailyAccountParseError(`${filename}: no dated rows found.`);

  // last row wins if a date repeats within the file
  const byDate = new Map<string, DailyAccountRow>();
  for (const r of rows) byDate.set(r.date, r);
  const deduped = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { filename, rows: deduped, dateStart: deduped[0].date, dateEnd: deduped[deduped.length - 1].date, revenue };
}
