import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const POLL_INTERVAL_MS = 10_000;

// Colors for the stacked distribution bar (cycles for >6 outcomes)
const OUTCOME_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function DistributionBar({ outcomes }: { outcomes: Market["outcomes"] }) {
  const total = outcomes.reduce((sum, o) => sum + o.odds, 0);
  // When no bets yet, show equal segments as placeholder
  const segments =
    total === 0
      ? outcomes.map((o) => ({ ...o, width: 100 / outcomes.length }))
      : outcomes.map((o) => ({ ...o, width: o.odds }));

  return (
    <div>
      <div className="flex h-7 rounded-lg overflow-hidden gap-px">
        {segments.map((outcome, i) => (
          <div
            key={outcome.id}
            className={`h-full transition-all duration-500 ${OUTCOME_COLORS[i % OUTCOME_COLORS.length]}`}
            style={{ width: `${outcome.width}%` }}
            title={`${outcome.title}: ${outcome.odds}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {outcomes.map((outcome, i) => (
          <div key={outcome.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${OUTCOME_COLORS[i % OUTCOME_COLORS.length]}`}
            />
            {outcome.title}: {outcome.odds}%
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, user, updateBalance } = useAuth();
  const isAdmin = user?.role === "admin";

  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [betError, setBetError] = useState<string | null>(null);
  const [isBetting, setIsBetting] = useState(false);

  // Admin resolve state
  const [resolveOutcomeId, setResolveOutcomeId] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const marketId = parseInt(id, 10);

  // Initial load — shows loading indicator and auto-selects first outcome
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getMarket(marketId);
        if (mounted) {
          setMarket(data);
          if (data.outcomes.length > 0) {
            setSelectedOutcomeId(data.outcomes[0].id);
            setResolveOutcomeId(data.outcomes[0].id);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load market details");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, [marketId]);

  // Background odds refresh — silent, only while market is active
  const refreshOdds = useCallback(async () => {
    try {
      const data = await api.getMarket(marketId);
      setMarket(data);
    } catch {
      // silent — don't interrupt the user on background poll failure
    }
  }, [marketId]);

  useEffect(() => {
    if (!market || market.status !== "active") return;
    const interval = setInterval(refreshOdds, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [market?.status, refreshOdds]);

  const handleResolveMarket = async () => {
    if (!resolveOutcomeId) return;
    setIsResolving(true);
    setResolveError(null);
    try {
      await api.resolveMarket(marketId, resolveOutcomeId);
      // Refresh market to reflect resolved state
      const updated = await api.getMarket(marketId);
      setMarket(updated);
      // Refresh balance — the current user may have won a payout.
      const me = await api.getMe();
      updateBalance(me.balance);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setIsResolving(false);
    }
  };

  const handlePlaceBet = async () => {
    setBetError(null);

    if (!selectedOutcomeId) {
      setBetError("Please select an outcome");
      return;
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      setBetError("Bet amount must be a positive number");
      return;
    }

    try {
      setIsBetting(true);
      const result = await api.placeBet(marketId, selectedOutcomeId, amount);
      // Update balance immediately from the response — no extra round-trip needed.
      updateBalance(result.newBalance);
      setBetAmount("");
      // Immediately refresh odds after bet is placed
      const updated = await api.getMarket(marketId);
      setMarket(updated);
    } catch (err) {
      setBetError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">Please log in to view this market</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading market...</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-destructive">{error || "Market not found"}</p>
            <Button onClick={() => navigate({ to: "/" })}>Back to Markets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-4xl">{market.title}</CardTitle>
                {market.description && (
                  <CardDescription className="text-lg mt-2">{market.description}</CardDescription>
                )}
              </div>
              <Badge variant={market.status === "active" ? "default" : "secondary"}>
                {market.status === "active" ? "Active" : "Resolved"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Percentage Distribution Chart */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Bet Distribution
              </h3>
              <DistributionBar outcomes={market.outcomes} />
            </div>

            {/* Outcomes */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Outcomes</h3>
              {market.outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedOutcomeId === outcome.id
                      ? "border-primary bg-primary/5"
                      : "border-secondary bg-secondary/5 hover:border-primary/50"
                  }`}
                  onClick={() => market.status === "active" && setSelectedOutcomeId(outcome.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-semibold">{outcome.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total bets: ${outcome.totalBets.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-primary">{outcome.odds}%</p>
                      <p className="text-xs text-muted-foreground">of pool</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Market Stats */}
            <div className="rounded-lg p-6 border border-primary/20 bg-primary/5">
              <p className="text-sm text-muted-foreground mb-1">Total Market Value</p>
              <p className="text-4xl font-bold text-primary">
                ${market.totalMarketBets.toFixed(2)}
              </p>
              {market.status === "active" && (
                <p className="text-xs text-muted-foreground mt-2">Odds refresh every 10s</p>
              )}
            </div>

            {/* Betting Section */}
            {market.status === "active" && (
              <Card className="bg-secondary/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Place Your Bet</CardTitle>
                    {user?.balance !== undefined && (
                      <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                        Balance: ${user.balance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {betError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                      {betError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Selected Outcome</Label>
                    <div className="p-3 bg-white border border-secondary rounded-md">
                      {market.outcomes.find((o) => o.id === selectedOutcomeId)?.title ||
                        "None selected"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="betAmount">Bet Amount ($)</Label>
                    <Input
                      id="betAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={betAmount}
                      onChange={(e) => {
                        setBetAmount(e.target.value);
                        setBetError(null);
                      }}
                      placeholder="Enter amount"
                      disabled={isBetting}
                    />
                  </div>

                  <Button
                    className="w-full text-lg py-6"
                    onClick={handlePlaceBet}
                    disabled={isBetting || !selectedOutcomeId}
                  >
                    {isBetting ? "Placing bet..." : "Place Bet"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Admin: Resolve Market — only visible to admins on active markets */}
            {isAdmin && market.status === "active" && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-amber-800 text-base">Admin: Resolve Market</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {resolveError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                      {resolveError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="resolveOutcome">Winning Outcome</Label>
                    <select
                      id="resolveOutcome"
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white"
                      value={resolveOutcomeId ?? ""}
                      onChange={(e) => setResolveOutcomeId(Number(e.target.value))}
                      disabled={isResolving}
                    >
                      {market.outcomes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={handleResolveMarket}
                    disabled={isResolving || !resolveOutcomeId}
                  >
                    {isResolving ? "Resolving..." : "Resolve Market"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {market.status === "resolved" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">This market has been resolved.</p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
