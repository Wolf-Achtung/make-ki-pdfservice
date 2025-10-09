/* Render-only PDF microservice (Gold-Standard+)
 * - Endpoints: /generate-pdf, /render-pdf (compat), /metrics, /health, /health/html
 * - Puppeteer context pool (configurable), simple fairness queue.
 * - Prometheus metrics, better diagnostics, optional HTML minify.
 */

'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const puppeteer = require('puppeteer');

// -------------------- Config --------------------
const PORT = parseInt(process.env.PORT || '3000', 10);

// Body limits (ENV overrideable)
const HTML_LIMIT = process.env.HTML_LIMIT || '20mb';
const JSON_LIMIT = process.env.JSON_LIMIT || '20mb';

// PDF size policy
const PDF_MAX_DEFAULT = parseInt(process.env.PDF_MAX_BYTES_DEFAULT || String(10 * 1024 * 1024), 10); // 10 MB
const PDF_MAX_CAP      = parseInt(process.env.PDF_MAX_BYTES_CAP      || String(25 * 1024 * 1024), 10); // 25 MB CAP
const MIN_PDF_BYTES    = 1 * 1024 * 1024; // 1 MB lower bound

// Sanitizing
const STRIP_SCRIPTS = (process.env.PDF_STRIP_SCRIPTS || '1').match(/^(1|true|yes)$/i);
const STRIP_PAGE_AT_RULES = (process.env.PDF_STRIP_PAGE_AT_RULES || '1').match(/^(1|true|yes)$/i);
const PDF_MINIFY_HTML = (process.env.PDF_MINIFY_HTML || '1').match(/^(1|true|yes)$/i);

// Response format preference
// Default: prefer application/pdf. Return JSON only when return_pdf_bytes=true or Accept: application/json
const RETURN_JSON_BASE64_DEFAULT = (process.env.RETURN_JSON_BASE64 || '0').match(/^(1|true|yes)$/i);

// Puppeteer headless mode
const HEADLESS_ENV = process.env.PUPPETEER_HEADLESS;
const HEADLESS = (() => {
  if (HEADLESS_ENV == null) return true;
  if (/^(1|true|yes|on|new)$/i.test(HEADLESS_ENV)) return true;
  if (/^(0|false|no|off)$/i.test(HEADLESS_ENV)) return false;
  if (HEADLESS_ENV === 'shell') return 'shell';
  return true;
})();

const BROWSER_POOL_SIZE = Math.max(1, Math.min(8, parseInt(process.env.BROWSER_POOL_SIZE || '4', 10)));
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '45000', 10);

// Very conservative: 1 job per context (simple + stable). If all busy -> 503.
const contexts = [];
const busy = new Set();

// -------------------- Metrics --------------------
client.collectDefaultMetrics();
const httpReqs  = new client.Counter({ name: 'pdf_http_requests_total', help: 'HTTP requests', labelNames: ['route','status'] });
const renderDur = new client.Histogram({ name: 'pdf_render_seconds', help: 'Render duration seconds' });
const poolAvail = new client.Gauge({ name: 'pdf_pool_available', help: 'Browser contexts available' });

function updatePoolGauge() {
  poolAvail.set(contexts.length - busy.size);
}

// -------------------- HTML helpers --------------------
function stripScripts(html) {
  if (!STRIP_SCRIPTS) return html;
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}
function stripAtRules(html) {
  if (!STRIP_PAGE_AT_RULES) return html;
  return html.replace(/@page\s*\{[^}]*\}/gi, '');
}
function minifySoft(html) {
  if (!PDF_MINIFY_HTML || !html) return html;
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/>\s+</g, '><');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}
function sanitize(html) {
  let h = html || '';
  h = stripScripts(h);
  h = stripAtRules(h);
  h = minifySoft(h);
  return h;
}

// -------------------- Browser Pool --------------------
let browser = null;

async function initPool() {
  if (browser) return;
  browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--no-sandbox','--disable-setuid-sandbox','--font-render-hinting=medium','--disable-dev-shm-usage']
  });

  browser.on('disconnected', () => {
    logger.warn('browser disconnected – resetting pool');
    contexts.splice(0, contexts.length);
    busy.clear();
    browser = null;
    updatePoolGauge();
  });

  // Puppeteer ≥ v21.11: createBrowserContext (else: createIncognitoBrowserContext)
  const createCtx = browser.createBrowserContext
    ? () => browser.createBrowserContext()
    : () => browser.createIncognitoBrowserContext();

  for (let i=0; i<BROWSER_POOL_SIZE; i++) {
    // eslint-disable-next-line no-await-in-loop
    const ctx = await createCtx();
    contexts.push(ctx);
  }
  updatePoolGauge();
}

