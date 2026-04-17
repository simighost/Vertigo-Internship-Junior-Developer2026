import { Elysia } from "elysia";
import { handleGetLeaderboard } from "./handlers";

export const leaderboardRoutes = new Elysia({ prefix: "/api/leaderboard" }).get(
  "/",
  handleGetLeaderboard,
);
