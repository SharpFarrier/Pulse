# Pulse — go live

A deployable Next.js app: the upload screen (approved mockup) on the tested
ingest core. Amazon Sponsored Products only, v1.

## 0. Try it locally first (optional, 2 min)

```
npm install
cp .env.example .env.local        # fill in the two values (step 3)
npm run dev                        # open http://localhost:3000
npm run test:ingest                # 24 checks on the ingest core
```

## 1. Put it in a repo

```
unzip pulse-app.zip -d pulse && cd pulse
git init && git add . && git commit -m "Pulse: Amazon ads ingestion (v1)"
gh repo create SharpFarrier/Pulse --private --source=. --push
```

## 2. Create the tables

Supabase dashboard → the shared project → SQL editor → paste and run
`supabase/migrations/001_pulse_schema.sql`. Creates five `pulse_` tables.
It does not touch `adslens_`.

## 3. Get the two env values

Supabase → Project settings → API:
- `SUPABASE_URL`  = Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** key (secret; server-only)

## 4. Deploy on Vercel

- Vercel → Add New → Project → import `SharpFarrier/Pulse`.
- Add both env vars (plain, **not** `NEXT_PUBLIC_` — the service key must stay server-side).
- Deploy.

## 5. Lock it down

Vercel → Project → Settings → Deployment Protection → **Vercel Authentication:
Standard**. Now only your Vercel account can open it — no auth code needed.
(Later, if others need in, swap to Google OAuth like AdsLens.)

Optional: Settings → Domains → add `pulse.sabiwabi.in`.

## 6. First upload

In Amazon Ads: Sponsored Products → Reporting → create these four, **unit of
time = Daily**, last 90 days, **XLSX**:
- Campaign report  (required — this is the totals source)
- Targeting report
- Search-term report
- Advertised-product report

Open Pulse → drop all four → confirm the green "Campaign report present" gate →
**Accept and save**. They land in the `pulse_` tables and show in Recent uploads.
Re-upload an overlapping range any time — last-write-wins keeps it clean.

## Next

Step 2 (daily preview) and step 3 (ask-your-ads) read from these same tables.
