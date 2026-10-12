-- Pulse migration 006 — daily account "Sales and Traffic by date" business report.
-- One row per calendar day for the whole account (not per-SKU). This is the
-- BusinessReport CSV Adi downloads daily. Keyed by date, last-write-wins.
--
-- The CSV carries only the metric columns. `sale_participation` and
-- `discount_pct` are Adi's own annotations, edited inside Pulse — a CSV
-- re-upload must NOT wipe them, so the commit path upserts only the metric
-- columns and leaves these two untouched (and the annotate path upserts only
-- these two and leaves the metrics untouched).

create table if not exists pulse_daily_account (
  date                      date primary key,         -- the calendar day
  ordered_product_sales     numeric not null default 0,   -- revenue
  units_ordered             integer not null default 0,   -- Adi's "orders"
  total_order_items         integer not null default 0,   -- actual pieces
  avg_selling_price         numeric,
  page_views                integer not null default 0,
  sessions                  integer not null default 0,
  avg_offer_count           numeric,                      -- offers live that day
  ordered_product_sales_b2b numeric,
  units_ordered_b2b         integer,
  -- Adi's manual annotations (edited in Pulse, preserved across CSV re-uploads)
  sale_participation        boolean not null default false,
  discount_pct              numeric,
  upload_id                 uuid references pulse_uploads(id) on delete set null,
  updated_at                timestamptz not null default now()
);
create index if not exists pulse_daily_account_date_idx on pulse_daily_account (date);

-- Extend coverage so the Ingest tab's tracker shows this stream too.
create or replace function pulse_coverage()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'today', current_date,
    'last_upload', (select max(uploaded_at) from pulse_uploads),
    'streams', jsonb_build_object(
      'sp_campaign',    (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_campaign_daily    where ad_product = 'SP') t),
      'sp_targeting',   (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_target_daily      where ad_product = 'SP') t),
      'sp_search_term', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_search_term_daily where ad_product = 'SP') t),
      'sp_product',     (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_product_daily) t),
      'sb_campaign',    (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_campaign_daily    where ad_product = 'SB') t),
      'sb_targeting',   (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_target_daily      where ad_product = 'SB') t),
      'sb_search_term', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_search_term_daily where ad_product = 'SB') t),
      'business',       (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from (select distinct period p from pulse_business_monthly) t),
      'daily_account',  (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct date d from pulse_daily_account) t)
    )
  );
$$;
