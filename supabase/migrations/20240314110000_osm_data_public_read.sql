-- Allow public read access to osm_data for frontend display
CREATE POLICY "Allow public read osm_data"
    ON public.osm_data FOR SELECT
    TO anon, authenticated
    USING (true);
