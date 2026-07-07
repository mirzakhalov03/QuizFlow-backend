# syntax=docker/dockerfile:1
#
# Production image for the QuizFlow backend.
#
# One image serves BOTH processes — the Express API and the SQS feedback
# worker — differing only by the command they run (see docker-compose.prod.yml).
#
# Multi-stage:
#   1. builder  — full deps + `tsc` to produce dist/.
#   2. runtime  — prod deps only, Chromium + its OS libraries baked in for
#                 Puppeteer PDF export, running as a non-root user.
#
# Baking Chromium into the image is the whole point: the host box no longer
# needs any Chromium libraries installed, so PDF export can't break on a fresh
# or re-imaged EC2 host the way it did under the pm2 deploy.

# ---- builder ----
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Install deps first (cached until package files change), then build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chromium runtime libraries for Puppeteer (PDF export). This is the Debian
# equivalent of the yum/dnf list we used to install on the EC2 box — it now
# lives in the image instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation wget \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 \
      libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 \
      libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Download the Chromium build that matches this Puppeteer version into an
# in-image cache. PUPPETEER_CACHE_DIR is read again at runtime by
# puppeteer.launch(), so the browser is always present — no post-deploy step.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npx puppeteer browsers install chrome

# Compiled application (tsc emits to dist/src/** because rootDir is ".").
COPY --from=builder /app/dist ./dist

# Drop root. Chromium is already launched with --no-sandbox in the app, so it
# runs fine unprivileged; the `node` user ships with the base image.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Default command runs the API. The worker service overrides this in compose.
CMD ["node", "dist/src/server.js"]
