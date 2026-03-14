-- Erlaube anon, die Bulk-Upsert-Funktion aufzurufen (für API ohne Edge Function)
GRANT EXECUTE ON FUNCTION public.upsert_osm_data_bulk(JSONB) TO anon;
