/**
 * Demo seed — small, fast, fully consistent.
 *
 * 8 users (1 admin), 15 resolved markets, 35 active markets.
 * All balances are exact: starting_balance - bets_placed + payouts_received.
 * Leaderboard is meaningful: alice is the clear top winner, frank loses heavily.
 * Pagination is testable: 35 active markets (>20), most users have >20 bets.
 */

import { Database } from "bun:sqlite";
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth";
import { distributePayouts } from "../lib/odds";

faker.seed(20260311);

const db = drizzle(new Database(process.env.DB_FILE_NAME || "database.sqlite"), { schema });

const SHARED_PASSWORD = "password123";
const STARTING_BALANCE = 10_000;

// ─── Demo users ───────────────────────────────────────────────────────────────

const DEMO_USERS: Array<{ username: string; email: string; role: "admin" | "user" }> = [
  { username: "admin",   email: "admin@demo.com",   role: "admin" },
  { username: "alice",   email: "alice@demo.com",   role: "user"  },
  { username: "bob",     email: "bob@demo.com",     role: "user"  },
  { username: "charlie", email: "charlie@demo.com", role: "user"  },
  { username: "diana",   email: "diana@demo.com",   role: "user"  },
  { username: "eve",     email: "eve@demo.com",     role: "user"  },
  { username: "frank",   email: "frank@demo.com",   role: "user"  },
  { username: "grace",   email: "grace@demo.com",   role: "user"  },
];

// ─── Resolved market specs ────────────────────────────────────────────────────
// Betting pattern:
//   alice  — consistently bets on the winning side (top leaderboard)
//   bob    — mostly bets on the winning side (solid 2nd)
//   charlie— mixed, slight edge toward winners
//   diana  — balanced, mildly positive
//   eve    — break-even mix
//   frank  — consistently bets on the losing side (bottom of leaderboard)
//   grace  — small, occasional bets; slight winner
//   admin  — places no bets (admin account)

type BetSpec = { user: string; outcomeIdx: number; amount: number };

type ResolvedMarketSpec = {
  title: string;
  description: string;
  outcomes: string[];
  bets: BetSpec[];
  winnerIdx: number; // index into `outcomes`
};

