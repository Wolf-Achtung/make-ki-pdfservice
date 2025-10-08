# File: Dockerfile
# Base with Chromium
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app

# Install deps (lockfile optional: fallback to npm install)
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# App code
COPY index.js ./

ENV NODE_ENV=production
ENV PUPPETEER_HEADLESS=new
ENV BROWSER_POOL_SIZE=4
ENV RENDER_TIMEOUT_MS=45000

EXPOSE 3000
CMD ["node","index.js"]
