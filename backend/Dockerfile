# ── Backend Dockerfile (Production) ──────────────────────────────
# Multi-stage build for a lean production image

# Stage 1: Install dependencies
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Don't run as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dependencies and application code
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove test files that shouldn't be in production
RUN rm -f test_*.js .env.example

USER appuser

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "server.js"]
