# Dockerfile — PDF Service (Variant A, corrected: no apt-get, no hardcoded exec path)
# - Pinned Puppeteer image (stable headless Chromium included)
# - Production deps install (respects package-lock.json)
# - Copies source and starts index.js

FROM ghcr.io/puppeteer/puppeteer:23.6.1

WORKDIR /usr/src/app

# Install production deps
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Runtime environment
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    XDG_RUNTIME_DIR=/tmp \
    PUPPETEER_DISABLE_HEADLESS_WARNING=true

EXPOSE 8080
CMD ["node","index.js"]
