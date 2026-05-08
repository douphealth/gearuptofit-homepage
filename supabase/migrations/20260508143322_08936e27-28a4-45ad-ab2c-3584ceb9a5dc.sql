CREATE POLICY "No direct browser access to import runs"
ON public.wp_import_runs
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct browser access to import pages"
ON public.wp_import_pages
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);