async function acquireContext() {
  for (const ctx of contexts) {
    if (!busy.has(ctx)) {
      busy.add(ctx);
      updatePoolGauge();
      return ctx;
    }
  }
  return null;
}
function releaseContext(ctx) {
  if (busy.has(ctx)) {
    busy.delete(ctx);
    updatePoolGauge();
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function renderToBuffer(html, filename, effectiveMaxBytes) {
  await initPool();
  const ctx = await acquireContext();
  if (!ctx) {
    const err = new Error('PDF service busy – please retry shortly');
    err.status = 503;
    throw err;
  }
  const start = Date.now();
  let page;
  try {
    page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const safeHtml = sanitize(html);
    await page.setContent(safeHtml, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });

    const pdf = await page.pdf({
      printBackground: true,
      format: 'A4',
      displayHeaderFooter: false,
      margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    renderDur.observe((Date.now() - start) / 1000);

    if (pdf.length > effectiveMaxBytes) {
      const err = new Error(`PDF larger than limit (${pdf.length} > ${effectiveMaxBytes})`);
      err.status = 413;
      err.html_bytes = Buffer.byteLength(safeHtml, 'utf8');
      err.pdf_bytes = pdf.length;
      err.limit_bytes = effectiveMaxBytes;
      throw err;
    }
    return pdf;
  } finally {
    if (page) { try { await page.close(); } catch { /* ignore */ } }
    releaseContext(ctx);
  }
}

// -------------------- App --------------------
const app = express();
app.set('x-powered-by', false);
app.use(helmet());
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: HTML_LIMIT }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: parseInt(process.env.RATE_LIMIT_PER_MIN || '120', 10) });
app.use(limiter);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/health', (req, res) => {
  updatePoolGauge();
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    pool: { total: contexts.length, busy: busy.size },
    headless: HEADLESS,
    pdf: { default_max_bytes: PDF_MAX_DEFAULT, cap_bytes: PDF_MAX_CAP },
    limits: { json: JSON_LIMIT, html: HTML_LIMIT },
    host: os.hostname(),
  });
});

app.get('/health/html', (req, res) => {
  updatePoolGauge();
  const html = `<!doctype html><meta charset="utf-8"><title>PDF Service /health</title>
  <style>body{font:14px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:880px;margin:2rem auto}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:.75rem 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}</style>
  <h1>PDF Service <small>v2.2.0</small></h1>
  <div class="card"><b>Status:</b> OK<br>Time: ${new Date().toISOString()}<br>
  Pool: ${contexts.length} contexts, busy: ${busy.size}<br>
  Limits: JSON=${JSON_LIMIT} · HTML=${HTML_LIMIT} · PDF default=${PDF_MAX_DEFAULT} cap=${PDF_MAX_CAP}<br>
  Headless: ${HEADLESS}<br>
  Host: ${os.hostname()}</div>
  <p><a href="/metrics">/metrics</a></p>`;
  res.set('Content-Type','text/html; charset=utf-8').send(html);
});

// Core render handler
async function handleRender(req, res) {
  const route = req.path;
  try {
    const { html, filename, return_pdf_bytes, meta, maxBytes } = req.body || {};
    if (!html || typeof html !== 'string') {
      httpReqs.labels(route, '400').inc();
      return res.status(400).json({ ok: false, error: 'html required' });
    }
    // Compute effective max bytes: request override (bounded) OR default
    const reqMax = typeof maxBytes === 'number' ? maxBytes : PDF_MAX_DEFAULT;
    const effectiveMaxBytes = clamp(reqMax, MIN_PDF_BYTES, PDF_MAX_CAP);

    const buf = await renderToBuffer(html, filename || 'report.pdf', effectiveMaxBytes);

    const wantsJson = return_pdf_bytes === true
      || RETURN_JSON_BASE64_DEFAULT
      || (req.headers.accept && req.headers.accept.includes('application/json'));

    // Add small diagnostics headers
    res.setHeader('X-PDF-Bytes', String(buf.length));
    res.setHeader('X-PDF-Limit', String(effectiveMaxBytes));

    if (wantsJson) {
      httpReqs.labels(route, '200').inc();
      return res.json({ ok: true, pdf_base64: buf.toString('base64'), bytes: buf.length, meta: meta || null });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(filename || 'report.pdf').replace(/[^a-zA-Z0-9_.-]+/g,'_')}"`);
    httpReqs.labels(route, '200').inc();
    return res.send(buf);
  } catch (e) {
    const status = e.status || 500;
    httpReqs.labels(route, String(status)).inc();
    const payload = { ok: false, error: String(e.message || e) };
    if (status === 413) {
      payload.reason = 'pdf_too_large';
      if (typeof e.html_bytes === 'number') payload.html_bytes = e.html_bytes;
      if (typeof e.pdf_bytes === 'number')  payload.pdf_bytes  = e.pdf_bytes;
      if (typeof e.limit_bytes === 'number')payload.limit_bytes= e.limit_bytes;
    }
    logger.warn({ status, err: e.message }, 'render failed');
    return res.status(status).json(payload);
  }
}

app.post('/generate-pdf', handleRender);
// Legacy-Compat
app.post('/render-pdf', handleRender);

app.get('/', (req, res) => res.type('text/html').send('<h1>make-ki-pdfservice</h1><p>OK</p>'));

process.on('SIGTERM', async () => {
  logger.info('shutting down...');
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  process.exit(0);
});

app.listen(PORT, async () => {
  await initPool();
  logger.info({ port: PORT }, 'pdf service listening');
});
