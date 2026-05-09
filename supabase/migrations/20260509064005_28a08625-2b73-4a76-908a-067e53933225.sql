CREATE TABLE IF NOT EXISTS public.wp_post_backups (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  run_id TEXT,
  content TEXT NOT NULL,
  status TEXT,
  date_gmt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wp_post_backups_post ON public.wp_post_backups(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_post_backups_run ON public.wp_post_backups(run_id);
ALTER TABLE public.wp_post_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct browser access to post backups" ON public.wp_post_backups
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.wp_cleanup_checkpoints (
  key TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'scan',
  page INTEGER NOT NULL DEFAULT 1,
  per_page INTEGER NOT NULL DEFAULT 50,
  total_pages INTEGER,
  processed_ids BIGINT[] NOT NULL DEFAULT '{}',
  affected JSONB NOT NULL DEFAULT '[]'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wp_cleanup_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct browser access to cleanup checkpoints" ON public.wp_cleanup_checkpoints
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);