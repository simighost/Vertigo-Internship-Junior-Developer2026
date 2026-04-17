# Demo Seed — Tester Reference

Run `bun run db:reset` from the `server/` directory to wipe and reseed the database at any time.

---

## Login Credentials

All accounts use the same password: **`password123`**

| Username  | Email               | Role  | Notes                          |
|-----------|---------------------|-------|--------------------------------|
| admin     | admin@demo.com      | admin | Can resolve markets; no bets   |
| alice     | alice@demo.com      | user  | Top leaderboard winner         |
| bob       | bob@demo.com        | user  | Second on leaderboard          |
| charlie   | charlie@demo.com    | user  | Moderate winner                |
| diana     | diana@demo.com      | user  | Slight positive balance        |
| eve       | eve@demo.com        | user  | Break-even mix                 |
| frank     | frank@demo.com      | user  | Heavy loser — nearly wiped out |
| grace     | grace@demo.com      | user  | Occasional small bets          |

---

## Market Overview

| Type     | Count | Purpose                                          |
|----------|-------|--------------------------------------------------|
| Active   | 35    | Enough to trigger pagination (>20 per page)      |
| Resolved | 15    | Populate leaderboard and profile resolved bets   |
| **Total**| **50**|                                                  |

---

## Balance State After Seed

Balances reflect: `$10,000 starting − bets placed + payouts received`.

| Username | Approx. Balance | Why                                            |
|----------|-----------------|------------------------------------------------|
| admin    | $10,000.00      | No bets placed                                 |
| alice    | ~$7,741         | Won most resolved markets; some active bets out|
| bob      | ~$5,075         | Mostly on winning side                         |
| eve      | ~$4,162         | Mixed results, slight edge                     |
| diana    | ~$3,609         | Mixed results                                  |
| charlie  | ~$2,929         | Mixed; heavier active bet exposure             |
| grace    | ~$1,983         | Small bets, mixed results                      |
| frank    | ~$10            | Consistently bet on losing outcomes            |

---

## Betting Patterns (for leaderboard verification)

- **alice** — placed large bets on the winning outcome in every resolved market.
- **bob** — placed medium bets on the winning outcome in most resolved markets.
- **frank** — placed large bets on the losing outcome in every resolved market.
- **charlie / diana / eve / grace** — mixed bets across both outcomes.

The leaderboard should rank: **alice > bob > charlie/diana > eve/grace**, with frank absent or at the bottom.

---

## Resolved Markets (15 total)

| # | Title (abbreviated)                            | Winner outcome |
|---|------------------------------------------------|----------------|
| 1 | Will BTC trade above $100k by end of Q1 2026?  | Yes            |
| 2 | Will the Lions win the NFC Championship?       | Yes            |
| 3 | Will Austin approve the downtown transit bond? | Pass           |
| 4 | Will NovaTech launch their IPO before Q3?      | Yes            |
| 5 | Will fusion energy hit a net-energy milestone? | No             |
| 6 | Will NYC record a day above 35°C this summer?  | No             |
| 7 | Will the Storm win their next playoff match?   | Win            |
| 8 | Will Chicago approve the North Side housing?   | Pass           |
| 9 | Will ETH trade above $5,000 by June 2026?      | No             |
|10 | Will the Falcons win the division title?       | Yes            |
|11 | Will GeneCure receive FDA approval?            | Approved       |
|12 | Will Tokyo record measurable snowfall Feb 2026?| Yes            |
|13 | Will RocketStart launch their consumer app?    | No             |
|14 | Will Phoenix break its all-time heat record?   | Yes            |
|15 | Will solid-state battery tech reach production?| Yes            |

---

## What to Test with This Data

| Feature              | What to check                                                        |
|----------------------|----------------------------------------------------------------------|
| Leaderboard          | alice at top, frank absent or near bottom, correct totalWinnings     |
| Profile — active     | Log in as alice/bob/frank; all show bets on active markets           |
| Profile — resolved   | alice/bob show "win" results; frank shows "loss" results             |
| Pagination           | Dashboard active markets list shows 20 items + next page             |
| Admin resolve        | Log in as admin, resolve an active market; non-admin gets 403        |
| Balance accuracy     | After resolving a market, winners' balances increase by exact payout |
| Bet on resolved      | Attempt to bet on a resolved market; expect 400 "Market is not active"|

---

## Docker — Automatic Seeding

When running via `docker compose up`, the demo data is seeded **automatically on first start**:

```bash
docker compose up
```

The entrypoint detects a missing database file and runs migrations + seed before starting the server.
The Docker Compose file already has `SEED_DATABASE: "true"` set — no extra configuration needed.

> **Note:** The Docker volume (`server_data`) persists across restarts. If you have already run the stack before, the existing database is reused and the seed is skipped. Use one of the commands below to start fresh.

### Reset options

```bash
# Wipe the volume and reseed on next start (recommended for a clean slate)
docker compose down -v
docker compose up

# Reseed inside a running container without rebuilding
docker compose exec server bun run db:reset
```

---

## Local Development — Reseed Command

```bash
cd server
bun run db:reset   # wipe everything and reseed
bun run db:seed    # seed without wiping
bun run db:delete  # wipe only, no reseed
```
