# Signal Control UI

A front-end-only React app (React Server Components, Tailwind CSS) built with `vinext` (Vite + Next.js App Router targeting Cloudflare Workers). Reproduces a Signal Control interface with inert visual fixtures — no backend, database, auth, or real market data.

## Stack

- **Framework**: Next.js 16 (App Router) on Node.js
- **Database**: Replit built-in PostgreSQL (connection via `DATABASE_URL` / `PG*` env vars)
- **Styling**: Tailwind CSS v4
- **Charts**: lightweight-charts
- **Node**: ≥ 22.13.0

## Running on Replit

```bash
npm run dev       # Next.js dev server on port 5000
npm run build     # production build
npm start         # production server on port 5000
npm test          # rendered-html source checks
npm run lint      # ESLint
```

The workflow **Start application** runs `npm run dev` and serves the app on port 5000.

## Deployment

Hosted on Replit. Use the Publish button to deploy. The production database schema is managed automatically by Replit's Publish flow.

## User preferences

_None recorded yet._
