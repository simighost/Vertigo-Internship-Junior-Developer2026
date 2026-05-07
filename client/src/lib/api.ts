const rawApiUrl = import.meta.env.VITE_API_URL || "localhost:4001";
const cleanHost = rawApiUrl.replace(/^(https?:)?\/+/, "");
const API_BASE_URL = cleanHost.startsWith("localhost") ? `http://${cleanHost}` : `https://${cleanHost}`;

// Types
export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved";
  creator?: string;
  createdAt?: string;
  outcomes: MarketOutcome[];
  totalMarketBets: number;
  participantCount?: number;
}

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface PaginatedMarketsResponse {
  markets: Market[];
  pagination: PaginationMeta;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  balance: number;
  token: string;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  newBalance: number;
  createdAt?: string;
}

export interface ActiveBet {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  currentOdds: number;
  createdAt: string;
}

export interface ResolvedBet {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  result: "win" | "loss";
  createdAt: string;
}

export interface PaginatedBetsResponse<T> {
  bets: T[];
  pagination: PaginationMeta;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  totalWinnings: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader() {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // If there are validation errors, throw them
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessage = data.errors.map((e: any) => `${e.field}: ${e.message}`).join(", ");
        throw new Error(errorMessage);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data ?? {};
  }

  // Auth endpoints
  async register(username: string, email: string, password: string): Promise<User> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // Markets endpoints
  async listMarkets(status: "active" | "resolved" = "active"): Promise<Market[]> {
    return this.request(`/api/markets?status=${status}`);
  }

  async listMarketsPaginated(
    page: number,
    limit: number,
    sort: string,
    status: string,
  ): Promise<PaginatedMarketsResponse> {
    return this.request(
      `/api/markets?page=${page}&limit=${limit}&sort=${sort}&status=${status}`,
    );
  }

  async getMarket(id: number): Promise<Market> {
    return this.request(`/api/markets/${id}`);
  }

  async createMarket(title: string, description: string, outcomes: string[]): Promise<Market> {
    return this.request("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  // Bets endpoints
  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  // Profile endpoints
  async getMe(): Promise<Pick<User, "id" | "username" | "email" | "role" | "balance"> & { hasApiKey: boolean }> {
    return this.request("/api/profile/me");
  }

  async generateApiKey(): Promise<{ key: string; message: string }> {
    return this.request("/api/profile/api-key", { method: "POST" });
  }

  async getLeaderboard(): Promise<LeaderboardResponse> {
    return this.request("/api/leaderboard");
  }

  async resolveMarket(marketId: number, outcomeId: number): Promise<{ success: boolean; marketId: number; resolvedOutcomeId: number }> {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async getActiveBets(page: number = 1): Promise<PaginatedBetsResponse<ActiveBet>> {
    return this.request(`/api/profile/bets/active?page=${page}`);
  }

  async getResolvedBets(page: number = 1): Promise<PaginatedBetsResponse<ResolvedBet>> {
    return this.request(`/api/profile/bets/resolved?page=${page}`);
  }
}

export const api = new ApiClient(API_BASE_URL);
