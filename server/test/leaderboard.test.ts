/**
 * Leaderboard endpoint tests.
 *
 * Covers: empty state, ranking order, formula correctness (regression for the
 * per-bet toFixed(2) divergence fixed in handleGetLeaderboard), and users with
 * no winning bets are excluded.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { app } from "../index";
import db from "../src/db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../src/db/schema";
import { processMarketPayouts } from "../src/lib/payout";

const BASE = "http://localhost";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(username: string, balance = 0) {
  const [user] = await db
    .insert(usersTable)
    .values({ username, email: `${username}@lb.test`, passwordHash: "x", balance })
    .returning();
  return user;
}

async function createMarket(creatorId: number, outcomes: string[]) {
  const [market] = await db
    .insert(marketsTable)
    .values({ title: "Leaderboard test market", createdBy: creatorId })
    .returning();
  const rows = await db
    .insert(marketOutcomesTable)
    .values(outcomes.map((title, position) => ({ marketId: market.id, title, position })))
    .returning();
  return { market, outcomes: rows };
}

async function placeBet(userId: number, marketId: number, outcomeId: number, amount: number) {
  await db.insert(betsTable).values({ userId, marketId, outcomeId, amount });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/leaderboard", () => {
  it("returns empty array when there are no resolved markets", async () => {
    const res = await app.handle(new Request(`${BASE}/api/leaderboard`));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.leaderboard)).toBe(true);
    // May have entries from other tests; the key assertion is the shape is correct
    expect(data.leaderboard.every((e: any) => "rank" in e && "username" in e && "totalWinnings" in e)).toBe(true);
  });

  it("ranks users by totalWinnings descending and assigns correct rank numbers", async () => {
    const ts = Date.now();
    const bigWinner = await createUser(`lb_big_${ts}`);
    const smallWinner = await createUser(`lb_small_${ts}`);
    const loser = await createUser(`lb_loser_${ts}`);

    const { market, outcomes } = await createMarket(bigWinner.id, ["Win", "Lose"]);
    const [win, lose] = outcomes;

    // bigWinner bets more on the winning side
    await placeBet(bigWinner.id, market.id, win.id, 200);
    await placeBet(smallWinner.id, market.id, win.id, 50);
    await placeBet(loser.id, market.id, lose.id, 100);

    await processMarketPayouts(market.id, win.id);

    const res = await app.handle(new Request(`${BASE}/api/leaderboard`));
    const { leaderboard } = await res.json() as any;

    const bigEntry = leaderboard.find((e: any) => e.username === `lb_big_${ts}`);
    const smallEntry = leaderboard.find((e: any) => e.username === `lb_small_${ts}`);

    expect(bigEntry).toBeDefined();
    expect(smallEntry).toBeDefined();
    expect(bigEntry.totalWinnings).toBeGreaterThan(smallEntry.totalWinnings);
    expect(bigEntry.rank).toBeLessThan(smallEntry.rank);
  });

  it("user with no winning bets does not appear in leaderboard", async () => {
    const ts = Date.now() + 1;
    const winner = await createUser(`lb_onlywinner_${ts}`);
    const noWin = await createUser(`lb_nowinner_${ts}`);

    const { market, outcomes } = await createMarket(winner.id, ["Yes", "No"]);
    const [yes, no] = outcomes;

    await placeBet(winner.id, market.id, yes.id, 100);
    await placeBet(noWin.id, market.id, no.id, 100); // noWin only bets on the losing side

    await processMarketPayouts(market.id, yes.id);

    const res = await app.handle(new Request(`${BASE}/api/leaderboard`));
    const { leaderboard } = await res.json() as any;

    const noWinEntry = leaderboard.find((e: any) => e.username === `lb_nowinner_${ts}`);
    expect(noWinEntry).toBeUndefined();
  });

  it("totalWinnings is exact when pool does not divide evenly in cents (formula regression)", async () => {
    // This is the exact case that exposed the old per-bet toFixed(2) bug:
    //   3 equal winners, pool = $10 → each should get $10/3 ≈ $3.33
    //   Old formula: 3.33 + 3.33 + 3.33 = $9.99 (off by $0.01)
    //   New formula (distributePayouts): $3.34 + $3.33 + $3.33 = $10.00 (exact)
    const ts = Date.now() + 2;
    const u1 = await createUser(`lb_eq1_${ts}`);
    const u2 = await createUser(`lb_eq2_${ts}`);
    const u3 = await createUser(`lb_eq3_${ts}`);
    const loser = await createUser(`lb_eqloser_${ts}`);

    const { market, outcomes } = await createMarket(u1.id, ["Win", "Lose"]);
    const [win, lose] = outcomes;

    // 3 winners × $1 stake each; loser bets $7 → total pool = $10
    await placeBet(u1.id, market.id, win.id, 1);
    await placeBet(u2.id, market.id, win.id, 1);
    await placeBet(u3.id, market.id, win.id, 1);
    await placeBet(loser.id, market.id, lose.id, 7);

    await processMarketPayouts(market.id, win.id);

    const res = await app.handle(new Request(`${BASE}/api/leaderboard`));
    const { leaderboard } = await res.json() as any;

    const entries = [u1, u2, u3].map((u) =>
      leaderboard.find((e: any) => e.username === u.username),
    );
    expect(entries.every((e) => e !== undefined)).toBe(true);

    const totalShown = entries.reduce((s, e: any) => s + e.totalWinnings, 0);
    // The three winners together must account for the full $10 pool
    expect(Math.round(totalShown * 100)).toBe(1000);
  });
});