const RESOLVED_MARKETS: ResolvedMarketSpec[] = [
  {
    title: "Will BTC trade above $100k by end of Q1 2026?",
    description: "Resolves YES if BTC/USD closes above $100,000 on 31 Mar 2026.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 500 },
      { user: "bob",     outcomeIdx: 0, amount: 300 },
      { user: "charlie", outcomeIdx: 0, amount: 200 },
      { user: "diana",   outcomeIdx: 0, amount: 150 },
      { user: "frank",   outcomeIdx: 1, amount: 600 },
      { user: "grace",   outcomeIdx: 0, amount: 80  },
    ],
  },
  {
    title: "Will the Lions win the NFC Championship?",
    description: "Resolves YES if the Detroit Lions reach the Super Bowl this season.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 600 },
      { user: "bob",     outcomeIdx: 0, amount: 250 },
      { user: "diana",   outcomeIdx: 0, amount: 100 },
      { user: "eve",     outcomeIdx: 1, amount: 200 },
      { user: "frank",   outcomeIdx: 1, amount: 700 },
    ],
  },
  {
    title: "Will Austin approve the downtown transit bond?",
    description: "Resolves using the official city council vote result.",
    outcomes: ["Pass", "Fail"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 400 },
      { user: "charlie", outcomeIdx: 0, amount: 300 },
      { user: "diana",   outcomeIdx: 0, amount: 200 },
      { user: "frank",   outcomeIdx: 1, amount: 550 },
      { user: "grace",   outcomeIdx: 1, amount: 60  },
    ],
  },
  {
    title: "Will NovaTech launch their IPO before Q3 2026?",
    description: "Resolves YES if NovaTech files and lists on a major exchange before 1 Jul 2026.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 350 },
      { user: "bob",     outcomeIdx: 0, amount: 400 },
      { user: "charlie", outcomeIdx: 1, amount: 150 },
      { user: "frank",   outcomeIdx: 1, amount: 500 },
      { user: "eve",     outcomeIdx: 0, amount: 100 },
    ],
  },
  {
    title: "Will fusion energy hit a net-energy milestone in 2026?",
    description: "Resolves YES upon a publicly verified Q > 1 announcement from any major facility.",
    outcomes: ["Yes", "No"],
    winnerIdx: 1,
    bets: [
      { user: "alice",   outcomeIdx: 1, amount: 300 },
      { user: "bob",     outcomeIdx: 1, amount: 200 },
      { user: "charlie", outcomeIdx: 1, amount: 150 },
      { user: "frank",   outcomeIdx: 0, amount: 450 },
      { user: "diana",   outcomeIdx: 0, amount: 100 },
    ],
  },
  {
    title: "Will NYC record a day above 35°C this summer?",
    description: "Resolves YES if any Central Park weather station records ≥35°C in Jun–Aug 2026.",
    outcomes: ["Yes", "No"],
    winnerIdx: 1,
    bets: [
      { user: "alice",   outcomeIdx: 1, amount: 280 },
      { user: "bob",     outcomeIdx: 1, amount: 220 },
      { user: "eve",     outcomeIdx: 0, amount: 180 },
      { user: "frank",   outcomeIdx: 0, amount: 500 },
      { user: "grace",   outcomeIdx: 1, amount: 70  },
    ],
  },
  {
    title: "Will the Storm win their next playoff match?",
    description: "Resolves on the official match result.",
    outcomes: ["Win", "Lose"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 450 },
      { user: "bob",     outcomeIdx: 0, amount: 350 },
      { user: "charlie", outcomeIdx: 0, amount: 120 },
      { user: "frank",   outcomeIdx: 1, amount: 600 },
      { user: "diana",   outcomeIdx: 1, amount: 100 },
    ],
  },
  {
    title: "Will Chicago approve the North Side housing measure?",
    description: "Resolves using the official aldermanic vote.",
    outcomes: ["Pass", "Fail"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 500 },
      { user: "bob",     outcomeIdx: 0, amount: 300 },
      { user: "diana",   outcomeIdx: 0, amount: 150 },
      { user: "eve",     outcomeIdx: 0, amount: 100 },
      { user: "frank",   outcomeIdx: 1, amount: 650 },
    ],
  },
  {
    title: "Will ETH trade above $5,000 by June 2026?",
    description: "Resolves YES if ETH/USD closes above $5,000 on any day before 30 Jun 2026.",
    outcomes: ["Yes", "No"],
    winnerIdx: 1,
    bets: [
      { user: "alice",   outcomeIdx: 1, amount: 400 },
      { user: "bob",     outcomeIdx: 1, amount: 250 },
      { user: "charlie", outcomeIdx: 0, amount: 200 },
      { user: "frank",   outcomeIdx: 0, amount: 550 },
      { user: "grace",   outcomeIdx: 1, amount: 90  },
    ],
  },
  {
    title: "Will the Falcons win the division title?",
    description: "Resolves on the official end-of-season standings.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 600 },
      { user: "bob",     outcomeIdx: 0, amount: 400 },
      { user: "charlie", outcomeIdx: 0, amount: 200 },
      { user: "frank",   outcomeIdx: 1, amount: 800 },
      { user: "diana",   outcomeIdx: 1, amount: 150 },
    ],
  },
  {
    title: "Will GeneCure receive FDA approval for their Phase 3 therapy?",
    description: "Resolves YES on official FDA approval notice.",
    outcomes: ["Approved", "Not Approved"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 200 },
      { user: "bob",     outcomeIdx: 0, amount: 150 },
      { user: "charlie", outcomeIdx: 0, amount: 250 },
      { user: "diana",   outcomeIdx: 0, amount: 100 },
      { user: "frank",   outcomeIdx: 1, amount: 400 },
    ],
  },
  {
    title: "Will Tokyo record measurable snowfall in February 2026?",
    description: "Resolves YES if the Japan Meteorological Agency records ≥1 cm snow in Tokyo.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 250 },
      { user: "bob",     outcomeIdx: 0, amount: 180 },
      { user: "eve",     outcomeIdx: 0, amount: 120 },
      { user: "frank",   outcomeIdx: 1, amount: 350 },
      { user: "grace",   outcomeIdx: 0, amount: 60  },
    ],
  },
  {
    title: "Will RocketStart launch their consumer app before April 2026?",
    description: "Resolves YES on App Store / Play Store public listing.",
    outcomes: ["Yes", "No"],
    winnerIdx: 1,
    bets: [
      { user: "alice",   outcomeIdx: 1, amount: 200 },
      { user: "charlie", outcomeIdx: 0, amount: 180 },
      { user: "diana",   outcomeIdx: 1, amount: 120 },
      { user: "frank",   outcomeIdx: 0, amount: 300 },
      { user: "grace",   outcomeIdx: 1, amount: 50  },
    ],
  },
  {
    title: "Will Phoenix break its all-time heat record in 2026?",
    description: "Resolves YES if Phoenix Sky Harbor records a temperature above 50°C.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 180 },
      { user: "bob",     outcomeIdx: 0, amount: 220 },
      { user: "diana",   outcomeIdx: 0, amount: 130 },
      { user: "eve",     outcomeIdx: 1, amount: 150 },
      { user: "frank",   outcomeIdx: 1, amount: 400 },
    ],
  },
  {
    title: "Will solid-state battery tech reach commercial production in 2026?",
    description: "Resolves YES on announcement of volume manufacturing by a major auto supplier.",
    outcomes: ["Yes", "No"],
    winnerIdx: 0,
    bets: [
      { user: "alice",   outcomeIdx: 0, amount: 350 },
      { user: "bob",     outcomeIdx: 0, amount: 280 },
      { user: "charlie", outcomeIdx: 0, amount: 190 },
      { user: "diana",   outcomeIdx: 1, amount: 120 },
      { user: "frank",   outcomeIdx: 1, amount: 480 },
    ],
  },
];

