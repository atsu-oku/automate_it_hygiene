# Multi-stage build for ESET Manager
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S esetmanager && \
    adduser -S esetmanager -u 1001

# Create directories for logs and config
RUN mkdir -p /var/log/eset-manager /etc/eset-manager && \
    chown -R esetmanager:esetmanager /var/log/eset-manager /etc/eset-manager

# Switch to non-root user
USER esetmanager

# Environment variables
ENV NODE_ENV=production \
    CONFIG_PATH=/etc/eset-manager/config.json \
    LOG_PATH=/var/log/eset-manager

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Default command (can be overridden)
CMD ["node", "dist/features/eset-cli.js", "health", "check", "--config", "/etc/eset-manager/config.json"]
