# make-ki-pdfservice (Gold-Standard+)

Render-only PDF microservice for the KI-Status-Report.

## Endpoints
- `POST /generate-pdf` – JSON `{ html, filename?, return_pdf_bytes? }` → PDF (bytes) or JSON `{pdf_base64}`
- `POST /render-pdf` – compatibility alias to `/generate-pdf`
- `GET /health` · `GET /health/html`
- `GET /metrics` (Prometheus)

## Important ENV
- `PUPPETEER_HEADLESS=new` · `BROWSER_POOL_SIZE=4..8`
- `PDF_MAX_BYTES=10485760` · `PDF_STRIP_SCRIPTS=1` · `PDF_STRIP_PAGE_AT_RULES=1`
- `HTML_LIMIT=15mb` · `JSON_LIMIT=15mb`

## Build
Dockerfile supports both `npm ci` (if lockfile present) and `npm install` fallback.
