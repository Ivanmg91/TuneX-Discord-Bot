# ── Stage 1: build native addons ─────────────────────────────────────────────
FROM node:20-alpine AS builder

# Build tools needed for native Node modules (sodium-native)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM node:20-alpine

# ffmpeg is required for audio transcoding via @discordjs/voice
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy only production node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY . .

# Non-root user for security
RUN addgroup -S tunex && adduser -S tunex -G tunex
USER tunex

CMD ["node", "src/index.js"]
