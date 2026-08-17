import * as XLSX from "xlsx";
import { detectReportType, mapHeader, REQUIRED_FIELDS } from "./detect";
import type { AnyRow, ParsedReport, ReportType } from "./types";

const INT_FIELDS = new Set(["impressions", "clicks", "orders", "units"]);
const NUM_FIELDS = new Set(["spend", "sales", "budget", "bid", "suggested_bid"]);

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // strip currency symbols, commas, spaces
  const cleaned = String(v).replace(/[₹$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Amazon dates arrive as "2026-08-17", "8/17/2026", or an Excel serial number.
function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date: days since 1899-12-30 (handles the 1900 leap-year quirk).
    const ms = Math.round((v - 25569) * 86400 * 1000); // 25569 = days to 1970-01-01
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return null;
}

export class ReportParseError extends Error {}

export function parseWorkbook(buf: ArrayBuffer | Uint8Array | Buffer, filename: string): ParsedReport {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new ReportParseError(`${filename}: no sheet found`);

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (grid.length < 2) throw new ReportParseError(`${filename}: empty report`);

  const rawHeaders = (grid[0] as unknown[]).map((h) => String(h ?? ""));
  const reportType = detectReportType(rawHeaders);
  if (!reportType) {
    throw new ReportParseError(
      `${filename}: could not recognize this as an Amazon SP report (no Campaign / Targeting / Customer Search Term / Advertised ASIN column)`
    );
  }

  // Build column index -> canonical field
  const colField: (string | null)[] = rawHeaders.map((h) => mapHeader(reportType, h));

  const rows: AnyRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] as unknown[];
    const rec: Record<string, unknown> = {
      impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0,
    };
    for (let c = 0; c < colField.length; c++) {
      const field = colField[c];
      if (!field) continue;
      const val = raw[c];
      if (field === "date") {
        const iso = toISODate(val);
        if (iso) rec.date = iso;
      } else if (INT_FIELDS.has(field)) {
        rec[field] = Math.round(toNumber(val));
      } else if (NUM_FIELDS.has(field)) {
        rec[field] = toNumber(val);
      } else {
        const s = val === null || val === undefined ? "" : String(val).trim();
        if (s !== "") rec[field] = s;
      }
    }

    if (!rec.date || !rec.campaign_name) continue; // skip totals/blank rows Amazon appends

    const d = rec.date as string;
    if (minDate === null || d < minDate) minDate = d;
    if (maxDate === null || d > maxDate) maxDate = d;
    rows.push(rec as unknown as AnyRow);
  }

  if (rows.length === 0) throw new ReportParseError(`${filename}: no dated rows found`);

  // Sanity: required canonical fields must have appeared in the header
  const present = new Set(colField.filter(Boolean) as string[]);
  const missing = REQUIRED_FIELDS[reportType].filter((f) => !present.has(f));
  if (missing.length) {
    throw new ReportParseError(
      `${filename}: recognized as ${reportType} but missing required column(s): ${missing.join(", ")}`
    );
  }

  return {
    reportType: reportType as ReportType,
    filename,
    rows,
    dateStart: minDate as string,
    dateEnd: maxDate as string,
  };
}
