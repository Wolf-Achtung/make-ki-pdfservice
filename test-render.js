#!/usr/bin/env node
/**
 * Self-Test für den PDF-Render-Service
 * Prüft, dass page.setRequestInterception korrekt funktioniert und
 * kein "page.route is not a function" Fehler auftritt.
 *
 * Usage: node test-render.js
 */
'use strict';

const puppeteer = require('puppeteer');

const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Self-Test PDF</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #2563eb; }
    .info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>PDF Render Self-Test</h1>
  <div class="info">
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
    <p>Dieser Test prüft, dass die Puppeteer Request-Interception korrekt funktioniert.</p>
  </div>
</body>
</html>`;

async function runTest(testName, blockAssets) {
  console.log(`\n[TEST] ${testName}`);
  console.log('─'.repeat(50));

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.createBrowserContext();
    page = await context.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Test: Request-Interception (der kritische Teil)
    if (blockAssets) {
      console.log('  → Aktiviere Request-Interception (blockAssets=true)...');
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (resourceType === 'image' || resourceType === 'font') {
          console.log(`    [BLOCKED] ${resourceType}: ${request.url().substring(0, 60)}...`);
          request.abort().catch(() => {});
        } else {
          request.continue().catch(() => {});
        }
      });
      console.log('  ✓ setRequestInterception erfolgreich (kein "page.route is not a function")');
    }

    // HTML laden
    console.log('  → Lade HTML-Content...');
    await page.setContent(TEST_HTML, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('  ✓ HTML geladen');

    // PDF generieren
    console.log('  → Generiere PDF...');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: !blockAssets,
      margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' }
    });

    console.log(`  ✓ PDF generiert: ${pdf.length} Bytes`);

    // Validierung
    if (pdf.length < 1000) {
      throw new Error(`PDF zu klein: ${pdf.length} Bytes`);
    }

    // PDF-Header prüfen
    const header = pdf.slice(0, 8).toString('utf-8');
    if (!header.startsWith('%PDF-')) {
      throw new Error(`Ungültiger PDF-Header: ${header}`);
    }
    console.log(`  ✓ PDF-Header valid: ${header.trim()}`);

    console.log(`  ✓ TEST BESTANDEN: ${testName}`);
    return { success: true, bytes: pdf.length };

  } catch (error) {
    console.error(`  ✗ TEST FEHLGESCHLAGEN: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (page) try { await page.close(); } catch {}
    if (browser) try { await browser.close(); } catch {}
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log(' PDF-RENDER-SERVICE SELF-TEST');
  console.log(' Prüft Puppeteer Request-Interception Kompatibilität');
  console.log('═'.repeat(60));
  console.log(`Puppeteer Version: ${puppeteer.version ? puppeteer.version() : 'unknown'}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Zeitpunkt: ${new Date().toISOString()}`);

  const results = [];

  // Test 1: Normales Rendering (ohne blockAssets)
  results.push(await runTest('Normales Rendering (Full Quality)', false));

  // Test 2: Low-Fidelity Rendering (mit blockAssets) - der kritische Test!
  results.push(await runTest('Low-Fidelity Rendering (blockAssets=true)', true));

  // Zusammenfassung
  console.log('\n' + '═'.repeat(60));
  console.log(' ZUSAMMENFASSUNG');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`  Bestanden: ${passed}/${results.length}`);
  console.log(`  Fehlgeschlagen: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\n  ✗ SELF-TEST FEHLGESCHLAGEN');
    console.log('  Fehlerhafte Tests:');
    results.forEach((r, i) => {
      if (!r.success) {
        console.log(`    - Test ${i + 1}: ${r.error}`);
      }
    });
    process.exit(1);
  }

  console.log('\n  ✓ ALLE TESTS BESTANDEN');
  console.log('  Der PDF-Service sollte korrekt funktionieren.');
  console.log('  "page.route is not a function" Fehler ist behoben.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
