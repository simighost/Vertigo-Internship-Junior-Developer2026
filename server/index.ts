import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes } from "./src/api/auth.routes";
import { marketRoutes } from "./src/api/markets.routes";
import { profileRoutes } from "./src/api/profile.routes";
import { leaderboardRoutes } from "./src/api/leaderboard.routes";
import { jwtPlugin } from "./src/plugins/jwt";

const PORT = Number(process.env.PORT || 4001);
const HOST = process.env.HOST || "0.0.0.0";

export const app = new Elysia()
  .use(
    cors({
      origin: "*",
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    }),
  )
  .use(jwtPlugin)
  .onError(({ code, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request" };
    }
  })
  .use(authRoutes)
  .use(marketRoutes)
  .use(profileRoutes)
  .use(leaderboardRoutes);

if (import.meta.main) {
  app.listen({
    port: PORT,
    hostname: HOST,
  });
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
}
