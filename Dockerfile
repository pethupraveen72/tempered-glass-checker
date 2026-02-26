
# ---------------------------------------------------
# 1. Build Stage
# ---------------------------------------------------
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (Vite -> dist)
RUN npm run build

# ---------------------------------------------------
# 2. Production Stage
# ---------------------------------------------------
FROM node:18-alpine
WORKDIR /app

# Copy dependencies and built assets from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public/phones.json ./public/phones.json

# Expose port (Cloud Run defaults to 8080, but we can config)
# We configured server.js to listen on 3000, but Cloud Run expects PORT env var usually.
# Let's adjust server.js to use process.env.PORT, but for now hardcoded 3000 is fine if we tell Cloud Run.
EXPOSE 3000

# Start command
CMD ["node", "server.js"]
