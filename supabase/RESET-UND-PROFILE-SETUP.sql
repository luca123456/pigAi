-- ============================================================
-- pigAi: Alle Daten leeren + Profile-Struktur neu aufsetzen
-- Im Supabase SQL Editor einfügen und "Run" klicken
-- ============================================================
--
-- STRUKTUR:
-- 1. profiles (Übersicht) – speichert, welches Schema zu welchem Profil gehört
-- 2. Jedes Profil hat ein eigenes Schema mit:
--    - websites  = OSM/Website-Daten (Name, URL etc.)
--    - analysis  = Analyse-Daten (Score, Reasoning, Screenshot)
--    - scores    = Score/Bewertungs-Daten
-- 3. Bei neuem Profil werden automatisch Schema + Tabellen erstellt
--
-- Hinweis: In Supabase gibt es eine Datenbank pro Projekt.
-- Jedes Profil bekommt ein eigenes SCHEMA (logische "Datenbank").
-- ============================================================

-- ========== TEIL 1: ALLES LEEREN ==========

-- Hinweis: Storage (Screenshots) kann nicht per SQL gelöscht werden.
-- Zum Leeren: Supabase Dashboard → Storage → screenshots → Dateien manuell löschen
-- oder Storage API verwenden.

-- View und Tabellen explizit löschen (sonst bleibt ggf. altes Schema ohne profile_id)
DROP VIEW IF EXISTS public.osm_data_with_coords CASCADE;
DROP TABLE IF EXISTS public.website_analysis CASCADE;
DROP TABLE IF EXISTS public.osm_data CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Alle Profile-Schemas löschen (profile_xxx)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'profile_%') LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.schema_name);
  END LOOP;
END $$;

-- PostGIS für Geometrie-Daten
CREATE EXTENSION IF NOT EXISTS postgis;

-- ========== TEIL 2: PROFILE-TABELLE ==========
-- Speichert: Welches Schema gehört zu welchem Profil

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    schema_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN public.profiles.schema_name IS 'Name des Schemas mit websites, analysis, scores für dieses Profil';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public insert profiles" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ========== TEIL 3: Trigger – Schema-Name setzen ==========
CREATE OR REPLACE FUNCTION public.on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  NEW.schema_name := 'profile_' || replace(NEW.id::text, '-', '_');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_insert ON public.profiles;
CREATE TRIGGER trg_profile_insert BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_insert();

-- ========== TEIL 4: Trigger – Bei neuem Profil Schema + Tabellen erstellen ==========
CREATE OR REPLACE FUNCTION public.on_profile_after_insert()
RETURNS TRIGGER AS $$
DECLARE v_schema TEXT;
BEGIN
  v_schema := NEW.schema_name;
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
  -- websites: OSM/Website-Daten
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.websites (
    id BIGINT NOT NULL,
    element_type TEXT NOT NULL CHECK (element_type IN (''node'',''way'',''relation'')),
    tags JSONB DEFAULT ''{}''::jsonb,
    location GEOMETRY(Geometry, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, element_type)
  )', v_schema);
  -- analysis: Analyse-Daten (Score, Reasoning, Screenshot)
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.analysis (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    reasoning TEXT NOT NULL DEFAULT '''',
    lovable_prompt TEXT NOT NULL DEFAULT '''',
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )', v_schema);
  -- scores: Bewertungs-Daten
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.scores (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )', v_schema);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profile_after_insert ON public.profiles;
CREATE TRIGGER trg_profile_after_insert AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_after_insert();

-- ========== TEIL 5: Standard-Profil anlegen ==========
-- Trigger erstellt automatisch Schema + Tabellen
INSERT INTO public.profiles (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Standard')
ON CONFLICT (id) DO NOTHING;

-- ========== TEIL 6: Kompatibilität mit bestehender App ==========
-- osm_data und website_analysis mit profile_id (für App ohne Code-Änderung)

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

-- RPC: Noch nicht analysierte URLs für Batch-Analyse (deterministisch)
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

-- Storage Bucket (falls noch nicht vorhanden)
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', true) ON CONFLICT (id) DO NOTHING;
