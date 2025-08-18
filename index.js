
// Simple PDF service with email sending
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import { readFile } from "fs/promises";
import bodyParser from "body-parser";
import crypto from "crypto";

import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

// Body limits
app.use(bodyParser.json({ limit: process.env.JSON_LIMIT || "10mb" }));
app.use(bodyParser.text({ type: ["text/*", "application/xhtml+xml"], limit: process.env.HTML_LIMIT || "10mb" }));
app.use(cors({ origin: "*"}));

// Health
app.get("/health", (req,res)=>res.json({ok:true,time:new Date().toISOString()}));

// Create nodemailer transporter
function makeTransport() {
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const port = parseInt(process.env.SMTP_PORT || (secure ? "465" : "587"), 10);
  const cfg = {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
      user: process.env.SMTP_USER, pass: process.env.SMTP_PASS
    } : undefined,
    logger: process.env.SMTP_DEBUG === "true",
    debug: process.env.SMTP_DEBUG === "true",
  };
  return nodemailer.createTransport(cfg);
}

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox','--disable-setuid-sandbox'],
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
  });
  await browser.close();
  return pdf;
}

// Main entry
app.post("/generate-pdf", async (req, res) => {
  const rid = req.get("X-Request-ID") || crypto.randomUUID();
  const adminEmail = process.env.ADMIN_EMAIL || "";
  let userEmail = req.get("X-User-Email") || "";

  let html = "";
  let jsonMode = false;

  if (typeof req.body === "string" && req.headers["content-type"]?.startsWith("text/")) {
    html = req.body;
  } else if (req.is("application/json")) {
    jsonMode = true;
    const { html: h, to } = req.body || {};
    html = h || "";
    if (to) userEmail = String(to);
  } else {
    return res.status(415).json({ ok:false, error:"Unsupported Content-Type" });
  }

  if (!html || html.length < 20) {
    return res.status(400).json({ ok:false, error:"Empty html" });
  }

  console.log("[PDFSERVICE] Render start", { rid, len: html.length, userEmail });

  try {
    const pdfBuffer = await renderPdf(html);
    console.log("[PDFSERVICE] Render ok", { rid, size: pdfBuffer.length });

    // Email send (optional)
    const transporter = makeTransport();
    const from = process.env.SMTP_FROM || (process.env.SMTP_USER || "pdf@localhost");
    const replyTo = process.env.SMTP_REPLY_TO || undefined;

    const subjectAdmin = "KI-Readiness Report erzeugt";
    const subjectUser = "Ihr KI-Readiness-Report";

    if (adminEmail) {
      await transporter.sendMail({
        from, replyTo,
        to: adminEmail,
        subject: subjectAdmin,
        text: `Ein neuer Report wurde erstellt. RID=${rid}`,
        attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
      });
      console.log("[PDFSERVICE] Mail an Admin verschickt:", adminEmail);
    }
    if (userEmail) {
      await transporter.sendMail({
        from, replyTo,
        to: userEmail,
        subject: subjectUser,
        text: "Vielen Dank. Anbei Ihr individueller KI-Readiness-Report.",
        attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
      });
      console.log("[PDFSERVICE] Mail an Nutzer verschickt:", userEmail);
    }

    // Always respond with the PDF for testing convenience
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=KI-Readiness-Report.pdf");
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error("[PDFSERVICE] render/send error", e);
    return res.status(500).json({ ok:false, error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`PDF-Service läuft auf Port ${PORT}`);
});
