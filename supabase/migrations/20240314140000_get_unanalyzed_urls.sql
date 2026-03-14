-- RPC: Gibt URLs aus OSM zurück, die noch nicht in website_analysis sind.
-- Ermöglicht deterministisch die "nächsten N" Websites zu analysieren.
CREATE OR REPLACE FUNCTION public.get_unanalyzed_urls(p_profile_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (url TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  WITH ordered AS (
    SELECT COALESCE(tags->>'website', tags->>'contact:website') AS url, id, element_type,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(tags->>'website', tags->>'contact:website') ORDER BY id, element_type) AS rn
    FROM osm_data
    WHERE profile_id = p_profile_id
      AND COALESCE(tags->>'website', tags->>'contact:website') IS NOT NULL
      AND (COALESCE(tags->>'website', tags->>'contact:website')) LIKE 'http%'
  )
  SELECT o.url FROM ordered o
  WHERE o.rn = 1
    AND o.url NOT IN (SELECT wa.url FROM website_analysis wa WHERE wa.profile_id = p_profile_id)
  ORDER BY o.id, o.element_type
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_unanalyzed_urls(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unanalyzed_urls(UUID, INT) TO anon;
