# Why "0 internal links applied"

I traced it in the database. Here is exactly what happened to the HIIT post (`37656`):

```
2026-05-09 16:16:30  →  Inserted 8 internal link(s)   ✅ (real, succeeded)
2026-05-09 16:17:36  →  Inserted 0 internal link(s)   ❌ (this run)
```

The first run actually **did insert all 8 internal links** into the live WordPress post. It also wrote 8 rows into the `autolink_markers` table as an audit/dedupe log (those rows are still there for targets `71338, 66943, 37496, 39473, 66951, 76139, 52897, 54395`).

Then you ran the SOTA overhaul. The overhaul **rewrites the entire post content**, which wiped all 8 `<a>` tags and their `<!--gutf:autolink-XXXX-->` marker comments out of the live post.

When you clicked "Apply" again, `applyToLivePost` loaded the dedupe set from `autolink_markers`:

```ts
const { data: storedMarkers } = await supabase
  .from("autolink_markers").select("target_id").eq("post_id", postId);
for (const m of storedMarkers || []) existingTargets.add(Number(m.target_id));
```

Every one of the 8 suggestions matched a `target_id` already in that set, so every single one was skipped → `applied: 0`. The DB log lied to the dedupe layer because the live content no longer contains those links.

# The fix

Make **live WordPress content the single source of truth**. The DB `autolink_markers` table becomes a passive audit log only — never a gate.

## 1. `supabase/functions/audit-link-optimizer/index.ts` → `applyToLivePost()`

- **Remove** the block that pre-fills `existingTargets` from `autolink_markers`. That table must not influence dedupe.
- Keep the live-source dedupe (already correct):
  - `autolinkMarkerRanges(raw)` — real `<!--gutf:autolink-ID-->...<!--/...-->` comments still in raw.
  - `existingLinks(raw)` — any `href` already pointing at the target URL.
  - `raw.includes('href="${s.targetUrl}"')` belt-and-suspenders check.
- After a successful save, **reconcile** `autolink_markers` for this `post_id`:
  1. Delete rows whose `target_id` is NOT in the freshly-saved `raw` (they were wiped by an earlier overhaul or manual edit).
  2. Insert one row per target newly inserted in this run (current behavior).
- Track skip reasons per suggestion and return them so the UI can explain "0 applied" instead of going silent. Reasons: `already_linked_in_live`, `marker_in_live`, `anchor_inside_heading_or_link`, `anchor_not_found`, `duplicate_anchor_in_run`.

## 2. `supabase/functions/audit-link-optimizer/index.ts` → response shape

Return:

```json
{
  "ok": true,
  "applied": 8,
  "links": [...],
  "skipped": [
    { "targetId": 71338, "anchor": "Interval Training", "reason": "marker_in_live" }
  ],
  "reconciled_stale_markers": 8
}
```

When `applied === 0`, the response also includes a top-level human-readable `summary` like `"0 of 8 suggestions inserted — all already linked in live content"` so the UI can surface it.

## 3. `src/pages/AuditPage.tsx` (autolink result block only)

When the apply call returns, instead of just toasting "Applied N", render:

- `Applied: N`
- `Reconciled stale markers: M` (only if > 0)
- A small collapsible list of `skipped[]` with reason chips per suggestion.

Pure presentation — no business-logic changes outside the edge function. Other features (overhaul, audit, verification) are untouched.

## Why this is correct

- Live HTML is the only source that cannot lie. If a `<!--gutf:autolink-71338-->` is not in `raw`, the link does not exist, period — and we are free to insert it.
- Reconciliation cleans the stale DB rows your earlier overhaul orphaned, so the audit log stays honest going forward.
- The skip-reason payload guarantees you will never again see an unexplained "0 applied".

## Files to touch

- `supabase/functions/audit-link-optimizer/index.ts` (apply mode + response)
- `src/pages/AuditPage.tsx` (autolink result rendering only)

No DB migration. No new secrets. No changes to overhaul, scoring, verification, or suggestion generation.
