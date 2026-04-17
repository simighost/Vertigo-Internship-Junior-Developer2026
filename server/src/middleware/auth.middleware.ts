import { Elysia } from "elysia";
import { getUserById, getUserByApiKeyHash, hashApiKey } from "../lib/auth";
import { allowRequest } from "../lib/rate-limit";
import type { usersTable } from "../db/schema";

type AuthContext = {
  user: typeof usersTable.$inferSelect | null;
  rateLimited: boolean;
};

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }: any): Promise<AuthContext> => {
    // ── API key path ────────────────────────────────────────────────────────
    // Clients supply their key via the X-API-Key header.
    const apiKey = (headers as Record<string, string | undefined>)["x-api-key"];
    if (apiKey) {
      const keyHash = hashApiKey(apiKey);

      // Enforce 60 req/min per key. Reject before DB lookup to minimise load.
      if (!allowRequest(keyHash)) {
        return { user: null, rateLimited: true };
      }

      const user = await getUserByApiKeyHash(keyHash);
      return { user, rateLimited: false };
    }

    // ── JWT / session path (unchanged behaviour) ───────────────────────────
    const authHeader = (headers as Record<string, string | undefined>)["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { user: null, rateLimited: false };
    }

    const token = authHeader.substring(7);
    const payload = await jwt.verify(token);
    if (!payload) {
      return { user: null, rateLimited: false };
    }

    const user = await getUserById(payload.userId);
    return { user, rateLimited: false };
  })
  .as("global");
