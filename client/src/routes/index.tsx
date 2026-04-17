import { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, type Market, type PaginationMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { PaginationControls } from "@/components/PaginationControls";
import { SortDropdown } from "@/components/SortDropdown";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

const ITEMS_PER_PAGE = 20;

function DashboardPage() {
  const { isAuthenticated, user, updateBalance } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"createdAt" | "totalBets" | "participantCount">("createdAt");
  const [status, setStatus] = useState<"active" | "resolved">("active");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync balance from server on mount so the header always shows the live value,
  // not a potentially stale value from localStorage (e.g. after receiving a payout
  // while the user was on a different page or in another tab).
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getMe().then((me) => updateBalance(me.balance)).catch(() => {});
  }, [isAuthenticated]);

  const fetchMarkets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listMarketsPaginated(page, ITEMS_PER_PAGE, sortBy, status);
      setMarkets(data.markets);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load markets");
    } finally {
      setIsLoading(false);
    }
  }, [page, sortBy, status]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const handleStatusChange = (next: "active" | "resolved") => {
    setStatus(next);
    setPage(1);
  };

  const handleSortChange = (next: "createdAt" | "totalBets" | "participantCount") => {
    setSortBy(next);
    setPage(1);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-gray-900">Prediction Markets</h1>
          <p className="text-gray-600 mb-8 text-lg">Create and participate in prediction markets</p>
          <div className="space-x-4">
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/register" })}>
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Markets</h1>
            <p className="text-gray-600 mt-2">
              Welcome back, {user?.username}!
              {user?.balance !== undefined && (
                <span className="ml-3 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                  Balance: ${user.balance.toFixed(2)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate({ to: "/leaderboard" })}>
              Leaderboard
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/profile" })}>
              My Profile
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/logout" })}>
              Logout
            </Button>
            <Button onClick={() => navigate({ to: "/markets/new" })}>Create Market</Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {/* Status filter */}
          <div className="flex gap-2">
            <Button
              variant={status === "active" ? "default" : "outline"}
              onClick={() => handleStatusChange("active")}
            >
              Active Markets
            </Button>
            <Button
              variant={status === "resolved" ? "default" : "outline"}
              onClick={() => handleStatusChange("resolved")}
            >
              Resolved Markets
            </Button>
            <Button variant="outline" onClick={fetchMarkets} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {/* Sort dropdown */}
          <SortDropdown value={sortBy} onChange={handleSortChange} />
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Markets grid */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading markets...</p>
            </CardContent>
          </Card>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground text-lg">
                No {status} markets found.{status === "active" && " Create one to get started!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && !isLoading && (
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            hasNextPage={pagination.hasNextPage}
            totalCount={pagination.totalCount}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
