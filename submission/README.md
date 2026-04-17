# Submission Write-up

## Project Overview

A full-stack prediction markets platform where users can create markets, place bets on outcomes, and earn payouts when markets resolve. Built with Bun + Elysia on the backend and React + TanStack Router on the frontend.

---

## Key Features Implemented

- **Main Dashboard** — paginated market listing with sort (newest, most bets, most participants) and active/resolved filter; balance synced from server on load
- **User Profile** — separate views for active bets (with live odds) and resolved bets (win/loss result), both paginated
- **Market Detail** — place bets, view per-outcome odds, see bet distribution
- **Leaderboard** — ranks users by total winnings across all resolved markets
- **Admin System** — only users with the `admin` role can resolve markets via `PATCH /api/markets/:id/resolve`
- **Payout Distribution** — largest-remainder algorithm guarantees `sum(payouts) === total pool` exactly, with no floating-point drift
- **Balance Tracking** — balance deduction is atomic (`UPDATE ... WHERE balance >= amount`); payouts credited inside the same SQLite transaction as market resolution
- **API Access** — users can generate API keys for programmatic betting; keys are SHA-256 hashed at rest with a per-key rate limit (60 req/min)

---

## Design Choices

- **Backend/frontend separation** — Elysia REST API consumed by both the React UI and external API key clients; no shared rendering logic.
- **Single source of truth for endpoints** — the same route handlers serve both browser sessions (JWT) and API key clients; auth middleware resolves the caller identity before any handler runs.
- **Centralized admin enforcement** — a dedicated `requireAdmin` middleware applied at the route level; no per-handler role checks scattered across the codebase.
- **Payout correctness over simplicity** — rather than naive per-bet `toFixed(2)` rounding, payouts are computed in integer cents using largest-remainder, so the ledger always balances to the cent.
- **Real-time updates via polling** — a refresh button and on-mount balance sync cover the live-data requirement without the complexity of WebSockets, which would be overengineering for this scope.

---

## Challenges Faced

- **Preventing double payouts** — solved with an idempotency guard: the resolution `UPDATE` includes `AND payout_status = 'pending'`, so a concurrent second request gets `changes === 0` and rolls back.
- **Balance consistency** — every bet deduction and payout credit runs inside a single SQLite transaction; the seed script uses the same logic so demo data is in a valid state from the start.
- **Floating-point payout drift** — the naive formula (`stake / total * pool` per bet, rounded independently) diverges by a cent when the pool does not divide evenly. The largest-remainder method fixes this at the distribution level rather than patching individual roundings.
- **Keeping scope manageable** — supporting auth, roles, API keys, pagination, sorting, and a correct payout system simultaneously required deliberate decisions about what not to build (no WebSockets, no refresh tokens, no multi-currency).

---

## Running the Project

**Docker (recommended):**
```bash
docker compose up
```
The database is migrated and seeded with demo data automatically on first start. App available at `http://localhost:3005`.

**Local:**
```bash
cd server && bun install && bun run db:migrate && bun run db:seed && bun run dev
cd client && bun install && bun run dev
```

Demo credentials and seed details are documented in `DEMO_SEED.md` at the project root.
