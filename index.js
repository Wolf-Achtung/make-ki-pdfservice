// index.js — PDF-Service (Gold-Standard, async mail + hardened SMTP)
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

// ------------------------- Helpers -------------------------
function _bool(env, def = false) {
  const v = String(env ?? "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

// ASCII-Sanitizer: entfernt Nicht-ASCII (z. B. für SendGrid-Header)
const ascii = (s) => (s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "");

// ------------------------- SMTP -----------------------------
function makeTransport({ alternate = false } = {}) {
  // Standard: STARTTLS (587). Alternate probiert implicit TLS (465).
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

async function sendMailSafe({ to, subject, text, pdfBuffer, filename = "KI-Status-Report.pdf" }) {
  const emailEnabled = !_bool(process.env.EMAIL_ENABLED, true) ? false : true;
  let meta = { admin: "skip", user: "skip", engine: "smtp", attempt: 0, alternateTried: false };
  if (!emailEnabled) return meta;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
  const replyTo = process.env.SMTP_REPLY_TO || undefined;
  const adminEmail = process.env.ADMIN_EMAIL || "";

  async function _trySend(t) {
    const tasks = [];
    if (adminEmail) {
      tasks.push(
        t.sendMail({
          from, replyTo, to: adminEmail,
          subject: ascii("KI-Status Report erzeugt"),
          text: ascii("Neuer Report wurde erstellt."),
          attachments: [{ filename: ascii(filename), content: pdfBuffer, contentType: "application/pdf" }],
        }).then(() => (meta.admin = "ok"))
         .catch((err) => { meta.admin = "fail"; throw err; })
      );
    }
    if (to) {
      tasks.push(
        t.sendMail({
          from, replyTo, to,
          subject: ascii(subject || "Ihr KI-Status-Report"),
          text: ascii(text || "Ihr Report ist angehängt."),
          attachments: [{ filename: ascii(filename), content: pdfBuffer, contentType: "application/pdf" }],
        }).then(() => (meta.user = "ok"))
         .catch((err) => { meta.user = "fail"; throw err; })
      );
    }
    await Promise.all(tasks.map(p => p.catch(e => { throw e; })));
  }

  // 1) Primär (587/STARTTLS)
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

  // 2) Alternate (465⇄587 / secure invertiert)
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

  // 3) SendGrid-Fallback (ASCII-sicher)
  if (process.env.SENDGRID_API_KEY) {
    try {
      meta.engine = "sendgrid";
      meta.attempt = meta.attempt ? meta.attempt + 1 : 1;
      const ok = await sendViaSendgrid({
        to,
        subject: ascii(subject || "KI Status Report"),
        text: ascii(text || "Ihr Report ist angehängt."),
        pdfBuffer,
        filename: ascii(filename || "KI-Status-Report.pdf"),
        adminEmail: process.env.ADMIN_EMAIL || ""
      });
      if (ok) {
        if (process.env.ADMIN_EMAIL) meta.admin = "ok";
        if (to) meta.user = "ok";
        return meta;
      }
    } catch (e3) {
      console.error("[PDFSERVICE] SendGrid error:", e3?.message || e3);
    }
  }

  return meta; // PDF ist trotzdem generiert
}

async function sendViaSendgrid({ to, adminEmail, subject, text, pdfBuffer, filename }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;

  // Nur E-Mail als From (ohne Display-Name!)
  const from = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";

  // sanitize from-address to avoid non-ASCII characters in SendGrid payload
  const sanitizedFrom = ascii(from);


  const personalizations = [];
  if (adminEmail) personalizations.push({ to: [{ email: adminEmail }] });
  if (to) personalizations.push({ to: [{ email: to }] });
  if (!personalizations.length) return true;

  const payload = {
    personalizations,
    from: { email: sanitizedFrom },
    subject: ascii(subject || "KI Status Report"),
    content: [{ type: "text/plain", value: ascii(text || "Ihr Report ist angehängt.") }],
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

// ------------------------- Diagnose -------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/env", (_req, res) => {
  let exec = null;
  try { exec = puppeteer.executablePath(); } catch {}
  const fallbacks = ["/usr/bin/chromium","/usr/bin/chromium-browser","/usr/bin/google-chrome","/usr/bin/google-chrome-stable"].filter((p) => fs.existsSync(p));
  res.json({ ok: true, puppeteerExecutablePath: exec || null, envExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || null, fallbacksExisting: fallbacks });
});

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

// ------------------------- Core Route ------------------------------
app.post("/generate-pdf", async (req, res) => {
  const rid = req.get("X-Request-ID") || crypto.randomUUID();
  const wantAsyncMail = (String(process.env.EMAIL_ASYNC || "true").toLowerCase() !== "false");

  let userEmail = req.get("X-User-Email") || "";
  let subject = req.get("X-Subject") || process.env.SUBJECT || "Ihr KI-Status-Report";
  const reqLang = (req.get("X-Lang") || "").toLowerCase();

  // Body lesen
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

  // --- ASYNC MAIL: PDF sofort senden, Mail im Hintergrund ---
  const txt = reqLang === "en"
    ? "Thank you. Your individual AI Readiness report is attached."
    : "Vielen Dank. Anbei Ihr individueller KI Status Report.";

  res.setHeader("X-Mail-Mode", wantAsyncMail ? "async" : "sync");
  res.setHeader("X-Mail-Engine", process.env.SENDGRID_API_KEY ? "sendgrid-or-smtp" : "smtp");

  if (wantAsyncMail) {
    res.setHeader("X-Email-Admin", "queued");
    res.setHeader("X-Email-User", userEmail ? "queued" : "skip");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${ascii("KI-Status-Report.pdf")}`);
    // Antwort JETZT senden
    res.status(200).send(pdfBuffer);

    // Mailversand „fire-and-forget“
    setTimeout(async () => {
      try {
        await sendMailSafe({ to: userEmail, subject, text: txt, pdfBuffer, filename: "KI-Status-Report.pdf" });
      } catch (e) {
        console.error("[PDFSERVICE] async mail error:", e?.message || e);
      }
    }, 10);

    return; // Route ist fertig
  }

  // --- SYNC MAIL (nur wenn EMAIL_ASYNC=false explizit gesetzt) ---
  let mailMeta = { admin: "skip", user: "skip" };
  try {
    mailMeta = await sendMailSafe({ to: userEmail, subject, text: txt, pdfBuffer, filename: "KI-Status-Report.pdf" });
  } catch (e) {
    console.error("[PDFSERVICE] mail pipeline error:", e?.message || e);
  }

  res.setHeader("X-Email-Admin", mailMeta.admin || "skip");
  res.setHeader("X-Email-User", mailMeta.user || "skip");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${ascii("KI-Status-Report.pdf")}`);
  return res.status(200).send(pdfBuffer);
});

app.listen(PORT, () => console.log(`PDF-Service läuft auf Port ${PORT}`));
