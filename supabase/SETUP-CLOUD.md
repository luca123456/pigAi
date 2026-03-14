# Supabase Cloud Setup – Anleitung

## Schritt 1: Supabase Login

Öffne ein Terminal und führe aus:

```powershell
cd "c:\Users\me\Documents\Mannheim Hackathon\pigAi"
npx supabase login
```

Ein Browser-Fenster öffnet sich. Melde dich an und bestätige den Zugriff.

## Schritt 2: Projekt verbinden

```powershell
npx supabase link --project-ref ftwsqdzfxpoanjffcrio
```

Wenn nach einem Datenbank-Passwort gefragt wird: Das Passwort findest du im Supabase-Dashboard unter **Settings → Database → Database password**.

## Schritt 3: Migrationen ausführen

```powershell
npx supabase db push
```

## Schritt 4: Edge Function deployen

```powershell
npx supabase functions deploy fetch-overpass
```

## Schritt 5: Umgebungsvariablen setzen

1. Kopiere `.env.example` nach `.env.local`
2. Hole den **anon key** aus dem Supabase-Dashboard: **Settings → API → anon public**
3. Trage ihn in `.env.local` ein:

```
NEXT_PUBLIC_SUPABASE_URL=https://ftwsqdzfxpoanjffcrio.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein_anon_key_hier
```

## Alternative: Migration manuell ausführen

Falls `supabase link` nicht funktioniert:

1. Öffne https://supabase.com/dashboard/project/ftwsqdzfxpoanjffcrio
2. Gehe zu **SQL Editor**
3. Kopiere den Inhalt von `supabase/migrations/20240314000000_enable_postgis_osm_data.sql`
4. Füge ihn ein und klicke auf **Run**

## Edge Function testen

```powershell
curl -X POST "https://ftwsqdzfxpoanjffcrio.supabase.co/functions/v1/fetch-overpass" -H "Authorization: Bearer DEIN_ANON_KEY"
```
