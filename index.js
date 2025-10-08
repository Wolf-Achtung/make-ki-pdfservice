// File: index.js
/* Render-only PDF microservice (Gold-Standard+)
 * - Endpoints: /generate-pdf, /render-pdf (compat), /metrics, /health, /health/html
 * - Puppeteer incognito pool (configurable), basic queue protection.
 * - Prometheus metrics, simple HTML dashboard.
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

// Puppeteer (Chromium provided by base image ghcr.io/puppeteer/puppeteer)
const puppeteer = require('puppeteer');

// -------------------- Config --------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const HTML_LIMIT = process.env.HTML_LIMIT || '15mb';
const JSON_LIMIT = process.env.JSON_LIMIT || '15mb';
const PDF_MAX_BYTES = parseInt(process.env.PDF_MAX_BYTES || String(10 * 1024 * 1024), 10);
const STRIP_SCRIPTS = (process.env.PDF_STRIP_SCRIPTS || '1').match(/^(1|true|yes)$/i);
const STRIP_PAGE_AT_RULES = (process.env.PDF_STRIP_PAGE_AT_RULES || '1').match(/^(1|true|yes)$/i);
const RETURN_JSON_BASE64 = (process.env.RETURN_JSON_BASE64 || '1').match(/^(1|true|yes)$/i);

const HEADLESS = process.env.PUPPETEER_HEADLESS || 'new';
const BROWSER_POOL_SIZE = Math.max(1, Math.min(8, parseInt(process.env.BROWSER_POOL_SIZE || '4', 10)));
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '45000', 10);

// Very conservative: 1 job per context (simple + stable). If all busy -> 503.
const contexts = [];
const busy = new Set();

// -------------------- Metrics --------------------
client.collectDefaultMetrics();
const httpReqs = new client.Counter({ name: 'pdf_http_requests_total', help: 'HTTP requests', labelNames: ['route','status'] });
const renderDur = new client.Histogram({ name: 'pdf_render_seconds', help: 'Render duration seconds' });
const poolAvail = new client.Gauge({ name: 'pdf_pool_available', help: 'Incognito contexts available' });

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
function sanitize(html) {
  let h = html || '';
  h = stripScripts(h);
  h = stripAtRules(h);
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
  for (let i=0;i<BROWSER_POOL_SIZE;i++) {
    const ctx = await browser.createIncognitoBrowserContext();
    contexts.push(ctx);
  }
  updatePoolGauge();
  logger.info({size: BROWSER_POOL_SIZE}, 'browser pool initialized');
}

async function acquireContext() {
  for (let i=0;i<contexts.length;i++) {
    const ctx = contexts[i];
    if (!busy.has(ctx)) {
      busy.add(ctx);
      updatePoolGauge();
      return ctx;
    }
  }
  return null; // too busy
}

function releaseContext(ctx) {
  if (busy.has(ctx)) {
    busy.delete(ctx);
    updatePoolGauge();
  }
}

async function renderToBuffer(html, filename) {
  await initPool();
  const ctx = await acquireContext();
  if (!ctx) {
    const err = new Error('PDF service busy – please retry shortly');
    err.status = 503;
    throw err;
  }
  const start = Date.now();
  try {
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.setContent(sanitize(html), { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      printBackground: true,
      format: 'A4',
      displayHeaderFooter: false,
      margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    await page.close();
    renderDur.observe((Date.now() - start) / 1000);
    if (pdf.length > PDF_MAX_BYTES) {
      const err = new Error(`PDF larger than limit (${pdf.length} > ${PDF_MAX_BYTES})`);
      err.status = 413;
      throw err;
    }
    return pdf;
  } finally {
    releaseContext(ctx);
  }
}

// -------------------- Server --------------------
const app = express();
app.set('x-powered-by', false);
app.use(helmet());
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: HTML_LIMIT }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use(limiter);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/health', (req, res) => {
  updatePoolGauge();
  res.json({ ok: true, ts: new Date().toISOString(), version: '2.0.0', pool: { size: contexts.length, busy: busy.size } });
});

app.get('/health/html', async (req, res) => {
  updatePoolGauge();
  const html = `<!doctype html><meta charset="utf-8"><title>PDF Service /health</title>
  <style>body{font:14px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:880px;margin:2rem auto}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:.75rem 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}</style>
  <h1>PDF Service <small>v2.0.0</small></h1>
  <div class="card"><b>Status:</b> OK<br>Time: ${new Date().toISOString()}<br>
  Pool: ${contexts.length} contexts, busy: ${busy.size}<br>
  Host: ${os.hostname()}</div>
  <p><a href="/metrics">/metrics</a></p>`;
  res.set('Content-Type','text/html; charset=utf-8').send(html);
});

async function handleRender(req, res) {
  const route = req.path;
  try {
    const { html, filename, return_pdf_bytes, meta } = req.body || {};
    if (!html || typeof html !== 'string') {
      httpReqs.labels(route, '400').inc();
      return res.status(400).json({ ok: false, error: 'html required' });
    }
    const buf = await renderToBuffer(html, filename || 'report.pdf');
    if (return_pdf_bytes || RETURN_JSON_BASE64) {
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
    logger.warn({ err: e.message }, 'render failed');
    return res.status(status).json({ ok: false, error: String(e.message || e) });
  }
}

app.post('/generate-pdf', handleRender);
// Legacy-Compat: /render-pdf
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
