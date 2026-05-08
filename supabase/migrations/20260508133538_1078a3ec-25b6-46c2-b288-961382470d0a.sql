
-- Audit dashboard tables. RLS enabled with no public policies; only edge functions (service role) access.

CREATE TABLE public.wp_posts_cache (
  post_id BIGINT PRIMARY KEY,
  slug TEXT,
  title TEXT,
  link TEXT,
  modified_at TIMESTAMPTZ,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wp_posts_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_scores (
  post_id BIGINT PRIMARY KEY,
  score INT NOT NULL,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_history (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  score INT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_history (post_id, scanned_at DESC);
ALTER TABLE public.audit_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_fixes_cache (
  post_id BIGINT PRIMARY KEY,
  fixes JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_fixes_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_log (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  draft_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.push_log (post_id, created_at DESC);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
