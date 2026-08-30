-- Pulse migration 002 — search-term grain fix
-- The Amazon search-term report's true grain includes the TARGETING keyword that
-- triggered each customer search term. Without it, the same search term matched by
-- two different keywords collides on the unique constraint. This adds the column
-- and widens the uniqueness rule to the real grain.

-- 1. Add the triggering keyword to the search-term table.
alter table pulse_search_term_daily add column if not exists target text;

-- 2. Clear partial data from the earlier failed upload attempts.
--    Safe: no complete snapshot has ever saved successfully. (Preview first with
--    `select count(*) from pulse_search_term_daily;` if you want to confirm.)
truncate pulse_campaign_daily, pulse_target_daily, pulse_search_term_daily,
         pulse_product_daily, pulse_uploads restart identity cascade;

-- 3. Widen the uniqueness rule to the true grain (adds target).
alter table pulse_search_term_daily
  drop constraint if exists pulse_search_term_daily_date_campaign_name_ad_group_search__key;
alter table pulse_search_term_daily
  add constraint pulse_search_term_daily_grain_key
  unique (date, campaign_name, ad_group, search_term, match_type, target);
