import express from "express";
import puppeteer from "puppeteer";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

    // Passe hier die HTML-Quelle an: HTML aus Request oder aus Template-Datei
    // Tipp: reportHtml sollte dein vollständiges HTML für den Report sein, z. B. wie nach dem Rendern mit Variablen
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // Asset-Pfade fixen: Falls Logos im Template relativ sind, müssen sie z. B. "/templates/ki-sicherheit-logo.png" heißen
    await page.setContent(reportHtml, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "28mm", bottom: "24mm", left: "18mm", right: "18mm" }
    });

    await browser.close();

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
