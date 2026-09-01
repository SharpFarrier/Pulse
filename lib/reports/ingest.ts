import type { AnyRow, ParsedReport, ReportType, AdProduct } from "./types";
import { REPORT_LABELS, TOTALS_SOURCE } from "./types";

// Table name per report type (working prefix pulse_).
export const TABLE: Record<ReportType, string> = {
  campaign: "pulse_campaign_daily",
  targeting: "pulse_target_daily",
  search_term: "pulse_search_term_daily",
  advertised_product: "pulse_product_daily",
};

// The exact columns each table has (excluding id + upload_id). Rows are projected
// to these before insert, so a field the parser attaches but the table lacks
// (e.g. `units`, which only pulse_campaign_daily has) can never break an insert.
export const COLUMNS: Record<string, string[]> = {
  pulse_campaign_daily: ["date", "campaign_name", "ad_product", "portfolio", "ad_type", "state", "budget", "impressions", "clicks", "spend", "sales", "orders", "units"],
  pulse_target_daily: ["date", "campaign_name", "ad_product", "ad_group", "target", "match_type", "impressions", "clicks", "spend", "sales", "orders", "bid", "suggested_bid"],
  pulse_search_term_daily: ["date", "campaign_name", "ad_product", "ad_group", "search_term", "target", "match_type", "impressions", "clicks", "spend", "sales", "orders"],
  pulse_product_daily: ["date", "campaign_name", "ad_group", "asin", "sku", "impressions", "clicks", "spend", "sales", "orders"],
};

// The ingest logic is pure: it talks to storage through this interface only, so
// it can be unit-tested with an in-memory store and run for real against Supabase.
export interface Store {
  createUpload(meta: UploadMeta): Promise<string>; // returns upload id
  // Last-write-wins: remove existing rows for this report type within [start,end].
  deleteRange(table: string, start: string, end: string, adProduct: AdProduct): Promise<number>;
  insertRows(table: string, rows: AnyRow[], uploadId: string): Promise<number>;
}

export interface UploadMeta {
  uploaded_by?: string | null;
  report_types: ReportType[];
  source_filenames: string[];
  date_range_start: string;
  date_range_end: string;
  row_count: number;
}

export interface StagedSummary {
  ok: boolean;
  errors: string[];
  warnings: string[];
  hasCampaignReport: boolean; // the accept gate
  dateStart: string | null;
  dateEnd: string | null;
  perType: { reportType: ReportType; adProduct: AdProduct; label: string; filename: string; rows: number }[];
  totalRows: number;
}

// -------------------------------------------------------------------------
// Stage: parse results in, no writes. Powers the "Accept and save" preview.
// The accept gate: without a Campaign report, headline totals can't tie to
// Amazon, so we refuse to commit (ok=false).
// -------------------------------------------------------------------------
export function stage(reports: ParsedReport[]): StagedSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (reports.length === 0) errors.push("No readable reports in this batch.");

  const seen = new Set<ReportType>();
  for (const r of reports) {
    if (seen.has(r.reportType)) {
      warnings.push(
        `Two ${REPORT_LABELS[r.reportType]} reports in one batch — both will be ingested; check they aren't the same file twice.`
      );
    }
    seen.add(r.reportType);
  }

  // Each ad type present needs its own Campaign report — SP totals come from the SP
  // Campaign report, SB totals from the SB Campaign report.
  const productsPresent = [...new Set(reports.map((r) => r.adProduct))];
  const label = (p: AdProduct) => (p === "SB" ? "Sponsored Brands" : "Sponsored Products");
  for (const prod of productsPresent) {
    const hasCamp = reports.some((r) => r.adProduct === prod && r.reportType === TOTALS_SOURCE);
    if (!hasCamp) {
      errors.push(`No ${label(prod)} Campaign report in this batch. Totals for ${label(prod)} come only from its Campaign report, so add it before saving.`);
    }
  }
  const hasCampaignReport = reports.length > 0 && productsPresent.every((prod) => reports.some((r) => r.adProduct === prod && r.reportType === TOTALS_SOURCE));

  let dateStart: string | null = null;
  let dateEnd: string | null = null;
  let totalRows = 0;
  const perType = reports.map((r) => {
    if (dateStart === null || r.dateStart < dateStart) dateStart = r.dateStart;
    if (dateEnd === null || r.dateEnd > dateEnd) dateEnd = r.dateEnd;
    totalRows += r.rows.length;
    return {
      reportType: r.reportType,
      adProduct: r.adProduct,
      label: REPORT_LABELS[r.reportType],
      filename: r.filename,
      rows: r.rows.length,
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    hasCampaignReport,
    dateStart,
    dateEnd,
    perType,
    totalRows,
  };
}

export interface CommitResult {
  uploadId: string;
  deleted: number; // rows superseded by last-write-wins
  inserted: number;
  dateStart: string;
  dateEnd: string;
}

// -------------------------------------------------------------------------
// Commit: writes via the Store. Refuses if staging failed (e.g. no campaign
// report). For each report type: delete its overlapping date range, then insert.
// -------------------------------------------------------------------------
export async function commit(
  reports: ParsedReport[],
  store: Store,
  opts: { uploadedBy?: string | null } = {}
): Promise<CommitResult> {
  const summary = stage(reports);
  if (!summary.ok) {
    throw new Error(`Cannot save: ${summary.errors.join(" ")}`);
  }
  const dateStart = summary.dateStart as string;
  const dateEnd = summary.dateEnd as string;

  const uploadId = await store.createUpload({
    uploaded_by: opts.uploadedBy ?? null,
    report_types: summary.perType.map((p) => p.reportType),
    source_filenames: summary.perType.map((p) => p.filename),
    date_range_start: dateStart,
    date_range_end: dateEnd,
    row_count: summary.totalRows,
  });

  let deleted = 0;
  let inserted = 0;
  for (const r of reports) {
    const table = TABLE[r.reportType];
    deleted += await store.deleteRange(table, r.dateStart, r.dateEnd, r.adProduct);
    inserted += await store.insertRows(table, r.rows, uploadId);
  }

  return { uploadId, deleted, inserted, dateStart, dateEnd };
}
