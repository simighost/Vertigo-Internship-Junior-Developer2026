FROM oven/bun:1.3.9

WORKDIR /app

# Build context is repo root — copy server files explicitly
COPY server/package.json server/bun.lock server/bunfig.toml server/tsconfig.json ./
RUN bun install --frozen-lockfile

COPY server/ .

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4001

EXPOSE 4001

CMD ["/app/docker-entrypoint.sh"]
