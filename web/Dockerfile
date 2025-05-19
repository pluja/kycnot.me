FROM node:lts AS runtime
WORKDIR /app

COPY package.json package-lock.json ./

COPY .npmrc .npmrc

RUN npm ci

COPY . .

ARG ASTRO_BUILD_MODE=production
# Generate Prisma client
RUN npx prisma generate
# Build the application
RUN npm run build -- --mode ${ASTRO_BUILD_MODE}

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

# Add entrypoint script and make it executable
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
