# reesr

A modern local-first music player with:
- inline/fullscreen video playback
- discovery + server-side downloading
- account sync
- cloud-aware tracks (online stream + optional offline download)
- PWA support for phone install

## Tech Stack

- Frontend: `React` + `TypeScript` + `Vite`
- Backend: `Express` + `better-sqlite3`
- Local app storage: `IndexedDB` (tracks/albums/playlists)
- Download pipeline: `yt-dlp` via backend

## Local Development

Prerequisites:
- Node.js 20+
- `yt-dlp` installed and available on `PATH`

Install:

```bash
npm install
```

Run backend:

```bash
npm run server
```

Run frontend:

```bash
npm run dev -- --host 127.0.0.1 --port 3000
```

Quality checks:

```bash
npm run lint
npm run build
```

## Environment Variables

Copy from `.env.example` and set values in hosting dashboards:

- Frontend env:
   - `VITE_API_BASE_URL` (example: `https://api.your-domain.com/api`)
- Backend env:
   - `PORT` (host usually injects this)
   - `NODE_ENV=production`
   - `DB_PATH` (recommended in production, example: `/var/data/server-data.sqlite`)
   - `YOUTUBE_COOKIES_B64` (see YouTube Cookie Setup below)

## YouTube Cookie Setup

YouTube blocks downloads from cloud server IPs unless you provide authentication cookies. This is a one-time ~2 minute setup.

### Step 1: Export cookies (do this on your personal computer)

1. Open a **new Incognito / Private Browsing** window
2. Go to [youtube.com](https://youtube.com) and **sign in** (use a throwaway Google account if you prefer)
3. In the **same tab**, navigate to `https://www.youtube.com/robots.txt`
4. Use the [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) browser extension → click it → **Export**
5. Save the file as `cookies.txt`
6. **Close the Incognito window** immediately (don't browse YouTube in it again — this prevents cookie rotation)

### Step 2: Base64-encode and add to Render

Run this in your terminal:

```bash
base64 < cookies.txt | tr -d '\n'
```

Copy the output, then in Render dashboard → **Environment** tab:
- **Key**: `YOUTUBE_COOKIES_B64`
- **Value**: paste the base64 string

Save → Render redeploys automatically.

### Step 3: Verify

```
curl https://aura-music-api.onrender.com/api/health
```

Should show `"ytCookies": true`. Downloads should now work.

### Troubleshooting

- If downloads stop working after a few weeks, your cookies may have expired. Repeat steps 1–2.
- Use a throwaway Google account to avoid risk to your main account.
- Alternative: set `YOUTUBE_COOKIES` env var with the raw cookie text (but base64 is easier for multi-line content).

## Push to GitHub

```bash
git init
git add .
git commit -m "Initial deploy-ready commit"
git branch -M main
git remote add origin https://github.com/braydenreesmusic-web/aura-music-2.git
git push -u origin main
```

CI is included at `.github/workflows/ci.yml` and runs lint + build on push/PR.

## Recommended Production Architecture

Use this split setup:

- Frontend: `Vercel`
- Backend API: `Railway` or `Render`
- Domain:
   - `app.your-domain.com` → frontend
   - `api.your-domain.com` → backend

### Why this setup

- Fast frontend deploys
- Simple backend deploy with persistent service URL
- Clean API separation for mobile and web clients

## Domain + DNS Setup

At your DNS provider:

- Add `CNAME` for `app` pointing to frontend host target
- Add `CNAME` for `api` pointing to backend host target
- Optionally redirect apex domain to `app.your-domain.com`

Set frontend env:
- `VITE_API_BASE_URL=https://api.your-domain.com/api`

## Deploy Now (Fast Path)

### 1) Push to GitHub

```bash
git add .
git commit -m "Deploy-ready setup"
git push
```

### 2) Deploy frontend on Vercel

1. Import your GitHub repo in Vercel.
2. Framework preset: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add env var:
   - `VITE_API_BASE_URL=https://api.your-domain.com/api`
6. Deploy.

### 3) Deploy backend on Railway

1. Create new Railway project from same GitHub repo.
2. Service root: repository root.
3. Railway auto-detects `railway.toml` and runs:
   - `startCommand = npm run start:server`
4. Keep `nixpacks.toml` in repo root so Railway installs required binaries:
   - `yt-dlp`
   - `ffmpeg`
5. Add persistent volume mounted to service root so SQLite + `downloads/` persist.
6. Confirm health endpoint:
   - `/api/health`

Recommended Railway env vars:
- `NODE_ENV=production`
- `PORT` (optional; Railway usually injects this)
- `DB_PATH=/var/data/server-data.sqlite` (or your mounted persistent disk path)

### Deploy backend on Render (free tier)

1. Create a new Web Service from the GitHub repo.
2. **Runtime**: `Node`
3. **Build Command**: `npm run render:build`
4. **Start Command**: `npm run render:start`
5. Add env vars:
   - `NODE_ENV=production`
   - `YTDL_NO_UPDATE=1`
6. Do **NOT** set `DB_PATH` unless you attach a persistent disk (free tier has no persistent disk — the server auto-falls-back to a writable path).
7. In Render dashboard fields, enter commands as plain text (no surrounding backticks/quotes).
8. Deploy. Check logs for:
   ```
   [downloader] yt-dlp found: /home/user/.local/bin/yt-dlp
   🎵 reesr server running on port 10000
   ```

> **Note**: On Render free tier the DB resets on each redeploy (no persistent disk). Users will need to re-create their account after each deploy. For durable storage, upgrade to a paid plan and attach a persistent disk mounted at `/var/data`, then set `DB_PATH=/var/data/server-data.sqlite`.

If downloads/search fail on backend:
- Open Railway logs and check for `yt-dlp not found` or `ffmpeg` errors.
- Verify `nixpacks.toml` is detected in build logs.
- Redeploy after adding/updating `nixpacks.toml`.

### 4) Point your domain

At your DNS provider:
- `app.your-domain.com` → Vercel target (`CNAME`)
- `api.your-domain.com` → Railway target (`CNAME`)

Then update Vercel env if needed:
- `VITE_API_BASE_URL=https://api.your-domain.com/api`

### 5) Verify from phone

1. Open `https://app.your-domain.com`
2. Sign in
3. Confirm cloud tracks appear online
4. Tap cloud-download icon for offline copy
5. Add to Home Screen (PWA install)

## Phone Usage (PWA)

Once deployed on HTTPS:

- iPhone (Safari): Share → Add to Home Screen
- Android (Chrome): Install App / Add to Home Screen

Behavior model:
- Offline: local downloaded/imported tracks only
- Online + signed in: cloud tracks visible and playable
- Online + not downloaded: user gets download option for offline use

## Important Storage Note

Current backend stores media under `downloads/` and metadata in SQLite.

For reliable long-term cloud playback across devices, use persistent storage:

- Good now: Railway/Render persistent disk + SQLite
- Best at scale: object storage (S3/R2) + Postgres metadata

## Next Upgrade Path (Optional)

If you want to scale beyond single-server disk storage:

1. Move media files from local disk to S3/R2
2. Store media URLs + metadata in Postgres
3. Keep IndexedDB for per-device offline cache
4. Add background sync for queued offline downloads
