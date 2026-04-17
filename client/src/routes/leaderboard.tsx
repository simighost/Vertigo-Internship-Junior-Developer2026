import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api, type LeaderboardEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function LeaderboardPage() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getLeaderboard();
        setLeaderboard(data.leaderboard);
      } catch {
        setError("Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Leaderboard</h1>
            <p className="text-gray-600 mt-1">Top earners by total winnings</p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            ← Markets
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading leaderboard...</p>
            </CardContent>
          </Card>
        ) : leaderboard.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                No winnings yet. Resolve a market to populate the leaderboard.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground">
                {leaderboard.length} winner{leaderboard.length !== 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.rank}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank badge */}
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          entry.rank === 1
                            ? "bg-yellow-100 text-yellow-700"
                            : entry.rank === 2
                              ? "bg-gray-100 text-gray-600"
                              : entry.rank === 3
                                ? "bg-orange-100 text-orange-700"
                                : "bg-secondary/30 text-muted-foreground"
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <span className="font-medium text-gray-900">{entry.username}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-green-700 border-green-300 bg-green-50 font-semibold text-sm"
                    >
                      ${entry.totalWinnings.toFixed(2)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
