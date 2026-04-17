/**
 * Simple in-memory sliding-window rate limiter for API key requests.
 *
 * Limit : RATE_LIMIT requests per WINDOW_MS (default 60 req / 60 s).
 * Keyed : by the SHA-256 hash of the API key so the limiter never sees
 *          the raw key value.
 * Cleanup: stale windows are pruned every 5 minutes to bound memory usage.
 *          The timer is unref'd so it never blocks process exit in tests.
 */

const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

interface RateWindow {
  count: number;
  resetAt: number;
}

const windows = new Map<string, RateWindow>();

const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, win] of windows) {
    if (now > win.resetAt) windows.delete(key);
  }
}, 5 * 60_000);

// Prevent the timer from blocking process exit (works in Bun and Node).
if (pruneTimer.unref) pruneTimer.unref();

/**
 * Returns `true` if the request is within rate limits and increments the
 * counter. Returns `false` if the limit has been reached; the counter is
 * NOT incremented when the request is rejected.
 */
export function allowRequest(identifier: string): boolean {
  const now = Date.now();
  const win = windows.get(identifier);

  if (!win || now > win.resetAt) {
    windows.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (win.count >= RATE_LIMIT) return false;
  win.count++;
  return true;
}

/** Exposed for tests — resets all windows. */
export function resetAll(): void {
  windows.clear();
}
