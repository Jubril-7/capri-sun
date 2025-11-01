# ---- Build ----
FROM node:20-alpine AS builder
WORKDIR /app

# pnpm (fast, disk-efficient)
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build || echo "no build script"

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app

# Install only runtime deps + ffmpeg (for media)
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json ./

# Volume for auth files
VOLUME /data

ENV NODE_ENV=production \
    PORT=3000 \
    AUTH_DIR=/data

EXPOSE 3000
CMD ["node", "src/index.js"]