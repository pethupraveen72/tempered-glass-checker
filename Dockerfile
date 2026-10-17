
# ---------------------------------------------------
# 1. Build Stage
# ---------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the frontend (Vite -> dist)
RUN npm run build

# ---------------------------------------------------
# 2. Production Stage
# ---------------------------------------------------
FROM node:22-alpine
WORKDIR /app

# Copy dependencies and built assets from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/api ./api
COPY --from=builder /app/public/phones.json ./public/phones.json
COPY --from=builder /app/public/fallback_index.json ./public/fallback_index.json

# server.js listens on process.env.PORT and falls back to 3000, so Cloud Run's
# injected PORT is honoured without further configuration.
EXPOSE 3000

# Start command
CMD ["node", "server.js"]
