# filename: Dockerfile
# Robust base image incl. Chromium
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js ./
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000
CMD ["node", "index.js"]
