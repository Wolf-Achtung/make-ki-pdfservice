// filename: index.js
/* Render-only PDF microservice (Gold-Standard+)
 * - Endpoints: /generate-pdf, /render-pdf (compat), /metrics, /health, /health/html
 * - Puppeteer context pool (configurable) + kleines FIFO-Queueing
 * - Low-Fidelity-Fallback bei Größenüberschreitung (413)
 * - Prometheus metrics, bessere Diagnostics, optionale HTML-Minify/Sanitize
 */

'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const pino = require('pino');
const os = require('os');
const puppeteer = require('puppeteer');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// -------------------- Config --------------------
const PORT = parseInt(process.env.PORT || '3000', 10);

// Body limits
const HTML_LIMIT = process.env.HTML_LIMIT || '20mb';
const JSON_LIMIT = process.env.JSON_LIMIT || '20mb';

// PDF size policy
const PDF_MAX_DEFAULT = parseInt(process.env.PDF_MAX_BYTES_DEFAULT || String(20 * 1024 * 1024), 10); // 20 MB
const PDF_MAX_CAP      = parseInt(process.env.PDF_MAX_BYTES_CAP      || String(32 * 1024 * 1024), 10); // 32 MB
const MIN_PDF_BYTES    = 1 * 1024 * 1024; // 1 MB Untergrenze

// Sanitizing / Minify
const STRIP_SCRIPTS = /^(1|true|yes)$/i.test(process.env.PDF_STRIP_SCRIPTS || '1');
const STRIP_PAGE_AT_RULES = /^(1|true|yes)$/i.test(process.env.PDF_STRIP_PAGE_AT_RULES || '1');
const PDF_MINIFY_HTML = /^(1|true|yes)$/i.test(process.env.PDF_MINIFY_HTML || '1');

// Response preference
const ALWAYS_PDF = /^(1|true|yes)$/i.test(process.env.ALWAYS_PDF || '1'); // Immer application/pdf
const RETURN_JSON_BASE64_DEFAULT = /^(1|true|yes)$/i.test(process.env.RETURN_JSON_BASE64 || '0'); // nur wenn ALWAYS_PDF=0

// Puppeteer headless mode
const HEADLESS_ENV = process.env.PUPPETEER_HEADLESS;
const HEADLESS = (() => {
  if (HEADLESS_ENV == null) return true;
  if (/^(1|true|yes|on|new)$/i.test(HEADLESS_ENV)) return true;
  if (/^(0|false|no|off)$/i.test(HEADLESS_ENV)) return false;
  if (HEADLESS_ENV === 'shell') return 'shell';
  return true;
})();

// Pool & Queue
const BROWSER_POOL_SIZE = Math.max(1, Math.min(8, parseInt(process.env.BROWSER_POOL_SIZE || '6', 10)));
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '60000', 10);
const QUEUE_MAX = Math.max(0, parseInt(process.env.QUEUE_MAX || '24', 10));
const QUEUE_WAIT_MS = Math.max(5000, parseInt(process.env.QUEUE_WAIT_MS || '25000', 10));

// PDF Optimization settings
const PDF_SCALE = parseFloat(process.env.PDF_SCALE || '0.94'); // Slightly reduced for smaller files
const PDF_PRINT_BG = /^(1|true|yes)$/i.test(process.env.PDF_PRINT_BACKGROUND || '0'); // Default: off for smaller files

// -------------------- Metrics --------------------
client.collectDefaultMetrics();
const httpReqs  = new client.Counter({ name: 'pdf_http_requests_total', help: 'HTTP requests', labelNames: ['route','status'] });
const renderDur = new client.Histogram({ name: 'pdf_render_seconds', help: 'Render duration seconds' });
const poolAvail = new client.Gauge({ name: 'pdf_pool_available', help: 'Browser contexts available' });

