// index.js — PDF Service (Gold-Standard, hardened, Admin+User Mail mit Reply-To)
// - Dual: PDF stream ODER JSON base64 (RETURN_JSON_BASE64=1)
// - Admin+User E-Mail; Reply-To = User-E-Mail (SMTP + SendGrid)
// - Headless Chrome via puppeteer; kein harter Exec-Pfad; sichere Flags
// - HTML-Sanitizer; @page optional stripbar; Größenlimit

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import crypto from "crypto";
import fs from "fs";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: process.env.JSON_LIMIT || "10mb" }));
app.use(bodyParser.text({ type: ["text/*", "application/xhtml+xml"], limit: process.env.HTML_LIMIT || "10mb" }));
app.use(cors({ origin: "*" }));

function _bool(env, def = false) {
  const v = String(env ?? "").trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return def;
}
const ascii = (s) => (s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "");

// --- Sanitizer ---
function sanitizeHtml(input = "") {
  const stripScripts = _bool(process.env.PDF_STRIP_SCRIPTS, true);
  const stripPageAt = _bool(process.env.PDF_STRIP_PAGE_AT_RULES, true);
  let t = String(input || "");
  if (stripScripts) t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  if (stripPageAt) t = t.replace(/@page\s*\{[\s\S]*?\}/gi, "").replace(/@page\s*:[^{]+\{[\s\S]*?\}/gi, "");
  const maxBytes = parseInt(process.env.PDF_MAX_BYTES || "600000", 10);
  if (maxBytes && Buffer.byteLength(t, "utf8") > maxBytes) {
    t = Buffer.from(t, "utf8").subarray(0, maxBytes).toString("utf8") + "\n<!-- truncated -->";
  }
  return t;
}

// --- SMTP helper ---
function makeTransport({ alternate = false } = {}) {
  const wantSecure = _bool(process.env.SMTP_SECURE, false);
  const wantPort = parseInt(process.env.SMTP_PORT || (wantSecure ? "465" : "587"), 10);
  const secure = alternate ? !wantSecure : wantSecure;
  const port = alternate ? (wantSecure ? 587 : 465) : wantPort;

  if (!process.env.SMTP_HOST) {
    return {
      __stub: true,
      sendMail: async () => ({ accepted: [], rejected: ["(skipped: SMTP_HOST not set)"] }),
      verify: async () => true,
      __info: { stub: true },
    };
  }

  const timeouts = {
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT || "30000", 10),
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || "20000", 10),
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT || "30000", 10),
  };

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    ...timeouts,
  });

  return transporter;
}
async function verifySmtp(t) {
  try { await t.verify(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

// --- Mail: SMTP first, alt SMTP, dann SendGrid ---
async function sendMailSafe({ to, subject, text, pdfBuffer, filename = "KI-Status-Report.pdf", replyTo }) {
  const emailEnabled = !_bool(process.env.EMAIL_ENABLED, true) ? false : true;
  let meta = { admin: "skip", user: "skip", engine: "smtp", attempt: 0, alternateTried: false };
  if (!emailEnabled) return meta;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
  const adminEmail = process.env.ADMIN_EMAIL || "";
  const reply_to = ascii(replyTo || process.env.SMTP_REPLY_TO || to || "");

  async function _trySend(t) {
    const tasks = [];
    if (adminEmail) {
      const adminSubject = ascii(`KI-Status Report für ${to || "Unbekannt"}`);
      const adminText = ascii(`Neuer Report wurde erstellt für ${to || "Unbekannt"}.`);
      tasks.push(
        t.sendMail({
          from, replyTo: reply_to || undefined, to: adminEmail,
          subject: adminSubject, text: adminText,
          attachments: [{ filename: ascii(filename), content: pdfBuffer, contentType: "application/pdf" }],
        }).then(() => (meta.admin = "ok")).catch((err) => { meta.admin = "fail"; throw err; })
      );
    }
    if (to) {
      tasks.push(
        t.sendMail({
          from, replyTo: reply_to || undefined, to,
          subject: ascii(subject || "Ihr KI-Status-Report"),
          text: ascii(text || "Ihr Report ist angehängt."),
          attachments: [{ filename: ascii(filename), content: pdfBuffer, contentType: "application/pdf" }],
        }).then(() => (meta.user = "ok")).catch((err) => { meta.user = "fail"; throw err; })
      );
    }
    await Promise.all(tasks.map(p => p.catch(e => { throw e; })));
  }

  try {
    meta.attempt = 1;
    const t1 = makeTransport();
    const v = await verifySmtp(t1);
    if (!v.ok) console.error("[PDFSERVICE] SMTP verify failed:", v);
    await _trySend(t1);
    return meta;
  } catch (e) {
    console.error("[PDFSERVICE] SMTP primary error:", e?.message || e);
  }

  if (_bool(process.env.SMTP_TRY_ALTERNATE, true)) {
    try {
      meta.attempt = 2;
      meta.alternateTried = true;
      const t2 = makeTransport({ alternate: true });
      const v2 = await verifySmtp(t2);
      if (!v2.ok) console.error("[PDFSERVICE] SMTP alternate verify failed:", v2);
      await _trySend(t2);
      return meta;
    } catch (e2) {
      console.error("[PDFSERVICE] SMTP alternate error:", e2?.message || e2);
    }
  }

  if (process.env.SENDGRID_API_KEY) {
    try {
      meta.engine = "sendgrid";
      meta.attempt = meta.attempt ? meta.attempt + 1 : 1;
      const ok = await sendViaSendgrid({
        to,
        adminEmail,
        subject: ascii(subject || "KI Status Report"),
        text: ascii(text || "Ihr Report ist angehängt."),
        pdfBuffer,
        filename,
        replyTo: reply_to || undefined,
      });
      if (ok) { meta.user = to ? "ok" : "skip"; meta.admin = adminEmail ? "ok" : "skip"; return meta; }
    } catch (e3) {
      console.error("[PDFSERVICE] SendGrid error:", e3?.message || e3);
    }
  }
  return meta;
}

async function sendViaSendgrid({ to, adminEmail, subject, text, pdfBuffer, filename, replyTo }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  const from = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
  const payload = {
    personalizations: [
      ...(adminEmail ? [{ to: [{ email: adminEmail }] }] : []),
      ...(to ? [{ to: [{ email: to }] }] : []),
    ],
    from: { email: ascii(from) },
    subject: ascii(subject || "KI Status Report"),
    content: [{ type: "text/plain", value: ascii(text || "Ihr Report ist angehängt.") }],
    ...(replyTo ? { reply_to: { email: ascii(replyTo) } } : {}),
    attachments: [{
      content: pdfBuffer.toString("base64"),
      filename: ascii(filename || "KI-Status-Report.pdf"),
      type: "application/pdf",
      disposition: "attachment"
    }],
  };

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (resp.status === 202) return true;
  console.error("[PDFSERVICE] SendGrid response:", resp.status, await resp.text().catch(() => ""));
  return false;
}

// --- Puppeteer ---
function sanitizePuppeteerEnv() {
  process.env.PUPPETEER_PRODUCT = "chrome";
  process.env.PUPPETEER_EXECUTABLE_PATH = ""; // kein harter Pfad
  process.env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || "/tmp";
}
async function resolveChromePath() {
  try { return (await import("puppeteer")).executablePath(); }
  catch { return undefined; }
}
function launchArgs() {
  return [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--no-zygote", "--single-process",
    "--disable-dev-shm-usage", "--disable-gpu",
    "--disable-software-rasterizer", "--mute-audio",
  ];
}
async function renderPdf(html) {
  sanitizePuppeteerEnv();
  const execPath = await resolveChromePath();
  const launchOpts = {
    headless: process.env.PUPPETEER_HEADLESS || "new",
    args: launchArgs(),
    protocolTimeout: parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT || "180000", 10),
    ...(execPath ? { executablePath: execPath } : {}),
  };
  console.log("[PDFSERVICE] chrome exec:", execPath || "(auto)");
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4", printBackground: true, preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}

// --- Routes ---
app.get("/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

app.post("/generate-pdf", async (req, res) => {
  const rid = req.get("X-Request-ID") || crypto.randomUUID();
  const wantAsyncMail = (String(process.env.EMAIL_ASYNC || "true").toLowerCase() !== "false");
  const returnJson = _bool(process.env.RETURN_JSON_BASE64, String(req.headers["accept"] || "").includes("application/json"));

  let userEmail = req.get("X-User-Email") || "";
  let subject = req.get("X-Subject") || process.env.SUBJECT || "Ihr KI-Status-Report";
  const reqLang = (req.get("X-Lang") || "").toLowerCase();

  let html = "";
  const ctype = String(req.headers["content-type"] || "").toLowerCase();
  if (typeof req.body === "string" && ctype.startsWith("text/")) {
    html = req.body;
  } else if (req.is("application/json")) {
    const { html: h, to, subject: subj } = req.body || {};
    html = String(h || "");
    if (to) userEmail = String(to);
    if (subj) subject = String(subj);
  } else {
    return res.status(415).json({ ok: false, error: "Unsupported Content-Type", rid });
  }
  if (!html || html.length < 20) return res.status(400).json({ ok: false, error: "Empty html", rid });

  console.log("[PDFSERVICE] Render start", { rid, len: html.length, userEmail, lang: reqLang || null });
  try {
    const sanitized = sanitizeHtml(html);
    const pdfBuffer = await renderPdf(sanitized);

    if (returnJson) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({
        ok: true,
        rid, status: "ok",
        data: { mail: wantAsyncMail ? "queued" : "sent-or-skipped", len: pdfBuffer.length },
        pdf_base64: pdfBuffer.toString("base64"),
      });
    } else {
      res.setHeader("X-Mail-Mode", wantAsyncMail ? "async" : "sync");
      res.setHeader("X-Mail-Engine", process.env.SENDGRID_API_KEY ? "sendgrid-or-smtp" : "smtp");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=${ascii("KI-Status-Report.pdf")}`);
      res.status(200).send(pdfBuffer);
    }

    if (wantAsyncMail) {
      setTimeout(async () => {
        try {
          await sendMailSafe({
            to: userEmail, subject, text: reqLang.startsWith("de") ? "Ihr Report ist angehängt." : "Your report is attached.",
            pdfBuffer, filename: "KI-Status-Report.pdf", replyTo: userEmail || undefined
          });
        } catch (e) { console.error("[PDFSERVICE] async mail error:", e?.message || e); }
      }, 10);
    }
  } catch (e) {
    console.error("[PDFSERVICE] render error", e);
    const msg = String(e && e.message || e);
    return res.status(500).json({ ok: false, rid, error: "Failed to launch or render PDF: " + msg });
  }
});

app.listen(PORT, () => console.log(`PDF-Service läuft auf Port ${PORT}`));
