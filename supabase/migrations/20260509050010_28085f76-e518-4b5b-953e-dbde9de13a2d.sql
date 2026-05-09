create table if not exists public.autolink_markers (
  id bigserial primary key,
  post_id integer not null,
  target_id integer not null,
  anchor text not null,
  target_url text not null,
  start_offset integer not null,
  end_offset integer not null,
  content_hash text,
  applied_at timestamptz not null default now()
);
create index if not exists autolink_markers_post_idx on public.autolink_markers(post_id);
create index if not exists autolink_markers_target_idx on public.autolink_markers(post_id, target_id);
alter table public.autolink_markers enable row level security;
-- Service role only; no public policies on purpose.