-- Migration: Profile-Support für bestehende Installationen
-- Nur ausführen, wenn osm_data/website_analysis bereits ohne profile_id existieren

-- 1. Profile-Tabelle
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

-- 2. osm_data: profile_id hinzufügen (falls Spalte fehlt)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='osm_data' AND column_name='profile_id') THEN
    ALTER TABLE public.osm_data ADD COLUMN profile_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
    ALTER TABLE public.osm_data DROP CONSTRAINT IF EXISTS osm_data_pkey;
    ALTER TABLE public.osm_data ADD PRIMARY KEY (profile_id, id, element_type);
    CREATE INDEX IF NOT EXISTS idx_osm_data_profile ON public.osm_data (profile_id);
  END IF;
END $$;

-- 3. website_analysis: profile_id hinzufügen (falls Spalte fehlt)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='website_analysis' AND column_name='profile_id') THEN
    ALTER TABLE public.website_analysis ADD COLUMN profile_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_website_analysis_profile ON public.website_analysis (profile_id);
  END IF;
END $$;

-- 4. upsert_osm_data_bulk Funktion aktualisieren (neuer Parameter p_profile_id)
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

GRANT EXECUTE ON FUNCTION public.upsert_osm_data_bulk(JSONB, UUID) TO anon;

-- 5. View aktualisieren (profile_id einschließen)
CREATE OR REPLACE VIEW public.osm_data_with_coords AS
SELECT profile_id, id, element_type, tags, created_at, updated_at,
    ST_Y(ST_Centroid(location::geometry)) AS lat,
    ST_X(ST_Centroid(location::geometry)) AS lon
FROM public.osm_data WHERE location IS NOT NULL;

GRANT SELECT ON public.osm_data_with_coords TO anon;
GRANT SELECT ON public.osm_data_with_coords TO authenticated;
