import { usersTable } from "../db/schema";

type User = typeof usersTable.$inferSelect;

/**
 * Centralized admin authorization guard.
 * Use inside Elysia .guard({ beforeHandle: requireAdmin }) blocks.
 * Returns a response object on failure (which Elysia treats as an early return),
 * or undefined on success (which lets the handler proceed).
 */
export function requireAdmin({
  user,
  set,
}: {
  user: User | null;
  set: { status: number };
}) {
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" };
  }
  if (user.role !== "admin") {
    set.status = 403;
    return { error: "Forbidden: admin access required" };
  }
}
