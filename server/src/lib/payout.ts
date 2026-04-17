import { eq, and } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import db from "../db";
import { marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import { distributePayouts } from "./odds";

export interface PayoutResult {
  totalPool: number;
  winnerCount: number;
  totalPaidOut: number;
}

/**
 * Resolve a market and distribute payouts atomically.
 *
 * Idempotency: the UPDATE uses `AND payout_status = 'pending'` as its guard.
 * If `changes === 0`, the market has already been paid out; the transaction
 * rolls back and the caller receives a PayoutAlreadyProcessedError.
 *
 * No-winners: when nobody bet on the winning outcome, distributePayouts returns
 * an empty array and the pool is retained by the system. The market is still
 * resolved and payout_status set to 'completed'.
 *
 * Conservation: largest-remainder rounding guarantees sum(payouts) === totalPool
 * exactly (in cents).
 */
export async function processMarketPayouts(
  marketId: number,
  outcomeId: number,
): Promise<PayoutResult> {
  // 1. Validate market exists
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    throw new MarketNotFoundError(marketId);
  }

  // 2. Validate market is in a resolvable state
  //    'pending' payout_status means it hasn't been paid out yet.
  //    Even if status is already 'resolved' but payout_status is 'pending', we
  //    treat it as actionable (supports retroactive payout runs).
  if (market.payoutStatus === "completed") {
    throw new PayoutAlreadyProcessedError(marketId);
  }

  if (market.status === "resolved") {
    // status=resolved but payout_status=pending: only process payouts, skip re-resolving
    // This branch handles the retroactive case cleanly.
  }

  // 3. Validate winning outcome belongs to this market
  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(
      eq(marketOutcomesTable.id, outcomeId),
      eq(marketOutcomesTable.marketId, marketId),
    ),
  });

  if (!outcome) {
    throw new OutcomeNotFoundError(outcomeId, marketId);
  }

  // 4. Load all market bets
  const allBets = await db
    .select({ userId: betsTable.userId, outcomeId: betsTable.outcomeId, amount: betsTable.amount })
    .from(betsTable)
    .where(eq(betsTable.marketId, marketId));

  // 5. Compute pool and per-user winning stakes
  const totalPool = allBets.reduce((sum, b) => sum + b.amount, 0);

  const winnerStakeByUser = new Map<number, number>();
  for (const bet of allBets) {
    if (bet.outcomeId !== outcomeId) continue;
    winnerStakeByUser.set(bet.userId, (winnerStakeByUser.get(bet.userId) ?? 0) + bet.amount);
  }

  const winnerList = [...winnerStakeByUser.entries()].map(([userId, amount]) => ({
    userId,
    amount,
  }));
  const totalWinningStake = winnerList.reduce((sum, w) => sum + w.amount, 0);

  // 6. Compute per-winner payouts using largest-remainder (no floating-point drift)
  //    Returns [] when no winners — pool stays in the system (no refunds).
  const payouts = distributePayouts(winnerList, totalPool, totalWinningStake);

  // 7. Execute atomically via native SQLite transaction.
  //    Prepared statements are compiled once and reused for each credit.
  //    The WHERE clause `AND payout_status = 'pending'` is the persisted idempotency
  //    gate: if another request races past the pre-check above, changes === 0 here
  //    triggers a rollback via the thrown error.
  const sqliteDb = db.$client as Database;

  const stmtResolve = sqliteDb.prepare(
    `UPDATE markets
     SET status = 'resolved', resolved_outcome_id = ?, payout_status = 'completed'
     WHERE id = ? AND payout_status = 'pending'`,
  );
  const stmtCredit = sqliteDb.prepare(
    `UPDATE users SET balance = balance + ? WHERE id = ?`,
  );

  const runTx = sqliteDb.transaction(() => {
    const { changes } = stmtResolve.run(outcomeId, marketId);
    if (changes === 0) {
      throw new Error("payout_already_processed");
    }
    for (const p of payouts) {
      stmtCredit.run(p.payout, p.userId);
    }
  });

  try {
    runTx();
  } catch (err) {
    if (err instanceof Error && err.message === "payout_already_processed") {
      throw new PayoutAlreadyProcessedError(marketId);
    }
    throw err;
  }

  const totalPaidOut = payouts.reduce((s, p) => s + p.payout, 0);

  return {
    totalPool,
    winnerCount: winnerList.length,
    totalPaidOut,
  };
}

// Typed errors so callers can handle each case precisely

export class MarketNotFoundError extends Error {
  constructor(public readonly marketId: number) {
    super(`Market ${marketId} not found`);
    this.name = "MarketNotFoundError";
  }
}

export class OutcomeNotFoundError extends Error {
  constructor(
    public readonly outcomeId: number,
    public readonly marketId: number,
  ) {
    super(`Outcome ${outcomeId} does not belong to market ${marketId}`);
    this.name = "OutcomeNotFoundError";
  }
}

export class PayoutAlreadyProcessedError extends Error {
  constructor(public readonly marketId: number) {
    super(`Market ${marketId} payouts already processed`);
    this.name = "PayoutAlreadyProcessedError";
  }
}
