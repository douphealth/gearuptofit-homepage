CREATE TABLE IF NOT EXISTS public.wp_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  expected_total integer NOT NULL DEFAULT 0,
  expected_pages integer NOT NULL DEFAULT 0,
  per_page integer NOT NULL DEFAULT 100,
  imported_total integer NOT NULL DEFAULT 0,
  first_missing_page integer,
  error text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wp_import_pages (
  run_id uuid NOT NULL REFERENCES public.wp_import_runs(id) ON DELETE CASCADE,
  page integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  post_ids bigint[] NOT NULL DEFAULT '{}',
  error text,
  fetched_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, page)
);

CREATE INDEX IF NOT EXISTS idx_wp_import_runs_started_at ON public.wp_import_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_import_pages_run_status ON public.wp_import_pages(run_id, status, page);

ALTER TABLE public.wp_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_import_pages ENABLE ROW LEVEL SECURITY;