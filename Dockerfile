# Dockerfile — Full PDF Service (optimized + pinned)
FROM ghcr.io/puppeteer/puppeteer:23.6.1

WORKDIR /usr/src/app

# Install only production deps (respect package-lock.json if present)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Optional: fonts for better glyph coverage (incl. emoji & CJK)
RUN apt-get update && apt-get install -y     fonts-noto fonts-noto-cjk fonts-noto-color-emoji     --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copy source
COPY . .

# Runtime env
ENV NODE_ENV=production     XDG_RUNTIME_DIR=/tmp     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium     PUPPETEER_SKIP_DOWNLOAD=true     PUPPETEER_DISABLE_HEADLESS_WARNING=true

EXPOSE 8080
CMD ["node", "index.js"]
