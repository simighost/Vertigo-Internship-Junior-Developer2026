/**
 * Profile bets endpoint tests.
 *
 * Covers: active bets with live odds, resolved bets with win/loss result,
 * and pagination metadata shape.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { app } from "../index";
import db from "../src/db";
import { usersTable, marketsTable, marketOutcomesTable } from "../src/db/schema";
import { processMarketPayouts } from "../src/lib/payout";

const BASE = "http://localhost";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string) {
  const res = await app.handle(
    new Request(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `prof_${suffix}`,
        email: `prof_${suffix}@test.com`,
        password: "password123",
      }),
    }),
  );
  const data = await res.json() as any;
  return { token: data.token as string, userId: data.id as number };
}

async function createMarketViaApi(token: string, title: string, outcomes: string[]) {
  const res = await app.handle(
    new Request(`${BASE}/api/markets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, outcomes }),
    }),
  );
  return res.json() as Promise<any>;
}

async function placeBetViaApi(token: string, marketId: number, outcomeId: number, amount: number) {
  const res = await app.handle(
    new Request(`${BASE}/api/markets/${marketId}/bets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ outcomeId, amount }),
    }),
  );
  return res.json() as Promise<any>;
}

// ─── Active bets ──────────────────────────────────────────────────────────────

describe("GET /api/profile/bets/active", () => {
  it("returns active bets with pagination metadata", async () => {
    const ts = Date.now();
    const { token } = await registerAndLogin(`active_${ts}`);
    const mkt = await createMarketViaApi(token, "Active Bets Profile Market", ["A", "B"]);
    await placeBetViaApi(token, mkt.id, mkt.outcomes[0].id, 50);

    const res = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(Array.isArray(data.bets)).toBe(true);
    expect(data.bets.length).toBe(1);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.totalCount).toBe(1);

    const bet = data.bets[0];
    expect(bet.marketId).toBe(mkt.id);
    expect(bet.outcomeTitle).toBe("A");
    expect(bet.amount).toBe(50);
    // currentOdds is a number representing the % share of the pool
    expect(typeof bet.currentOdds).toBe("number");
  });

  it("returns 401 without authentication", async () => {
    const res = await app.handle(new Request(`${BASE}/api/profile/bets/active`));
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no active bets", async () => {
    const ts = Date.now() + 1;
    const { token } = await registerAndLogin(`nobet_${ts}`);

    const res = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json() as any;
    expect(data.bets).toHaveLength(0);
    expect(data.pagination.totalCount).toBe(0);
  });

  it("active bets reflect current odds after additional bets are placed", async () => {
    const ts = Date.now() + 2;
    const { token: t1 } = await registerAndLogin(`odds1_${ts}`);
    const { token: t2 } = await registerAndLogin(`odds2_${ts}`);

    const mkt = await createMarketViaApi(t1, "Odds Update Market", ["X", "Y"]);
    // t1 bets 100 on X — at this point X has 100% of the pool
    await placeBetViaApi(t1, mkt.id, mkt.outcomes[0].id, 100);

    const before = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, { headers: { Authorization: `Bearer ${t1}` } }),
    );
    const dataBefore = await before.json() as any;
    expect(dataBefore.bets[0].currentOdds).toBe(100);

    // t2 bets equal amount on Y — X now has 50%
    await placeBetViaApi(t2, mkt.id, mkt.outcomes[1].id, 100);

    const after = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, { headers: { Authorization: `Bearer ${t1}` } }),
    );
    const dataAfter = await after.json() as any;
    expect(dataAfter.bets[0].currentOdds).toBe(50);
  });
});

// ─── Resolved bets ────────────────────────────────────────────────────────────

describe("GET /api/profile/bets/resolved", () => {
  it("returns 401 without authentication", async () => {
    const res = await app.handle(new Request(`${BASE}/api/profile/bets/resolved`));
    expect(res.status).toBe(401);
  });

  it("shows 'win' for correctly predicted outcome", async () => {
    const ts = Date.now() + 3;
    const { token, userId } = await registerAndLogin(`win_${ts}`);
    const mkt = await createMarketViaApi(token, "Win Result Market", ["Yes", "No"]);

    await placeBetViaApi(token, mkt.id, mkt.outcomes[0].id, 100); // bet on Yes
    await processMarketPayouts(mkt.id, mkt.outcomes[0].id);       // Yes wins

    const res = await app.handle(
      new Request(`${BASE}/api/profile/bets/resolved`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.bets).toHaveLength(1);
    expect(data.bets[0].result).toBe("win");
    expect(data.bets[0].marketTitle).toBe("Win Result Market");
    expect(data.pagination.totalCount).toBe(1);
  });

  it("shows 'loss' for incorrectly predicted outcome", async () => {
    const ts = Date.now() + 4;
    const { token } = await registerAndLogin(`lose_${ts}`);
    const { token: t2 } = await registerAndLogin(`lose2_${ts}`);
    const mkt = await createMarketViaApi(token, "Loss Result Market", ["Yes", "No"]);

    await placeBetViaApi(token, mkt.id, mkt.outcomes[1].id, 50); // bet on No
    await placeBetViaApi(t2, mkt.id, mkt.outcomes[0].id, 50);   // t2 bets Yes
    await processMarketPayouts(mkt.id, mkt.outcomes[0].id);      // Yes wins

    const res = await app.handle(
      new Request(`${BASE}/api/profile/bets/resolved`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json() as any;

    expect(data.bets).toHaveLength(1);
    expect(data.bets[0].result).toBe("loss");
  });

  it("bet moves from active to resolved after market is resolved", async () => {
    const ts = Date.now() + 5;
    const { token } = await registerAndLogin(`move_${ts}`);
    const mkt = await createMarketViaApi(token, "Move To Resolved Market", ["A", "B"]);
    await placeBetViaApi(token, mkt.id, mkt.outcomes[0].id, 75);

    // Before resolution — appears in active
    const activeBefore = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    const ab = await activeBefore.json() as any;
    expect(ab.bets).toHaveLength(1);

    // Resolve market
    await processMarketPayouts(mkt.id, mkt.outcomes[0].id);

    // After resolution — no longer in active
    const activeAfter = await app.handle(
      new Request(`${BASE}/api/profile/bets/active`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    const aa = await activeAfter.json() as any;
    expect(aa.bets).toHaveLength(0);

    // Now appears in resolved
    const resolved = await app.handle(
      new Request(`${BASE}/api/profile/bets/resolved`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    const rd = await resolved.json() as any;
    expect(rd.bets).toHaveLength(1);
    expect(rd.bets[0].result).toBe("win");
  });
});
