import { randomBytes, createHash } from "crypto";
import { usersTable } from "../db/schema";
import db from "../db";
import { eq } from "drizzle-orm";

export interface AuthTokenPayload {
  userId: number;
}

/**
 * Hash a password using Bun's built-in crypto
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<typeof usersTable.$inferSelect | null> {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  return user ?? null;
}

/**
 * Generate a cryptographically random API key with a recognisable prefix.
 * Format: pmk_<43-char base64url string>  (~256 bits of entropy)
 */
export function generateApiKey(): string {
  return "pmk_" + randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hash of an API key (hex-encoded).
 * Keys have sufficient entropy so no salt is required.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Look up a user by the SHA-256 hash of their API key.
 */
export async function getUserByApiKeyHash(
  keyHash: string,
): Promise<typeof usersTable.$inferSelect | null> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.apiKeyHash, keyHash),
  });
  return user ?? null;
}
