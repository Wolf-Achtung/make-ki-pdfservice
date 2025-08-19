FROM ghcr.io/puppeteer/puppeteer:latest
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true

EXPOSE 8080
CMD ["node","index.js"]

