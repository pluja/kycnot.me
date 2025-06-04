FROM node:lts AS runtime
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
RUN npm run build -- --mode ${ASTRO_BUILD_MODE}

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

# Add knm-migrate command script and make it executable
COPY web/migrate.sh /usr/local/bin/knm-migrate
RUN chmod +x /usr/local/bin/knm-migrate

CMD ["node", "./dist/server/entry.mjs"]
