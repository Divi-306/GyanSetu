# GyanSetu — Setup on a New Machine

Everything you need to do after cloning the repo to get the API, the database and the mobile app running on a fresh computer.

```
GyanSetu/                ← git root (what `git clone` creates)
├── doc/                 ← design / build guides
└── GyanSetu/            ← Expo app  (all commands below start here)
    ├── src/             ← app code (Expo Router screens in src/app/)
    └── backend/         ← Node/Express API + Postgres scripts
```

---

## 1. Install the tools (one time per machine)

| Tool | Version | Why |
|---|---|---|
| **Git** | any recent | clone the repo |
| **Node.js** | **24.x LTS** (same as the backend Dockerfile) | runs the app tooling and the API |
| **npm** | comes with Node (11.x) | the project uses `package-lock.json`, so use npm, not yarn/bun |
| **Docker Desktop** | any recent | runs Postgres 17 for dev and tests |
| **Expo Go** (on your phone) | latest from Play Store / App Store, must support **SDK 57** | runs the app without building it |

Optional:
- **Android Studio** (for an Android emulator) or **Xcode** (macOS only, iOS simulator).
- **VS Code** with the ESLint extension.

Check:

```bash
git --version
node -v        # v24.x
npm -v
docker --version
```

> On Windows, start Docker Desktop and wait until it says "Engine running" before step 4.

---

## 2. Clone

```bash
git clone https://github.com/Divi-306/GyanSetu.git
cd GyanSetu/GyanSetu
```

---

## 3. Install dependencies

Two separate `node_modules`: one for the app, one for the backend.

```bash
# app (in GyanSetu/GyanSetu)
npm install            # .npmrc already sets legacy-peer-deps=true

# backend
cd backend
npm install
cd ..
```

Don't add packages with plain `npm install <pkg>` in the app — use `npx expo install <pkg>` so versions match Expo SDK 57.

---

## 4. Start the database (Docker)

```bash
cd backend
docker compose up -d
```

This starts two Postgres 17 containers:

| Service | Host port | Database | Used by |
|---|---|---|---|
| `db` | **5435** | `gyansetu` | dev API |
| `db_test` | **5434** | `gyansetu_test` | `npm test` |

User / password for both: `gyansetu` / `gyansetu`. Check with `docker compose ps`.

> If port 5435 or 5434 is taken on the new machine, change the left-hand port in `docker-compose.yml` and update `DATABASE_URL` to match.

---

## 5. Create the backend `.env`

`.env` files are **not** in git, so every new machine needs its own.

```bash
# still in backend/
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Then edit `backend/.env`:

**a. Find this machine's LAN IP** (phones can't reach `localhost`):

- Windows: `ipconfig` → "IPv4 Address" of your Wi-Fi adapter (e.g. `192.168.1.23`)
- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`

```env
PUBLIC_BASE_URL=http://<YOUR_LAN_IP>:4000
```

**b. Generate two secrets** (run twice, paste one into each):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```env
JWT_ACCESS_SECRET=<first value>
PACK_URL_SECRET=<second value>
```

Both must be at least 32 characters or the API refuses to start.

> If you want existing sessions/pack URLs from the old machine to stay valid against the same DB, copy the secrets from the old `.env` instead. For a fresh dev DB, new values are fine.

**c. AI tutor key** (needed for the AI tutor and Navigator features; everything else works without it):

```env
AI_PROVIDER=groq              # or xai / anthropic
GROQ_API_KEY=<your key>       # set the key for whichever provider you chose
```

Get a Groq key at https://console.groq.com/keys. Leave `AI_MODEL` / `NAVIGATOR_MODEL` blank to use defaults.

Learning-pack videos: Wikimedia Commons works with no key (openly licensed, downloadable for offline). To also suggest YouTube videos (stream-only), set `YOUTUBE_API_KEY` (YouTube Data API v3). `VIDEO_SOURCES=` (empty) turns videos off.

**d. Optional**

| Variable | Leave blank → |
|---|---|
| `GOOGLE_CLIENT_IDS` | Google sign-in disabled |
| `SMTP_URL` | password-reset links are printed in the API console instead of emailed |

Keep `DATABASE_URL=postgres://gyansetu:gyansetu@localhost:5435/gyansetu` unless you changed the port.

---

## 6. Create tables and seed content

```bash
# in backend/
npm run migrate        # applies db/migrations/*.sql
npm run seed           # loads db/seed/seed.sql and builds the offline learning packs
npm run convert-courses  # turns the curated courses into dynamic learning packs (no AI key needed)
```

Generating new learning packs ("Learn Anything") needs the AI key from step 5c.

