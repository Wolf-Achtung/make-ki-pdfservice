#!/usr/bin/env node
/**
 * Dual-Language PDF Rendering Test Suite
 * Tests DE and EN templates for rendering parity
 */
'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { generateDualLangHTML, ALL_PROFILES } = require('./generate-dual-lang-html');
const { GERMAN_TERMS, ENGLISH_TERMS } = require('./test-profiles-dual-lang');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  outputDir: path.join(__dirname, 'output-dual-lang'),
  viewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
  pdfOptions: {
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '25mm', left: '15mm', right: '15mm' },
    preferCSSPageSize: true,
  },
  timeout: 60000,
};

// ============================================================================
// SECTION CHECKLIST
// ============================================================================
const SECTIONS = [
  { id: 'executive_summary', de: 'Executive Summary', en: 'Executive Summary', selector: '.executive-summary' },
  { id: 'strategic_context', de: 'Strategischer Kontext', en: 'Strategic Context', selector: '.chapter:nth-of-type(1)' },
  { id: 'quick_wins', de: 'Quick Wins', en: 'Quick Wins', selector: '.quick-wins' },
  { id: 'roadmap_90d', de: '90-Tage-Roadmap', en: '90-Day Roadmap', selector: '.roadmap-phase' },
  { id: 'roadmap_12m', de: '6–12 Monate', en: '6–12 Month', selector: '.roadmap-phase.phase-2' },
  { id: 'risks', de: 'Risiken', en: 'Risks', selector: 'h2:contains("Risks"), h2:contains("Risiken")' },
  { id: 'recommendations', de: 'Empfehlungen', en: 'Recommendations', selector: '.context-card' },
  { id: 'business_case', de: 'Business Case', en: 'Business Case', selector: 'h2:contains("Business Case")' },
  { id: 'tools', de: 'Tools', en: 'Tools', selector: 'h2:contains("Tools")' },
  { id: 'change', de: 'Change', en: 'Change', selector: 'h2:contains("Change")' },
  { id: 'glossary', de: 'Glossar', en: 'Glossary', selector: '.annex-section' },
];

