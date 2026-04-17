import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, type ActiveBet, type ResolvedBet, type PaginationMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/PaginationControls";

const ITEMS_PER_PAGE = 20;
const POLL_INTERVAL_MS = 10_000;

function ProfilePage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // API key state
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Active bets state
  const [activePage, setActivePage] = useState(1);
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [activePagination, setActivePagination] = useState<PaginationMeta | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Resolved bets state
  const [resolvedPage, setResolvedPage] = useState(1);
  const [resolvedBets, setResolvedBets] = useState<ResolvedBet[]>([]);
  const [resolvedPagination, setResolvedPagination] = useState<PaginationMeta | null>(null);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [resolvedError, setResolvedError] = useState<string | null>(null);

  const fetchActiveBets = useCallback(async () => {
    setActiveLoading(true);
    setActiveError(null);
    try {
      const data = await api.getActiveBets(activePage);
      setActiveBets(data.bets);
      setActivePagination(data.pagination);
    } catch {
      setActiveError("Failed to load active bets");
    } finally {
      setActiveLoading(false);
    }
  }, [activePage]);

  const fetchResolvedBets = useCallback(async () => {
    setResolvedLoading(true);
    setResolvedError(null);
    try {
      const data = await api.getResolvedBets(resolvedPage);
      setResolvedBets(data.bets);
      setResolvedPagination(data.pagination);
    } catch {
      setResolvedError("Failed to load resolved bets");
    } finally {
      setResolvedLoading(false);
    }
  }, [resolvedPage]);

  // Load API key status (does the user have one?) on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getMe().then((me) => setHasApiKey(me.hasApiKey)).catch(() => {});
  }, [isAuthenticated]);

  const handleGenerateApiKey = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setGeneratedKey(null);
    try {
      const result = await api.generateApiKey();
      setGeneratedKey(result.key);
      setHasApiKey(true);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setIsGenerating(false);
    }
  };

  // Fetch active bets on mount/page change and poll for odds updates
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchActiveBets();
    const interval = setInterval(fetchActiveBets, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchActiveBets, isAuthenticated]);

  // Fetch resolved bets on mount/page change
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchResolvedBets();
  }, [fetchResolvedBets, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to view your profile.</p>
          <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">My Profile</h1>
            <p className="text-gray-600 mt-2">{user?.username}</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              ← Markets
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/logout" })}>
              Logout
            </Button>
          </div>
        </div>

        {/* API Access */}
        <section className="mb-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">API Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use an API key to access the prediction market API programmatically.
                Supply the key via the{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">X-API-Key</code>{" "}
                request header.
              </p>

              {generateError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {generateError}
                </div>
              )}

              {generatedKey ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Copy this key now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted rounded px-3 py-2 text-xs font-mono break-all border">
                      {generatedKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(generatedKey)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Regenerating will invalidate this key immediately.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {hasApiKey === null
                      ? "Loading…"
                      : hasApiKey
                        ? "You have an active API key (value hidden)."
                        : "No API key yet."}
                  </span>
                </div>
              )}

              <Button
                variant="outline"
                onClick={handleGenerateApiKey}
                disabled={isGenerating}
              >
                {isGenerating
                  ? "Generating…"
                  : hasApiKey && !generatedKey
                    ? "Regenerate API Key"
                    : "Generate API Key"}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Active Bets */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">Active Bets</h2>
            <span className="text-xs text-muted-foreground">Odds refresh every 10s</span>
          </div>

          {activeError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-4">
              {activeError}
            </div>
          )}

          {activeLoading && activeBets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-10">
                <p className="text-muted-foreground">Loading active bets...</p>
              </CardContent>
            </Card>
          ) : activeBets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-10">
                <p className="text-muted-foreground">No active bets yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeBets.map((bet) => (
                <Card key={bet.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-gray-900">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Outcome:{" "}
                        <span className="font-medium text-gray-700">{bet.outcomeTitle}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <Badge
                        variant="outline"
                        className="text-blue-700 border-blue-300 bg-blue-50"
                      >
                        {bet.currentOdds}%
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">current odds</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activePagination && activeBets.length > 0 && (
            <PaginationControls
              page={activePagination.page}
              totalPages={activePagination.totalPages}
              hasNextPage={activePagination.hasNextPage}
              totalCount={activePagination.totalCount}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setActivePage}
            />
          )}
        </section>

        {/* Resolved Bets */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Resolved Bets</h2>

          {resolvedError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-4">
              {resolvedError}
            </div>
          )}

          {resolvedLoading && resolvedBets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-10">
                <p className="text-muted-foreground">Loading resolved bets...</p>
              </CardContent>
            </Card>
          ) : resolvedBets.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-10">
                <p className="text-muted-foreground">No resolved bets yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {resolvedBets.map((bet) => (
                <Card key={bet.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-gray-900">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Outcome:{" "}
                        <span className="font-medium text-gray-700">{bet.outcomeTitle}</span>
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        bet.result === "win"
                          ? "text-green-700 border-green-300 bg-green-50 shrink-0 ml-4"
                          : "text-red-700 border-red-300 bg-red-50 shrink-0 ml-4"
                      }
                    >
                      {bet.result === "win" ? "Win" : "Loss"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {resolvedPagination && resolvedBets.length > 0 && (
            <PaginationControls
              page={resolvedPagination.page}
              totalPages={resolvedPagination.totalPages}
              hasNextPage={resolvedPagination.hasNextPage}
              totalCount={resolvedPagination.totalCount}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setResolvedPage}
            />
          )}
        </section>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});
