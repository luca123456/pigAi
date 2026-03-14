This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Screenshots von URLs

Das Script `screenshot_urls.py` erstellt Screenshots von Webseiten. Nutzung:

```bash
cd scripts
pip install -r requirements.txt
playwright install chromium
python screenshot_urls.py
```

URLs in `backend/config.json` anpassen. Screenshots werden in Supabase Storage hochgeladen.

## Website-Analyse (Gemini)

Das Backend-Modul bewertet Webseiten per Screenshot mit Gemini 1.5 Flash:

```bash
pip install -r backend/requirements.txt
playwright install chromium
cp backend/.env.example backend/.env
# GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY in backend/.env eintragen
python -m backend.analyze_website https://example.com
```

Ergebnisse werden in Supabase gespeichert (`website_analysis` + Screenshots in Storage).

**Test-Run** (Analyse über Profil-Datenbanken):
```bash
python -m backend.test_run
# Optional: Limit angeben (Standard: 30)
python -m backend.test_run 10
```
Holt Website-URLs aus Supabase `osm_data` (pro Profil) und analysiert sie. Profil via `PIGAI_PROFILE_ID` in `backend/.env` (Standard: Standard-Profil).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
