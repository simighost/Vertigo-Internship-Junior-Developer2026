/**
 * Calculate implied odds for an outcome based on total bets
 * Formula: outcome_bets / total_bets
 */
export function calculateOutcomeOdds(outcomeBets: number, totalBets: number): number {
  if (totalBets === 0) return 0;
  return Number(((outcomeBets / totalBets) * 100).toFixed(2));
}

/**
 * Distribute a total pool among winners proportionally to their stake.
 * Uses the largest-remainder method so sum(payouts) === totalPool exactly (in cents).
 *
 * Formula per winner: (stake_i / totalWinningStake) * totalPool
 *
 * Edge cases:
 * - No winners (empty array or totalWinningStake === 0): returns []
 * - No bets at all (totalPool === 0): every payout is 0
 */
export function distributePayouts(
  winners: Array<{ userId: number; amount: number }>,
  totalPool: number,
  totalWinningStake: number,
): Array<{ userId: number; payout: number }> {
  if (winners.length === 0 || totalWinningStake === 0) return [];

  // Work in integer cents to avoid floating-point drift
  const poolCents = Math.round(totalPool * 100);

  const items = winners.map((w) => {
    const exactCents = (w.amount / totalWinningStake) * poolCents;
    const flooredCents = Math.floor(exactCents);
    return { userId: w.userId, flooredCents, frac: exactCents - flooredCents };
  });

  // Largest-remainder: give extra cents to winners with the highest fractional parts
  let remainderCents = poolCents - items.reduce((s, i) => s + i.flooredCents, 0);
  items.sort((a, b) => b.frac - a.frac);
  for (const item of items) {
    if (remainderCents <= 0) break;
    item.flooredCents += 1;
    remainderCents -= 1;
  }

  return items.map((i) => ({ userId: i.userId, payout: i.flooredCents / 100 }));
}
