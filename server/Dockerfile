FROM oven/bun:1.3.9

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile

COPY . .

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4001

EXPOSE 4001

CMD ["/app/docker-entrypoint.sh"]
