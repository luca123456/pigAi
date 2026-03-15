# PigAI — AI-Powered Local Business Website Auditor

PigAI automatically discovers local businesses via OpenStreetMap, screenshots their websites, scores them with AI (OpenAI Vision), and generates modern redesign proposals using Lovable. It streamlines the entire prospecting-to-outreach pipeline for web design agencies.

## How It Works

```
Search businesses by location
        │
        ▼
  Overpass / OSM query
        │
        ▼
  Batch-analyze websites
  (Playwright screenshot → OpenAI Vision scoring)
        │
        ▼
  Identify worst-performing sites
        │
        ▼
  Generate redesign via Lovable
        │
        ▼
  Send outreach via Make.com webhook
```

1. **Search** — Enter an address, business type (e.g. restaurant, shop), and radius. PigAI geocodes the location via Nominatim and queries the Overpass API for matching OpenStreetMap POIs. Results are stored in Supabase.
2. **Analyze** — For each business with a website, Playwright takes a full-page screenshot and sends it to OpenAI Vision (`gpt-4.1-mini`). The AI scores the site on visual quality, UX clarity, SEO signals, and GEO signals (1–10), returning strengths, weaknesses, and quick wins.
3. **Redesign** — The worst-scoring websites can be automatically redesigned: PigAI opens Lovable via browser automation, feeds it the original screenshot and a redesign prompt, waits for the generated project, and stores the result.
4. **Outreach** — With the original site, its score, and a polished redesign side-by-side, you can trigger outreach to the business owner via a Make.com webhook.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Backend | Python 3 (Playwright, httpx, python-dotenv) |
| AI | OpenAI Vision API (gpt-4.1-mini) |
| Database | Supabase (PostgreSQL + PostGIS + Storage) |
| Redesign | Lovable.dev (browser automation via Playwright) |
| Outreach | Make.com (webhook) |
| Geo Data | OpenStreetMap Overpass API, Nominatim |

## Project Structure

```
pigai/
├── app/                        # Next.js App Router
│   ├── api/                    # API routes (proxy to Python backend + Supabase)
│   │   ├── analyze/            # Trigger batch or single-URL analysis
│   │   ├── overpass/           # Overpass query → geocode → Supabase
│   │   ├── lovable-create/     # Lovable redesign automation
│   │   ├── found-businesses/   # OSM businesses + analysis join
│   │   ├── worst-websites/     # Lowest-scored sites
│   │   ├── projects/           # Sites with Lovable drafts
│   │   ├── outreach-sent/      # Mark outreach as sent
│   │   ├── sent-requests/      # Outreach history
│   │   ├── results/            # All analysis results
│   │   ├── profiles/           # Multi-profile support
│   │   └── preview-proxy/      # Proxy for Lovable preview iframes
│   ├── page.tsx                # Main dashboard
│   └── layout.tsx              # Root layout with ProfileProvider
├── components/                 # React components
│   ├── Hero.tsx                # Search form (address, type, radius)
│   ├── WebsiteScores.tsx       # Found businesses + "Analyze next 10"
│   ├── WorstWebsites.tsx       # Worst sites + Lovable + outreach
│   ├── CurrentProjects.tsx     # Active Lovable redesign projects
│   ├── SentRequests.tsx        # Outreach history
│   ├── OwnWebsiteSection.tsx   # Single-URL analysis input
│   ├── ProfileSelector.tsx     # Profile switcher
│   └── ...                     # Header, Footer, Cards, Overlays
├── lib/                        # Shared utilities and types
├── backend/                    # Python backend
│   ├── analyze_website.py      # Screenshot → OpenAI → Supabase
│   ├── batch_analyze.py        # Batch analysis from OSM data
│   ├── lovable_create.py       # Lovable browser automation
│   ├── lovable_session_setup.py# One-time Lovable login
│   ├── supabase_client.py      # Supabase REST client
│   ├── config.py               # Shared config (model, viewport, paths)
│   └── requirements.txt        # Python dependencies
├── supabase/                   # Database setup
│   ├── migrations/             # SQL migrations (PostGIS, tables, RLS, RPCs)
│   ├── SETUP-SQL.sql           # Full setup script
│   └── functions/              # Edge functions
└── scripts/                    # Utility scripts
```

## Database Schema

**`profiles`** — Multi-tenant profiles for separate search contexts.

**`osm_data`** — OpenStreetMap POIs with PostGIS geometry, linked to a profile. Stores tags (name, website, phone, etc.) and location.

**`website_analysis`** — AI analysis results per URL: score (1–10), reasoning, strengths/weaknesses, screenshot path, Lovable project URL, and outreach status.

