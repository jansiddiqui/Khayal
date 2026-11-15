# Deploying the public demo on Voroa (free tier)

Khayal runs on Voroa as three pieces:

| Piece | Voroa product | Plan |
|---|---|---|
| Database | Postgres | DB Nano (1 GB, few connections) |
| Backend (FastAPI) | Web Service, native Python 3.12 | Nano (free; sleeps after 15 min idle) |
| Frontend (React/Vite) | Web Service, Vite | Nano (free) |

Voroa has no config file: everything below is typed into the dashboard. Labels in the
dashboard may differ slightly from the ones here; the values are what matters.

The public demo is a **demo**: it shows a banner on every screen (except during a game,
where the board needs the whole phone screen), rate-limits sign-up, sign-in and pairing,
and deletes every account and its data 7 days after it was made.

---

## 0. Before you start

1. Merge the branch `deploy-voroa` into `main` and push. Voroa deploys `main`.
2. Make two secrets on your own computer (any Python 3 works):

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   Run it twice. Keep the first as the **JWT secret** and the second as the **tick secret**.
   Paste them only into Voroa's environment variables, never into the code or a chat.
   If a secret ever leaks: make a new one, update the variable and redeploy. (A new JWT
   secret signs everyone out, which is fine for a demo.)

---

## 1. Create the database

1. Voroa dashboard → **New** → **Postgres**.
2. Name: `khayal-db`. Region: the one closest to your users (and use the **same region**
   for both web services). Plan: **DB Nano**.
3. **Create**, and wait until it shows as available.
4. Open `khayal-db` → **Connection** → copy the connection URL. It looks like
   `postgres://USER:PASS@HOST:PORT/DB?sslmode=require`.
   If Voroa shows an internal and an external URL, copy the **internal** one for the backend.

You don't need to change the URL: the backend turns `postgres://` into the driver it
uses and keeps `?sslmode=require`.

---

## 2. Create the backend Web Service

1. Dashboard → **New** → **Web Service** → connect the GitHub repository → branch `main`.
2. **Name:** `khayal-api`.
3. **Root directory:** leave it empty (the repository root). The backend imports the
   `ml/` folder, so it must run from the root. The root has the two files Voroa's Python
   detection looks for: `requirements.txt` (self-contained: the same pinned packages as `backend/requirements.txt`, checked by a test) and
   `.python-version` (`3.12`).
4. **Runtime:** Python (native). Voroa should detect it; choose Python 3.12 if asked.
5. **Build command:** leave Voroa's default (`pip install -r requirements.txt`).
6. **Start command** (type exactly):

   ```
   python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"
   ```

   `--proxy-headers` makes the rate limits see each visitor's own address instead of
   Voroa's proxy.

7. **Pre-deploy command** (type exactly):

   ```
   python -m alembic -c backend/alembic.ini upgrade head
   ```

   This applies database migrations before the new version takes traffic. On the first
   deploy it creates all the tables.

8. **Health check path:** `/api/health`
9. **Plan:** Nano (free). Keep **one** instance (the rate limits live in memory, and the
   database allows few connections).
