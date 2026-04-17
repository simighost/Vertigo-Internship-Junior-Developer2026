import { eq, and, inArray, sql, asc, desc, count, isNotNull } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import db from "../db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import { hashPassword, verifyPassword, generateApiKey, hashApiKey, type AuthTokenPayload } from "../lib/auth";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
} from "../lib/validation";
import { distributePayouts } from "../lib/odds";
import {
  processMarketPayouts,
  MarketNotFoundError,
  OutcomeNotFoundError,
  PayoutAlreadyProcessedError,
} from "../lib/payout";

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);

  // Explicit initial balance of 1000 (belt-and-suspenders alongside schema default).
  const newUser = await db
    .insert(usersTable)
    .values({ username, email, passwordHash, balance: 1000 })
    .returning();

  const token = await jwt.sign({ userId: newUser[0].id });

  set.status = 201;
  return {
    id: newUser[0].id,
    username: newUser[0].username,
    email: newUser[0].email,
    role: newUser[0].role,
    balance: newUser[0].balance,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    token,
  };
}

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description || "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db
    .insert(marketsTable)
    .values({
      title,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  const outcomeIds = await db
    .insert(marketOutcomesTable)
    .values(
      outcomes.map((title: string, index: number) => ({
        marketId: market[0].id,
        title,
        position: index,
      })),
    )
    .returning();

  set.status = 201;
  return {
    id: market[0].id,
    title: market[0].title,
    description: market[0].description,
    status: market[0].status,
    outcomes: outcomeIds,
  };
}

export async function handleListMarkets({
  query,
}: {
  query: { page?: string; limit?: string; sort?: string; status?: string };
}) {
  const page = Math.max(1, parseInt(query.page || "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20") || 20));
  const sort = (["createdAt", "totalBets", "participantCount"] as const).includes(
    query.sort as "createdAt" | "totalBets" | "participantCount",
  )
    ? (query.sort as "createdAt" | "totalBets" | "participantCount")
    : "createdAt";
  const status = (["active", "resolved"] as const).includes(
    query.status as "active" | "resolved",
  )
    ? (query.status as "active" | "resolved")
    : "active";
  const offset = (page - 1) * limit;

  // Count total markets matching the filter
  const countRows = await db
    .select({ totalCount: count() })
    .from(marketsTable)
    .where(eq(marketsTable.status, status));
  const totalCount = countRows[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // Build order expression — keep all branches as SQL<unknown> for consistent inference
  const orderExpr =
    sort === "totalBets"
      ? sql`(SELECT COALESCE(SUM(b.amount), 0) FROM bets b WHERE b.market_id = markets.id) DESC`
      : sort === "participantCount"
        ? sql`(SELECT COUNT(DISTINCT b.user_id) FROM bets b WHERE b.market_id = markets.id) DESC`
        : sql`markets.created_at DESC`;

  // Fetch paginated markets joined with creator
  const marketRows = await db
    .select({
      id: marketsTable.id,
      title: marketsTable.title,
      description: marketsTable.description,
      status: marketsTable.status,
      createdBy: marketsTable.createdBy,
      createdAt: marketsTable.createdAt,
      creatorUsername: usersTable.username,
    })
    .from(marketsTable)
    .leftJoin(usersTable, eq(marketsTable.createdBy, usersTable.id))
    .where(eq(marketsTable.status, status))
    .orderBy(orderExpr)
    .limit(limit)
    .offset(offset);

  if (marketRows.length === 0) {
    return {
      markets: [],
      pagination: { page, limit, totalCount, totalPages, hasNextPage: false },
    };
  }

  const marketIds = marketRows.map((m) => m.id);

  // Batch fetch all outcomes for selected markets
  const allOutcomes = await db
    .select()
    .from(marketOutcomesTable)
    .where(inArray(marketOutcomesTable.marketId, marketIds))
    .orderBy(asc(marketOutcomesTable.position));

  // Batch fetch all bets for selected markets — single query, no N+1
  const allBets = await db
    .select({
      marketId: betsTable.marketId,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
      userId: betsTable.userId,
    })
    .from(betsTable)
    .where(inArray(betsTable.marketId, marketIds));

  // Group outcomes and bets by marketId
  const outcomesByMarket = new Map<number, typeof allOutcomes>();
  for (const outcome of allOutcomes) {
    const list = outcomesByMarket.get(outcome.marketId) ?? [];
    list.push(outcome);
    outcomesByMarket.set(outcome.marketId, list);
  }

  type BetRow = (typeof allBets)[number];
  const betsByMarket = new Map<number, BetRow[]>();
  for (const bet of allBets) {
    const list = betsByMarket.get(bet.marketId) ?? [];
    list.push(bet);
    betsByMarket.set(bet.marketId, list);
  }

  // Build enriched market objects
  const markets = marketRows.map((market) => {
    const marketBets = betsByMarket.get(market.id) ?? [];
    const marketOutcomes = outcomesByMarket.get(market.id) ?? [];

    const totalMarketBets = marketBets.reduce((sum, b) => sum + b.amount, 0);
    const participantCount = new Set(marketBets.map((b) => b.userId)).size;

    const outcomes = marketOutcomes.map((outcome) => {
      const outcomeBets = marketBets
        .filter((b) => b.outcomeId === outcome.id)
        .reduce((sum, b) => sum + b.amount, 0);
      const odds =
        totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;
      return {
        id: outcome.id,
        title: outcome.title,
        odds,
        totalBets: outcomeBets,
      };
    });

    return {
      id: market.id,
      title: market.title,
      description: market.description,
      status: market.status,
      creator: market.creatorUsername,
      createdAt: market.createdAt,
      totalMarketBets,
      participantCount,
      outcomes,
    };
  });

  return {
    markets,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    with: {
      creator: {
        columns: { username: true },
      },
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  const betsPerOutcome = await Promise.all(
    market.outcomes.map(async (outcome) => {
      const totalBets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.outcomeId, outcome.id));

      const totalAmount = totalBets.reduce((sum, bet) => sum + bet.amount, 0);
      return { outcomeId: outcome.id, totalBets: totalAmount };
    }),
  );

  const totalMarketBets = betsPerOutcome.reduce((sum, b) => sum + b.totalBets, 0);

  return {
    id: market.id,
    title: market.title,
    description: market.description,
    status: market.status,
    creator: market.creator?.username,
    outcomes: market.outcomes.map((outcome) => {
      const outcomeBets = betsPerOutcome.find((b) => b.outcomeId === outcome.id)?.totalBets || 0;
      const odds =
        totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;

      return {
        id: outcome.id,
        title: outcome.title,
        odds,
        totalBets: outcomeBets,
      };
    }),
    totalMarketBets,
  };
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;
  const errors = validateBet(amount);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(eq(marketOutcomesTable.id, outcomeId), eq(marketOutcomesTable.marketId, marketId)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  // Fast pre-check (UX): reject immediately if balance is clearly insufficient.
  // This is NOT the security boundary — the transaction below is.
  if (user.balance < Number(amount)) {
    set.status = 402;
    return { error: "Insufficient balance" };
  }

  // Atomic bet placement: INSERT bet + deduct balance in one SQLite transaction.
  //
  // The UPDATE uses `AND balance >= ?` as the concurrency guard: if two requests
  // race, only one can satisfy the condition and decrement to a non-negative value.
  // If changes === 0, another concurrent request depleted the balance; the
  // transaction rolls back and the caller receives an Insufficient balance error.
  const sqliteDb = db.$client as Database;

  const stmtInsertBet = sqliteDb.prepare(
    `INSERT INTO bets (user_id, market_id, outcome_id, amount, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const stmtDeductBalance = sqliteDb.prepare(
    `UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?`,
  );
  const stmtGetBalance = sqliteDb.prepare(
    `SELECT balance FROM users WHERE id = ?`,
  );

  let betId: number;
  let newBalance: number;

  const runTx = sqliteDb.transaction(() => {
    const createdAt = Math.floor(Date.now() / 1000);
    const betResult = stmtInsertBet.run(
      user.id,
      marketId,
      outcomeId,
      Number(amount),
      createdAt,
    );
    betId = Number(betResult.lastInsertRowid);

    // The guard `AND balance >= amount` prevents negative balances even under concurrency.
    const { changes } = stmtDeductBalance.run(Number(amount), user.id, Number(amount));
    if (changes === 0) {
      throw new Error("insufficient_balance");
    }

    const row = stmtGetBalance.get(user.id) as { balance: number };
    newBalance = row.balance;
  });

  try {
    runTx();
  } catch (err) {
    if (err instanceof Error && err.message === "insufficient_balance") {
      set.status = 402;
      return { error: "Insufficient balance" };
    }
    throw err;
  }

  set.status = 201;
  return {
    id: betId!,
    userId: user.id,
    marketId,
    outcomeId,
    amount: Number(amount),
    newBalance: newBalance!,
  };
}

export async function handleGetMe({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  // user is loaded fresh from DB by the auth middleware on every request.
  // The guard in profile.routes.ts ensures this is only reached when authenticated.
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    hasApiKey: user.apiKeyHash !== null,
  };
}

export async function handleGenerateApiKey({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  // Generate a fresh 256-bit random key with the pmk_ prefix.
  const plainKey = generateApiKey();
  // Only the SHA-256 hash is persisted — the plaintext is never stored.
  const keyHash = hashApiKey(plainKey);

  await db
    .update(usersTable)
    .set({ apiKeyHash: keyHash })
    .where(eq(usersTable.id, user.id));

  // Return the plaintext key once. After this response it is unrecoverable.
  return {
    key: plainKey,
    message: "Store this key securely — it will not be shown again.",
  };
}

const BETS_PER_PAGE = 20;

export async function handleGetActiveBets({
  query,
  user,
}: {
  query: { page?: string };
  user: typeof usersTable.$inferSelect;
}) {
  const page = Math.max(1, parseInt(query.page || "1") || 1);
  const offset = (page - 1) * BETS_PER_PAGE;

  const countRows = await db
    .select({ totalCount: count() })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, "active")));
  const totalCount = countRows[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / BETS_PER_PAGE));

  if (totalCount === 0) {
    return {
      bets: [],
      pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: false },
    };
  }

  const betRows = await db
    .select({
      betId: betsTable.id,
      amount: betsTable.amount,
      createdAt: betsTable.createdAt,
      outcomeId: betsTable.outcomeId,
      outcomeTitle: marketOutcomesTable.title,
      marketId: marketsTable.id,
      marketTitle: marketsTable.title,
    })
    .from(betsTable)
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, "active")))
    .orderBy(desc(betsTable.createdAt))
    .limit(BETS_PER_PAGE)
    .offset(offset);

  if (betRows.length === 0) {
    return {
      bets: [],
      pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: false },
    };
  }

  // Batch-fetch all bets for these markets to compute current odds
  const marketIds = [...new Set(betRows.map((b) => b.marketId))];
  const allMarketBets = await db
    .select({
      marketId: betsTable.marketId,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .where(inArray(betsTable.marketId, marketIds));

  type MarketBetRow = (typeof allMarketBets)[number];
  const betsByMarket = new Map<number, MarketBetRow[]>();
  for (const b of allMarketBets) {
    const list = betsByMarket.get(b.marketId) ?? [];
    list.push(b);
    betsByMarket.set(b.marketId, list);
  }

  const bets = betRows.map((row) => {
    const marketBets = betsByMarket.get(row.marketId) ?? [];
    const totalMarketBets = marketBets.reduce((sum, b) => sum + b.amount, 0);
    const outcomeBets = marketBets
      .filter((b) => b.outcomeId === row.outcomeId)
      .reduce((sum, b) => sum + b.amount, 0);
    const currentOdds =
      totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;
    return {
      id: row.betId,
      marketId: row.marketId,
      marketTitle: row.marketTitle,
      outcomeId: row.outcomeId,
      outcomeTitle: row.outcomeTitle,
      amount: row.amount,
      currentOdds,
      createdAt: row.createdAt,
    };
  });

  return {
    bets,
    pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: page < totalPages },
  };
}

export async function handleGetResolvedBets({
  query,
  user,
}: {
  query: { page?: string };
  user: typeof usersTable.$inferSelect;
}) {
  const page = Math.max(1, parseInt(query.page || "1") || 1);
  const offset = (page - 1) * BETS_PER_PAGE;

  const countRows = await db
    .select({ totalCount: count() })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, "resolved")));
  const totalCount = countRows[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / BETS_PER_PAGE));

  if (totalCount === 0) {
    return {
      bets: [],
      pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: false },
    };
  }

  const betRows = await db
    .select({
      betId: betsTable.id,
      amount: betsTable.amount,
      createdAt: betsTable.createdAt,
      outcomeId: betsTable.outcomeId,
      outcomeTitle: marketOutcomesTable.title,
      marketId: marketsTable.id,
      marketTitle: marketsTable.title,
      resolvedOutcomeId: marketsTable.resolvedOutcomeId,
    })
    .from(betsTable)
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, "resolved")))
    .orderBy(desc(betsTable.createdAt))
    .limit(BETS_PER_PAGE)
    .offset(offset);

  if (betRows.length === 0) {
    return {
      bets: [],
      pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: false },
    };
  }

  const bets = betRows.map((row) => ({
    id: row.betId,
    marketId: row.marketId,
    marketTitle: row.marketTitle,
    outcomeId: row.outcomeId,
    outcomeTitle: row.outcomeTitle,
    amount: row.amount,
    result: row.resolvedOutcomeId !== null && row.resolvedOutcomeId === row.outcomeId
      ? ("win" as const)
      : ("loss" as const),
    createdAt: row.createdAt,
  }));

  return {
    bets,
    pagination: { page, limit: BETS_PER_PAGE, totalCount, totalPages, hasNextPage: page < totalPages },
  };
}

export async function handleGetLeaderboard() {
  // 1. Fetch all resolved markets that have a declared winning outcome
  const resolvedMarkets = await db
    .select({ id: marketsTable.id, resolvedOutcomeId: marketsTable.resolvedOutcomeId })
    .from(marketsTable)
    .where(and(eq(marketsTable.status, "resolved"), isNotNull(marketsTable.resolvedOutcomeId)));

  if (resolvedMarkets.length === 0) {
    return { leaderboard: [] };
  }

  const marketIds = resolvedMarkets.map((m) => m.id);

  // 2. Batch-fetch all bets for those markets in one query (no N+1)
  const allBets = await db
    .select({
      userId: betsTable.userId,
      marketId: betsTable.marketId,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .where(inArray(betsTable.marketId, marketIds));

  // 3. Build lookup: marketId → resolvedOutcomeId
  const resolvedOutcomeByMarket = new Map(
    resolvedMarkets.map((m) => [m.id, m.resolvedOutcomeId as number]),
  );

  // 4. Group bets by market
  type BetRow = (typeof allBets)[number];
  const betsByMarket = new Map<number, BetRow[]>();
  for (const bet of allBets) {
    const list = betsByMarket.get(bet.marketId) ?? [];
    list.push(bet);
    betsByMarket.set(bet.marketId, list);
  }

  // 5. Compute per-user payouts using the same distributePayouts formula as processMarketPayouts.
  //    This guarantees leaderboard values match what was actually credited to balances — the old
  //    per-bet toFixed(2) approach diverged by up to $0.01 per market when cents didn't divide evenly.
  const userWinnings = new Map<number, number>();

  for (const market of resolvedMarkets) {
    const resolvedOutcomeId = resolvedOutcomeByMarket.get(market.id)!;
    const marketBets = betsByMarket.get(market.id) ?? [];

    const totalPool = marketBets.reduce((sum, b) => sum + b.amount, 0);

    // Group winning stakes by userId (mirrors processMarketPayouts step 5)
    const winnerStakeByUser = new Map<number, number>();
    for (const bet of marketBets) {
      if (bet.outcomeId !== resolvedOutcomeId) continue;
      winnerStakeByUser.set(bet.userId, (winnerStakeByUser.get(bet.userId) ?? 0) + bet.amount);
    }

    const winnerList = [...winnerStakeByUser.entries()].map(([userId, amount]) => ({ userId, amount }));
    const totalWinningStake = winnerList.reduce((sum, w) => sum + w.amount, 0);

    if (totalWinningStake === 0) continue;

    const payouts = distributePayouts(winnerList, totalPool, totalWinningStake);
    for (const p of payouts) {
      userWinnings.set(p.userId, (userWinnings.get(p.userId) ?? 0) + p.payout);
    }
  }

  if (userWinnings.size === 0) {
    return { leaderboard: [] };
  }

  // 6. Fetch usernames for all winners in one batch query
  const winnerIds = [...userWinnings.keys()];
  const users = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, winnerIds));

  const usernameById = new Map(users.map((u) => [u.id, u.username]));

  // 7. Sort descending by totalWinnings and assign ranks
  const leaderboard = [...userWinnings.entries()]
    .map(([userId, totalWinnings]) => ({
      username: usernameById.get(userId) ?? "Unknown",
      totalWinnings: Number(totalWinnings.toFixed(2)),
    }))
    .sort((a, b) => b.totalWinnings - a.totalWinnings)
    .map((entry, i) => ({ rank: i + 1, ...entry }));

  return { leaderboard };
}

export async function handleResolveMarket({
  params,
  body,
  set,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: { status: number };
}) {
  const marketId = params.id;
  const { outcomeId } = body;

  try {
    const result = await processMarketPayouts(marketId, outcomeId);
    return {
      success: true,
      marketId,
      resolvedOutcomeId: outcomeId,
      totalPool: result.totalPool,
      winnerCount: result.winnerCount,
      totalPaidOut: result.totalPaidOut,
    };
  } catch (err) {
    if (err instanceof MarketNotFoundError) {
      set.status = 404;
      return { error: "Market not found" };
    }
    if (err instanceof OutcomeNotFoundError) {
      set.status = 404;
      return { error: "Outcome not found for this market" };
    }
    if (err instanceof PayoutAlreadyProcessedError) {
      set.status = 409;
      return { error: "Market is already resolved" };
    }
    throw err;
  }
}
