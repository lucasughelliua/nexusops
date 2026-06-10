# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and Prisma schema/config first
# (required for `prisma generate` to run via the postinstall script)
COPY apps/web/package*.json ./
COPY apps/web/prisma ./prisma
COPY apps/web/prisma.config.ts ./

# Install dependencies (also runs `prisma generate`)
RUN npm ci

# Copy source
COPY apps/web .

# Build
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and Prisma schema/config first
# (required for `prisma generate` to run via the postinstall script)
COPY apps/web/package*.json ./
COPY apps/web/prisma ./prisma
COPY apps/web/prisma.config.ts ./

# Install production dependencies only (also runs `prisma generate`)
RUN npm ci --omit=dev

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Expose port
EXPOSE 3000

# Health check (Railway injects a dynamic PORT env var; next start listens on it)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (r) => { if (r.statusCode !== 200) process.exit(1) })"

# Start
CMD ["npm", "start"]
