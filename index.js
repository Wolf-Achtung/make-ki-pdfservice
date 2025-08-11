import express from "express";
// Verwende puppeteer-core, um nur die Steuerbibliothek zu laden. Der eigentliche
// Chromium‑Browser wird vom Basis‑Image bereitgestellt (via CHROMIUM_PATH).
// Verwende puppeteer-core zusammen mit @sparticuz/chromium. Die
// Bibliothek @sparticuz/chromium liefert eine portable Chrome‑Binary,
// die serverless‑freundlich ist. Puppeteer‑core steuert diesen
// Browser. Wir verzichten dadurch auf eine systemweite Chrome‑Installation.
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors"; // <--- NEU
// Optional: SMTP email support.  When configured via environment
// variables, the PDF service can automatically forward a copy of the
// generated report to an administrator.  The following import is only
// used when ADMIN_EMAIL is set.
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS aktivieren: Freigabe für dein Frontend!
// CORS aktivieren: Freigabe für dein Frontend!
// Neben "Content-Type" müssen hier alle Header aufgeführt werden, die die
// Anwendung akzeptieren soll. Für den Versand der Benutzer‑Adresse im
// X-User-Email‑Header erweitern wir die Liste entsprechend.
app.use(cors({
  origin: "https://make.ki-sicherheit.jetzt", // Nur deine Domain freigeben
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-User-Email"]
}));

app.use(bodyParser.text({ type: '*/*', limit: '5mb' }));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

const TEMPLATE_PATH = path.join(__dirname, "templates/pdf_template.html");

// Simple health check
app.get("/", (req, res) => {
  res.send("KI-Readiness PDF Service läuft!");
});

app.post("/generate-pdf", async (req, res) => {
  try {
    const reportHtml = req.body;

    // Tipp: reportHtml sollte dein vollständiges HTML für den Report sein
    // Starte den Browser. `executablePath` verweist auf den Chrome aus dem Basis‑Image.
    // Starte den Browser. chromium.args und chromium.executablePath
    // stammen aus @sparticuz/chromium und liefern die korrekten
    // Einstellungen für die serverless‑Umgebung. Kein weiteres
    // System‑Chrome erforderlich.
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();

    // Asset-Pfade fixen: Falls Logos im Template relativ sind, müssen sie z. B. "/templates/ki-sicherheit-logo.png" heißen
    await page.setContent(reportHtml, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "28mm", bottom: "24mm", left: "18mm", right: "18mm" }
    });

    await browser.close();

    // -----------------------------------------------------------------------
    // ✉️  Optional e‑mail forwarding for administrators
    //
    // If an ADMIN_EMAIL environment variable is defined, the service will
    // attempt to forward the generated PDF report as an e‑mail attachment.
    // The sender and SMTP credentials can be customized via the following
    // environment variables:
    //   SMTP_HOST   – hostname of the SMTP server
    //   SMTP_PORT   – port number (defaults to 465 when secure, 587 otherwise)
    //   SMTP_USER   – SMTP username
    //   SMTP_PASS   – SMTP password
    //   SMTP_SECURE – "true" to enable TLS/SSL on the specified port
    //   SMTP_FROM   – optional "from" address (fallbacks to ADMIN_EMAIL)
    //
    // Additionally, the client may specify the end‑user’s email address in
    // the `X-User-Email` header to include it in the subject or body of the
    // administrative notification.  This header is optional and has no
    // functional effect on the PDF generation itself.
    const adminEmail = process.env.ADMIN_EMAIL;
    const userEmail = req.headers["x-user-email"] || "";
    if (adminEmail || userEmail) {
      try {
        const smtpHost = process.env.SMTP_HOST || "smtp.example.com";
        const smtpPort = parseInt(process.env.SMTP_PORT || (process.env.SMTP_SECURE === "true" ? "465" : "587"), 10);
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpSecure = process.env.SMTP_SECURE === "true";
        const smtpFrom = process.env.SMTP_FROM || adminEmail || userEmail;
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
        });
        // Versende an Admin (sofern konfiguriert)
        if (adminEmail) {
          const subjectAdmin = userEmail
            ? `Neuer KI‑Readiness‑Report von ${userEmail}`
            : `Neuer KI‑Readiness‑Report`;
          const textBodyAdmin = userEmail
            ? `Es wurde ein neuer KI‑Readiness‑Report von ${userEmail} erstellt. Im Anhang findest du das PDF.`
            : `Es wurde ein neuer KI‑Readiness‑Report erstellt. Im Anhang findest du das PDF.`;
          await transporter.sendMail({
            from: smtpFrom,
            to: adminEmail,
            subject: subjectAdmin,
            text: textBodyAdmin,
            attachments: [
              {
                filename: "KI-Readiness-Report.pdf",
                content: pdfBuffer,
              },
            ],
          });
        }
        // Versende an Benutzer, falls E‑Mail übermittelt wurde
        if (userEmail) {
          const subjectUser = `Ihr KI‑Readiness‑Report`;
          const textBodyUser = `Vielen Dank für Ihre Angaben. Anbei erhalten Sie Ihren individuellen KI‑Readiness‑Report im PDF‑Format.`;
          await transporter.sendMail({
            from: smtpFrom,
            to: userEmail,
            subject: subjectUser,
            text: textBodyUser,
            attachments: [
              {
                filename: "KI-Readiness-Report.pdf",
                content: pdfBuffer,
              },
            ],
          });
        }
      } catch (emailErr) {
        // Log but do not fail the PDF request if e‑mail delivery fails.
        console.error("[PDFSERVICE] Fehler beim Senden der E‑Mail:", emailErr);
      }
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"KI-Readiness-Report.pdf\""
    });
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).send("Fehler beim PDF-Export: " + e.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("PDF-Service läuft auf Port", PORT));
