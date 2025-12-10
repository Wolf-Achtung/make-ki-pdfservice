# make-ki-pdfservice (Gold-Standard+)

Render-only PDF microservice for the KI-Status-Report.

## Endpoints
- `POST /generate-pdf` – JSON `{ html, filename?, maxBytes? }` → PDF (bytes) or JSON `{pdf_base64}`
- `POST /render-pdf` – compatibility alias to `/generate-pdf`
- `GET /health` · `GET /health/html`
- `GET /metrics` (Prometheus)

## Important ENV

### HTML Payload Limits
- `PDF_MAX_HTML_KB=1024` – Max incoming HTML size in KB (default: 1024 = 1 MB)
- `PDF_MAX_HTML_BYTES` – Alternative: set bytes directly (takes precedence)
- `PDF_SLIM_MODE=0` – Enable soft-landing (0=hard fail, 1=apply slim-mode)

### PDF Output Limits
- `PDF_MAX_BYTES_DEFAULT=20971520` (20 MB)
- `PDF_MAX_BYTES_CAP=33554432` (32 MB absolute cap)

### Rendering & Sanitizing
- `PUPPETEER_HEADLESS=new`
- `PDF_RENDER_TIMEOUT=60` – Render timeout in seconds
- `PDF_MEMORY_LIMIT=1024` – Memory limit in MB (informational)
- `PDF_STRIP_SCRIPTS=1` · `PDF_STRIP_PAGE_AT_RULES=1`
- `PDF_MINIFY_HTML=1`

### PDF Optimization
- `PDF_SCALE=0.94` – Scale factor (0.94 = smaller files)
- `PDF_PRINT_BACKGROUND=0` – Background printing (0=off for smaller files)

### Body Limits
- `HTML_LIMIT=20mb` · `JSON_LIMIT=20mb`

## Response Headers
- `X-PDF-Bytes` – Size of generated PDF
- `X-PDF-Limit` – Applied PDF size limit
- `X-HTML-Original-KB` – Original HTML payload size
- `X-HTML-Slimmed` – Present if slim-mode was applied
- `X-HTML-Slimmed-KB` – Size after slim-mode

## Error Responses

### 413 - Payload Too Large
Two possible reasons:
- `html_payload_too_large` – Incoming HTML exceeds `PDF_MAX_HTML_KB`
- `pdf_too_large` – Generated PDF exceeds size limit

### 503 - Service Busy
- Queue full or timeout waiting for browser context

## Build
Dockerfile supports both `npm ci` (if lockfile present) and `npm install` fallback.
