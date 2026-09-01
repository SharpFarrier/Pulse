-- Pulse migration 003 — Sponsored Brands support
-- Tags every row SP or SB so Sponsored Products and Sponsored Brands live in the
-- same tables and blend, and widens the uniqueness rules to include ad_product so
-- an SP and an SB campaign with the same name+date never collide. Additive: all
-- existing rows default to 'SP'.

alter table pulse_campaign_daily    add column if not exists ad_product text not null default 'SP';
alter table pulse_target_daily      add column if not exists ad_product text not null default 'SP';
alter table pulse_search_term_daily add column if not exists ad_product text not null default 'SP';

-- Drop whatever unique constraint each table currently has, then re-add it with ad_product.
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'pulse_campaign_daily'::regclass and contype = 'u' loop
    execute 'alter table pulse_campaign_daily drop constraint ' || quote_ident(c);
  end loop;
end $$;
alter table pulse_campaign_daily
  add constraint pulse_campaign_daily_grain_key unique (date, campaign_name, ad_product);

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'pulse_target_daily'::regclass and contype = 'u' loop
    execute 'alter table pulse_target_daily drop constraint ' || quote_ident(c);
  end loop;
end $$;
alter table pulse_target_daily
  add constraint pulse_target_daily_grain_key unique (date, campaign_name, ad_product, ad_group, target, match_type);

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'pulse_search_term_daily'::regclass and contype = 'u' loop
    execute 'alter table pulse_search_term_daily drop constraint ' || quote_ident(c);
  end loop;
end $$;
alter table pulse_search_term_daily
  add constraint pulse_search_term_daily_grain_key unique (date, campaign_name, ad_product, ad_group, search_term, match_type, target);

create index if not exists pulse_campaign_daily_adproduct_idx on pulse_campaign_daily (ad_product);
