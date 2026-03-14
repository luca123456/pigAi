-- Table for website analysis results (replaces results.json)
CREATE TABLE IF NOT EXISTS public.website_analysis (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    reasoning TEXT NOT NULL DEFAULT '',
    lovable_prompt TEXT NOT NULL DEFAULT '',
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_analysis_url ON public.website_analysis (url);
CREATE INDEX IF NOT EXISTS idx_website_analysis_created_at ON public.website_analysis (created_at DESC);

-- RLS
ALTER TABLE public.website_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for website_analysis"
    ON public.website_analysis FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Service role full access to website_analysis"
    ON public.website_analysis FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Storage bucket for screenshots (replaces backend/screenshots/)
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, service_role write
CREATE POLICY "Public read screenshots"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'screenshots');

CREATE POLICY "Service role upload screenshots"
    ON storage.objects FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'screenshots');

CREATE POLICY "Service role update screenshots"
    ON storage.objects FOR UPDATE
    TO service_role
    USING (bucket_id = 'screenshots');