function updatePoolGauge(contexts, busy) {
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

// CSS minification helper
function minifyCSS(css) {
  let s = css;
  // Remove CSS comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove unnecessary whitespace
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*([{};:,>+~])\s*/g, '$1');
  s = s.replace(/;}/g, '}');
  // Remove last semicolon before closing brace
  s = s.replace(/;(?=\s*})/g, '');
  // Reduce box-shadow complexity (smaller files)
  s = s.replace(/box-shadow:\s*([^;]+)\s*;/gi, (match, value) => {
    // Simplify multiple shadows to single
    const shadows = value.split(',');
    if (shadows.length > 2) {
      return `box-shadow:${shadows[0].trim()};`;
    }
    return match;
  });
  return s.trim();
}

// Consolidate multiple <style> blocks
function consolidateStyles(html) {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styles = [];
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    styles.push(match[1]);
  }
  if (styles.length <= 1) return html;

  // Remove all style blocks
  let result = html.replace(styleRegex, '');
  // Add consolidated style block in head
  const consolidatedCSS = minifyCSS(styles.join('\n'));
  const headClose = result.indexOf('</head>');
  if (headClose > -1) {
    result = result.slice(0, headClose) + `<style>${consolidatedCSS}</style>` + result.slice(headClose);
  } else {
    // Fallback: prepend to body
    result = `<style>${consolidatedCSS}</style>` + result;
  }
  return result;
}

function minifySoft(html) {
  if (!PDF_MINIFY_HTML || !html) return html;
  let s = String(html);
  // Remove HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Consolidate style blocks
  s = consolidateStyles(s);
  // Minify inline styles
  s = s.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
    return `<style>${minifyCSS(css)}</style>`;
  });
  // Reduce whitespace between tags
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

// -------------------- Browser Pool & Queue --------------------
let browser = null;
const contexts = [];
const busy = new Set();
const waitQueue = []; // FIFO

async function initPool() {
  if (browser) return;
  browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      // Core security/sandbox
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // GPU/rendering optimization for smaller PDFs
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      // Font rendering (none = smaller files, less hinting overhead)
      '--font-render-hinting=none',
      // Additional size optimizations
      '--disable-skia-runtime-opts',
      '--disable-gpu-rasterization',
      '--disable-accelerated-2d-canvas',
      '--disable-background-timer-throttling',
    ]
  });

  browser.on('disconnected', () => {
    logger.warn('browser disconnected – resetting pool');
    contexts.splice(0, contexts.length);
    busy.clear();
    browser = null;
    updatePoolGauge(contexts, busy);
  });

  const createCtx = browser.createBrowserContext
    ? () => browser.createBrowserContext()
    : () => browser.createIncognitoBrowserContext();

  for (let i=0; i<BROWSER_POOL_SIZE; i++) {
    // eslint-disable-next-line no-await-in-loop
    const ctx = await createCtx();
    contexts.push(ctx);
  }
  updatePoolGauge(contexts, busy);
}

function _acquireImmediate() {
  for (const ctx of contexts) {
    if (!busy.has(ctx)) {
      busy.add(ctx);
      updatePoolGauge(contexts, busy);
      return ctx;
    }
  }
  return null;
}

function _release(ctx) {
  if (busy.has(ctx)) {
    busy.delete(ctx);
    updatePoolGauge(contexts, busy);
    // Wecke nächsten in der FIFO-Queue
    if (waitQueue.length > 0) {
      const ticket = waitQueue.shift();
      const free = _acquireImmediate();
      if (free) {
        clearTimeout(ticket.timer);
        // Asynchron: übergeben des freien Kontextes
        setImmediate(() => ticket.resolve(free));
      } else {
        // falls race: Ticket wieder vorn einsortieren
        waitQueue.unshift(ticket);
      }
    }
  }
}

