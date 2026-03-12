# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy only the manifest first so Docker layer caching works well
COPY package.json ./
RUN npm install --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim

# Run as non-root for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copy installed modules and application code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

USER appuser

# Cloud Run injects PORT at runtime (default 8080)
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
