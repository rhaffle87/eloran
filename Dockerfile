# syntax=docker/dockerfile:1.4

# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies deterministically
COPY package.json package-lock.json ./
RUN npm ci

# Copy full repository source
COPY . .

# Build static production distribution
ENV NODE_ENV=production
RUN npm run build

# ==========================================
# Stage 2: Hardened Nginx Production Runtime
# ==========================================
FROM nginx:1.27-alpine AS runner

# Label metadata for OCI image compliance
LABEL org.opencontainers.image.title="SIMULORAN" \
      org.opencontainers.image.description="Professional LF Radio Navigation & eLoran Simulation Suite" \
      org.opencontainers.image.vendor="SIMULORAN" \
      org.opencontainers.image.licenses="MIT"

# Copy hardened nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Healthcheck probe to monitor container availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

# Start nginx daemon in foreground
CMD ["nginx", "-g", "daemon off;"]