async function acquireContextWait() {
  const immediate = _acquireImmediate();
  if (immediate) return immediate;

  if (waitQueue.length >= QUEUE_MAX) {
    const err = new Error('PDF service busy – queue full');
    err.status = 503;
    throw err;
  }
  return new Promise((resolve, reject) => {
    const ticket = { resolve, reject };
    ticket.timer = setTimeout(() => {
      const idx = waitQueue.indexOf(ticket);
      if (idx >= 0) waitQueue.splice(idx, 1);
      const err = new Error('PDF service busy – timeout');
      err.status = 503;
      reject(err);
    }, QUEUE_WAIT_MS);
    waitQueue.push(ticket);
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function renderWithOptions(html, filename, effectiveMaxBytes, opts) {
  await initPool();
  const ctx = await acquireContextWait();
  const start = Date.now();
  let page;
  const htmlBytes = Buffer.byteLength(html, 'utf8');

  try {
    page = await ctx.newPage();
    // 96 DPI equivalent viewport for A4 portrait
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    // optional: Assets blocken (Low-Fidelity) – Puppeteer-kompatible Implementierung
    if (opts.blockAssets) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (resourceType === 'image' || resourceType === 'font') {
          request.abort().catch(() => {});
        } else {
          request.continue().catch(() => {});
        }
      });
    }

    const safeHtml = sanitize(html);
    const safeHtmlBytes = Buffer.byteLength(safeHtml, 'utf8');
    await page.setContent(safeHtml, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });

    // A4 portrait, 96 DPI, harmonized margins (15mm)
    const pdf = await page.pdf({
      printBackground: !!opts.printBackground,
      scale: typeof opts.scale === 'number' ? opts.scale : PDF_SCALE,
      format: 'A4',
      landscape: false,
      displayHeaderFooter: false,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      preferCSSPageSize: true,
    });

    const durationMs = Date.now() - start;
    renderDur.observe(durationMs / 1000);

    // Size monitoring
    const compressionRatio = safeHtmlBytes > 0 ? (pdf.length / safeHtmlBytes).toFixed(2) : 'N/A';
    logger.info({
      html_bytes: htmlBytes,
      html_minified_bytes: safeHtmlBytes,
      pdf_bytes: pdf.length,
      compression_ratio: compressionRatio,
      scale: opts.scale,
      print_bg: !!opts.printBackground,
      duration_ms: durationMs,
    }, 'pdf rendered');

    // Soft warnings
    if (pdf.length > 15 * 1024 * 1024) {
      logger.warn({ pdf_bytes: pdf.length, limit_bytes: effectiveMaxBytes }, 'pdf exceeds 15 MB soft limit');
    }

    // Größenprüfung
    if (pdf.length > effectiveMaxBytes) {
      const err = new Error(`PDF larger than limit (${pdf.length} > ${effectiveMaxBytes})`);
      err.status = 413;
      err.html_bytes = htmlBytes;
      err.html_minified_bytes = safeHtmlBytes;
      err.pdf_bytes = pdf.length;
      err.limit_bytes = effectiveMaxBytes;
      throw err;
    }
    return pdf;
  } finally {
    if (page) { try { await page.close(); } catch { /* ignore */ } }
    _release(ctx);
  }
}

async function renderToBufferAdaptive(html, filename, effectiveMaxBytes) {
  // 4 Degradierungsstufen, um 413 zu vermeiden (optimierte Skalierung)
  const passes = [
    { printBackground: PDF_PRINT_BG, blockAssets: false, scale: PDF_SCALE },      // Default optimized
    { printBackground: false,        blockAssets: false, scale: PDF_SCALE },      // No background
    { printBackground: false,        blockAssets: false, scale: 0.90 },           // Reduced scale
    { printBackground: false,        blockAssets: true,  scale: 0.85 },           // Low-fi mode
  ];
  let last;
  for (const p of passes) {
    try {
      return await renderWithOptions(html, filename, effectiveMaxBytes, p);
    } catch (e) {
      last = e;
      if (e && e.status === 413) {
        // nächste Stufe probieren
        continue;
      }
      throw e;
    }
  }
  throw last;
}

