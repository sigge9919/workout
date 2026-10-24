-- Cache för källsvar (kupong, resultat, odds, nyheter, väder).
-- Nyckeln börjar med "draw<nr>:" för data som hör till en viss omgång.
create table if not exists public.source_cache (
  key text primary key,
  draw_number integer,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists source_cache_draw_number_idx on public.source_cache (draw_number);

-- Bara servern (service role) läser och skriver; inga publika policies.
alter table public.source_cache enable row level security;