// ─── Active market title templates ───────────────────────────────────────────

const MARKET_CATEGORIES = ["crypto", "sports", "politics", "business", "science", "weather"] as const;
type MarketCategory = (typeof MARKET_CATEGORIES)[number];

function createMarketTitle(category: MarketCategory): string {
  switch (category) {
    case "crypto":
      return `Will ${faker.finance.currencyCode()} trade above $${faker.number.int({ min: 20, max: 250 })} by ${faker.date.soon({ days: 180 }).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}?`;
    case "sports":
      return `Will the ${faker.helpers.arrayElement(["Lions", "Storm", "Falcons", "Tigers", "Sharks"])} win ${faker.helpers.arrayElement(["their next match", "the division", "the championship"])}?`;
    case "politics":
      return `Will ${faker.location.city()} approve ${faker.helpers.arrayElement(["the housing measure", "the transit bond", "the tax proposal", "the school budget"])} this year?`;
    case "business":
      return `Will ${faker.company.name()} launch ${faker.helpers.arrayElement(["an IPO", "a new AI product", "a mobile app", "a subscription tier"])} before Q${faker.number.int({ min: 2, max: 4 })}?`;
    case "science":
      return `Will ${faker.helpers.arrayElement(["fusion", "gene therapy", "battery tech", "space robotics"])} hit ${faker.helpers.arrayElement(["a public milestone", "commercial rollout", "regulatory approval", "a new record"])} this year?`;
    case "weather":
      return `Will ${faker.location.city()} record ${faker.helpers.arrayElement(["rain", "snow", "temperatures above 35C", "temperatures below -5C"])} this month?`;
  }
}

function createMarketDescription(category: MarketCategory): string {
  switch (category) {
    case "crypto":   return "Speculation on a major digital asset crossing a specific price target.";
    case "sports":   return "A sports market based on an upcoming result with fan-driven volume.";
    case "politics": return "A local politics market resolving on the official public election result.";
    case "business": return "A company milestone market focused on launches and capital events.";
    case "science":  return "A research market driven by publicly reported breakthroughs.";
    case "weather":  return "A weather market tied to publicly recorded local conditions.";
  }
}

function createMarketOutcomes(category: MarketCategory): string[] {
  if (category === "sports") {
    return faker.helpers.arrayElement([["Win", "Lose"], ["Yes", "No"], ["Win in regulation", "Win after OT", "No win"]]);
  }
  if (category === "politics") {
    return faker.helpers.arrayElement([["Pass", "Fail"], ["Yes", "No"]]);
  }
  return faker.helpers.arrayElement([["Yes", "No"], ["Yes", "No", "Unclear"]]);
}

// ─── Bet distribution helpers for active markets ──────────────────────────────
// Each active market gets a random subset of users with random amounts.
// We track user balances to avoid overspending.

// ─── Core seeding logic ───────────────────────────────────────────────────────

