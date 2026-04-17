/**
 * Payout distribution tests.
 *
 * Tests run against an in-memory SQLite database, fully migrated via Drizzle.
 * Each describe block gets a fresh market so tests are independent.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import db from "../src/db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../src/db/schema";
import {
  processMarketPayouts,
  MarketNotFoundError,
  OutcomeNotFoundError,
  PayoutAlreadyProcessedError,
} from "../src/lib/payout";
import { distributePayouts } from "../src/lib/odds";

// ─── Migration ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(username: string) {
  const rows = await db
    .insert(usersTable)
    .values({
      username,
      email: `${username}@test.com`,
      passwordHash: "x",
      role: "user",
      balance: 0,
    })
    .returning();
  return rows[0];
}

async function createMarket(creatorId: number, outcomeLabels: string[]) {
  const marketRows = await db
    .insert(marketsTable)
    .values({ title: "Test market", createdBy: creatorId })
    .returning();
  const market = marketRows[0];

  const outcomeRows = await db
    .insert(marketOutcomesTable)
    .values(outcomeLabels.map((title, i) => ({ marketId: market.id, title, position: i })))
    .returning();

  return { market, outcomes: outcomeRows };
}

async function placeBet(userId: number, marketId: number, outcomeId: number, amount: number) {
  await db.insert(betsTable).values({ userId, marketId, outcomeId, amount });
}

async function getUserBalance(userId: number): Promise<number> {
  const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  return row?.balance ?? 0;
}

async function getMarket(marketId: number) {
  return db.query.marketsTable.findFirst({ where: eq(marketsTable.id, marketId) });
}

// ─── Unit: distributePayouts formula ─────────────────────────────────────────

describe("distributePayouts — formula correctness", () => {
  it("single winner gets the entire pool", () => {
    const result = distributePayouts([{ userId: 1, amount: 50 }], 175, 50);
    expect(result).toHaveLength(1);
    expect(result[0].payout).toBe(175);
  });

  it("two equal-stake winners split the pool evenly", () => {
    const result = distributePayouts(
      [
        { userId: 1, amount: 50 },
        { userId: 2, amount: 50 },
      ],
      200,
      100,
    );
    expect(result).toHaveLength(2);
    const total = result.reduce((s, r) => s + r.payout, 0);
    expect(total).toBe(200);
    expect(result[0].payout).toBe(100);
    expect(result[1].payout).toBe(100);
  });

  it("conservation: sum of payouts equals totalPool exactly (fractional pool)", () => {
    // 3 winners with stakes 33, 33, 34 out of 100; pool = $333.33
    const pool = 333.33;
    const winners = [
      { userId: 1, amount: 33 },
      { userId: 2, amount: 33 },
      { userId: 3, amount: 34 },
    ];
    const totalWinningStake = 100;
    const result = distributePayouts(winners, pool, totalWinningStake);
    const total = result.reduce((s, r) => s + r.payout, 0);
    // Allow at most 1-cent discrepancy from rounding to $0.01
    expect(Math.abs(total - pool)).toBeLessThanOrEqual(0.01);
    // Strict: largest-remainder guarantees exact match in cents
    expect(Math.round(total * 100)).toBe(Math.round(pool * 100));
  });

  it("no winners returns empty array", () => {
    expect(distributePayouts([], 100, 0)).toEqual([]);
    expect(distributePayouts([], 0, 0)).toEqual([]);
  });

  it("pool of zero distributes nothing", () => {
    const result = distributePayouts([{ userId: 1, amount: 50 }], 0, 50);
    expect(result[0].payout).toBe(0);
  });
});

// ─── Integration: processMarketPayouts ───────────────────────────────────────

describe("processMarketPayouts — correct payout to winners", () => {
  it("credits winning user with full pool, loser unchanged", async () => {
    const admin = await createUser(`admin_p1_${Date.now()}`);
    const loser = await createUser(`loser_p1_${Date.now()}`);
    const { market, outcomes } = await createMarket(admin.id, ["Alpha", "Beta"]);
    const [alpha, beta] = outcomes;

    await placeBet(admin.id, market.id, alpha.id, 75);
    await placeBet(loser.id, market.id, beta.id, 100);

    const result = await processMarketPayouts(market.id, alpha.id);

    expect(result.totalPool).toBe(175);
    expect(result.winnerCount).toBe(1);
    expect(result.totalPaidOut).toBe(175);

    expect(await getUserBalance(admin.id)).toBe(175);
    expect(await getUserBalance(loser.id)).toBe(0);
  });

  it("sets market status=resolved and payout_status=completed", async () => {
    const user = await createUser(`user_p2_${Date.now()}`);
    const { market, outcomes } = await createMarket(user.id, ["Yes", "No"]);
    await placeBet(user.id, market.id, outcomes[0].id, 50);

    await processMarketPayouts(market.id, outcomes[0].id);

    const updated = await getMarket(market.id);
    expect(updated?.status).toBe("resolved");
    expect(updated?.payoutStatus).toBe("completed");
    expect(updated?.resolvedOutcomeId).toBe(outcomes[0].id);
  });

  it("proportional payout for two winners", async () => {
    const u1 = await createUser(`u1_p3_${Date.now()}`);
    const u2 = await createUser(`u2_p3_${Date.now()}`);
    const { market, outcomes } = await createMarket(u1.id, ["Win", "Lose"]);
    const [win, lose] = outcomes;

    await placeBet(u1.id, market.id, win.id, 100);
    await placeBet(u2.id, market.id, win.id, 100);
    await placeBet(u1.id, market.id, lose.id, 50); // u1 also bet on loser

    // total pool = 250, winning stake = 200
    // u1 payout = (100/200)*250 = 125
    // u2 payout = (100/200)*250 = 125
    await processMarketPayouts(market.id, win.id);

    expect(await getUserBalance(u1.id)).toBe(125);
    expect(await getUserBalance(u2.id)).toBe(125);
  });
});

// ─── Edge case: no bets ───────────────────────────────────────────────────────

describe("processMarketPayouts — no bets", () => {
  it("resolves cleanly with totalPool=0 and no balance changes", async () => {
    const user = await createUser(`user_nobets_${Date.now()}`);
    const { market, outcomes } = await createMarket(user.id, ["Yes", "No"]);

    const result = await processMarketPayouts(market.id, outcomes[0].id);

    expect(result.totalPool).toBe(0);
    expect(result.winnerCount).toBe(0);
    expect(result.totalPaidOut).toBe(0);

    const updated = await getMarket(market.id);
    expect(updated?.status).toBe("resolved");
    expect(updated?.payoutStatus).toBe("completed");
  });
});

// ─── Edge case: no winners ────────────────────────────────────────────────────

describe("processMarketPayouts — no winners", () => {
  it("pool is retained (no refunds); market still resolves", async () => {
    const u1 = await createUser(`u1_nowin_${Date.now()}`);
    const u2 = await createUser(`u2_nowin_${Date.now()}`);
    const { market, outcomes } = await createMarket(u1.id, ["Yes", "No"]);
    const [yes, no] = outcomes;

    // Both users bet on 'No'. We resolve with 'Yes' — nobody wins.
    await placeBet(u1.id, market.id, no.id, 40);
    await placeBet(u2.id, market.id, no.id, 60);

    const result = await processMarketPayouts(market.id, yes.id);

    expect(result.totalPool).toBe(100);
    expect(result.winnerCount).toBe(0);
    expect(result.totalPaidOut).toBe(0);

    // Balances unchanged — pool stays in system
    expect(await getUserBalance(u1.id)).toBe(0);
    expect(await getUserBalance(u2.id)).toBe(0);

    const updated = await getMarket(market.id);
    expect(updated?.payoutStatus).toBe("completed");
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe("processMarketPayouts — idempotency", () => {
  it("second call throws PayoutAlreadyProcessedError, balances unchanged", async () => {
    const user = await createUser(`user_idem_${Date.now()}`);
    const { market, outcomes } = await createMarket(user.id, ["Yes", "No"]);
    await placeBet(user.id, market.id, outcomes[0].id, 100);

    // First call — succeeds
    await processMarketPayouts(market.id, outcomes[0].id);
    const balanceAfterFirst = await getUserBalance(user.id);
    expect(balanceAfterFirst).toBe(100);

    // Second call — must throw, not double-pay
    await expect(processMarketPayouts(market.id, outcomes[0].id)).rejects.toThrow(
      PayoutAlreadyProcessedError,
    );

    // Balance must not have changed
    expect(await getUserBalance(user.id)).toBe(balanceAfterFirst);
  });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe("processMarketPayouts — validation errors", () => {
  it("throws MarketNotFoundError for unknown market", async () => {
    await expect(processMarketPayouts(999999, 1)).rejects.toThrow(MarketNotFoundError);
  });

  it("throws OutcomeNotFoundError when outcome doesn't belong to market", async () => {
    const user = await createUser(`user_badout_${Date.now()}`);
    const { market } = await createMarket(user.id, ["A", "B"]);

    await expect(processMarketPayouts(market.id, 999999)).rejects.toThrow(OutcomeNotFoundError);
  });
});
