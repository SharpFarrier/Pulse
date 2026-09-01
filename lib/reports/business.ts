import * as XLSX from "xlsx";

export interface BusinessRow {
  period?: string; // 'YYYY-MM-01', set at commit time
  parent_asin: string | null;
  asin: string;
  sku: string | null;
  title: string | null;
  sessions: number;
  page_views: number;
  featured_offer_pct: number | null;
  units_ordered: number;
  ordered_product_sales: number;
  total_order_items: number;
}

export interface ParsedBusiness {
  filename: string;
  rows: BusinessRow[];
  revenue: number;
}

export class BusinessParseError extends Error {}

const norm = (h: string) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^\ufeff/, "");

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[₹$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const MAP: Record<string, keyof BusinessRow> = {
  "(parent) asin": "parent_asin",
  "(child) asin": "asin",
  "asin": "asin",
  "title": "title",
  "sku": "sku",
  "sessions - total": "sessions",
  "sessions": "sessions",
  "page views - total": "page_views",
  "page views": "page_views",
  "featured offer percentage": "featured_offer_pct",
  "featured offer (buy box) percentage": "featured_offer_pct",
  "buy box percentage": "featured_offer_pct",
  "units ordered": "units_ordered",
  "ordered product sales": "ordered_product_sales",
  "total order items": "total_order_items",
};

const INT = new Set<keyof BusinessRow>(["sessions", "page_views", "units_ordered", "total_order_items"]);
const NUMF = new Set<keyof BusinessRow>(["featured_offer_pct", "ordered_product_sales"]);

export function parseBusinessReport(buf: ArrayBuffer | Uint8Array | Buffer, filename: string): ParsedBusiness {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new BusinessParseError(`${filename}: no sheet found`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (grid.length < 2) throw new BusinessParseError(`${filename}: empty report`);

  const headers = (grid[0] as unknown[]).map((h) => norm(String(h ?? "")));
  const colField = headers.map((h) => MAP[h] ?? null);
  if (!colField.includes("asin") || !colField.includes("ordered_product_sales")) {
    throw new BusinessParseError(`${filename}: doesn't look like an Amazon Business report (needs a Child ASIN and Ordered Product Sales column).`);
  }

  const rows: BusinessRow[] = [];
  let revenue = 0;
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] as unknown[];
    const rec: Record<string, unknown> = {
      parent_asin: null, asin: "", sku: null, title: null,
      sessions: 0, page_views: 0, featured_offer_pct: null, units_ordered: 0, ordered_product_sales: 0, total_order_items: 0,
    };
    for (let c = 0; c < colField.length; c++) {
      const f = colField[c];
      if (!f) continue;
      const v = raw[c];
      if (INT.has(f)) rec[f] = Math.round(num(v));
      else if (NUMF.has(f)) rec[f] = num(v);
      else { const s = v === null || v === undefined ? "" : String(v).trim(); rec[f] = s === "" ? null : s; }
    }
    if (rec.featured_offer_pct !== null && (rec.featured_offer_pct as number) <= 1) rec.featured_offer_pct = (rec.featured_offer_pct as number) * 100;
    if (!rec.asin) continue;
    revenue += rec.ordered_product_sales as number;
    rows.push(rec as unknown as BusinessRow);
  }
  if (rows.length === 0) throw new BusinessParseError(`${filename}: no rows with an ASIN found.`);

  // Amazon lists a parent and its child ASIN, which can be identical — collapse
  // duplicate ASINs into one row (sum counts/revenue) so (period, asin) is unique.
  const byAsin = new Map<string, BusinessRow>();
  for (const r of rows) {
    const ex = byAsin.get(r.asin);
    if (!ex) { byAsin.set(r.asin, { ...r }); continue; }
    ex.sessions += r.sessions;
    ex.page_views += r.page_views;
    ex.units_ordered += r.units_ordered;
    ex.ordered_product_sales += r.ordered_product_sales;
    ex.total_order_items += r.total_order_items;
    if (ex.featured_offer_pct === null) ex.featured_offer_pct = r.featured_offer_pct;
    if (!ex.sku && r.sku) ex.sku = r.sku;
    if (!ex.title && r.title) ex.title = r.title;
  }
  const deduped = [...byAsin.values()];
  return { filename, rows: deduped, revenue };
}
