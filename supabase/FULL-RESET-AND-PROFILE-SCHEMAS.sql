-- ============================================================
-- pigAi: Vollständiger Reset + Profile mit eigenen Schemas
-- Im Supabase SQL Editor einfügen und "Run" klicken
-- ============================================================
-- Struktur:
--   profiles     = Übersicht aller Profile (id, name, schema_name)
--   Jedes Profil hat ein Schema mit:
--     - websites  = OSM/Website-Daten
--     - analysis  = Website-Analysen (Score, Reasoning, etc.)
--     - scores    = Bewertungen (Zusammenfassung)
-- Bei neuem Profil wird automatisch das Schema + Tabellen erstellt.
-- ============================================================

-- ========== TEIL 1: ALLES LEEREN ==========

-- Storage: Screenshots löschen
DELETE FROM storage.objects WHERE bucket_id = 'screenshots';

-- Tabellen leeren (falls vorhanden)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='website_analysis') THEN
    TRUNCATE TABLE public.website_analysis CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='osm_data') THEN
    TRUNCATE TABLE public.osm_data CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    TRUNCATE TABLE public.profiles CASCADE;
  END IF;
END $$;

-- Alte Profile-Schemas löschen
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'profile_%') LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.schema_name);
  END LOOP;
END $$;

-- PostGIS (wird für geometry in profile-Schemas benötigt)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ========== TEIL 2: PROFILE-TABELLE ==========
-- Speichert: Welches Schema gehört zu welchem Profil

DROP TABLE IF EXISTS public.profiles CASCADE;

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    schema_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public insert profiles" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ========== TEIL 3: FUNKTION – Neues Profil + Schema + Tabellen erstellen ==========
-- Jedes neue Profil bekommt automatisch: Schema + websites + analysis + scores

CREATE OR REPLACE FUNCTION public.create_profile_with_schema(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.profiles (name) VALUES (p_name) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_profile_with_schema(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_profile_with_schema(TEXT) TO authenticated;

-- Trigger: Bei INSERT (name) automatisch schema_name setzen + Schema erstellen
CREATE OR REPLACE FUNCTION public.on_profile_insert()
RETURNS TRIGGER AS $$
DECLARE v_schema TEXT;
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  v_schema := 'profile_' || replace(NEW.id::text, '-', '_');
  NEW.schema_name := v_schema;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_insert ON public.profiles;
CREATE TRIGGER trg_profile_insert BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_insert();

-- Nach INSERT: Schema + Tabellen erstellen
CREATE OR REPLACE FUNCTION public.on_profile_after_insert()
RETURNS TRIGGER AS $$
DECLARE v_schema TEXT;
BEGIN
  v_schema := NEW.schema_name;
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.websites (id BIGINT NOT NULL, element_type TEXT NOT NULL CHECK (element_type IN (''node'',''way'',''relation'')), tags JSONB DEFAULT ''{}''::jsonb, location GEOMETRY(Geometry, 4326), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (id, element_type))', v_schema);
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.analysis (id BIGSERIAL PRIMARY KEY, url TEXT NOT NULL, score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10), reasoning TEXT NOT NULL DEFAULT '''', lovable_prompt TEXT NOT NULL DEFAULT '''', screenshot_path TEXT, created_at TIMESTAMPTZ DEFAULT NOW())', v_schema);
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.scores (id BIGSERIAL PRIMARY KEY, url TEXT NOT NULL, score INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())', v_schema);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profile_after_insert ON public.profiles;
CREATE TRIGGER trg_profile_after_insert AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_after_insert();

-- ========== TEIL 4: Standard-Profil anlegen ==========
-- Feste UUID damit die App den Default-Profil kennt (Trigger erstellt Schema automatisch)

INSERT INTO public.profiles (id, name, schema_name) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Standard', 'profile_00000000_0000_0000_0000_000000000001')
ON CONFLICT (id) DO NOTHING;

-- ========== TEIL 5: Kompatibilität mit bestehender App ==========
-- osm_data und website_analysis bleiben als Tabellen mit profile_id,
-- damit die App ohne Code-Änderung weiterläuft.

CREATE TABLE IF NOT EXISTS public.osm_data (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    id BIGINT NOT NULL,
    element_type TEXT NOT NULL CHECK (element_type IN ('node', 'way', 'relation')),
    tags JSONB DEFAULT '{}'::jsonb,
    location GEOMETRY(Geometry, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (profile_id, id, element_type)
);

CREATE INDEX IF NOT EXISTS idx_osm_data_profile ON public.osm_data (profile_id);
CREATE INDEX IF NOT EXISTS idx_osm_data_location ON public.osm_data USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_osm_data_tags ON public.osm_data USING GIN (tags);

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

CREATE OR REPLACE VIEW public.osm_data_with_coords AS
SELECT profile_id, id, element_type, tags, created_at, updated_at,
    ST_Y(ST_Centroid(location::geometry)) AS lat,
    ST_X(ST_Centroid(location::geometry)) AS lon
FROM public.osm_data WHERE location IS NOT NULL;

ALTER TABLE public.osm_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read osm_data" ON public.osm_data FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full osm_data" ON public.osm_data FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.website_analysis (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    reasoning TEXT NOT NULL DEFAULT '',
    lovable_prompt TEXT NOT NULL DEFAULT '',
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_analysis_profile ON public.website_analysis (profile_id);
CREATE INDEX IF NOT EXISTS idx_website_analysis_url ON public.website_analysis (url);

ALTER TABLE public.website_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read website_analysis" ON public.website_analysis FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full website_analysis" ON public.website_analysis FOR ALL TO service_role USING (true) WITH CHECK (true);
