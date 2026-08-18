# Signal Control UI

A front-end-only React app (React Server Components, Tailwind CSS) built with `vinext` (Vite + Next.js App Router targeting Cloudflare Workers). Reproduces a Signal Control interface with inert visual fixtures — no backend, database, auth, or real market data.

## Stack

- **Framework**: [vinext](https://github.com/nicholasgasior/vinext) — Vite + Next.js App Router hybrid
- **Runtime target**: Cloudflare Workers (via `@cloudflare/vite-plugin` + Wrangler)
- **Styling**: Tailwind CSS v4
- **Charts**: lightweight-charts
- **Node**: ≥ 22.13.0

## Running locally on Replit

```bash
npm run dev       # dev server on port 5000
npm run build     # production build
npm test          # build + rendered-html tests
npm run lint      # ESLint
```

The workflow **Start application** runs `npm run dev` and serves the app on port 5000.

## Project constraints (from README)

- No market data or external data sources
- No API routes or network requests
- No database, storage, authentication, or persistence
- No signal calculations, decision scoring, or trading logic
- No connection to the existing VELVET engine

Signal rows are inert visual fixtures; buttons change visible screen/overlay in memory only.

## Deployment

The project targets **Cloudflare Sites** (configured in `.openai/hosting.json`). GitHub (`nnathamm/Market-Engine-V2`) is the source of truth; see `AGENTS.md` for the full delivery workflow.

## User preferences

_None recorded yet._
