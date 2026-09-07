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

The project now includes a dependency-free Node API with JSON-file persistence for local development.

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

Local backend data is written to `server/data.json` and ignored by Git. The current React UI still supports its browser-only fallback; wiring the UI fully to the API is the next integration step.

## Deploy with Vercel + Render

The repository includes `vercel.json` for the Vite SPA and `render.yaml` for the Node API.

1. Push the repository to GitHub.
2. In Vercel, import the repository and use `npm run build` with output directory `dist`.
3. In Render, create a Blueprint from the repository. It will create `kodokodo-rewards-api` from `render.yaml`.
4. Copy the Vercel deployment URL into the Render `FRONTEND_ORIGIN` environment variable.
5. Redeploy the Render service and verify `https://YOUR-API.onrender.com/api/health` returns `{ "ok": true }`.

The Render blueprint uses a 1 GB persistent disk because the current API stores data in JSON. Persistent disks require Render's paid Starter service. For production scale, replace JSON storage with Postgres and move sessions to a shared store such as Redis.

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

The tests cover tier rules, member permissions, activity privacy, receipt de-duplication, purchase parsing, reward eligibility, and CSV export formatting.
