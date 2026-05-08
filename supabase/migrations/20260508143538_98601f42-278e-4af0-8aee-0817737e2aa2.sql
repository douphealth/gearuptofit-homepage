ALTER TABLE public.wp_import_pages
ADD COLUMN IF NOT EXISTS post_refs jsonb NOT NULL DEFAULT '[]'::jsonb;