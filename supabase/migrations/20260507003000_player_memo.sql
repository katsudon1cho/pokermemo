alter table public.players
add column if not exists memo text not null default '';
