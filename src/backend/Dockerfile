# ============================================================
# Dockerfile — Backend NestJS (multi-stage)
# ============================================================

# ---- Stage 1: Install dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
# `--ignore-scripts` evita los postinstall (rápido y seguro), pero también deja
# a bcrypt sin su binding nativo -> MODULE_NOT_FOUND al arrancar. Se compila
# explícitamente con un toolchain temporal de Alpine, que se borra después para
# no engordar la imagen.
RUN npm ci --only=production --ignore-scripts && \
    cp -R node_modules /tmp/node_modules-prod && \
    npm ci --ignore-scripts && \
    apk add --no-cache --virtual .build-deps python3 make g++ gcc && \
    npm rebuild bcrypt --build-from-source && \
    apk del .build-deps

# ---- Stage 2: Prisma generate ----
FROM node:20-alpine AS prisma
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
RUN npx prisma generate

# ---- Stage 3: Build ----
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json package.json ./
COPY src ./src
RUN npm run build

# ---- Stage 4: Production image ----
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy production deps
COPY --from=deps /tmp/node_modules-prod ./node_modules
# Copy Prisma generated client
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
# Copy prisma schema & migrations (needed for migrate deploy)
COPY --from=prisma /app/prisma ./prisma
# Copy compiled output
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]
