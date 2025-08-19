FROM ghcr.io/puppeteer/puppeteer:latest
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev   # <- statt "npm ci"

COPY . .
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 8080
CMD ["node","index.js"]