The seed writes pack files to `backend/storage/packs/` (git-ignored, so each machine builds its own). To force new pack versions later: `npm run seed -- --rebuild`.

---

## 7. Run the API

```bash
# in backend/
npm run dev
```

You should see `GyanSetu API listening on :4000`. Check it:

- On the PC: http://localhost:4000/health
- On the phone's browser: `http://<YOUR_LAN_IP>:4000/health` — if this fails, see Troubleshooting → firewall.

Leave this terminal running.

---

## 8. Create the app `.env.local`

In a **new terminal**, in `GyanSetu/GyanSetu` (the app folder, not `backend/`):

```bash
cp .env.example .env.local    # Windows PowerShell: Copy-Item .env.example .env.local
```

Set the API URL:

```env
EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:4000
```

| Where the app runs | Use |
|---|---|
| Real phone (Expo Go) on same Wi-Fi | `http://<YOUR_LAN_IP>:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| iOS simulator / web | `http://localhost:4000` |

`EXPO_PUBLIC_*` values are baked in when Metro bundles, so **restart `npx expo start` after changing this** (add `-c` to clear the cache).

---

## 9. Run the app

```bash
npx expo start
```

- **Phone:** open Expo Go and scan the QR code (Android: scan in Expo Go; iOS: scan with the Camera app). Phone and PC must be on the **same Wi-Fi**.
- **Android emulator:** press `a`.
- **Web:** press `w`.

If the phone can't connect to Metro (e.g. college/office Wi-Fi blocks devices from talking to each other), use `npx expo start --tunnel`. Note the tunnel only covers the app bundle — the API URL still has to be reachable from the phone.

---

## 10. Verify everything

```bash
# app folder
npx expo lint
npx tsc --noEmit

# backend folder (needs db_test container from step 4 running)
npm run typecheck
npm test
```

Then in the app: sign up → open Courses → download a course → turn on airplane mode and confirm lessons/quizzes still open.

---

## Daily workflow on this machine

```bash
# terminal 1
cd GyanSetu/GyanSetu/backend
docker compose up -d
npm run dev

# terminal 2
cd GyanSetu/GyanSetu
npx expo start
```

After `git pull`:

```bash
npm install                     # in app folder, if package.json changed
cd backend && npm install       # if backend/package.json changed
npm run migrate                 # if new files appeared in db/migrations/
```

If your LAN IP changed (new Wi-Fi network), update **both** `backend/.env` (`PUBLIC_BASE_URL`) and `.env.local` (`EXPO_PUBLIC_API_URL`), then restart the API and `npx expo start -c`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| API exits with a Zod error about `JWT_ACCESS_SECRET` / `PACK_URL_SECRET` | Secrets missing or shorter than 32 chars — redo step 5b. |
| `ECONNREFUSED ...:5435` | Docker isn't running or the `db` container is down: `docker compose up -d`. |
| App shows "EXPO_PUBLIC_API_URL is not set" | `.env.local` missing or in the wrong folder (must be in `GyanSetu/GyanSetu`, next to `package.json`). Restart with `npx expo start -c`. |
| `/health` works on the PC but not on the phone | **Windows Firewall** is blocking port 4000. Allow Node.js on Private networks when prompted, or run in an admin PowerShell: `New-NetFirewallRule -DisplayName "GyanSetu API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private`. Also make sure the Wi-Fi network is set to *Private*, not *Public*. |
| Downloaded packs fail to load on the phone | `PUBLIC_BASE_URL` in `backend/.env` still points to `localhost` or the old machine's IP. Fix it, restart the API. |
| Expo Go says the project needs a newer/older SDK | Update Expo Go from the store; the project is on SDK 57. |
| `npm install` peer-dependency errors | Make sure `.npmrc` (with `legacy-peer-deps=true`) came through the clone; run `npx expo install --fix`. |
| Port 4000 already in use | Change `PORT` in `backend/.env` and the port in both URLs. |
| Weird stale behaviour after switching machines/branches | `npx expo start -c` (clears Metro cache). As a last resort delete `node_modules` and reinstall. |
| `npx expo-doctor` | Run it for a general health check of the app's dependencies and config. |

---

## What is *not* in git (must be recreated per machine)

- `GyanSetu/node_modules/`, `GyanSetu/backend/node_modules/` → `npm install`
- `GyanSetu/.env.local` → step 8
- `GyanSetu/backend/.env` → step 5 (holds secrets and API keys — never commit it)
- `GyanSetu/backend/storage/packs/` → `npm run seed`
- Postgres data (Docker volume `pgdata`) → `npm run migrate && npm run seed`. To carry over real data from the old machine instead, `pg_dump` it there and `psql` restore it here.
