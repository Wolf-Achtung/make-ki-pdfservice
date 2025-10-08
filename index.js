// filename: index.js
/* eslint-disable no-console */
'use strict';

/**
 * make-ki-pdfservice – Node/Puppeteer (Gold-Standard+)
 * Endpunkte:
 *  - GET  /health
 *  - POST /generate-pdf   -> application/pdf ODER JSON { pdf_base64, bytes } (wenn return_pdf_bytes=false)
 *  - POST /render-pdf     -> immer application/pdf (Backward-Compatibility)
 *
 * Sicherheit & Robustheit:
 *  - HTML-Sanitizing (DOMPurify) mit on* Event-Strip und <script>-Removal
 *  - Größenlimit (MAX_HTML_SIZE_BYTES)
 *  - Rate-Limit, Helmet, CORS
 *  - Ein Browser, pro Request eigener Kontext -> keine Leakage über Seiten hinweg
 *  - Optionaler Mail-Fallback (SendGrid oder SMTP), wenn ausdrücklich send_email=true gesetzt ist
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

const PORT = Number(process.env.PORT || 8000);
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const ALLOW = (process.env.ALLOW_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_HTML_SIZE_BYTES = Number(process.env.MAX_HTML_SIZE_BYTES || 2_000_000); // 2 MB
const DEFAULT_FORMAT = process.env.DEFAULT_FORMAT || 'A4';
const DEFAULT_MARGIN_MM = process.env.DEFAULT_MARGIN_MM || '12,12,12,12';
const PUPPETEER_HEADLESS = process.env.PUPPETEER_HEADLESS || 'new';
const PUPPETEER_PROTOCOL_TIMEOUT = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 180000);

// Optional: Mail-Fallback (nur wenn ausdrücklich genutzt)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM = process.env.SENDGRID_FROM || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SENDGRID_FROM || '';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'PDF Service';
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

if (SENDGRID_API_KEY) {
  try { sgMail.setApiKey(SENDGRID_API_KEY); } catch (e) { /* ignore */ }
}

// ----------------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------------
function truthy(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  return false;
}

function mmTuple(str) {
  const parts = String(str || DEFAULT_MARGIN_MM).split(',').map(s => s.trim());
  const safe = (parts.length >= 4 ? parts : parts.concat(['12', '12', '12', '12']).slice(0, 4))
    .map(x => isNaN(Number(x)) ? 12 : Number(x));
  return { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] };
}

function sanitizeHtml(input, { stripScripts = true, stripEvents = true } = {}) {
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);
  // Erlaube style, aber entferne Skripte und Event-Handler
  if (stripScripts) {
    DOMPurify.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName && data.tagName.toLowerCase() === 'script') {
        node.parentNode && node.parentNode.removeChild(node);
      }
    });
  }
  if (stripEvents) {
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName && data.attrName.toLowerCase().startsWith('on')) {
        return { keepAttr: false };
      }
      return undefined;
    });
  }
  return DOMPurify.sanitize(String(input || ''), { WHOLE_DOCUMENT: true, RETURN_DOM_FRAGMENT: false });
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: PUPPETEER_HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: PUPPETEER_PROTOCOL_TIMEOUT
    });
  }
  return browserPromise;
}

async function renderPdf({ html, filename, pageFormat, marginMM, viewportWidth, waitUntil, stripScripts, maxBytes }) {
  if (!html) throw new Error('html required');
  const rawBytes = Buffer.byteLength(html, 'utf8');
  const limit = Number(maxBytes || MAX_HTML_SIZE_BYTES);
  if (rawBytes > limit) throw new Error(`HTML too large (${rawBytes} > ${limit})`);

  const cleanHtml = sanitizeHtml(html, { stripScripts: truthy(stripScripts), stripEvents: true });
  const browser = await getBrowser();
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();

  await page.setViewport({ width: Number(viewportWidth) || 1280, height: 900 });
  const wait = (['load', 'domcontentloaded', 'networkidle0', 'networkidle2'].includes(String(waitUntil).toLowerCase()))
    ? String(waitUntil).toLowerCase()
    : 'networkidle0';
  await page.setContent(cleanHtml, { waitUntil: wait });

  const m = mmTuple(marginMM);
  const buf = await page.pdf({
    format: pageFormat || DEFAULT_FORMAT,
    margin: { top: `${m.top}mm`, right: `${m.right}mm`, bottom: `${m.bottom}mm`, left: `${m.left}mm` },
    printBackground: true
  });

  await page.close();
  await context.close();
  return { buffer: buf, filename: filename || 'report.pdf', engine: 'puppeteer' };
}

