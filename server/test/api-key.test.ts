/**
 * API key authentication tests.
 *
 * Covers: generation, hashing, auth, regeneration, rate limiting.
 * All tests use the in-memory SQLite DB migrated in beforeAll.
 */
import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import { app } from "../index";
import db from "../src/db";
import { usersTable } from "../src/db/schema";
import { generateApiKey, hashApiKey } from "../src/lib/auth";
import { resetAll as resetRateLimit } from "../src/lib/rate-limit";

const BASE = "http://localhost";

// ─── Migration ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// Reset the rate limiter between tests so they don't bleed into each other.
afterEach(() => {
  resetRateLimit();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string) {
  const username = `apikeyuser_${suffix}`;
  const email = `apikey_${suffix}@test.com`;
  const password = "password123";

  const res = await app.handle(
    new Request(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    }),
  );
  const data = await res.json() as any;
  return { token: data.token as string, userId: data.id as number };
}

// ─── Key generation utilities ─────────────────────────────────────────────────

describe("generateApiKey + hashApiKey", () => {
  it("generated key has pmk_ prefix", () => {
    const key = generateApiKey();
    expect(key.startsWith("pmk_")).toBe(true);
  });

  it("generated key has sufficient length (>40 chars)", () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThan(40);
  });

  it("two generated keys are always different", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });

  it("hashApiKey produces a 64-char hex SHA-256 digest", () => {
    const hash = hashApiKey("pmk_test");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("hashing the same key twice is deterministic", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("different keys produce different hashes", () => {
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()));
  });
});

// ─── API key generation endpoint ─────────────────────────────────────────────

describe("POST /api/profile/api-key", () => {
  it("generates a key and returns it in plaintext", async () => {
    const { token } = await registerAndLogin(Date.now().toString());

    const res = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.key).toBe("string");
    expect(data.key.startsWith("pmk_")).toBe(true);
    expect(data.message).toBeDefined();
  });

  it("stores only the hash — plaintext is never in the DB", async () => {
    const { token, userId } = await registerAndLogin(`hash_${Date.now()}`);

    const res = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key } = await res.json() as any;

    const dbUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    // DB must NOT contain the plaintext key.
    expect(dbUser?.apiKeyHash).not.toBe(key);
    // DB must contain the correct SHA-256 hash.
    expect(dbUser?.apiKeyHash).toBe(hashApiKey(key));
  });

  it("returns 401 without authentication", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("regenerating overwrites the old hash", async () => {
    const { token, userId } = await registerAndLogin(`regen_${Date.now()}`);

    const first = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key: key1 } = await first.json() as any;

    const second = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key: key2 } = await second.json() as any;

    // Keys must be different.
    expect(key1).not.toBe(key2);

    // DB must now store the hash of key2, not key1.
    const dbUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    expect(dbUser?.apiKeyHash).toBe(hashApiKey(key2));
    expect(dbUser?.apiKeyHash).not.toBe(hashApiKey(key1));
  });
});

// ─── API key authentication ───────────────────────────────────────────────────

describe("X-API-Key authentication", () => {
  it("authenticates a valid key on an existing endpoint", async () => {
    const { token } = await registerAndLogin(`auth_${Date.now()}`);

    // Generate a key.
    const genRes = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key } = await genRes.json() as any;

    // Use the key to access /api/profile/me.
    const meRes = await app.handle(
      new Request(`${BASE}/api/profile/me`, {
        headers: { "X-API-Key": key },
      }),
    );

    expect(meRes.status).toBe(200);
    const me = await meRes.json() as any;
    expect(me.username).toBeDefined();
    expect(me.hasApiKey).toBe(true);
  });

  it("rejects an invalid API key with 401", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/profile/me`, {
        headers: { "X-API-Key": "pmk_thisisnotarealkey" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("user resolved via API key has the same role as via JWT", async () => {
    const { token, userId } = await registerAndLogin(`role_${Date.now()}`);

    const genRes = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key } = await genRes.json() as any;

    // Fetch profile via JWT.
    const jwtMe = await app
      .handle(new Request(`${BASE}/api/profile/me`, { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => r.json()) as any;

    // Fetch profile via API key.
    const keyMe = await app
      .handle(new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": key } }))
      .then((r) => r.json()) as any;

    expect(keyMe.id).toBe(jwtMe.id);
    expect(keyMe.role).toBe(jwtMe.role);
  });

  it("old key no longer works after regeneration", async () => {
    const { token } = await registerAndLogin(`revoke_${Date.now()}`);

    const first = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key: oldKey } = await first.json() as any;

    // Regenerate — old key is now invalidated.
    await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    const res = await app.handle(
      new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": oldKey } }),
    );
    expect(res.status).toBe(401);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("API key rate limiting (60 req/min)", () => {
  it("allows 60 requests then returns 429", async () => {
    const { token } = await registerAndLogin(`rl_${Date.now()}`);
    const genRes = await app.handle(
      new Request(`${BASE}/api/profile/api-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const { key } = await genRes.json() as any;

    // Make 60 successful requests.
    for (let i = 0; i < 60; i++) {
      const res = await app.handle(
        new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": key } }),
      );
      expect(res.status).toBe(200);
    }

    // The 61st request must be rate-limited.
    const limited = await app.handle(
      new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": key } }),
    );
    expect(limited.status).toBe(429);
    const body = await limited.json() as any;
    expect(body.error).toMatch(/rate limit/i);
  });

  it("rate limit is per-key: different keys have independent counters", async () => {
    const { token: t1 } = await registerAndLogin(`rl_a_${Date.now()}`);
    const { token: t2 } = await registerAndLogin(`rl_b_${Date.now()}`);

    const k1 = ((await (await app.handle(new Request(`${BASE}/api/profile/api-key`, {
      method: "POST", headers: { Authorization: `Bearer ${t1}` },
    }))).json()) as any).key;
    const k2 = ((await (await app.handle(new Request(`${BASE}/api/profile/api-key`, {
      method: "POST", headers: { Authorization: `Bearer ${t2}` },
    }))).json()) as any).key;

    // Exhaust key1's limit.
    for (let i = 0; i < 60; i++) {
      await app.handle(new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": k1 } }));
    }
    const k1Limited = await app.handle(
      new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": k1 } }),
    );
    expect(k1Limited.status).toBe(429);

    // key2 must still be allowed.
    const k2Allowed = await app.handle(
      new Request(`${BASE}/api/profile/me`, { headers: { "X-API-Key": k2 } }),
    );
    expect(k2Allowed.status).toBe(200);
  });
});
