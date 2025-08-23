// index.js — PDF-Service (Gold-Standard, hardened SMTP + SendGrid fallback)
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import crypto from "crypto";
import fs from "fs";
import puppeteer from "puppeteer";

// ------------------------- App & Middleware -------------------------
const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: process.env.JSON_LIMIT || "10mb" }));
app.use(bodyParser.text({ type: ["text/*", "application/xhtml+xml"], limit: process.env.HTML_LIMIT || "10mb" }));
app.use(cors({ origin: "*" }));

// ------------------------- SMTP Helpers -----------------------------
function _bool(env, def = false) {
  const v = String(env ?? "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

function makeTransport({ alternate = false } = {}) {
  // Primärkonfiguration aus ENV
  const wantSecure = _bool(process.env.SMTP_SECURE, true);
  const wantPort = parseInt(process.env.SMTP_PORT || (wantSecure ? "465" : "587"), 10);

  // Fallback-Konfiguration: Port/Secure invertieren
  const secure = alternate ? !wantSecure : wantSecure;
  const port = alternate ? (wantSecure ? 587 : 465) : wantPort;

  if (!process.env.SMTP_HOST) {
    // Kein SMTP: Stub-Transport
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
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    pool: false,
    ...timeouts,
    logger: _bool(process.env.SMTP_DEBUG),
    debug: _bool(process.env.SMTP_DEBUG),
  });

  transporter.__info = { host: process.env.SMTP_HOST, port, secure, ...timeouts };
  return transporter;
}

async function verifySmtp(transporter) {
  try {
    if (transporter.__stub) return { ok: true, stub: true };
    await transporter.verify();
    return { ok: true, info: transporter.__info };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), info: transporter.__info };
  }
}

async function sendMailSafe({ to, subject, text, pdfBuffer, filename = "KI-Readiness-Report.pdf" }) {
  const emailEnabled = !_bool(process.env.EMAIL_ENABLED, true) ? false : true;

  let meta = {
    admin: "skip",
    user: "skip",
    engine: "smtp",
    attempt: 0,
    alternateTried: false,
  };

  if (!emailEnabled) return meta;

  // 1) SMTP Primär
  let transporter = makeTransport();
  let v = await verifySmtp(transporter);
  if (!v.ok) {
    console.error("[PDFSERVICE] SMTP verify failed:", v);
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
  const replyTo = process.env.SMTP_REPLY_TO || undefined;
  const adminEmail = process.env.ADMIN_EMAIL || "";

  async function _trySend(t) {
    const tasks = [];
    if (adminEmail) {
      tasks.push(
        t
          .sendMail({
            from, replyTo, to: adminEmail,
            subject: "KI-Readiness Report erzeugt",
            text: "Neuer Report wurde erstellt.",
            attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
          })
          .then(() => (meta.admin = "ok"))
          .catch((err) => {
            meta.admin = "fail";
            throw err;
          })
      );
    }
    if (to) {
      tasks.push(
        t
          .sendMail({
            from, replyTo, to,
            subject,
            text,
            attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
          })
          .then(() => (meta.user = "ok"))
          .catch((err) => {
            meta.user = "fail";
            throw err;
          })
      );
    }
    await Promise.all(tasks.map(p => p.catch(e => { throw e; })));
  }

  try {
    meta.attempt = 1;
    await _trySend(transporter);
    return meta;
  } catch (err) {
    console.error("[PDFSERVICE] SMTP primary error:", err?.message || err);
  }

  // 2) SMTP Alternate (invertiere Port/secure), wenn erlaubt
  if (_bool(process.env.SMTP_TRY_ALTERNATE, true)) {
    try {
      meta.engine = "smtp";
      meta.attempt = 2;
      meta.alternateTried = true;
      const alt = makeTransport({ alternate: true });
      const v2 = await verifySmtp(alt);
      if (!v2.ok) console.error("[PDFSERVICE] SMTP alternate verify failed:", v2);
      await _trySend(alt);
      return meta;
    } catch (err2) {
      console.error("[PDFSERVICE] SMTP alternate error:", err2?.message || err2);
    }
  }

  // 3) SendGrid-Fallback (falls API-Key vorhanden)
  if (process.env.SENDGRID_API_KEY) {
    try {
      meta.engine = "sendgrid";
      meta.attempt = meta.attempt ? meta.attempt + 1 : 1;
      const ok = await sendViaSendgrid({ to, adminEmail, subject, text, pdfBuffer, filename });
      if (ok) {
        if (adminEmail) meta.admin = "ok";
        if (to) meta.user = "ok";
        return meta;
      }
    } catch (e) {
      console.error("[PDFSERVICE] SendGrid error:", e?.message || e);
    }
  }

  // 4) Am Ende Status zurück (Mail ggf. fail/skip); PDF wurde trotzdem erzeugt
  return meta;
}

async function sendViaSendgrid({ to, adminEmail, subject, text, pdfBuffer, filename }) {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
  const personalizations = [];
  if (adminEmail) personalizations.push({ to: [{ email: adminEmail }] });
  if (to) personalizations.push({ to: [{ email: to }] });

  if (!personalizations.length) return true; // nichts zu senden

  const payload = {
    personalizations,
    from: { email: from },
    subject,
    content: [{ type: "text/plain", value: text || "Ihr Report ist angehängt." }],
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (resp.status === 202) return true;
  const errText = await resp.text().catch(() => "");
  console.error("[PDFSERVICE] SendGrid response:", resp.status, errText);
  return false;
}

// ------------------------- Puppeteer -------------------------------
function sanitizePuppeteerEnv() {
  const removed = [];
  for (const key of ["PUPPETEER_EXECUTABLE_PATH", "CHROME_PATH"]) {
    const p = process.env[key];
    if (p && !fs.existsSync(p)) {
      removed.push({ [key]: p });
      delete process.env[key];
    }
  }
  if (removed.length) console.warn("[PDFSERVICE] removed invalid exec paths:", removed);
}

async function resolveChromePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  const fallbacks = ["/usr/bin/chromium","/usr/bin/chromium-browser","/usr/bin/google-chrome","/usr/bin/google-chrome-stable"];
  for (const p of fallbacks) if (fs.existsSync(p)) return p;
  return null;
}

async function renderPdf(html) {
  sanitizePuppeteerEnv();
  const execPath = await resolveChromePath();
  const launchOpts = {
    headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--disable-gpu","--disable-web-security"],
    protocolTimeout: parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT || "180000", 10),
  };
  if (execPath) launchOpts.executablePath = execPath;

  console.log("[PDFSERVICE] chrome exec:", execPath || "(auto via puppeteer)");

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// ------------------------- Routes ----------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/env", (_req, res) => {
  let exec = null;
  try { exec = puppeteer.executablePath(); } catch {}
  const fallbacks = ["/usr/bin/chromium","/usr/bin/chromium-browser","/usr/bin/google-chrome","/usr/bin/google-chrome-stable"].filter((p) => fs.existsSync(p));
  res.json({ ok: true, puppeteerExecutablePath: exec || null, envExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || null, fallbacksExisting: fallbacks });
});

