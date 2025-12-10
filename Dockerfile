# filename: Dockerfile
FROM ghcr.io/puppeteer/puppeteer:22.10.0

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY index.js ./

ENV NODE_ENV=production
ENV PUPPETEER_HEADLESS=new
ENV BROWSER_POOL_SIZE=6

# Timeout (seconds, preferred over legacy RENDER_TIMEOUT_MS)
ENV PDF_RENDER_TIMEOUT=60

# Body limits (express parser)
ENV JSON_LIMIT=20mb
ENV HTML_LIMIT=20mb

# HTML payload limit (incoming HTML before rendering)
ENV PDF_MAX_HTML_KB=1024
ENV PDF_SLIM_MODE=0

# PDF size defaults (output PDF)
ENV PDF_MAX_BYTES_DEFAULT=20971520
ENV PDF_MAX_BYTES_CAP=33554432

# Safety limits
ENV PDF_MEMORY_LIMIT=1024

# PDF optimization
ENV PDF_SCALE=0.94
ENV PDF_PRINT_BACKGROUND=0

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
