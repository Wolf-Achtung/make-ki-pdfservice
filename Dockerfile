# File: Dockerfile
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY index.js ./

ENV NODE_ENV=production
ENV PUPPETEER_HEADLESS=new
ENV BROWSER_POOL_SIZE=4
ENV RENDER_TIMEOUT_MS=45000

# Neue Defaults (können per Railway ENV überschrieben werden)
ENV JSON_LIMIT=20mb
ENV HTML_LIMIT=20mb
ENV PDF_MAX_BYTES_DEFAULT=10485760   # 10 MB
ENV PDF_MAX_BYTES_CAP=26214400       # 25 MB
ENV RETURN_JSON_BASE64=0
ENV PDF_MINIFY_HTML=1
ENV PDF_STRIP_SCRIPTS=1
ENV PDF_STRIP_PAGE_AT_RULES=1

EXPOSE 3000
CMD ["node","index.js"]
