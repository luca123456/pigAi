# Supabase Backend: OSM Overpass Integration

This directory contains the Supabase backend for fetching geographic data from the OpenStreetMap Overpass API and storing it in a PostGIS-enabled database.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Docker](https://www.docker.com/) (for local Supabase)
- Node.js 18+ (optional, for `@supabase/supabase-js` in frontend)

### Install Supabase CLI

```bash
# npm
npm install -g supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# macOS (Homebrew)
brew install supabase/tap/supabase
```

## 1. Database Setup

### Run Migrations Locally

```bash
# Start local Supabase (Docker required)
supabase start

# Apply migrations
supabase db reset

# Or apply without reset (if DB already running)
supabase migration up
```

### Run Migrations on Remote Project

```bash
# Link to your Supabase project (get project ref from dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### Migration Contents

- Enables **PostGIS** extension
- Creates **`osm_data`** table:
  - `id` (BIGINT) – OSM element ID
  - `element_type` (TEXT) – 'node', 'way', or 'relation'
  - `tags` (JSONB) – OSM tags (name, amenity, etc.)
  - `location` (GEOMETRY) – PostGIS geometry (Point, Polygon, LineString)
- Adds spatial index on `location` for fast queries
- Adds GIN index on `tags` for JSONB queries
- RPC functions: `upsert_osm_data`, `upsert_osm_data_bulk`

## 2. Edge Function: fetch-overpass

### Local Development

```bash
# Start Supabase (if not already running)
supabase start

# Serve Edge Functions locally
supabase functions serve fetch-overpass

# In another terminal, invoke the function
curl -X POST "http://localhost:54321/functions/v1/fetch-overpass" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

Get `YOUR_ANON_KEY` from `supabase status` after running `supabase start`.

### Custom Bounding Box

Pass query parameters to change the search area:

```bash
curl -X POST "http://localhost:54321/functions/v1/fetch-overpass?south=49.4&west=8.4&north=49.5&east=8.5" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Parameters: `south`, `west`, `north`, `east` (lat/lon in decimal degrees).

### Deploy to Supabase

```bash
supabase functions deploy fetch-overpass
```

## 3. Overpass API Error Handling

The Edge Function handles:

- **429 Too Many Requests** – Retries after `Retry-After` header or 5 seconds
- **503 Service Unavailable** – Retries up to 3 times with 5-second delay
- **Network errors** – Retries up to 3 times

To avoid rate limits:

- Use a smaller bounding box
- Add delays between bulk runs
- Consider using [Overpass Turbo](https://overpass-turbo.eu/) for one-off queries

## 4. Query Examples

### Spatial Query (PostGIS)

```sql
-- Find cafes within 1km of a point (Mannheim center)
SELECT id, element_type, tags->>'name' as name, ST_AsText(location)
FROM osm_data
WHERE ST_DWithin(
  location::geography,
  ST_SetSRID(ST_MakePoint(8.4669, 49.4875), 4326)::geography,
  1000
)
AND tags->>'amenity' = 'cafe';
```

### Filter by Tags

```sql
SELECT * FROM osm_data
WHERE tags->>'amenity' = 'pharmacy'
AND element_type = 'node';
```

## 5. Custom Overpass QL (Frontend)

Das Frontend bietet eine Overpass-Turbo-ähnliche Oberfläche. Die Edge Function akzeptiert eine benutzerdefinierte Abfrage per POST:

```json
{ "query": "[out:json]; node[\"amenity\"=\"cafe\"](49.45,8.42,49.55,8.55); out body;" }
```

`{{bbox}}` im Frontend wird durch die eingegebenen Bounding-Box-Werte ersetzt.

## 6. Project Structure

```
supabase/
├── config.toml              # Local Supabase config
├── migrations/
│   ├── 20240314000000_enable_postgis_osm_data.sql
│   ├── 20240314100000_website_analysis_storage.sql
│   ├── 20240314110000_osm_data_public_read.sql
│   └── 20240314120000_osm_data_view.sql
├── functions/
│   └── fetch-overpass/
│       └── index.ts        # Edge Function (custom QL via POST)
└── README.md               # This file
```

## 7. Environment Variables

For local development, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically when using `supabase functions serve`.

For deployed functions, set secrets:

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Note: These are usually set by default for Edge Functions; only override if needed.
