import {
  int,
  sqliteTable,
  text,
  real,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Users table
export const usersTable = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    balance: real("balance").notNull().default(1000),
    apiKeyHash: text("api_key_hash"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    apiKeyHashIdx: uniqueIndex("users_api_key_hash_idx").on(table.apiKeyHash),
  }),
);

// Markets table
export const marketsTable = sqliteTable(
  "markets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "resolved"] })
      .notNull()
      .default("active"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedOutcomeId: integer("resolved_outcome_id"),
    payoutStatus: text("payout_status", { enum: ["pending", "completed"] })
      .notNull()
      .default("pending"),
  },
  (table) => ({
    createdByIdx: index("markets_created_by_idx").on(table.createdBy),
    statusIdx: index("markets_status_idx").on(table.status),
  }),
);

// Market Outcomes table
export const marketOutcomesTable = sqliteTable(
  "market_outcomes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: integer("market_id")
      .notNull()
      .references(() => marketsTable.id),
    title: text("title").notNull(),
    position: integer("position").notNull(), // for ordering outcomes
  },
  (table) => ({
    marketIdIdx: index("market_outcomes_market_id_idx").on(table.marketId),
  }),
);

// Bets table
export const betsTable = sqliteTable(
  "bets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    marketId: integer("market_id")
      .notNull()
      .references(() => marketsTable.id),
    outcomeId: integer("outcome_id")
      .notNull()
      .references(() => marketOutcomesTable.id),
    amount: real("amount").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("bets_user_id_idx").on(table.userId),
    marketIdIdx: index("bets_market_id_idx").on(table.marketId),
    outcomeIdIdx: index("bets_outcome_id_idx").on(table.outcomeId),
  }),
);

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdMarkets: many(marketsTable, { relationName: "createdBy" }),
  bets: many(betsTable, { relationName: "bets" }),
}));

export const marketsRelations = relations(marketsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [marketsTable.createdBy],
    references: [usersTable.id],
    relationName: "createdBy",
  }),
  outcomes: many(marketOutcomesTable, { relationName: "outcomes" }),
  bets: many(betsTable, { relationName: "bets" }),
  resolvedOutcome: one(marketOutcomesTable, {
    fields: [marketsTable.resolvedOutcomeId],
    references: [marketOutcomesTable.id],
  }),
}));

export const marketOutcomesRelations = relations(marketOutcomesTable, ({ one, many }) => ({
  market: one(marketsTable, {
    fields: [marketOutcomesTable.marketId],
    references: [marketsTable.id],
    relationName: "outcomes",
  }),
  bets: many(betsTable, { relationName: "bets" }),
}));

export const betsRelations = relations(betsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [betsTable.userId],
    references: [usersTable.id],
    relationName: "bets",
  }),
  market: one(marketsTable, {
    fields: [betsTable.marketId],
    references: [marketsTable.id],
    relationName: "bets",
  }),
  outcome: one(marketOutcomesTable, {
    fields: [betsTable.outcomeId],
    references: [marketOutcomesTable.id],
    relationName: "bets",
  }),
}));