async function deleteAllData() {
  console.log("Deleting all data...");
  await db.delete(schema.betsTable);
  await db.delete(schema.marketOutcomesTable);
  await db.delete(schema.marketsTable);
  await db.delete(schema.usersTable);
  console.log("All data deleted.\n");
}

async function insertUsers() {
  console.log("Creating demo users...");
  const passwordHash = await hashPassword(SHARED_PASSWORD);
  const rows = await db
    .insert(schema.usersTable)
    .values(
      DEMO_USERS.map((u) => ({
        username: u.username,
        email: u.email,
        role: u.role,
        passwordHash,
        balance: STARTING_BALANCE,
      })),
    )
    .returning();
  console.log(`Created ${rows.length} users.`);
  // Return a map username → row for easy lookup
  const userMap = new Map<string, typeof rows[0]>();
  for (const row of rows) userMap.set(row.username, row);
  return userMap;
}

/**
 * Place a bet: insert the row and deduct balance.
 * Uses the same atomicity pattern as handlePlaceBet (UPDATE ... WHERE balance >= amount).
 */
async function placeBet(
  sqliteDb: Database,
  userId: number,
  marketId: number,
  outcomeId: number,
  amount: number,
) {
  const stmtDeduct = sqliteDb.prepare(
    `UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?`,
  );
  const { changes } = stmtDeduct.run(amount, userId, amount);
  if (changes === 0) {
    throw new Error(`User ${userId} has insufficient balance to bet $${amount}`);
  }
  await db.insert(schema.betsTable).values({ userId, marketId, outcomeId, amount });
}

/**
 * Resolve a market: distribute payouts and mark it resolved.
 * Mirrors processMarketPayouts but uses the seed's own db connection.
 */
async function resolveMarket(
  sqliteDb: Database,
  marketId: number,
  winnerOutcomeId: number,
) {
  const allBets = await db
    .select({ userId: schema.betsTable.userId, outcomeId: schema.betsTable.outcomeId, amount: schema.betsTable.amount })
    .from(schema.betsTable)
    .where(eq(schema.betsTable.marketId, marketId));

  const totalPool = allBets.reduce((s, b) => s + b.amount, 0);

  const winnerStakeByUser = new Map<number, number>();
  for (const bet of allBets) {
    if (bet.outcomeId !== winnerOutcomeId) continue;
    winnerStakeByUser.set(bet.userId, (winnerStakeByUser.get(bet.userId) ?? 0) + bet.amount);
  }

  const winnerList = [...winnerStakeByUser.entries()].map(([userId, amount]) => ({ userId, amount }));
  const totalWinningStake = winnerList.reduce((s, w) => s + w.amount, 0);
  const payouts = distributePayouts(winnerList, totalPool, totalWinningStake);

  const stmtResolve = sqliteDb.prepare(
    `UPDATE markets SET status = 'resolved', resolved_outcome_id = ?, payout_status = 'completed' WHERE id = ?`,
  );
  const stmtCredit = sqliteDb.prepare(
    `UPDATE users SET balance = balance + ? WHERE id = ?`,
  );

  sqliteDb.transaction(() => {
    stmtResolve.run(winnerOutcomeId, marketId);
    for (const p of payouts) stmtCredit.run(p.payout, p.userId);
  })();
}

async function insertResolvedMarkets(
  userMap: Map<string, { id: number }>,
  sqliteDb: Database,
) {
  console.log(`\nCreating ${RESOLVED_MARKETS.length} resolved markets with bets...`);
  let totalBets = 0;

  for (const spec of RESOLVED_MARKETS) {
    // Admin creates the market
    const adminId = userMap.get("admin")!.id;
    const [market] = await db
      .insert(schema.marketsTable)
      .values({ title: spec.title, description: spec.description, createdBy: adminId })
      .returning() as [typeof schema.marketsTable.$inferSelect];

    const outcomeRows = await db
      .insert(schema.marketOutcomesTable)
      .values(spec.outcomes.map((title, position) => ({ marketId: market.id, title, position })))
      .returning();

    // Place bets
    for (const betSpec of spec.bets) {
      const user = userMap.get(betSpec.user);
      if (!user) throw new Error(`Unknown user: ${betSpec.user}`);
      const outcome = outcomeRows[betSpec.outcomeIdx]!;
      await placeBet(sqliteDb, user.id, market.id, outcome.id, betSpec.amount);
      totalBets++;
    }

    // Resolve and distribute payouts
    const winnerOutcome = outcomeRows[spec.winnerIdx]!;
    await resolveMarket(sqliteDb, market.id, winnerOutcome.id);
  }

  console.log(`Created ${RESOLVED_MARKETS.length} resolved markets with ${totalBets} bets.`);
}

