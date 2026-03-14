-- ============================================================
-- pigAi Supabase Setup – Alle Migrationen in einem Durchlauf
-- Im SQL Editor einfügen und "Run" klicken
-- ============================================================

-- 0. Profile (verschiedene Anfragen pro Profil)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.profiles (id, name) VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Standard')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert profiles" ON public.profiles;
CREATE POLICY "Allow public insert profiles" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 1. PostGIS + osm_data
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.osm_data (
    profile_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    id BIGINT NOT NULL,
    element_type TEXT NOT NULL CHECK (element_type IN ('node', 'way', 'relation')),
    tags JSONB DEFAULT '{}'::jsonb,
    location GEOMETRY(Geometry, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (profile_id, id, element_type)
);

CREATE INDEX IF NOT EXISTS idx_osm_data_location ON public.osm_data USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_osm_data_tags ON public.osm_data USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_osm_data_element_type ON public.osm_data (element_type);

ALTER TABLE public.osm_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to osm_data" ON public.osm_data;
CREATE POLICY "Service role has full access to osm_data"
    ON public.osm_data FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_osm_data_bulk(p_rows JSONB, p_profile_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r JSONB; v_location GEOMETRY(Geometry, 4326); v_count INTEGER := 0;
BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        IF r->>'location' IS NOT NULL AND r->>'location' != '' THEN
            BEGIN v_location := (r->>'location')::geometry;
            EXCEPTION WHEN OTHERS THEN v_location := NULL; END;
        ELSE v_location := NULL; END IF;
        INSERT INTO public.osm_data (profile_id, id, element_type, tags, location, updated_at)
        VALUES (p_profile_id, (r->>'id')::BIGINT, r->>'element_type', COALESCE((r->'tags')::jsonb, '{}'::jsonb), v_location, NOW())
        ON CONFLICT (profile_id, id, element_type) DO UPDATE SET tags = EXCLUDED.tags, location = EXCLUDED.location, updated_at = NOW();
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END; $$;

-- 2. Lese-Zugriff osm_data
DROP POLICY IF EXISTS "Allow public read osm_data" ON public.osm_data;
CREATE POLICY "Allow public read osm_data"
    ON public.osm_data FOR SELECT TO anon, authenticated USING (true);

-- 3. Anon darf Upsert aufrufen
GRANT EXECUTE ON FUNCTION public.upsert_osm_data_bulk(JSONB, UUID) TO anon;

-- 4. View mit Koordinaten
CREATE OR REPLACE VIEW public.osm_data_with_coords AS
SELECT profile_id, id, element_type, tags, created_at, updated_at,
    ST_Y(ST_Centroid(location::geometry)) AS lat,
    ST_X(ST_Centroid(location::geometry)) AS lon
FROM public.osm_data WHERE location IS NOT NULL;

GRANT SELECT ON public.osm_data_with_coords TO anon;
GRANT SELECT ON public.osm_data_with_coords TO authenticated;

-- 5. website_analysis (Website-Bewertungen)
CREATE TABLE IF NOT EXISTS public.website_analysis (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    reasoning TEXT NOT NULL DEFAULT '',
    lovable_prompt TEXT NOT NULL DEFAULT '',
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_analysis_profile ON public.website_analysis (profile_id);
CREATE INDEX IF NOT EXISTS idx_website_analysis_url ON public.website_analysis (url);
CREATE INDEX IF NOT EXISTS idx_website_analysis_created_at ON public.website_analysis (created_at DESC);

ALTER TABLE public.website_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for website_analysis" ON public.website_analysis;
CREATE POLICY "Allow public read for website_analysis"
    ON public.website_analysis FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access to website_analysis" ON public.website_analysis;
CREATE POLICY "Service role full access to website_analysis"
    ON public.website_analysis FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: Noch nicht analysierte URLs für Batch-Analyse
CREATE OR REPLACE FUNCTION public.get_unanalyzed_urls(p_profile_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ordered AS (
    SELECT COALESCE(tags->>'website', tags->>'contact:website') AS url, id, element_type,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(tags->>'website', tags->>'contact:website') ORDER BY id, element_type) AS rn
    FROM osm_data
    WHERE profile_id = p_profile_id
      AND COALESCE(tags->>'website', tags->>'contact:website') IS NOT NULL
      AND (COALESCE(tags->>'website', tags->>'contact:website')) LIKE 'http%'
  )
  SELECT o.url FROM ordered o
  WHERE o.rn = 1 AND o.url NOT IN (SELECT wa.url FROM website_analysis wa WHERE wa.profile_id = p_profile_id)
  ORDER BY o.id, o.element_type
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_unanalyzed_urls(UUID, INT) TO service_role, anon;

-- 6. Storage Bucket Screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Public read screenshots" ON storage.objects;
CREATE POLICY "Public read screenshots" ON storage.objects FOR SELECT TO public USING (bucket_id = 'screenshots');
DROP POLICY IF EXISTS "Service role upload screenshots" ON storage.objects;
CREATE POLICY "Service role upload screenshots" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'screenshots');
DROP POLICY IF EXISTS "Service role update screenshots" ON storage.objects;
CREATE POLICY "Service role update screenshots" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'screenshots');
