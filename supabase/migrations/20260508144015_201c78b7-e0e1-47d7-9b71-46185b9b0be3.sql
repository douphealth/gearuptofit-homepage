CREATE POLICY "No direct browser access to AI fixes"
ON public.ai_fixes_cache
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct browser access to audit history"
ON public.audit_history
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct browser access to audit scores"
ON public.audit_scores
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct browser access to push log"
ON public.push_log
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct browser access to WordPress cache"
ON public.wp_posts_cache
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);