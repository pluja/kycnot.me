# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:lts AS build
WORKDIR /app

COPY .env .env
COPY web/package.json web/package-lock.json ./
COPY web/.npmrc .npmrc

RUN npm ci

COPY web/ .

ARG ASTRO_BUILD_MODE=production

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build:astro -- --mode ${ASTRO_BUILD_MODE} && npm run build:server-init

RUN npm prune --omit=dev && \
    rm -rf node_modules/@img/sharp-libvips-linuxmusl-x64 \
           node_modules/@img/sharp-linuxmusl-x64 \
           node_modules/lightningcss-linux-x64-musl

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:lts-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libvips42 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

COPY web/migrate.sh /usr/local/bin/knm-migrate
RUN chmod +x /usr/local/bin/knm-migrate

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["sh", "-c", "node ./dist/server/server-init.js & node ./dist/server/entry.mjs"]
