-- Enable PostGIS extension for geographic data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create osm_data table for storing OpenStreetMap Overpass API results
CREATE TABLE IF NOT EXISTS public.osm_data (
    id BIGINT NOT NULL,
    element_type TEXT NOT NULL CHECK (element_type IN ('node', 'way', 'relation')),
    tags JSONB DEFAULT '{}'::jsonb,
    location GEOMETRY(Geometry, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, element_type)
);

-- Add comment for documentation
COMMENT ON TABLE public.osm_data IS 'OpenStreetMap data fetched from Overpass API';
COMMENT ON COLUMN public.osm_data.id IS 'OSM element ID (unique per element_type)';
COMMENT ON COLUMN public.osm_data.element_type IS 'OSM element type: node, way, or relation';
COMMENT ON COLUMN public.osm_data.tags IS 'All OSM tags (name, amenity, etc.) as JSON';
COMMENT ON COLUMN public.osm_data.location IS 'PostGIS geometry (Point for nodes, Polygon/LineString for ways)';

-- Create spatial index for fast geographic queries
CREATE INDEX IF NOT EXISTS idx_osm_data_location ON public.osm_data USING GIST (location);

-- Create index on tags for JSONB queries (e.g., filtering by amenity)
CREATE INDEX IF NOT EXISTS idx_osm_data_tags ON public.osm_data USING GIN (tags);

-- Create index on element_type for filtered queries
CREATE INDEX IF NOT EXISTS idx_osm_data_element_type ON public.osm_data (element_type);

-- Enable RLS (Row Level Security) - optional, configure policies as needed
ALTER TABLE public.osm_data ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for Edge Functions using service key)
CREATE POLICY "Service role has full access to osm_data"
    ON public.osm_data
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RPC function for upserting OSM data with geometry from coordinates
-- Supports both point (lon, lat) and WKT for complex geometries
CREATE OR REPLACE FUNCTION public.upsert_osm_data(
    p_id BIGINT,
    p_element_type TEXT,
    p_tags JSONB,
    p_lon DOUBLE PRECISION DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_geom_wkt TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location GEOMETRY(Geometry, 4326);
BEGIN
    IF p_geom_wkt IS NOT NULL THEN
        v_location := ST_SetSRID(ST_GeomFromText(p_geom_wkt), 4326);
    ELSIF p_lon IS NOT NULL AND p_lat IS NOT NULL THEN
        v_location := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
    ELSE
        v_location := NULL;
    END IF;

    INSERT INTO public.osm_data (id, element_type, tags, location, updated_at)
    VALUES (p_id, p_element_type, COALESCE(p_tags, '{}'::jsonb), v_location, NOW())
    ON CONFLICT (id, element_type)
    DO UPDATE SET
        tags = EXCLUDED.tags,
        location = EXCLUDED.location,
        updated_at = NOW();
END;
$$;

-- Bulk upsert function for Edge Functions (accepts EWKT location strings)
-- Each row: { id, element_type, tags, location } where location is EWKT e.g. "SRID=4326;POINT(lon lat)"
CREATE OR REPLACE FUNCTION public.upsert_osm_data_bulk(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r JSONB;
    v_location GEOMETRY(Geometry, 4326);
    v_count INTEGER := 0;
BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        IF r->>'location' IS NOT NULL AND r->>'location' != '' THEN
            BEGIN
                v_location := (r->>'location')::geometry;
            EXCEPTION WHEN OTHERS THEN
                v_location := NULL;
            END;
        ELSE
            v_location := NULL;
        END IF;

        INSERT INTO public.osm_data (id, element_type, tags, location, updated_at)
        VALUES (
            (r->>'id')::BIGINT,
            r->>'element_type',
            COALESCE((r->'tags')::jsonb, '{}'::jsonb),
            v_location,
            NOW()
        )
        ON CONFLICT (id, element_type)
        DO UPDATE SET
            tags = EXCLUDED.tags,
            location = EXCLUDED.location,
            updated_at = NOW();

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