10. **Environment variables** (add each one):

    | Name | Example value | Notes |
    |---|---|---|
    | `KHAYAL_ENV` | `production` | Turns on the production checks. |
    | `KHAYAL_DATABASE_URL` | `postgres://USER:PASS@HOST:PORT/DB?sslmode=require` | From step 1. **Or** name it `DATABASE_URL`, as Voroa's dashboard suggests: the backend reads `KHAYAL_DATABASE_URL` first and falls back to `DATABASE_URL`. Set one, not both. |
    | `KHAYAL_JWT_SECRET` | *(first secret from step 0)* | At least 32 characters. The backend refuses to start in production without it. |
    | `KHAYAL_CORS_ORIGINS` | `https://khayal-web.example.app` | The frontend's address, no trailing slash. You get it in step 4; until then put any placeholder and change it later. Several addresses: comma-separated. |
    | `KHAYAL_TIMEZONE` | `Asia/Kolkata` | The clock for "today" (reminders, today's games). |
    | `KHAYAL_DEMO_MODE` | `1` | Banner, "Try the demo", smaller uploads, 7-day clean-up. |
    | `KHAYAL_TICK_SECRET` | *(second secret from step 0)* | Optional; only needed for the external cron in step 6. Without it `/api/internal/tick` does not exist. |

    Optional, with their defaults (leave them out unless you want to change them):

    | Name | Default | Meaning |
    |---|---|---|
    | `KHAYAL_STORAGE` | `db` in production | Where photos and recordings are kept. `db` = a database table (Voroa has no persistent disk or free object storage). |
    | `KHAYAL_DEMO_ACCOUNT_DAYS` | `7` | Demo accounts are deleted after this many days. |
    | `KHAYAL_DEMO_MAX_CAREGIVERS` | `200` | Above this many demo caregivers, the oldest are deleted first. One demo uses roughly 0.5 MB, so 200 is about 100 MB of the 1 GB. |
    | `KHAYAL_REMINDER_CHECK_MINUTES` | `15` | How often the server checks for missed reminders and expired demo accounts while awake. |
    | `KHAYAL_DB_POOL_SIZE` / `KHAYAL_DB_MAX_OVERFLOW` | `3` / `2` | Database connections: at most 5 per instance. |
    | `KHAYAL_ALERT_RULE` | `persistence` | Decline alert rule B (see CLAUDE.md section 6). |

11. **Create Web Service**.

---

## 3. Deploy and test the backend

1. Watch the deploy in **Events / Deploys**. You should see, in order: the build
   (`pip install`), the pre-deploy command (`Running upgrade ... -> 0007, demo accounts and
   stored files`), then the start, and the health check passing.
2. Note the service address, e.g. `https://khayal-api.voroa.app` (yours will differ).
3. Open `https://khayal-api.voroa.app/api/health` in a browser. Expected:
   `{"status":"ok","app":"khayal"}`.
4. Open `https://khayal-api.voroa.app/api/config`. Expected:
   `{"demo_mode":true,"recording_limit_seconds":120,"demo_account_days":7}`.

The API explorer (`/docs`) is turned off in production on purpose.

---

## 4. Create the frontend Web Service

1. Dashboard → **New** → **Web Service** → same repository → branch `main`.
2. **Name:** `khayal-web`.
3. **Root directory:** `frontend`
4. **Runtime:** Vite (Voroa detects it from `frontend/package.json`). Leave the build
   command as Voroa suggests (`npm ci && npm run build`). Voroa serves `dist/` with SPA
   routing, so links such as `/pair` and `/caregiver` work on reload.
5. **Environment variables:**

   | Name | Example value | Notes |
   |---|---|---|
   | `VITE_API_URL` | `https://khayal-api.voroa.app` | The backend address from step 3, without `/api` (with it also works). Mark it **build-time**: Vite bakes it into the files when it builds. |

6. **Create Web Service** and wait for the deploy. Note its address, e.g.
   `https://khayal-web.voroa.app`.

Changing `VITE_API_URL` later needs a **new deploy of the frontend** (it is read at build time).

**If the site keeps saying "Waking up the server…"** although the backend's `/api/health`
answers: open the browser console. The message "Khayal: VITE_API_URL was empty when this
frontend was built" means the variable was missing (or not marked build-time) during the
build, so the site is asking itself instead of the backend. Set it and redeploy the frontend.

---

## 5. Connect the two (CORS)

1. Open `khayal-api` → **Environment** → set `KHAYAL_CORS_ORIGINS` to the frontend address
   from step 4, exactly, with no trailing slash, e.g. `https://khayal-web.voroa.app`.
2. **Save** and **redeploy** the backend (Manual deploy → Deploy latest commit, if saving
   does not redeploy by itself).
3. Open the frontend address. You should see the demo banner and the sign-in screen
   with **Try the demo**.
4. Click **Try the demo**. You are signed in as a demo caregiver with Kamala, Rahim and
   Shanti, and you see a 6-digit code. On a phone (or a private window) open
   `https://khayal-web.voroa.app/pair` and type the code to try the patient side.

If the browser console shows a CORS error, the address in `KHAYAL_CORS_ORIGINS` does not
match the frontend's address exactly (`https`, spelling, no slash at the end).

---

## 6. Optional: an external cron every 30 minutes

The free backend sleeps after 15 minutes without traffic, so its own 15-minute loop stops.
It also runs the missed-reminder check and the demo clean-up **at startup and after each
sign-in**, which is enough for a demo. If you also want them on a schedule:

1. Make sure `KHAYAL_TICK_SECRET` is set on the backend (step 2).
2. Create a free account at [cron-job.org](https://cron-job.org) → **Create cronjob**.
3. **URL:** `https://khayal-api.voroa.app/api/internal/tick`
4. **Schedule:** every 30 minutes.
5. **Advanced:** request method **POST**; add a header
   `X-Khayal-Tick-Secret` = *(the tick secret)*. Timeout: 30 seconds or more (the first
   request after a sleep can take a while to wake the service).
6. Save, then **Test run**. Expected response: `200` with
   `{"reminder_patients":...,"accounts_removed":...,"skipped":false}`. A `403` means the
   header value is wrong; `404` means `KHAYAL_TICK_SECRET` is not set.

Note: each tick wakes the sleeping service, so it uses more of the free tier's running
hours. Skip this step if that matters.

---

## 7. How updates work

- Both services auto-deploy when you **push to `main`**.
- The backend runs the pre-deploy command (`alembic upgrade head`) first; if a migration
  fails, the old version keeps serving and the deploy is marked failed.
- Every model change already ships with an Alembic migration (CLAUDE.md section 10), so
  there is nothing to run by hand.
- After changing an environment variable, redeploy that service. For the frontend this
  is needed for `VITE_API_URL` to take effect.

---

## 8. Checking logs

**If a backend deploy log says "Using Node.js"**: the service is not running as Python. The
repository root has no `package.json` (only `frontend/` does), so check the backend service's
settings: **Runtime** must be Python 3.12 and **Root directory** must be empty (the repository
root). A Node runtime or a `frontend` root directory makes the build miss `backend/`, which
shows up as errors about `backend/...` files not being found, and the start command would
fail for the same reason.


- Dashboard → `khayal-api` → **Logs**. Useful lines:
  - `Housekeeping: reminders checked for N patient(s), M expired account(s) removed`: the
    reminder check and demo clean-up ran (startup, every 15 min while awake, after sign-ins, ticks).
  - `Running upgrade ...` (in the pre-deploy step of a deploy): migrations.
  - `RuntimeError: KHAYAL_JWT_SECRET must be set ...`: the secret is missing or too short.
  - `Database is at revision ..., code expects ...`: the pre-deploy command did not run;
    check step 2.7.
  - `POST /api/... 429`: a rate limit did its job.
- Dashboard → `khayal-web` → **Logs** shows the build; the running site is static files.
- Dashboard → `khayal-db` → **Metrics** shows the storage used against the 1 GB.

---

## What the public demo limits

| What | Limit |
|---|---|
| Sign-up | 5 accounts per address per hour |
| "Try the demo" | 5 per address per hour |
| Sign-in | 10 tries per address per 5 minutes |
| Pairing codes | 20 tries per address per 10 minutes, and 10 wrong codes per 10 minutes |
| Family photos | 1 MB each after resizing (the app resizes to 800 px) |
| Voice recordings | 2 minutes (stops by itself), 2 MB |
| Accounts | deleted with all their data 7 days after they were made (both "Try the demo" and normal sign-up) |

## Running the backend tests on Postgres

The suite runs on SQLite by default. To run it on Postgres too, create two empty
databases (for example `khayal_test` and `khayal_test_migrations`) and set:

```bash
export KHAYAL_TEST_DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/khayal_test
export KHAYAL_TEST_MIGRATIONS_DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/khayal_test_migrations
backend/.venv/Scripts/python -m pytest
```

Never point these at the demo database: the tests empty them.
