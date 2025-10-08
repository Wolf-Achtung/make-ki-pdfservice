# filename: Dockerfile
# Puppeteer base inkl. Chromium
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app
COPY package.json package-lock.json* ./

# Wenn eine Lockfile vorliegt → reproduzierbar; sonst Fallback auf install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY index.js ./
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000
CMD ["node", "index.js"]

