import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";
import { handleCreateMarket, handleListMarkets, handleGetMarket, handlePlaceBet, handleResolveMarket } from "./handlers";

export const marketRoutes = new Elysia({ prefix: "/api/markets" })
  .use(authMiddleware)
  .get("/", handleListMarkets, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      sort: t.Optional(t.String()),
      status: t.Optional(t.String()),
    }),
  })
  .get("/:id", handleGetMarket, {
    params: t.Object({
      id: t.Numeric(),
    }),
  })
  .guard(
    {
      beforeHandle({ user, rateLimited, set }: any) {
        if (rateLimited) {
          set.status = 429;
          return { error: "Rate limit exceeded. Maximum 60 requests per minute per API key." };
        }
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .post("/", handleCreateMarket, {
          body: t.Object({
            title: t.String(),
            description: t.Optional(t.String()),
            outcomes: t.Array(t.String()),
          }),
        })
        .post("/:id/bets", handlePlaceBet, {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            outcomeId: t.Number(),
            amount: t.Number(),
          }),
        }),
  )
  // Admin-only: resolve a market by declaring the winning outcome
  .guard(
    { beforeHandle: requireAdmin },
    (app) =>
      app.patch("/:id/resolve", handleResolveMarket, {
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ outcomeId: t.Number() }),
      }),
  );