**`screenshots`** (Storage) — Public bucket for original website screenshots and Lovable redesign screenshots.

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A [Supabase](https://supabase.com) project

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
pip install -r backend/requirements.txt
playwright install chromium
```

### 2. Configure environment variables

```bash
# Frontend — create .env.local from the example
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Backend — create backend/.env from the example
cp backend/.env.example backend/.env
# Set OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
```

### 3. Set up the database

Run the SQL migrations in your Supabase Dashboard (SQL Editor), or use the combined setup script:

```sql
-- Run supabase/SETUP-SQL.sql in the Supabase SQL Editor
```

This creates the `profiles`, `osm_data`, and `website_analysis` tables, enables PostGIS, sets up RLS policies, and creates the `get_unanalyzed_urls` RPC.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Usage

### Search for businesses

Enter an address (e.g. "Munich, Germany"), a business type (e.g. "restaurant"), and a search radius. PigAI queries OpenStreetMap and stores the results.

### Analyze websites

Click **"Analyze next 10"** to batch-analyze unscored websites. Each site is screenshotted and scored by OpenAI Vision on four dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| Visual Quality | 35% | Design, layout, typography, color, hierarchy |
| UX Clarity | 30% | Readability, structure, CTAs, trust signals |
| SEO Signals | 20% | Headlines, content hierarchy, search intent |
| GEO Signals | 15% | Citable content, clear services, extractable info |

The weighted average produces an overall score (1–10) with a verdict: **outdated** (1–3), **average** (4–6), or **strong** (7–10).

### Analyze a single URL

Use the **"Analyze your own website"** section to score any URL on demand.

### Generate a redesign

For the worst-performing sites, click **"Improve"** to automatically generate a modern redesign via Lovable. Requires a one-time Lovable login setup:

```bash
python -m backend.lovable_session_setup
```

### Send outreach

Once a redesign is ready, click **"Start outreach"** to send the original site, score, and redesign preview to a Make.com webhook for automated outreach.

## Make.com Outreach Workflow

The outreach automation runs entirely on Make.com. When a user clicks "Start outreach" in PigAI, the following 8-step scenario executes automatically:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Webhook │────▶│  2. HTTP     │────▶│  3. Tools    │
│  (Trigger)  │     │  Download   │     │  Set Variable│
│             │     │  Screenshot │     │              │
└─────────────┘     └─────────────┘     └──────┬───────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  6. Make AI │◀────│  5. JSON     │◀────│  4. OpenAI   │
│  Web Search │     │  Parse      │     │  Generate    │
│  Find Email │     │  Response   │     │  Email Copy  │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  7. Tools   │────▶│  8. Gmail    │
│  Set Variable│     │  Send Email │
│             │     │              │
└─────────────┘     └─────────────┘
```

| Step | Module | Purpose |
|------|--------|---------|
| 1 | **Webhooks** — Custom webhook | Receives the trigger from PigAI with the website URL, score, screenshot URL, and redesign preview |
| 2 | **HTTP** — Download a file | Downloads the original website screenshot from Supabase Storage |
| 3 | **Tools** — Set variable | Prepares and structures the data for the AI prompt |
| 4 | **OpenAI** — Generate a completion | Writes a personalized cold outreach email based on the website analysis (score, weaknesses, redesign preview) |
| 5 | **JSON** — Parse JSON | Parses the structured response from OpenAI (subject line, email body, etc.) |
| 6 | **Make AI Web Search** — Generate a response | Searches the web to find the business owner's contact email address |
| 7 | **Tools** — Set variable | Assembles the final email (recipient, subject, body with redesign link) |
| 8 | **Gmail** — Send an email | Sends the personalized outreach email to the business owner |

The result: a fully automated pipeline from "this website scored 2/10" to a professional cold email landing in the business owner's inbox — with their specific weaknesses, a link to the AI-generated redesign, and a clear call to action.

## CLI Usage

```bash
# Analyze a single URL
python -m backend.analyze_website https://example.com

# Batch-analyze from OSM data (default: 10 URLs)
python -m backend.batch_analyze
python -m backend.batch_analyze 25   # custom limit

# Test run (alias for batch analysis)
python -m backend.test_run
python -m backend.test_run 5
```

## Environment Variables

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key (needed for Overpass upsert) |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_MODEL` | No | Model name (default: `gpt-4.1-mini`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `PIGAI_PROFILE_ID` | No | Profile UUID (default: standard profile) |
| `LOVABLE_WORKSPACE` | No | Lovable workspace name for automation |

## License

Private project — not licensed for redistribution.
