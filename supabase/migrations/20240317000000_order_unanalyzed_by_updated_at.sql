-- get_unanalyzed_urls: Reihenfolge an found-businesses angleichen (updated_at DESC)
-- Damit werden die "ersten 10" aus der Liste aller gefundenen Betriebe analysiert.
CREATE OR REPLACE FUNCTION public.get_unanalyzed_urls(p_profile_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (url TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  WITH ordered AS (
    SELECT COALESCE(tags->>'website', tags->>'contact:website') AS url, id, element_type, updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(tags->>'website', tags->>'contact:website')
        ORDER BY updated_at DESC NULLS LAST, id, element_type
      ) AS rn
    FROM osm_data
    WHERE profile_id = p_profile_id
      AND COALESCE(tags->>'website', tags->>'contact:website') IS NOT NULL
      AND (COALESCE(tags->>'website', tags->>'contact:website')) LIKE 'http%'
  )
  SELECT o.url FROM ordered o
  WHERE o.rn = 1
    AND o.url NOT IN (SELECT wa.url FROM website_analysis wa WHERE wa.profile_id = p_profile_id)
  ORDER BY o.updated_at DESC NULLS LAST, o.id, o.element_type
  LIMIT p_limit;
$$;
