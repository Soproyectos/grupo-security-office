# ============================================================
# Dockerfile — Frontend React + Vite (multi-stage con Nginx)
# ============================================================

# ---- Stage 1: Install dependencies ----
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: Typecheck + Build ----
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json vite.config.ts index.html tailwind.config.js postcss.config.js ./
COPY public ./public
# Match the existing production-mode Vite configuration (public frontend settings only).
COPY .env.production ./.env.production
COPY src ./src

# Typecheck then bundle
RUN npx tsc -b && npx vite build

# ---- Stage 3: Nginx production server ----
FROM nginx:1.27-alpine AS runner

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config (overrides default)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
