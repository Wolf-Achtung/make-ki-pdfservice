import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

// Größere Bodies zulassen (HTML mit Base64 kann groß sein)
app.use(express.text({ type: ["text/*", "application/xhtml+xml", "*/*"], limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: "https://make.ki-sicherheit.jetzt",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","X-User-Email"]
}));

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post("/generate-pdf", async (req, res) => {
  try {
    const userEmail = req.get("X-User-Email") || req.body?.to || "";
    const html = typeof req.body === "string" ? req.body : (req.body?.html || "");
    console.log("POST /generate-pdf", { len: (html||"").length, userEmail });

    if (!html) return res.status(400).json({ error: "no html" });

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "28mm", bottom: "24mm", left: "18mm", right: "18mm" }
    });
    await browser.close();

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail || userEmail) {
      try {
        const secure = String(process.env.SMTP_SECURE).toLowerCase()==="true";
        const port = parseInt(process.env.SMTP_PORT || (secure ? "465" : "587"), 10);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure,
          auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
            user: process.env.SMTP_USER, pass: process.env.SMTP_PASS
          } : undefined,
        });
        const from = process.env.SMTP_FROM || adminEmail || userEmail;
        if (adminEmail) {
          await transporter.sendMail({
            from, to: adminEmail,
            subject: userEmail ? `Neuer KI-Readiness-Report von ${userEmail}` : "Neuer KI-Readiness-Report",
            text: userEmail
              ? `Es wurde ein neuer KI-Readiness-Report von ${userEmail} erstellt.`
              : `Es wurde ein neuer KI-Readiness-Report erstellt.`,
            attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
          });
        }
        if (userEmail) {
          await transporter.sendMail({
            from, to: userEmail,
            subject: "Ihr KI-Readiness-Report",
            text: "Vielen Dank. Anbei Ihr individueller KI-Readiness-Report.",
            attachments: [{ filename: "KI-Readiness-Report.pdf", content: pdfBuffer }],
          });
        }
      } catch (emailErr) {
        console.error("[PDFSERVICE] E-Mail-Fehler:", emailErr);
      }
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"KI-Readiness-Report.pdf\""
    });
    res.send(pdfBuffer);
  } catch (e) {
    console.error("ERR /generate-pdf", e);
    res.status(500).json({ error: "Fehler beim PDF-Export", message: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("PDF-Service läuft auf Port", PORT));
