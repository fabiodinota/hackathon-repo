FROM oven/bun:1.4.2 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.2-slim AS runtime
WORKDIR /app
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json kbc-services.json ./
COPY --chown=bun:bun src ./src
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD bun -e 'const r = await fetch("http://127.0.0.1:3000/health"); process.exit(r.ok ? 0 : 1)'
CMD ["bun", "run", "src/server.ts"]
