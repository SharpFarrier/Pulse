-- Pulse — Amazon Sponsored Products ingestion (v1)
-- Working prefix: pulse_   (rename here + in lib/reports/ingest.ts to change it)
--
-- Design rules encoded by this schema:
--  1. Store RAW counts only. ACOS / ROAS / CTR / CPC are never stored — they are
--     computed on read so they can never drift when re-aggregated across dates or
--     campaigns. (see lib/reports/metrics.ts)
--  2. Headline totals come ONLY from pulse_campaign_daily. The other three tables
--     are drill-down / attribution sources and must never feed a top-line number.
--  3. Last-write-wins per date range: a re-upload deletes the overlapping dates for
--     that report type, then inserts fresh. The unique constraints make that safe.

create extension if not exists "pgcrypto";

-- One row per accepted upload batch. Everything else references this for audit.
create table if not exists pulse_uploads (
  id                uuid primary key default gen_random_uuid(),
  uploaded_at       timestamptz not null default now(),
  uploaded_by       text,
  report_types      text[]      not null,   -- e.g. {campaign,targeting,search_term,advertised_product}
  source_filenames  text[]      not null,
  date_range_start  date        not null,
  date_range_end    date        not null,
  row_count         integer     not null default 0
);

-- CAMPAIGN report — the totals source of truth. Grain: campaign x date.
create table if not exists pulse_campaign_daily (
  id            bigint generated always as identity primary key,
  upload_id     uuid    not null references pulse_uploads(id) on delete cascade,
  date          date    not null,
  campaign_name text    not null,
  portfolio     text,
  ad_type       text,
  state         text,
  budget        numeric,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  spend         numeric not null default 0,
  sales         numeric not null default 0,
  orders        integer not null default 0,
  units         integer not null default 0,
  unique (date, campaign_name)
);
create index if not exists pulse_campaign_daily_date_idx on pulse_campaign_daily (date);
create index if not exists pulse_campaign_daily_campaign_idx on pulse_campaign_daily (campaign_name);

-- TARGETING report — drill-down only. Grain: target x date.
create table if not exists pulse_target_daily (
  id            bigint generated always as identity primary key,
  upload_id     uuid    not null references pulse_uploads(id) on delete cascade,
  date          date    not null,
  campaign_name text    not null,
  ad_group      text,
  target        text    not null,           -- keyword or targeted ASIN
  match_type    text,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  spend         numeric not null default 0,
  sales         numeric not null default 0,
  orders        integer not null default 0,
  bid           numeric,
  suggested_bid numeric,
  unique (date, campaign_name, ad_group, target, match_type)
);
create index if not exists pulse_target_daily_date_idx on pulse_target_daily (date);
create index if not exists pulse_target_daily_campaign_idx on pulse_target_daily (campaign_name);

-- SEARCH-TERM report — drill-down only. Grain: search term x date.
create table if not exists pulse_search_term_daily (
  id            bigint generated always as identity primary key,
  upload_id     uuid    not null references pulse_uploads(id) on delete cascade,
  date          date    not null,
  campaign_name text    not null,
  ad_group      text,
  search_term   text    not null,
  match_type    text,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  spend         numeric not null default 0,
  sales         numeric not null default 0,
  orders        integer not null default 0,
  unique (date, campaign_name, ad_group, search_term, match_type)
);
create index if not exists pulse_search_term_daily_date_idx on pulse_search_term_daily (date);

-- ADVERTISED-PRODUCT report — drill-down + seeds the future SKU<->campaign map.
create table if not exists pulse_product_daily (
  id            bigint generated always as identity primary key,
  upload_id     uuid    not null references pulse_uploads(id) on delete cascade,
  date          date    not null,
  campaign_name text    not null,
  ad_group      text,
  asin          text    not null,
  sku           text,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  spend         numeric not null default 0,
  sales         numeric not null default 0,
  orders        integer not null default 0,
  unique (date, campaign_name, ad_group, asin)
);
create index if not exists pulse_product_daily_date_idx on pulse_product_daily (date);
create index if not exists pulse_product_daily_asin_idx on pulse_product_daily (asin);