// -------------------- App --------------------
const app = express();
app.set('x-powered-by', false);
app.use(helmet());
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: HTML_LIMIT }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: parseInt(process.env.RATE_LIMIT_PER_MIN || '180', 10) });
app.use(limiter);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/health', (req, res) => {
  updatePoolGauge(contexts, busy);
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    pool: { total: contexts.length, busy: busy.size, queue: waitQueue.length },
    headless: HEADLESS,
    pdf: { default_max_bytes: PDF_MAX_DEFAULT, cap_bytes: PDF_MAX_CAP },
    limits: { json: JSON_LIMIT, html: HTML_LIMIT },
    always_pdf: ALWAYS_PDF,
    host: os.hostname(),
  });
});

app.get('/health/html', (req, res) => {
  updatePoolGauge(contexts, busy);
  const html = `<!doctype html><meta charset="utf-8"><title>PDF Service /health</title>
  <style>body{font:14px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:880px;margin:2rem auto}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin:.75rem 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}</style>
  <h1>PDF Service <small>v2.3.0</small></h1>
  <div class="card"><b>Status:</b> OK<br>Time: ${new Date().toISOString()}<br>
  Pool: ${contexts.length} contexts, busy: ${busy.size}, queue: ${waitQueue.length}<br>
  Limits: JSON=${JSON_LIMIT} · HTML=${HTML_LIMIT} · PDF default=${PDF_MAX_DEFAULT} cap=${PDF_MAX_CAP}<br>
  Always-PDF: ${ALWAYS_PDF}<br>
  Host: ${os.hostname()}</div>
  <p><a href="/metrics">/metrics</a></p>`;
  res.set('Content-Type','text/html; charset=utf-8').send(html);
});

// Core render handler (shared)
async function handleRender(req, res) {
  const route = req.path;
  try {
    const { html, filename, maxBytes } = req.body || {};
    if (!html || typeof html !== 'string') {
      httpReqs.labels(route, '400').inc();
      return res.status(400).json({ ok: false, error: 'html required' });
    }

    // Request-basiertes Limit (auf Cap geclamped) oder Default
    const reqMax = typeof maxBytes === 'number' ? maxBytes : PDF_MAX_DEFAULT;
    const effectiveMaxBytes = clamp(reqMax, MIN_PDF_BYTES, PDF_MAX_CAP);

    const buf = await renderToBufferAdaptive(html, filename || 'report.pdf', effectiveMaxBytes);

    // Diagnostik-Header
    res.setHeader('X-PDF-Bytes', String(buf.length));
    res.setHeader('X-PDF-Limit', String(effectiveMaxBytes));

    // Immer PDF?
    if (ALWAYS_PDF || !RETURN_JSON_BASE64_DEFAULT) {
      httpReqs.labels(route, '200').inc();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${(filename || 'report.pdf').replace(/[^a-zA-Z0-9_.-]+/g,'_')}"`);
      return res.send(buf);
    }

    // Optional JSON/Base64 (nur falls explizit gewünscht)
    httpReqs.labels(route, '200').inc();
    return res.json({ ok: true, pdf_base64: buf.toString('base64'), bytes: buf.length });
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
app.post('/render-pdf', handleRender); // legacy

app.get('/', (req, res) => res.type('text/html').send('<h1>make-ki-pdfservice</h1><p>OK</p>'));

process.on('SIGTERM', async () => {
  logger.info('shutting down...');
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  process.exit(0);
});

app.listen(PORT, async () => {
  await initPool();
  logger.info({ port: PORT, pool: BROWSER_POOL_SIZE }, 'pdf service listening');
  logger.info({
    pdf_max_default_mb: (PDF_MAX_DEFAULT / 1024 / 1024).toFixed(1),
    pdf_max_cap_mb: (PDF_MAX_CAP / 1024 / 1024).toFixed(1),
    pdf_scale: PDF_SCALE,
    pdf_print_bg: PDF_PRINT_BG,
  }, 'pdf optimization settings configured');
});
