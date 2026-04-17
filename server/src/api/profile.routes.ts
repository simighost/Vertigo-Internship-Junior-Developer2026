import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleGetActiveBets, handleGetResolvedBets, handleGetMe, handleGenerateApiKey } from "./handlers";

export const profileRoutes = new Elysia({ prefix: "/api/profile" })
  .use(authMiddleware)
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
        .get("/me", handleGetMe)
        .post("/api-key", handleGenerateApiKey)
        .get("/bets/active", handleGetActiveBets, {
          query: t.Object({
            page: t.Optional(t.String()),
          }),
        })
        .get("/bets/resolved", handleGetResolvedBets, {
          query: t.Object({
            page: t.Optional(t.String()),
          }),
        }),
  );
