-- Pulse migration 004 — Amazon Business report (per-SKU listing/revenue), monthly.
-- The Business report has no reporting period in it, so `period` is supplied at
-- upload time (a month picker) and stored here. Join to ad data on `asin`.

create table if not exists pulse_business_monthly (
  id                    bigint generated always as identity primary key,
  upload_id             uuid    not null references pulse_uploads(id) on delete cascade,
  period                date    not null,           -- first day of the month
  parent_asin           text,
  asin                  text    not null,
  sku                   text,
  title                 text,
  sessions              integer not null default 0,
  page_views            integer not null default 0,
  featured_offer_pct    numeric,                     -- buy box %
  units_ordered         integer not null default 0,
  ordered_product_sales numeric not null default 0,  -- revenue
  total_order_items     integer not null default 0,
  unique (period, asin)
);
create index if not exists pulse_business_monthly_period_idx on pulse_business_monthly (period);
create index if not exists pulse_business_monthly_asin_idx   on pulse_business_monthly (asin);
