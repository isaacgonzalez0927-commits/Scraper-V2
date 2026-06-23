# Acsend Call List

Mobile web app for your cold caller. They pick a city, tap **Get My Call List**, and dial HVAC businesses that need a website.

## Run locally (same Wi-Fi as your phone)

```bash
cd lead-finder
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open the printed URL on the caller's phone.

## Deploy online (Render — free tier)

**Why not Netlify?** Netlify hosts static HTML only. This app is Python (Flask) and must run on a server like Render.

### 1. Push code to GitHub

Your repo: `https://github.com/isaacgonzalez0927-commits/Scraper-V2`

Make sure `.env` is **not** committed (it's in `.gitignore`).

### 2. Create a Render web service

1. Go to [render.com](https://render.com) and sign up (free).
2. **New → Web Service** → connect your GitHub repo `Scraper-V2`.
3. Settings:
   - **Root Directory:** `lead-finder` (if the repo root is the parent folder, leave blank if repo IS lead-finder)
   - **Runtime:** Python
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `gunicorn app:app --workers 1 --threads 8 --timeout 180`
4. **Environment variables** (Environment tab):
   - `GOOGLE_MAPS_API_KEY` = your Google Places key
   - `ACCESS_CODE` = a password only your caller knows (e.g. `acsend2026`)
5. Click **Deploy**.

Render gives you a URL like `https://acsend-leads.onrender.com`.

### 3. Give your caller the link

1. Send them the Render URL.
2. First time: they enter the **access code** once (saved on their phone).
3. **Add to Home Screen** (iPhone: Share → Add to Home Screen) so it feels like an app.

### 4. Optional — custom domain

In Render → Settings → Custom Domains, point something like `leads.acsendsites.com` if you own the domain.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_MAPS_API_KEY` | Yes | Google Places search |
| `ACCESS_CODE` | Recommended | Password so random people can't use your API credits |
| `PORT` | Auto on Render | Local dev only |
