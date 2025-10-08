// filename: index.js
/* eslint-disable no-console */
'use strict';

/**
 * make-ki-pdfservice – Node/Puppeteer (Gold-Standard+, Render-only)
 * Endpunkte:
 *  - GET  /health           -> JSON
 *  - GET  /health/html      -> HTML-Dashboard
 *  - GET  /metrics          -> Prometheus
 *  - POST /generate-pdf     -> application/pdf (default) ODER JSON {pdf_base64, bytes} (wenn return_pdf_bytes=false)
 *  - POST /render-pdf       -> application/pdf (Legacy-Kompatibilität)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const puppeteer = require('puppeteer');
const client = require('prom-client');

const PORT = Number(process.env.PORT || 8000);
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const ALLOW = (process.env.ALLOW_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);

const MAX_HTML_SIZE_BYTES = Number(process.env.MAX_HTML_SIZE_BYTES || 2_000_000);
const DEFAULT_FORMAT = process.env.DEFAULT_FORMAT || 'A4';
const DEFAULT_MARGIN_MM = process.env.DEFAULT_MARGIN_MM || '12,12,12,12';
const PUPPETEER_HEADLESS = process.env.PUPPETEER_HEADLESS || 'new';
const PUPPETEER_PROTOCOL_TIMEOUT = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 180000);

// Browser-Pool ENV
const BROWSER_POOL_SIZE = Math.min(Math.max(Number(process.env.BROWSER_POOL_SIZE || 4), 1), 32);
const BROWSER_POOL_MAX = Math.min(Math.max(Number(process.env.BROWSER_POOL_MAX || 8), BROWSER_POOL_SIZE), 64);
const CONTEXT_REUSE_LIMIT = Math.max(Number(process.env.BROWSER_CONTEXT_REUSE_LIMIT || 100), 1);
const POOL_WARMUP = String(process.env.BROWSER_POOL_WARMUP || 'true').toLowerCase() === 'true';

// ---------------------------- Prometheus ------------------------------------
client.collectDefaultMetrics({ prefix: 'pdfsvc_' });
const REQ_TOTAL = new client.Counter({ name: 'pdfsvc_http_requests_total', help: 'HTTP requests', labelNames: ['method', 'route', 'status'] });
const RENDER_SEC = new client.Histogram({ name: 'pdfsvc_render_duration_seconds', help: 'Render duration', buckets: [0.1,0.25,0.5,1,2,4,8,15] });
const INFLIGHT = new client.Gauge({ name: 'pdfsvc_renders_in_flight', help: 'Renders in flight' });
const POOL_SIZE_G = new client.Gauge({ name: 'pdfsvc_browser_pool_size', help: 'Pool size' });
const POOL_AVAIL_G = new client.Gauge({ name: 'pdfsvc_browser_pool_available', help: 'Pool available' });

// ------------------------------ Utils ---------------------------------------
function truthy(v){ if(typeof v==='boolean')return v; if(typeof v==='number')return v!==0; if(typeof v==='string')return ['1','true','yes','on'].includes(v.trim().toLowerCase()); return false; }
function mmTuple(str){
  const parts = String(str || DEFAULT_MARGIN_MM).split(',').map(s=>s.trim());
  const safe = (parts.length>=4?parts:parts.concat(['12','12','12','12']).slice(0,4)).map(x=>isNaN(Number(x))?12:Number(x));
  return { top:safe[0], right:safe[1], bottom:safe[2], left:safe[3] };
}
function sanitizeHtml(input,{stripScripts=true,stripEvents=true}={}){
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);
  if(stripScripts){ DOMPurify.addHook('uponSanitizeElement',(node,data)=>{ if((data.tagName||'').toLowerCase()==='script'){ node.parentNode&&node.parentNode.removeChild(node);} }); }
  if(stripEvents){ DOMPurify.addHook('uponSanitizeAttribute',(_node,data)=>{ if((data.attrName||'').toLowerCase().startsWith('on')) return {keepAttr:false}; }); }
  return DOMPurify.sanitize(String(input||''), { WHOLE_DOCUMENT:true, RETURN_DOM_FRAGMENT:false });
}

// --------------------------- Browser / Pool ---------------------------------
let browserPromise = null;
let pool = [];
let available = [];
const uses = new Map();
const waiters = [];

async function getBrowser(){
  if(!browserPromise){
    browserPromise = puppeteer.launch({
      headless: PUPPETEER_HEADLESS,
      args: ['--no-sandbox','--disable-setuid-sandbox'],
      protocolTimeout: PUPPETEER_PROTOCOL_TIMEOUT
    });
  }
  return browserPromise;
}
async function createContext(){
  const b = await getBrowser();
  const ctx = await b.createIncognitoBrowserContext();
  uses.set(ctx,0);
  pool.push(ctx);
  available.push(ctx);
  POOL_SIZE_G.set(pool.length); POOL_AVAIL_G.set(available.length);
  return ctx;
}
async function warmupPool(){
  const target = Math.min(BROWSER_POOL_SIZE, BROWSER_POOL_MAX);
  for(let i=pool.length;i<target;i+=1){ await createContext(); }
}
function _resolveNext(){ const w = waiters.shift(); if(w) w(); }
async function acquireContext(){
  if(available.length){ const ctx = available.pop(); POOL_AVAIL_G.set(available.length); return ctx; }
  if(pool.length < BROWSER_POOL_MAX){ return createContext(); }
  await new Promise(res=>waiters.push(res));
  const ctx = available.pop(); POOL_AVAIL_G.set(available.length); return ctx;
}
async function releaseContext(ctx){
  try{
    const n=(uses.get(ctx)||0)+1; uses.set(ctx,n);
    if(n>=CONTEXT_REUSE_LIMIT){
      try{ await ctx.close(); }catch(_){}
      const idx=pool.indexOf(ctx); if(idx>=0) pool.splice(idx,1);
      uses.delete(ctx); await createContext();
    }else{
      available.push(ctx); POOL_AVAIL_G.set(available.length);
    }
  }finally{ _resolveNext(); }
}

async function renderPdf({ html, filename, pageFormat, marginMM, viewportWidth, waitUntil, stripScripts, maxBytes }){
  if(!html) throw new Error('html required');
  const rawBytes = Buffer.byteLength(html,'utf8');
  const limit = Number(maxBytes || MAX_HTML_SIZE_BYTES);
  if(rawBytes>limit) throw new Error(`HTML too large (${rawBytes} > ${limit})`);

  const cleanHtml = sanitizeHtml(html,{ stripScripts: truthy(stripScripts), stripEvents:true });
  const ctx = await acquireContext();
  try{
    const page = await ctx.newPage();
    await page.setViewport({ width:Number(viewportWidth)||1280, height:900 });
    const wait = (['load','domcontentloaded','networkidle0','networkidle2'].includes(String(waitUntil).toLowerCase()))
      ? String(waitUntil).toLowerCase() : 'networkidle0';
    await page.setContent(cleanHtml,{ waitUntil:wait });
    const m = mmTuple(marginMM);
    const buf = await page.pdf({
      format: pageFormat || DEFAULT_FORMAT,
      margin: { top:`${m.top}mm`, right:`${m.right}mm`, bottom:`${m.bottom}mm`, left:`${m.left}mm` },
      printBackground: true
    });
    await page.close();
    return { buffer: buf, filename: filename || 'report.pdf' };
  }finally{
    await releaseContext(ctx);
  }
}

// ------------------------------ App -----------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: ALLOW, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: process.env.JSON_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended:false, limit: process.env.HTML_LIMIT || '10mb' }));
app.use(rateLimit({ windowMs: 60*1000, max: Number(process.env.RATE_LIMIT_PER_MIN || 120) }));

// Metrics MW
app.use((req,res,next)=>{
  const start = process.hrtime.bigint();
  res.on('finish', ()=>{
    const dur = Number(process.hrtime.bigint()-start)/1e9;
    REQ_TOTAL.labels(req.method, req.route?.path || req.path, String(res.statusCode)).inc();
    if(req.path==='/generate-pdf' || req.path==='/render-pdf'){ RENDER_SEC.observe(dur); }
  });
  next();
});

app.get('/health', async (_req,res)=>{
  try{
    const b = await getBrowser(); const version = await b.version();
    if(POOL_WARMUP && pool.length < BROWSER_POOL_SIZE) await warmupPool();
    res.json({ ok:true, engine:'puppeteer', version, pool:{ size:pool.length, available:available.length, max:BROWSER_POOL_MAX, reuse_limit:CONTEXT_REUSE_LIMIT }, limits:{ MAX_HTML_SIZE_BYTES } });
  }catch(e){ res.status(503).json({ ok:false, detail:String(e) }); }
});

app.get('/health/html', async (_req,res)=>{
  const b = await getBrowser(); const version = await b.version();
  const html = `<!doctype html><meta charset="utf-8">
  <title>PDF Service Health</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:2rem;color:#111}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:1rem}.card{border:1px solid #e5e5e5;border-radius:12px;padding:1rem}
  h1{font-size:1.1rem;margin:.2rem 0}.kv{display:flex;justify-content:space-between;margin:.2rem 0}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}</style>
  <h1>make-ki-pdfservice – Health</h1>
  <div class="grid">
    <div class="card"><h1>Engine</h1><div class="kv"><span>runtime</span><span class="mono">puppeteer</span></div><div class="kv"><span>version</span><span class="mono">${version}</span></div><div class="kv"><span>html limit</span><span class="mono">${MAX_HTML_SIZE_BYTES} B</span></div></div>
    <div class="card"><h1>Browser Pool</h1><div class="kv"><span>size</span><span class="mono">${pool.length}</span></div><div class="kv"><span>available</span><span class="mono">${available.length}</span></div><div class="kv"><span>max</span><span class="mono">${BROWSER_POOL_MAX}</span></div><div class="kv"><span>reuse</span><span class="mono">${CONTEXT_REUSE_LIMIT}</span></div></div>
  </div>`;
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html);
});

app.get('/metrics', async (_req,res)=>{ res.set('Content-Type', client.register.contentType); res.end(await client.register.metrics()); });

app.post('/generate-pdf', async (req,res)=>{
  INFLIGHT.inc(); const stop = RENDER_SEC.startTimer();
  try{
    const { html, filename, return_pdf_bytes, stripScripts, maxBytes, pageFormat, marginMM, viewportWidth, waitUntil } = req.body || {};
    const { buffer, filename: fn } = await renderPdf({ html, filename, pageFormat, marginMM, viewportWidth, waitUntil, stripScripts, maxBytes });
    const returnBytes = (typeof return_pdf_bytes === 'undefined') ? true : truthy(return_pdf_bytes);
    if(!returnBytes){ return res.json({ ok:true, engine:'puppeteer', bytes: buffer.length, pdf_base64: buffer.toString('base64') }); }
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${fn}"`); res.send(buffer);
  }catch(err){
    const msg = String(err && err.message || err); res.status(msg.includes('HTML too large')?413:500).json({ ok:false, detail:msg });
  }finally{ stop(); INFLIGHT.dec(); }
});

// Legacy-Kompatibilität: immer PDF
app.post('/render-pdf', async (req, res) => {
  INFLIGHT.inc(); const stop = RENDER_SEC.startTimer();
  try{
    const { html, filename, stripScripts, maxBytes, pageFormat, marginMM, viewportWidth, waitUntil } = req.body || {};
    const { buffer, filename: fn } = await renderPdf({ html, filename, pageFormat, marginMM, viewportWidth, waitUntil, stripScripts, maxBytes });
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${fn||'report.pdf'}"`); res.send(buffer);
  }catch(err){
    const msg = String(err && err.message || err); res.status(msg.includes('HTML too large')?413:500).json({ ok:false, detail:msg });
  }finally{ stop(); INFLIGHT.dec(); }
});

app.get('/', (_req,res)=>res.json({ ok:true, app:'make-ki-pdfservice' }));

(async ()=>{ await getBrowser(); if(POOL_WARMUP) await warmupPool(); app.listen(PORT, ()=>{ if(LOG_LEVEL!=='silent') console.log(`[pdfservice] listening on :${PORT} (pool=${pool.length}/${BROWSER_POOL_MAX})`); }); })();

process.on('SIGTERM', async ()=>{ try{ const b=await browserPromise; b && await b.close(); }catch(_){} process.exit(0); });
