-- Pulse migration 005 — data coverage. Returns the distinct dates present per
-- report stream (computed in SQL so we never pull whole tables), plus the latest
-- ingest time. The app turns these into "have X–Y, gaps, download next".
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
      'business',       (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from (select distinct period p from pulse_business_monthly) t)
    )
  );
$$;
