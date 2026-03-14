-- View mit extrahierten Koordinaten für Frontend (lat/lon aus PostGIS)
CREATE OR REPLACE VIEW public.osm_data_with_coords AS
SELECT
    id,
    element_type,
    tags,
    created_at,
    updated_at,
    ST_Y(ST_Centroid(location::geometry)) AS lat,
    ST_X(ST_Centroid(location::geometry)) AS lon
FROM public.osm_data
WHERE location IS NOT NULL;

GRANT SELECT ON public.osm_data_with_coords TO anon;
GRANT SELECT ON public.osm_data_with_coords TO authenticated;