// SMTP Diagnose
app.get("/smtp/verify", async (_req, res) => {
  const t = makeTransport();
  const v = await verifySmtp(t);
  res.json(v);
});

app.get("/smtp/config", (_req, res) => {
  const t1 = makeTransport();
  const t2 = makeTransport({ alternate: true });
  res.json({ primary: t1.__info || {}, alternate: t2.__info || {}, sendgrid: !!process.env.SENDGRID_API_KEY });
});

app.post("/generate-pdf", async (req, res) => {
  const rid = req.get("X-Request-ID") || crypto.randomUUID();
  const emailEnabled = !_bool(process.env.EMAIL_ENABLED, true) ? false : true;

  let userEmail = req.get("X-User-Email") || "";
  let subject = req.get("X-Subject") || process.env.SUBJECT || "Ihr KI-Readiness-Report";
  const reqLang = (req.get("X-Lang") || "").toLowerCase();

  // Input Body
  let html = "";
  const ctype = String(req.headers["content-type"] || "").toLowerCase();
  if (typeof req.body === "string" && ctype.startsWith("text/")) {
    html = req.body;
  } else if (req.is("application/json")) {
    const { html: h, to, subject: subj, lang } = req.body || {};
    html = h || "";
    if (to) userEmail = String(to);
    if (subj) subject = String(subj);
  } else {
    return res.status(415).json({ ok: false, error: "Unsupported Content-Type" });
  }

  if (!html || html.length < 20) return res.status(400).json({ ok: false, error: "Empty html" });

  console.log("[PDFSERVICE] Render start", { rid, len: html.length, userEmail, lang: reqLang || null });

  let pdfBuffer;
  try {
    pdfBuffer = await renderPdf(html);
    console.log("[PDFSERVICE] Render ok", { rid, size: pdfBuffer.length });
  } catch (e) {
    console.error("[PDFSERVICE] render error", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }

  // Mails (robust, mit Alternate/SendGrid-Fallback)
  let mailMeta = { admin: "skip", user: "skip" };
  if (emailEnabled) {
    try {
      const txt = reqLang === "en"
        ? "Thank you. Your individual AI Readiness report is attached."
        : "Vielen Dank. Anbei Ihr individueller KI-Readiness-Report.";
      mailMeta = await sendMailSafe({ to: userEmail, subject, text: txt, pdfBuffer, filename: "KI-Readiness-Report.pdf" });
    } catch (e) {
      console.error("[PDFSERVICE] mail pipeline error:", e?.message || e);
    }
  }

  // Response: PDF + Mail-Status
  res.setHeader("X-Email-Admin", mailMeta.admin || "skip");
  res.setHeader("X-Email-User", mailMeta.user || "skip");
  res.setHeader("X-Mail-Engine", mailMeta.engine || "smtp");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=KI-Readiness-Report.pdf");
  return res.status(200).send(pdfBuffer);
});

app.listen(PORT, () => console.log(`PDF-Service läuft auf Port ${PORT}`));
