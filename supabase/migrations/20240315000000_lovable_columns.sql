-- Lovable-Integration: Spalten für generierte Projekt-URL und Screenshot
ALTER TABLE public.website_analysis
    ADD COLUMN IF NOT EXISTS lovable_project_url TEXT,
    ADD COLUMN IF NOT EXISTS lovable_screenshot_path TEXT;
