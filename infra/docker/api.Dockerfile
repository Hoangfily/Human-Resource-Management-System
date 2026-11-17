# Build context is the repo root (docker-compose.yml: context: .).
# The root package-lock.json is the only up-to-date lockfile (npm workspaces);
# apps/api/package-lock.json is stale and not used here.

# ---- build: dev dependencies, Prisma client, TypeScript -> dist ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @hr-agent/api
COPY apps/api/ apps/api/
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build -w @hr-agent/api

# ---- runtime: production dependencies and compiled code only ----
FROM node:22-alpine
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @hr-agent/api --omit=dev && npm cache clean --force
# The generated Prisma client replaces the stub that @prisma/client installs
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
# Apply pending migrations (creates the tables on an empty database), then start.
# A database made by `prisma db push` has no migration history: baseline it once with `npm run db:baseline`.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && exec node dist/main.js"]
