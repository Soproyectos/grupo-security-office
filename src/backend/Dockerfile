# ============================================================
# Dockerfile - NestJS backend (2 stages)
# ============================================================
# Runtime keeps the full node_modules on purpose: the Prisma CLI is needed to
# run `prisma migrate deploy` from this image on every deploy.

# ---- Stage 1: install dependencies and build ----
FROM node:20-alpine AS build
WORKDIR /app

# Toolchain for native modules (bcrypt) when no prebuilt binary matches.
RUN apk add --no-cache openssl python3 make g++
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# The uploads directory is a mounted volume; it must be writable by nestjs.
RUN apk add --no-cache openssl && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nestjs && \
    mkdir -p /app/uploads && \
    chown nestjs:nodejs /app/uploads

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/src/main.js"]
