// Canonical shapes the rest of Pulse works with. Raw Amazon headers are
// normalized into these by lib/reports/detect.ts + parse.ts.

export type ReportType =
  | "campaign"
  | "targeting"
  | "search_term"
  | "advertised_product";

export const REPORT_LABELS: Record<ReportType, string> = {
  campaign: "Campaign",
  targeting: "Targeting",
  search_term: "Search-term",
  advertised_product: "Advertised-product",
};

// Only the Campaign report is allowed to feed headline totals.
export const TOTALS_SOURCE: ReportType = "campaign";

export interface CampaignRow {
  date: string; // ISO yyyy-mm-dd
  campaign_name: string;
  portfolio?: string | null;
  ad_type?: string | null;
  state?: string | null;
  budget?: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  units: number;
}

export interface TargetRow {
  date: string;
  campaign_name: string;
  ad_group?: string | null;
  target: string;
  match_type?: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  bid?: number | null;
  suggested_bid?: number | null;
}

export interface SearchTermRow {
  date: string;
  campaign_name: string;
  ad_group?: string | null;
  search_term: string;
  target?: string | null; // the keyword/target that triggered this search term
  match_type?: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

export interface ProductRow {
  date: string;
  campaign_name: string;
  ad_group?: string | null;
  asin: string;
  sku?: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

export type AnyRow = CampaignRow | TargetRow | SearchTermRow | ProductRow;

// One parsed file, ready to stage/commit.
export interface ParsedReport {
  reportType: ReportType;
  filename: string;
  rows: AnyRow[];
  dateStart: string; // min date in rows
  dateEnd: string; // max date in rows
}