async function insertActiveMarkets(
  userMap: Map<string, { id: number; balance?: number }>,
  sqliteDb: Database,
) {
  const ACTIVE_COUNT = 35;
  console.log(`\nCreating ${ACTIVE_COUNT} active markets with bets...`);

  // Track current balances so we don't overspend
  const balances = new Map<string, number>();
  for (const [name] of userMap) balances.set(name, STARTING_BALANCE);

  // Re-read actual current balances (after resolved market payouts)
  const dbBalances = await db.select({ id: schema.usersTable.id, username: schema.usersTable.username, balance: schema.usersTable.balance }).from(schema.usersTable);
  for (const row of dbBalances) balances.set(row.username, row.balance);

  const regularUsers = DEMO_USERS.filter((u) => u.role === "user").map((u) => u.username);
  let totalBets = 0;

  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const category = faker.helpers.arrayElement(MARKET_CATEGORIES);
    const creator = faker.helpers.arrayElement(regularUsers);
    const creatorId = userMap.get(creator)!.id;

    const [market] = await db
      .insert(schema.marketsTable)
      .values({
        title: createMarketTitle(category),
        description: createMarketDescription(category),
        createdBy: creatorId,
      })
      .returning() as [typeof schema.marketsTable.$inferSelect];

    const outcomes = createMarketOutcomes(category);
    const outcomeRows = await db
      .insert(schema.marketOutcomesTable)
      .values(outcomes.map((title, position) => ({ marketId: market.id, title, position })))
      .returning();

    // Give this market 5–12 bets from random users
    const betCount = faker.number.int({ min: 5, max: 12 });
    for (let b = 0; b < betCount; b++) {
      const bettor = faker.helpers.arrayElement(regularUsers);
      const currentBalance = balances.get(bettor) ?? 0;
      if (currentBalance < 20) continue;

      const maxBet = Math.min(currentBalance - 10, 300);
      const amount = faker.number.int({ min: 10, max: maxBet, multipleOf: 5 });
      const outcome = faker.helpers.arrayElement(outcomeRows);

      await placeBet(sqliteDb, userMap.get(bettor)!.id, market.id, outcome.id, amount);
      balances.set(bettor, (balances.get(bettor) ?? 0) - amount);
      totalBets++;
    }
  }

  console.log(`Created ${ACTIVE_COUNT} active markets with ${totalBets} bets.`);
}

function printSeedSummary(userMap: Map<string, { username: string; email: string }>) {
  console.log("\n============================================================");
  console.log("SEED COMPLETE");
  console.log("============================================================");
  console.log(`Users:    ${userMap.size} (1 admin, ${userMap.size - 1} regular)`);
  console.log(`Markets:  ${RESOLVED_MARKETS.length} resolved + 35 active = ${RESOLVED_MARKETS.length + 35} total`);
  console.log("\nLogin credentials (all passwords: password123):");
  for (const [, user] of userMap) {
    console.log(`  ${user.email.padEnd(26)} / ${SHARED_PASSWORD}`);
  }
  console.log("\nLeaderboard: alice > bob > charlie > diana (frank near bottom)");
  console.log("============================================================\n");
}

async function seedDatabase() {
  console.log("Seeding database...\n");

  const userMap = await insertUsers();
  const sqliteDb = (db.$client as Database);

  await insertResolvedMarkets(userMap, sqliteDb);
  await insertActiveMarkets(userMap, sqliteDb);

  printSeedSummary(userMap);
}

async function main() {
  const command = process.argv[2];

  if (command === "reset") {
    await deleteAllData();
    await seedDatabase();
  } else if (command === "seed") {
    await seedDatabase();
  } else if (command === "delete") {
    await deleteAllData();
  } else {
    console.log("Usage:");
    console.log("  bun run db:seed        # Seed with demo data");
    console.log("  bun run db:reset       # Delete all and reseed");
    console.log("  bun run db:delete      # Delete all data");
  }
}

main().catch(console.error);
