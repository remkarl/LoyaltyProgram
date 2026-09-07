# Kodokodo Rewards Console

A mobile-first Korean restaurant loyalty prototype built with React, Vite, and an optional dependency-free Node API. The browser-only mode remains available for demo use.

## Features

- Staff login with Members, Capture Center, Rewards, export, and reset controls
- Customer/member login with a personal rewards view and restricted access
- Customer signup with duplicate mobile/email validation
- Earn points and redeem rewards with member-specific balances
- Bronze, Silver, and Gold membership tiers with live progress
- Persistent members, balances, visits, and activity history via `localStorage`
- Responsive mobile-first layout with browser and API-backed development modes

## Backend API

The Node API defaults to a dependency-free, JSON-file store for local development. Set `DATABASE_URL` and it automatically switches to Postgres instead (see [server/store.js](server/store.js)) — that's the path used in production on Render.

```bash
npm run server
```

The API runs at `http://localhost:8787` and provides:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/me`
- `GET /api/members` for staff
- `GET /api/activity`
- `POST /api/earn` for staff
- `POST /api/redeem` for staff

Local backend data is written to `server/data.json` (ignored by Git) unless `DATABASE_URL` is set. The current React UI still supports its browser-only fallback; wiring the UI fully to the API is the next integration step.

## Deploy with Vercel + Render

The repository includes `vercel.json` for the Vite SPA and `render.yaml` for the Node API + a Postgres database, both on Render's **free** plan — no persistent disk, no paid tier required.

1. Push the repository to GitHub.
2. In Vercel, import the repository and use `npm run build` with output directory `dist`.
3. In Render, create a Blueprint from the repository. It creates two resources from `render.yaml`: the `kodokodo-rewards-api` web service and a free `kodokodo-db` Postgres instance, and wires `DATABASE_URL` between them automatically.
4. Copy the Vercel deployment URL into the Render `FRONTEND_ORIGIN` environment variable on `kodokodo-rewards-api`.
5. Redeploy the Render service and verify `https://YOUR-API.onrender.com/api/health` returns `{ "ok": true }`.

**Free-tier tradeoffs to know before relying on this for real member data:**

- The free web service spins down after 15 minutes of idle traffic and takes ~1 minute to wake back up on the next request.
- Render's free Postgres instance **auto-deletes after 30 days** (you get a 14-day warning first). Upgrade the database to a paid plan (starts at $6/month) before then if you want to keep the data, or treat this deployment as a demo/prototype and expect to reseed it periodically.
- The store itself is still a single JSON blob in one Postgres row (see `server/store.js`) — it swaps out the disk-backed file for a DB row with minimal code change, but it isn't a normalized schema. For real production scale, move to proper `users`/`members`/`activities` tables and a shared session store such as Redis.

## Demo access

Staff:

- Email: `manager@kodokodo.ph`
- Password: `kodokodo123`

Customer/member:

- Email: `yuna@kodokodo.ph`
- Password: `kodokodo123`

## Run locally

```bash
npm install
npm run dev
```

Vite will print the local URL. If port `5173` is occupied, it will choose the next available port.

## Build for production

```bash
npm run build
```

## Run tests

```bash
npm test
```

The tests cover tier rules, member permissions, activity privacy, receipt de-duplication, purchase parsing, reward eligibility, CSV export formatting, and the storage layer (both the JSON-file store and the Postgres store's SQL, the latter against a fake in-memory pool so `npm test` never needs a live database).
