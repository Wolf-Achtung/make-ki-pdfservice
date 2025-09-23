# Dockerfile — PDF Service (Variant A: simple, no apt-get)
# - Uses pinned Puppeteer image (no :latest surprises)
# - Installs production dependencies
# - Copies source and starts index.js
# - Headless Chromium is included in the base image

FROM ghcr.io/puppeteer/puppeteer:23.6.1

WORKDIR /usr/src/app

# Install production deps (honor package-lock.json if present)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Runtime environment
ENV NODE_ENV=production     PUPPETEER_SKIP_DOWNLOAD=true     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium     XDG_RUNTIME_DIR=/tmp     PUPPETEER_DISABLE_HEADLESS_WARNING=true

EXPOSE 8080
CMD ["node","index.js"]
