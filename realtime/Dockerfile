# Dockerfile layanan realtime Quis.
# Build context = root repo (lihat docker-compose.yaml) karena layanan ini
# mengimpor kode bersama dari ../shared dan ../db/schema.

# ---------- build: bundle source lokal dengan esbuild ----------
FROM node:20-alpine AS build
WORKDIR /app

# Pasang dependensi realtime lebih dulu (cache layer).
COPY realtime/package.json realtime/package-lock.json* ./realtime/
RUN cd realtime && npm install --no-audit --no-fund

# Salin source yang dibutuhkan, pertahankan layout repo agar impor relatif
# (../../db, ../shared) tetap valid saat esbuild membundel.
COPY shared ./shared
COPY db/schema ./db/schema
COPY realtime/tsconfig.json ./realtime/
COPY realtime/src ./realtime/src

RUN cd realtime && npm run build

# ---------- runtime: hanya dependensi produksi + bundle ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# HTTP + Socket.IO. Wajib bind 0.0.0.0 agar dapat di-proxy Nginx.
ENV REALTIME_PORT=4000

COPY realtime/package.json realtime/package-lock.json* ./realtime/
RUN cd realtime && npm install --omit=dev --no-audit --no-fund

COPY --from=build --chown=node:node /app/realtime/dist ./realtime/dist

# Jalankan sebagai user non-root bawaan image node.
USER node
WORKDIR /app/realtime
EXPOSE 4000

# Health check memakai endpoint /health (json ok/rooms) — logging terstruktur
# ada di logger.ts (JSON baris-tunggal ke stdout/stderr).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${REALTIME_PORT}/health >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.mjs"]
