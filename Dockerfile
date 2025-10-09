# filename: Dockerfile
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY index.js ./

ENV NODE_ENV=production
ENV PUPPETEER_HEADLESS=new
ENV BROWSER_POOL_SIZE=6
ENV RENDER_TIMEOUT_MS=60000

# Body limits
ENV JSON_LIMIT=20mb
ENV HTML_LIMIT=20mb

# PDF size defaults
ENV PDF_MAX_BYTES_DEFAULT=10485760
ENV PDF_MAX_BYTES_CAP=33554432

# Response behaviour
ENV ALWAYS_PDF=1
ENV RETURN_JSON_BASE64=0

# Sanitizing / Minify
ENV PDF_MINIFY_HTML=1
ENV PDF_STRIP_SCRIPTS=1
ENV PDF_STRIP_PAGE_AT_RULES=1

# Queue
ENV QUEUE_MAX=24
ENV QUEUE_WAIT_MS=25000

EXPOSE 3000
CMD ["node","index.js"]
