// index.js — PDF-Service (Gold-Standard)
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import crypto from "crypto";
import fs from "fs";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

// Body-Limits konfigurierbar
app.use(bodyParser.json({ limit: process.env.JSON_LIMIT || "10mb" }));
app.use(
  bodyParser.text({
    type: ["text/*", "application/xhtml+xml"],
    limit: process.env.HTML_LIMIT || "10mb",
  })
);
app.use(cors({ origin: "*" }));

// ---------- Helpers ----------
function makeTransport() {
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const port = parseInt(process.env.SMTP_PORT || (secure ? "465" : "587"), 10);

  if (!process.env.SMTP_HOST) {
    // Kein SMTP → Stub (schluckt)
    return { sendMail: async () => ({ accepted: [], rejected: ["(skipped: SMTP_HOST not set)"] }) };
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    logger: process.env.SMTP_DEBUG === "true",
    debug: process.env.SMTP_DEBUG === "true",
  });
}

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

  const fallbacks = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const p of fallbacks) if (fs.existsSync(p)) return p;
  return null; // Puppeteer auto
}

async function renderPdf(html) {
  sanitizePuppeteerEnv();
  const execPath = await resolveChromePath();

  const launchOpts = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-web-security",
    ],
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
// ---------- Routes ----------
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/env", (_req, res) => {
  let exec = null;
  try { exec = puppeteer.executablePath(); } catch {}
  const fallbacks = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter((p) => fs.existsSync(p));
  res.json({
    ok: true,
    puppeteerExecutablePath: exec || null,
    envExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || null,
    fallbacksExisting: fallbacks,
  });
});

app.post("/generate-pdf", async (req, res) => {
  const rid = req.get("X-Request-ID") || crypto.randomUUID();
  const emailEnabled = String(process.env.EMAIL_ENABLED || "true").toLowerCase() !== "false";
  const emailStrict = String(process.env.EMAIL_STRICT || "false").toLowerCase() === "true";

  const adminEmail = process.env.ADMIN_EMAIL || "";
  let userEmail = req.get("X-User-Email") || "";
  let subject = req.get("X-Subject") || process.env.SUBJECT || "Ihr KI-Readiness-Report";
  const reqLang = (req.get("X-Lang") || "").toLowerCase();

  // Input: text/html ODER JSON { html, to, subject, lang }
  let html = "";
  const ctype = String(req.headers["content-type"] || "").toLowerCase();

  if (typeof req.body === "string" && ctype.startsWith("text/")) {
    html = req.body;
  } else if (req.is("application/json")) {
    const { html: h, to, subject: subj, lang } = req.body || {};
    html = h || "";
    if (to) userEmail = String(to);
    if (subj) subject = String(subj);
    if (lang) subject = subject; // (Platzhalter – falls du Betreff nach Sprache variieren willst)
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

  // Mails
  let adminStatus = "skip", userStatus = "skip";
  if (emailEnabled) {
    try {
      const transporter = makeTransport();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || "pdf@localhost";
      const replyTo = process.env.SMTP_REPLY_TO || undefined;

      const tasks = [];
      if (adminEmail) {
        tasks.push(
          transporter
            .sendMail({
              from, replyTo, to: adminEmail,
              subject: "KI-Readiness Report erzeugt",
              text: `Ein neuer Report wurde erstellt. RID=${rid}`,
              attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
            })
            .then(() => { adminStatus = "ok"; console.log("[PDFSERVICE] Admin-Mail ok:", adminEmail); })
            .catch((err) => { adminStatus = "fail"; console.error("[PDFSERVICE] Admin-Mail Fehler:", err?.message || err); })
        );
      }
      if (userEmail) {
        tasks.push(
          transporter
            .sendMail({
              from, replyTo, to: userEmail,
              subject,
              text: reqLang === "en"
                ? "Thank you. Your individual AI Readiness report is attached."
                : "Vielen Dank. Anbei Ihr individueller KI-Readiness-Report.",
              attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
            })
            .then(() => { userStatus = "ok"; console.log("[PDFSERVICE] Nutzer-Mail ok:", userEmail); })
            .catch((err) => { userStatus = "fail"; console.error("[PDFSERVICE] Nutzer-Mail Fehler:", err?.message || err); })
        );
      }
      await Promise.allSettled(tasks);
    } catch (e) {
      console.error("[PDFSERVICE] sendMail setup error:", e?.message || e);
      if (emailStrict) return res.status(502).json({ ok: false, error: "Email send failed", admin: adminStatus, user: userStatus });
    }
  }

  // PDF immer liefern; Mail-Status in Headern
  res.setHeader("X-Email-Admin", adminStatus);
  res.setHeader("X-Email-User", userStatus);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=KI-Readiness-Report.pdf");
  return res.status(200).send(pdfBuffer);
});

app.listen(PORT, () => console.log(`PDF-Service läuft auf Port ${PORT}`));