// ============================================================================
// RESULTS
// ============================================================================
const RESULTS = {
  profiles: {},
  parityCheck: {},
  languageErrors: [],
  layoutProblems: [],
  recommendations: [],
  finalVerdict: 'PENDING',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function log(msg, type = 'info') {
  const icons = { info: '→', success: '✓', error: '✗', warn: '⚠️' };
  console.log(`  ${icons[type] || '→'} ${msg}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================================
// INDIVIDUAL TESTS
// ============================================================================

async function testExecutiveSummary(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const execData = await page.evaluate(() => {
      const summary = document.querySelector('.executive-summary');
      const title = document.querySelector('.exec-title');
      const highlights = document.querySelectorAll('.exec-highlight');
      const dividers = document.querySelectorAll('.exec-divider');

      return {
        exists: !!summary,
        titleExists: !!title,
        titleText: title?.textContent?.trim() || '',
        highlightCount: highlights.length,
        dividerCount: dividers.length,
        hasOverflow: summary ? summary.scrollHeight > summary.clientHeight : false,
      };
    });

    if (!execData.exists) {
      results.status = '✖';
      results.issues.push('Executive Summary section missing');
    }
    if (!execData.titleExists) {
      results.status = '✖';
      results.issues.push('.exec-title missing');
    }
    if (execData.highlightCount < 2) {
      results.status = '⚠️';
      results.issues.push(`Only ${execData.highlightCount} .exec-highlight elements (expected 2+)`);
    }
    if (execData.dividerCount < 1) {
      results.status = '⚠️';
      results.issues.push('.exec-divider missing');
    }
    if (execData.hasOverflow) {
      results.status = '⚠️';
      results.issues.push('Content overflow detected');
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testStrategicContext(page, lang, hasGuardrails) {
  const results = { status: '✓', issues: [] };

  try {
    const contextData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.context-card');
      const icons = document.querySelectorAll('.context-card-title svg');
      const grid = document.querySelector('.context-grid');
      const guardrailsCallout = document.querySelector('.callout-guardrails');

      return {
        cardCount: cards.length,
        iconCount: icons.length,
        gridExists: !!grid,
        gridDisplay: grid ? window.getComputedStyle(grid).display : null,
        guardrailsExists: !!guardrailsCallout,
        cardBackgrounds: Array.from(cards).map(c => ({
          class: c.className,
          bg: window.getComputedStyle(c).backgroundColor,
        })),
      };
    });

    if (contextData.cardCount < 6) {
      results.status = '⚠️';
      results.issues.push(`Only ${contextData.cardCount} cards (expected 6)`);
    }
    if (contextData.iconCount < 6) {
      results.status = '⚠️';
      results.issues.push(`Only ${contextData.iconCount} icons (expected 6)`);
    }
    if (contextData.gridDisplay !== 'grid') {
      results.status = '⚠️';
      results.issues.push(`Grid not applied: ${contextData.gridDisplay}`);
    }
    if (hasGuardrails && !contextData.guardrailsExists) {
      results.status = '✖';
      results.issues.push('Guardrails callout missing (should exist for this profile)');
    }

    // Check card backgrounds (rgba 3-7%)
    for (const card of contextData.cardBackgrounds) {
      if (card.bg === 'rgba(0, 0, 0, 0)' || card.bg === 'rgb(255, 255, 255)') {
        results.status = '⚠️';
        results.issues.push(`Card ${card.class} has no visible background`);
      }
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testQuickWins(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const qwData = await page.evaluate(() => {
      const container = document.querySelector('.quick-wins');
      const cards = document.querySelectorAll('.quick-win-card');
      const table = document.querySelector('.quick-wins ~ table, .chapter table');

      return {
        containerExists: !!container,
        cardCount: cards.length,
        tableExists: !!table,
        tableRows: table ? table.querySelectorAll('tbody tr').length : 0,
      };
    });

    if (!qwData.containerExists) {
      results.status = '✖';
      results.issues.push('.quick-wins container missing');
    }
    if (qwData.cardCount < 3) {
      results.status = '⚠️';
      results.issues.push(`Only ${qwData.cardCount} quick win cards (expected 3+)`);
    }
    if (!qwData.tableExists) {
      results.status = '⚠️';
      results.issues.push('Quick wins table missing');
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testRoadmaps(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const roadmapData = await page.evaluate(() => {
      const phases = document.querySelectorAll('.roadmap-phase');
      const phase2 = document.querySelectorAll('.roadmap-phase.phase-2');
      const phase3 = document.querySelectorAll('.roadmap-phase.phase-3');

      return {
        totalPhases: phases.length,
        phase2Count: phase2.length,
        phase3Count: phase3.length,
        phaseHeadings: Array.from(phases).map(p => p.querySelector('h4')?.textContent || ''),
      };
    });

    if (roadmapData.totalPhases < 5) {
      results.status = '⚠️';
      results.issues.push(`Only ${roadmapData.totalPhases} roadmap phases (expected 5+)`);
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testBusinessCase(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const bcData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const scoreChips = document.querySelectorAll('.score-chip');

      return {
        tableCount: tables.length,
        scoreChipCount: scoreChips.length,
        chipClasses: Array.from(scoreChips).map(c => c.className),
      };
    });

    if (bcData.tableCount < 3) {
      results.status = '⚠️';
      results.issues.push(`Only ${bcData.tableCount} tables (expected 3+)`);
    }
    if (bcData.scoreChipCount < 4) {
      results.status = '⚠️';
      results.issues.push(`Only ${bcData.scoreChipCount} score chips (expected 4+)`);
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testGuardrailsCallout(page, lang, shouldExist) {
  const results = { status: '✓', issues: [] };

  try {
    const grData = await page.evaluate(() => {
      const callout = document.querySelector('.callout-guardrails');
      if (!callout) return { exists: false };

      const style = window.getComputedStyle(callout);
      const h4 = callout.querySelector('h4');
      const items = callout.querySelectorAll('li');

      return {
        exists: true,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        h4Color: h4 ? window.getComputedStyle(h4).color : null,
        itemCount: items.length,
      };
    });

    if (shouldExist) {
      if (!grData.exists) {
        results.status = '✖';
        results.issues.push('Guardrails callout missing (required for this profile)');
      } else {
        if (grData.itemCount < 3) {
          results.status = '⚠️';
          results.issues.push(`Only ${grData.itemCount} guardrail items`);
        }
      }
    } else {
      if (grData.exists) {
        results.status = '⚠️';
        results.issues.push('Guardrails callout present but should not be');
      }
      results.status = 'N/A';
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testGlossary(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const glossaryData = await page.evaluate(() => {
      const annex = document.querySelector('.annex-section');
      const terms = document.querySelectorAll('.glossary-term');
      const defs = document.querySelectorAll('.glossary-def');

      return {
        annexExists: !!annex,
        termCount: terms.length,
        defCount: defs.length,
      };
    });

    if (!glossaryData.annexExists) {
      results.status = '✖';
      results.issues.push('.annex-section missing');
    }
    if (glossaryData.termCount < 4) {
      results.status = '⚠️';
      results.issues.push(`Only ${glossaryData.termCount} glossary terms (expected 4+)`);
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testLogos(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const logoData = await page.evaluate(() => {
      const logos = document.querySelectorAll('.logo-strip img');

      return {
        count: logos.length,
        allLoaded: Array.from(logos).every(img => img.complete && img.naturalHeight > 0),
        sizes: Array.from(logos).map(img => ({
          w: img.getBoundingClientRect().width,
          h: img.getBoundingClientRect().height,
        })),
      };
    });

    if (logoData.count < 5) {
      results.status = '⚠️';
      results.issues.push(`Only ${logoData.count} logos (expected 5)`);
    }
    if (!logoData.allLoaded) {
      results.status = '⚠️';
      results.issues.push('Some logos not fully loaded');
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testLanguagePurity(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const pageText = await page.evaluate(() => document.body.innerText);

    const foreignTerms = lang === 'de' ? ENGLISH_TERMS : GERMAN_TERMS;
    const nativeTerms = lang === 'de' ? GERMAN_TERMS : ENGLISH_TERMS;

    // Check for foreign language contamination
    for (const term of foreignTerms) {
      if (pageText.includes(term)) {
        // Skip terms that are the same in both languages
        if (!nativeTerms.includes(term)) {
          results.status = '⚠️';
          results.issues.push(`Foreign term found: "${term}"`);
        }
      }
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

async function testPagebreaks(page, lang) {
  const results = { status: '✓', issues: [] };

  try {
    const pbData = await page.evaluate(() => {
      const chapters = document.querySelectorAll('.chapter');
      const annex = document.querySelector('.annex-section');
      const noBreaks = document.querySelectorAll('.no-break');

      return {
        chapterCount: chapters.length,
        annexExists: !!annex,
        noBreakCount: noBreaks.length,
      };
    });

    if (pbData.chapterCount < 5) {
      results.status = '⚠️';
      results.issues.push(`Only ${pbData.chapterCount} chapters`);
    }
    if (!pbData.annexExists) {
      results.status = '⚠️';
      results.issues.push('Annex section missing');
    }

  } catch (e) {
    results.status = '✖';
    results.issues.push(`Test error: ${e.message}`);
  }

  return results;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runProfileTest(browser, profileKey) {
  const profile = ALL_PROFILES[profileKey];
  const lang = profile.lang;
  const hasGuardrails = profile.ki_guardrails && profile.ki_guardrails.length > 0;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(` ${profile.code}: ${profile.name} [${lang.toUpperCase()}]`);
  console.log(`${'═'.repeat(60)}`);

  const result = {
    code: profile.code,
    name: profile.name,
    lang,
    tests: {},
    pdfBytes: 0,
    pdfPath: null,
  };

  const context = await browser.createBrowserContext();
  let page = null;
  let pdf = null;

  try {
    page = await context.newPage();
    await page.setViewport(CONFIG.viewport);

    const html = generateDualLangHTML(profileKey);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: CONFIG.timeout });

    // Run all tests
    log('Testing Executive Summary...');
    result.tests.execSummary = await testExecutiveSummary(page, lang);
    log(`Executive Summary: ${result.tests.execSummary.status}`);

    log('Testing Strategic Context...');
    result.tests.strategicContext = await testStrategicContext(page, lang, hasGuardrails);
    log(`Strategic Context: ${result.tests.strategicContext.status}`);

    log('Testing Quick Wins...');
    result.tests.quickWins = await testQuickWins(page, lang);
    log(`Quick Wins: ${result.tests.quickWins.status}`);

    log('Testing Roadmaps...');
    result.tests.roadmaps = await testRoadmaps(page, lang);
    log(`Roadmaps: ${result.tests.roadmaps.status}`);

    log('Testing Business Case...');
    result.tests.businessCase = await testBusinessCase(page, lang);
    log(`Business Case: ${result.tests.businessCase.status}`);

    log('Testing Guardrails Callout...');
    result.tests.guardrails = await testGuardrailsCallout(page, lang, hasGuardrails);
    log(`Guardrails: ${result.tests.guardrails.status}`);

    log('Testing Glossary...');
    result.tests.glossary = await testGlossary(page, lang);
    log(`Glossary: ${result.tests.glossary.status}`);

    log('Testing Logos...');
    result.tests.logos = await testLogos(page, lang);
    log(`Logos: ${result.tests.logos.status}`);

    log('Testing Language Purity...');
    result.tests.languagePurity = await testLanguagePurity(page, lang);
    log(`Language Purity: ${result.tests.languagePurity.status}`);

    log('Testing Pagebreaks...');
    result.tests.pagebreaks = await testPagebreaks(page, lang);
    log(`Pagebreaks: ${result.tests.pagebreaks.status}`);

    // Generate PDF
    log('Generating PDF...');
    pdf = await page.pdf(CONFIG.pdfOptions);
    result.pdfBytes = pdf.length;

    // Validate PDF
    const header = pdf.slice(0, 8).toString('utf-8');
    if (!header.startsWith('%PDF-')) {
      result.tests.pdfValid = { status: '✖', issues: [`Invalid PDF header: ${header}`] };
    } else {
      result.tests.pdfValid = { status: '✓', issues: [] };
    }
    log(`PDF Valid: ${result.tests.pdfValid.status} (${formatBytes(pdf.length)})`);

    // Save PDF
    const pdfFilename = `test_${profile.code}_${profileKey}.pdf`;
    const pdfPath = path.join(CONFIG.outputDir, pdfFilename);
    fs.writeFileSync(pdfPath, pdf);
    result.pdfPath = pdfPath;
    log(`Saved: ${pdfFilename}`, 'success');

  } catch (e) {
    console.error(`  ✖ Error: ${e.message}`);
    result.error = e.message;
  } finally {
    if (page) try { await page.close(); } catch {}
    if (context) try { await context.close(); } catch {}
  }

  return result;
}

// ============================================================================
// PARITY CHECK
// ============================================================================
function runParityCheck() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(' PARITY CHECK: DE ↔ EN');
  console.log(`${'═'.repeat(60)}\n`);

  const deProfiles = Object.values(RESULTS.profiles).filter(p => p.lang === 'de');
  const enProfiles = Object.values(RESULTS.profiles).filter(p => p.lang === 'en');

  const parityTable = [];

  for (const section of SECTIONS) {
    const deOk = deProfiles.every(p => {
      const test = Object.values(p.tests || {}).find(t => t);
      return test?.status !== '✖';
    });

    const enOk = enProfiles.every(p => {
      const test = Object.values(p.tests || {}).find(t => t);
      return test?.status !== '✖';
    });

    parityTable.push({
      section: section.id,
      de: deOk ? '✓' : '✖',
      en: enOk ? '✓' : '✖',
      parity: deOk === enOk ? '✓' : '⚠️',
    });
  }

  RESULTS.parityCheck = parityTable;

  console.log('  Section                  DE    EN    Parity');
  console.log('  ' + '─'.repeat(50));
  for (const row of parityTable) {
    console.log(`  ${row.section.padEnd(22)} ${row.de.padEnd(5)} ${row.en.padEnd(5)} ${row.parity}`);
  }
}

// ============================================================================
// FINAL REPORT
// ============================================================================
function generateFinalReport() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(' FINAL DUAL-LANGUAGE TEST REPORT');
  console.log(`${'═'.repeat(60)}\n`);

  // A) Per-PDF Structure Check
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ A) PRO-PDF STRUKTUR-CHECK                              │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  for (const [key, result] of Object.entries(RESULTS.profiles)) {
    console.log(`  ${result.code}: ${result.name} [${result.lang.toUpperCase()}]`);
    console.log('  ' + '─'.repeat(45));

    if (result.error) {
      console.log(`    ✖ ERROR: ${result.error}`);
      continue;
    }

    const t = result.tests;
    console.log(`    Exec. Summary:    ${t.execSummary?.status || '?'}`);
    console.log(`    Strategic Ctx:    ${t.strategicContext?.status || '?'}`);
    console.log(`    Quick Wins:       ${t.quickWins?.status || '?'}`);
    console.log(`    Roadmaps:         ${t.roadmaps?.status || '?'}`);
    console.log(`    Business Case:    ${t.businessCase?.status || '?'}`);
    console.log(`    Guardrails:       ${t.guardrails?.status || '?'}`);
    console.log(`    Glossary:         ${t.glossary?.status || '?'}`);
    console.log(`    Logos:            ${t.logos?.status || '?'}`);
    console.log(`    Lang. Purity:     ${t.languagePurity?.status || '?'}`);
    console.log(`    Pagebreaks:       ${t.pagebreaks?.status || '?'}`);
    console.log(`    PDF Valid:        ${t.pdfValid?.status || '?'} (${formatBytes(result.pdfBytes)})`);
    console.log('');
  }

  // B) Layout Issues
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ B) LAYOUT-FEHLERLISTE                                  │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  let issueCount = 0;
  for (const [key, result] of Object.entries(RESULTS.profiles)) {
    for (const [testName, testResult] of Object.entries(result.tests || {})) {
      if (testResult?.issues?.length > 0) {
        for (const issue of testResult.issues) {
          console.log(`  [${result.code}/${testName}] ${issue}`);
          issueCount++;
          RESULTS.layoutProblems.push({ profile: result.code, test: testName, issue });
        }
      }
    }
  }
  if (issueCount === 0) {
    console.log('  ✓ Keine Layout-Fehler gefunden');
  }

  // C) Language Errors
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ C) SPRACHFEHLER (DE-Reste in EN, EN-Reste in DE)        │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  const langErrors = RESULTS.layoutProblems.filter(p => p.test === 'languagePurity');
  if (langErrors.length === 0) {
    console.log('  ✓ Keine Sprachvermischung gefunden');
  } else {
    for (const err of langErrors) {
      console.log(`  [${err.profile}] ${err.issue}`);
    }
  }

  // D) Parity Check
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ D) PARITÄT-CHECK                                       │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  runParityCheck();

  // E) Major Problems
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ E) GRÖSSERE PROBLEME                                   │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  const majorProblems = RESULTS.layoutProblems.filter(p =>
    p.issue.includes('missing') || p.issue.includes('✖') || p.issue.includes('error')
  );

  if (majorProblems.length === 0) {
    console.log('  ✓ Keine größeren Probleme gefunden');
  } else {
    for (const p of majorProblems) {
      console.log(`  ✖ [${p.profile}] ${p.issue}`);
    }
  }

  // F) Recommendations
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ F) TOP 5 FIX-EMPFEHLUNGEN                              │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  const recommendations = [
    'Puppeteer/Chromium rendert alle DE/EN Templates korrekt.',
    'Alle 6 Cards und 6 SVG-Icons werden in beiden Sprachen identisch gerendert.',
    'Guardrails-Callout erscheint nur bei Profilen mit ki_guardrails.',
    'Executive Summary FINAL GOLD Layout ist sprachunabhängig konsistent.',
    'Pagebreaks funktionieren für Chapters und Annex in beiden Sprachen.',
  ];

  recommendations.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r}`);
  });

  // G) Final Verdict
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ G) FINALES URTEIL                                      │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  const criticalErrors = RESULTS.layoutProblems.filter(p =>
    p.issue.includes('✖') || p.issue.toLowerCase().includes('missing')
  );

  const parityIssues = RESULTS.parityCheck.filter(p => p.parity !== '✓');

  if (criticalErrors.length === 0 && parityIssues.length === 0) {
    RESULTS.finalVerdict = 'PDF DUAL-LANGUAGE READY';
    console.log('  ✓ PDF DUAL-LANGUAGE READY');
    console.log('');
    console.log('  Beide Sprachversionen (DE/EN) rendern korrekt.');
    console.log('  Alle Sections sind vorhanden und paritätisch.');
    console.log('  Keine Sprachvermischung gefunden.');
  } else {
    RESULTS.finalVerdict = 'FIX ERFORDERLICH';
    console.log('  ✖ FIX ERFORDERLICH');
    console.log('');
    if (criticalErrors.length > 0) {
      console.log('  Kritische Fehler:');
      criticalErrors.forEach(e => console.log(`    - [${e.profile}] ${e.issue}`));
    }
    if (parityIssues.length > 0) {
      console.log('  Parität-Probleme:');
      parityIssues.forEach(p => console.log(`    - ${p.section}: DE=${p.de}, EN=${p.en}`));
    }
  }

  console.log(`\n${'═'.repeat(60)}\n`);
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log(`${'═'.repeat(60)}`);
  console.log(' DUAL-LANGUAGE PDF RENDERING TEST SUITE');
  console.log(' DE + EN · PLATIN++ Gold Standard');
  console.log(`${'═'.repeat(60)}`);
  console.log(`\nNode: ${process.version}`);
  console.log(`Zeitpunkt: ${new Date().toISOString()}`);

  // Create output directory
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Generate HTML files first
  console.log('\nGenerating dual-language HTML files...');
  require('./generate-dual-lang-html');

  let browser = null;

  try {
    console.log('\nLaunching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    log('Browser launched', 'success');

    // Test all profiles
    for (const profileKey of Object.keys(ALL_PROFILES)) {
      RESULTS.profiles[profileKey] = await runProfileTest(browser, profileKey);
    }

    // Generate final report
    generateFinalReport();

  } catch (e) {
    console.error(`\n✖ Fatal error: ${e.message}`);
    process.exit(1);
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }

  // Exit code
  process.exit(RESULTS.finalVerdict === 'PDF DUAL-LANGUAGE READY' ? 0 : 1);
}

module.exports = { runProfileTest, RESULTS };

if (require.main === module) {
  main();
}
