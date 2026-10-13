-- Job secrets table (separate from jobs so tokens are never exposed).

-- Job tokens live in their own table (RLS on, no policies, no client grants).
-- jobs.token_hash from the core migration is no longer used; it stays
-- ungranted to clients and can be dropped in a later cleanup migration.
create table if not exists public.job_secrets (
  job_id      uuid primary key references public.jobs (id) on delete cascade,
  token_hash  text not null
);
alter table public.job_secrets enable row level security;
revoke all on public.job_secrets from anon, authenticated;
alter table public.jobs alter column token_hash drop not null;
comment on column public.jobs.token_hash is 'Unused; tokens are stored in job_secrets.';
