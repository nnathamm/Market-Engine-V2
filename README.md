# Signal Control UI

## Delivery workflow

GitHub is the source of truth for this website. Completed code changes are validated, committed, and pushed to `nnathamm/Market-Engine-V2`. Changes that affect the running application are also published to the existing Sites deployment from the same committed source.

Repository-specific agent instructions are defined in `AGENTS.md`.

A single-page, front-end-only reproduction of the supplied Signal Control interface.

## Hard boundary

- No market data or external data sources
- No API routes or network requests
- No database, storage, authentication, or persistence
- No signal calculations, decision scoring, or trading logic
- No connection to the existing VELVET engine

The example signal rows are inert visual fixtures used only to reproduce the supplied design. Buttons change the visible screen or overlay in memory and do not save or submit anything.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```
