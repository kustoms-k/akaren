# Åkaren: one image for the API and the built office/driver client (single port).
# Built on the server by deploy/compose.yaml; see deploy/README.md.

# ── Build: server dependencies (native: better-sqlite3, sharp) and the client bundle ──
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund

COPY client/package.json client/package-lock.json client/
RUN npm --prefix client ci --no-audit --no-fund
COPY client client
RUN npm --prefix client run build

# ── Runtime ──
FROM node:22-bookworm-slim
# tzdata: the nightly jobs (backup, retention, demo reset) run on Stockholm time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    TZ=Europe/Stockholm \
    HOST=0.0.0.0 \
    PORT=3002 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/client/dist

WORKDIR /app
COPY --from=build /app/server/node_modules server/node_modules
COPY server server
COPY --from=build /app/client/dist client/dist
# Never ship a local database, photos or env file, even if .dockerignore is bypassed.
RUN rm -rf server/data server/backups server/.env \
 && mkdir -p /data && chown node:node /data

USER node
WORKDIR /app/server
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "index.js"]
