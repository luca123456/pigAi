-- Outreach-Status: Wann wurde "Outreach starten" geklickt (nur einmal klickbar)
ALTER TABLE public.website_analysis
  ADD COLUMN IF NOT EXISTS outreach_sent_at TIMESTAMPTZ;
