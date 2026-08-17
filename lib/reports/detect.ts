import type { ReportType } from "./types";

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

export function normHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasHeader(headers: Set<string>, name: string): boolean {
  return headers.has(normHeader(name));
}

// ---------------------------------------------------------------------------
// Detection — order matters. The most specific discriminator wins first.
//   search_term        -> has "Customer Search Term"
//   advertised_product -> has "Advertised ASIN" (or "Advertised SKU")
//   targeting          -> has "Targeting"
//   campaign           -> has "Campaign Name" and none of the above
// ---------------------------------------------------------------------------

export function detectReportType(rawHeaders: string[]): ReportType | null {
  const headers = new Set(rawHeaders.map(normHeader));

  if (hasHeader(headers, "Customer Search Term")) return "search_term";
  if (hasHeader(headers, "Advertised ASIN") || hasHeader(headers, "Advertised SKU"))
    return "advertised_product";
  if (hasHeader(headers, "Targeting")) return "targeting";
  if (hasHeader(headers, "Campaign Name")) return "campaign";

  return null;
}

// ---------------------------------------------------------------------------
// Normalization maps: raw Amazon header (lowercased) -> canonical field.
// Amazon ships several aliases for the same measure across report versions
// and attribution windows (7 / 14 day). We fold them all to one field.
// ---------------------------------------------------------------------------

type FieldMap = Record<string, string>;

const COMMON: FieldMap = {
  "date": "date",
  "start date": "date",
  "campaign name": "campaign_name",
  "ad group name": "ad_group",
  "match type": "match_type",
  "impressions": "impressions",
  "clicks": "clicks",
  "spend": "spend",
  "cost": "spend",
  // sales aliases
  "sales": "sales",
  "7 day total sales": "sales",
  "7 day total sales (₹)": "sales",
  "14 day total sales": "sales",
  "total sales": "sales",
  // orders aliases
  "orders": "orders",
  "7 day total orders (#)": "orders",
  "14 day total orders (#)": "orders",
  "total orders (#)": "orders",
  "units": "units",
  "7 day total units (#)": "units",
};

const CAMPAIGN_MAP: FieldMap = {
  ...COMMON,
  "portfolio name": "portfolio",
  "ad type": "ad_type",
  "state": "state",
  "campaign state": "state",
  "budget": "budget",
  "daily budget": "budget",
};

const TARGETING_MAP: FieldMap = {
  ...COMMON,
  "targeting": "target",
  "bid": "bid",
  "suggested bid": "suggested_bid",
};

const SEARCH_TERM_MAP: FieldMap = {
  ...COMMON,
  "customer search term": "search_term",
};

const PRODUCT_MAP: FieldMap = {
  ...COMMON,
  "advertised asin": "asin",
  "advertised sku": "sku",
};

export const FIELD_MAPS: Record<ReportType, FieldMap> = {
  campaign: CAMPAIGN_MAP,
  targeting: TARGETING_MAP,
  search_term: SEARCH_TERM_MAP,
  advertised_product: PRODUCT_MAP,
};

// Required canonical fields per type — a file missing one of these is malformed.
export const REQUIRED_FIELDS: Record<ReportType, string[]> = {
  campaign: ["date", "campaign_name", "spend", "sales"],
  targeting: ["date", "campaign_name", "target", "spend"],
  search_term: ["date", "campaign_name", "search_term", "spend"],
  advertised_product: ["date", "campaign_name", "asin", "spend"],
};

export function mapHeader(reportType: ReportType, rawHeader: string): string | null {
  return FIELD_MAPS[reportType][normHeader(rawHeader)] ?? null;
}