async function sendMailIfRequested({ recipient, subject, html, filename, pdfBuffer, lang, sendEmailFlag }) {
  if (!truthy(sendEmailFlag)) return { ok: false, detail: 'mail not requested' };
  if (!recipient || !subject) return { ok: false, detail: 'recipient/subject missing' };

  // Prefer SendGrid
  if (SENDGRID_API_KEY && SENDGRID_FROM) {
    try {
      await sgMail.send({
        to: recipient,
        from: SENDGRID_FROM,
        subject,
        html: html || (lang === 'de' ? '<p>Ihr Report ist im Anhang.</p>' : '<p>Your report is attached.</p>'),
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: filename || 'report.pdf',
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      });
      return { ok: true, provider: 'sendgrid' };
    } catch (err) {
      return { ok: false, provider: 'sendgrid', detail: String(err).slice(0, 300) };
    }
  }

  // Fallback SMTP
  if (SMTP_HOST && SMTP_FROM) {
    try {
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 20000),
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 30000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 30000)
      });
      await transport.sendMail({
        to: recipient,
        from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
        subject,
        html: html || (lang === 'de' ? '<p>Ihr Report ist im Anhang.</p>' : '<p>Your report is attached.</p>'),
        attachments: [{ filename: filename || 'report.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
      });
      return { ok: true, provider: 'smtp' };
    } catch (err) {
      return { ok: false, provider: 'smtp', detail: String(err).slice(0, 300) };
    }
  }

  return { ok: false, detail: 'no mail provider configured' };
}

// ----------------------------------------------------------------------------
// App
// ----------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: ALLOW, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: process.env.JSON_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.HTML_LIMIT || '10mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_PER_MIN || 60) }));

app.get('/health', async (_req, res) => {
  try {
    const browser = await getBrowser();
    const version = await browser.version();
    res.json({
      ok: true,
      engine: 'puppeteer',
      version,
      limits: { MAX_HTML_SIZE_BYTES },
    });
  } catch (e) {
    res.status(503).json({ ok: false, detail: String(e) });
  }
});

app.post('/generate-pdf', async (req, res) => {
  try {
    const {
      html, filename, lang, subject, recipient, meta,
      return_pdf_bytes, stripScripts, maxBytes,
      pageFormat, marginMM, viewportWidth, waitUntil,
      send_email
    } = req.body || {};

    const { buffer, filename: fn, engine } = await renderPdf({
      html, filename, pageFormat, marginMM, viewportWidth, waitUntil, stripScripts, maxBytes
    });

    // Optionaler Mail-Fallback, nur wenn ausdrücklich angefordert
    const mail = await sendMailIfRequested({
      recipient, subject, html, filename: fn, pdfBuffer: buffer, lang, sendEmailFlag: send_email
    });

    if (!truthy(return_pdf_bytes) && !truthy(send_email)) {
      // JSON-Antwort (Base64) – hilfreich für Health/Tests
      return res.json({ ok: true, engine, bytes: buffer.length, pdf_base64: buffer.toString('base64'), mail });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.send(buffer);
  } catch (err) {
    const msg = String(err && err.message || err);
    res.status(msg.includes('HTML too large') ? 413 : 500).json({ ok: false, detail: msg });
  }
});

// BW-Kompatibilität: immer PDF-Bytes
app.post('/render-pdf', async (req, res) => {
  req.body = req.body || {};
  req.body.return_pdf_bytes = true;
  return app._router.handle(req, res, require('finalhandler')(req, res)); // passt req weiter
});

// Fallback Root
app.get('/', (_req, res) => res.json({ ok: true, app: 'make-ki-pdfservice' }));

// Start
app.listen(PORT, () => {
  if (LOG_LEVEL !== 'silent') console.log(`[pdfservice] listening on :${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  try { const b = await browserPromise; b && await b.close(); } catch (_) {}
  process.exit(0);
});
