/**
 * Generiert Test-HTML-Dateien für alle 4 Profile
 * Enthält alle Features aus dem PLATIN++ Template
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PROFILES } = require('./test-profiles');

// ============================================================================
// SVG ICONS (die 6 blauen Icons)
// ============================================================================
const SVG_ICONS = {
  circle: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="12" stroke="#1E3A8A" stroke-width="2" fill="#3B82F6" fill-opacity="0.15"/>
    <circle cx="14" cy="14" r="6" fill="#3B82F6"/>
  </svg>`,

  triangle: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 4L25 24H3L14 4Z" stroke="#1E3A8A" stroke-width="2" fill="#3B82F6" fill-opacity="0.15"/>
  </svg>`,

  hexagon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2L25 8V20L14 26L3 20V8L14 2Z" stroke="#1E3A8A" stroke-width="2" fill="#3B82F6" fill-opacity="0.15"/>
  </svg>`,

  square: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="20" height="20" rx="3" stroke="#1E3A8A" stroke-width="2" fill="#3B82F6" fill-opacity="0.15"/>
  </svg>`,

  wave: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 14C2 14 6 8 10 14C14 20 18 8 22 14C26 20 26 14 26 14" stroke="#3B82F6" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  node: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="4" fill="#1E3A8A"/>
    <circle cx="6" cy="6" r="3" fill="#3B82F6"/>
    <circle cx="22" cy="6" r="3" fill="#3B82F6"/>
    <circle cx="6" cy="22" r="3" fill="#3B82F6"/>
    <circle cx="22" cy="22" r="3" fill="#3B82F6"/>
    <line x1="14" y1="14" x2="6" y2="6" stroke="#93C5FD" stroke-width="1.5"/>
    <line x1="14" y1="14" x2="22" y2="6" stroke="#93C5FD" stroke-width="1.5"/>
    <line x1="14" y1="14" x2="6" y2="22" stroke="#93C5FD" stroke-width="1.5"/>
    <line x1="14" y1="14" x2="22" y2="22" stroke="#93C5FD" stroke-width="1.5"/>
  </svg>`,
};

// ============================================================================
// BASE64 TEST LOGOS (Placeholder SVGs als Data-URIs)
// ============================================================================
const TEST_LOGOS = {
  ki_sicherheit: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
    <rect width="120" height="40" fill="#1E3A8A" rx="4"/>
    <text x="60" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">KI-Sicherheit</text>
  </svg>`).toString('base64')}`,

  tuev: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">
    <circle cx="20" cy="20" r="18" fill="#003399"/>
    <text x="20" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">TÜV</text>
    <text x="55" y="25" fill="#003399" font-family="Arial" font-size="10">CERT</text>
  </svg>`).toString('base64')}`,

  ki_ready: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">
    <rect width="100" height="40" fill="#059669" rx="4"/>
    <text x="50" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="11" font-weight="bold">KI-Ready 2025</text>
  </svg>`).toString('base64')}`,

  dsgvo: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40">
    <rect width="60" height="40" fill="#1E40AF" rx="4"/>
    <text x="30" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">DSGVO</text>
  </svg>`).toString('base64')}`,

  eu_ai: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40">
    <rect width="60" height="40" fill="#003399" rx="4"/>
    <circle cx="30" cy="15" r="8" fill="#FFCC00"/>
    <text x="30" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="8" font-weight="bold">EU AI Act</text>
  </svg>`).toString('base64')}`,
};

// ============================================================================
// CSS STYLES (PLATIN++ Gold Standard)
// ============================================================================
const CSS_STYLES = `
/* ============================================
   PLATIN++ GOLD STANDARD CSS
   PDF-Rendering Test Suite
   ============================================ */

@page {
  size: A4 portrait;
  margin: 20mm 15mm 25mm 15mm;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.5;
  color: #1f2937;
  background: #ffffff;
}

/* ============================================
   PAGE BREAK RULES
   ============================================ */
.chapter {
  page-break-before: always;
}

.chapter:first-of-type {
  page-break-before: auto;
}

.annex-section {
  page-break-before: always;
}

.no-break {
  page-break-inside: avoid;
}

/* ============================================
   HEADER & LOGOS
   ============================================ */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 15px;
  border-bottom: 2px solid #1E3A8A;
  margin-bottom: 20px;
}

.logo-strip {
  display: flex;
  gap: 12px;
  align-items: center;
}

.logo-strip img {
  height: 32px;
  width: auto;
  object-fit: contain;
}

.meta-info {
  text-align: right;
  font-size: 9pt;
  color: #6b7280;
}

/* ============================================
   EXECUTIVE SUMMARY (FINAL GOLD)
   ============================================ */
.executive-summary {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
}

.exec-title {
  font-size: 20pt;
  font-weight: 700;
  color: #1E3A8A;
  margin-bottom: 16px;
  letter-spacing: -0.02em;
}

.exec-highlight {
  border-left: 4px solid #3B82F6;
  padding-left: 16px;
  margin: 16px 0;
  background: rgba(59, 130, 246, 0.05);
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
}

.exec-highlight p {
  line-height: 1.45;
  margin: 0;
}

.exec-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 20px 0;
  border: none;
}

/* ============================================
   CONTEXT CARDS (Strategic Context)
   ============================================ */
.context-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin: 20px 0;
}

.context-card {
  border-radius: 8px;
  padding: 16px;
  page-break-inside: avoid;
}

.context-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 11pt;
  color: #1E3A8A;
  margin-bottom: 10px;
}

.context-card-title svg {
  flex-shrink: 0;
}

.context-card p {
  font-size: 9.5pt;
  line-height: 1.5;
  color: #374151;
  overflow-wrap: break-word;
  word-wrap: break-word;
  hyphens: auto;
}

/* Card Variants with subtle blue tones */
.card-goal {
  background: rgba(59, 130, 246, 0.03);
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.card-process {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.card-model {
  background: rgba(59, 130, 246, 0.04);
  border: 1px solid rgba(59, 130, 246, 0.12);
}

.card-vision {
  background: rgba(30, 58, 138, 0.03);
  border: 1px solid rgba(30, 58, 138, 0.15);
}

/* ============================================
   GUARDRAILS CALLOUT (Profile D only)
   ============================================ */
.callout {
  border-radius: 8px;
  padding: 16px 20px;
  margin: 20px 0;
  page-break-inside: avoid;
}

.callout-guardrails {
  background: rgba(220, 131, 131, 0.05);
  border: 2px solid #DC8383;
  border-left-width: 4px;
}

.callout-guardrails h4 {
  color: #DC8383;
  font-size: 12pt;
  font-weight: 600;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.callout-guardrails ul {
  margin: 0;
  padding-left: 20px;
}

.callout-guardrails li {
  margin-bottom: 6px;
  line-height: 1.4;
  color: #4b5563;
}

/* ============================================
   QUICK WINS & ROADMAP
   ============================================ */
.quick-wins {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  page-break-inside: avoid;
}

.quick-wins h3 {
  color: #166534;
  font-size: 12pt;
  margin-bottom: 12px;
}

.roadmap-phase {
  background: #fefce8;
  border: 1px solid #fef08a;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  page-break-inside: avoid;
}

.roadmap-phase h4 {
  color: #854d0e;
  font-size: 11pt;
  margin-bottom: 8px;
}

/* ============================================
   TABLES
   ============================================ */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 9pt;
}

th, td {
  border: 1px solid #e5e7eb;
  padding: 10px 12px;
  text-align: left;
}

th {
  background: #f3f4f6;
  font-weight: 600;
  color: #374151;
}

tr:nth-child(even) {
  background: #f9fafb;
}

/* ============================================
   TYPOGRAPHY
   ============================================ */
h1 {
  font-size: 22pt;
  font-weight: 700;
  color: #1E3A8A;
  margin-bottom: 16px;
  line-height: 1.2;
}

h2 {
  font-size: 16pt;
  font-weight: 600;
  color: #1e40af;
  margin: 24px 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 2px solid #dbeafe;
}

h3 {
  font-size: 13pt;
  font-weight: 600;
  color: #1f2937;
  margin: 16px 0 8px 0;
}

h4 {
  font-size: 11pt;
  font-weight: 600;
  color: #374151;
  margin: 12px 0 6px 0;
}

p {
  margin-bottom: 10px;
  line-height: 1.45;
}

ul, ol {
  margin: 8px 0 16px 20px;
}

li {
  margin-bottom: 4px;
  line-height: 1.4;
}

/* ============================================
   ANNEX & GLOSSARY
   ============================================ */
.annex-section {
  background: #fafafa;
  padding: 20px;
  border-radius: 8px;
}

.glossary-term {
  font-weight: 600;
  color: #1E3A8A;
}

.glossary-def {
  color: #4b5563;
  margin-left: 16px;
  margin-bottom: 12px;
}

/* ============================================
   LIGHT MODE OVERRIDES (ensure visibility)
   ============================================ */
@media screen {
  .card-goal,
  .card-process,
  .card-model,
  .card-vision {
    /* Ensure cards are not completely white in light mode */
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
}

/* ============================================
   PRINT SPECIFIC
   ============================================ */
@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .no-print {
    display: none !important;
  }

  a {
    text-decoration: none;
    color: inherit;
  }
}

/* ============================================
   LONG TEXT HANDLING
   ============================================ */
.long-text-test {
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  hyphens: auto;
}
`;

// ============================================================================
// HTML TEMPLATE GENERATOR
// ============================================================================
function generateHTML(profile) {
  const p = PROFILES[profile];
  const hasGuardrails = p.ki_guardrails && p.ki_guardrails.length > 0;
  const timestamp = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KI-Status-Report – ${p.name} (Profil ${p.code})</title>
  <style>${CSS_STYLES}</style>
</head>
<body>

<!-- ============================================
     HEADER MIT LOGOS
     ============================================ -->
<header class="header">
  <div class="logo-strip">
    <img src="${TEST_LOGOS.ki_sicherheit}" alt="KI-Sicherheit Logo">
    <img src="${TEST_LOGOS.tuev}" alt="TÜV Logo">
    <img src="${TEST_LOGOS.ki_ready}" alt="KI-Ready 2025">
    <img src="${TEST_LOGOS.dsgvo}" alt="DSGVO">
    <img src="${TEST_LOGOS.eu_ai}" alt="EU AI Act">
  </div>
  <div class="meta-info">
    <strong>KI-Status-Report</strong><br>
    Profil ${p.code}: ${p.name}<br>
    ${p.branche} · ${p.mitarbeiter} MA<br>
    <small>Erstellt: ${timestamp}</small>
  </div>
</header>

<!-- ============================================
     EXECUTIVE SUMMARY (FINAL GOLD)
     ============================================ -->
<section class="executive-summary">
  <h1 class="exec-title">Executive Summary</h1>

  <div class="exec-highlight">
    <p><strong>Fokus:</strong> ${p.strategische_ziele}</p>
  </div>

  <hr class="exec-divider">

  <div class="exec-highlight">
    <p><strong>Wesentliche Belastungen:</strong> ${p.zeitersparnis_prioritaet}</p>
  </div>

  <hr class="exec-divider">

  <p>Dieser Report analysiert das KI-Potenzial für <strong>${p.hauptleistung}</strong>
  und liefert konkrete Handlungsempfehlungen für die strategische Transformation.</p>

  ${hasGuardrails ? `
  <div class="exec-highlight" style="border-left-color: #DC8383; background: rgba(220, 131, 131, 0.05);">
    <p><strong>⚠️ Leitplanken aktiv:</strong> Dieser Report berücksichtigt ${p.ki_guardrails.length} definierte KI-Guardrails.</p>
  </div>
  ` : ''}
</section>

<!-- ============================================
     CHAPTER 1: STRATEGISCHER KONTEXT & LEITPLANKEN
     ============================================ -->
<section class="chapter">
  <h2>1. Strategischer Kontext & Leitplanken</h2>

  <div class="context-grid">
    <!-- Card 1: Strategische Ziele -->
    <div class="context-card card-goal no-break">
      <div class="context-card-title">
        ${SVG_ICONS.circle}
        <span>Strategische Ziele</span>
      </div>
      <p>${p.strategische_ziele}</p>
    </div>

    <!-- Card 2: Zeitkritische Prozesse -->
    <div class="context-card card-process no-break">
      <div class="context-card-title">
        ${SVG_ICONS.triangle}
        <span>Zeitkritische Prozesse</span>
      </div>
      <p>${p.zeitersparnis_prioritaet}</p>
    </div>

    <!-- Card 3: Geschäftsmodell-Evolution -->
    <div class="context-card card-model no-break">
      <div class="context-card-title">
        ${SVG_ICONS.hexagon}
        <span>Geschäftsmodell-Evolution</span>
      </div>
      <p>${p.geschaeftsmodell_evolution}</p>
    </div>

    <!-- Card 4: Vision 3 Jahre -->
    <div class="context-card card-vision no-break">
      <div class="context-card-title">
        ${SVG_ICONS.node}
        <span>Vision 2027</span>
      </div>
      <p>${p.vision_3_jahre}</p>
    </div>
  </div>

  ${hasGuardrails ? `
  <!-- GUARDRAILS CALLOUT (nur Profil D) -->
  <div class="callout callout-guardrails no-break">
    <h4>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L2 18H18L10 2Z" fill="#DC8383" fill-opacity="0.2" stroke="#DC8383" stroke-width="1.5"/>
        <text x="10" y="14" text-anchor="middle" fill="#DC8383" font-size="10" font-weight="bold">!</text>
      </svg>
      KI-Leitplanken (Guardrails)
    </h4>
    <ul>
      ${p.ki_guardrails.map(g => `<li>${g}</li>`).join('\n      ')}
    </ul>
  </div>
  ` : ''}

  <!-- Aktuelle KI-Projekte -->
  <h3>Aktuelle KI-Initiativen</h3>
  <p><strong>Bisherige KI-Projekte:</strong> ${p.ki_projekte}</p>
</section>

<!-- ============================================
     CHAPTER 2: QUICK WINS
     ============================================ -->
<section class="chapter">
  <h2>2. Quick Wins & Sofortmaßnahmen</h2>

  <div class="quick-wins no-break">
    <h3>🚀 Top 3 Quick Wins</h3>
    <ol>
      <li><strong>Automatisierte ${p.zeitersparnis_prioritaet.split(',')[0] || 'Dokumentation'}:</strong>
          Direkte Zeitersparnis durch KI-gestützte Vorlagen und Textgenerierung.</li>
      <li><strong>Prozess-Analyse:</strong>
          Identifikation weiterer Automatisierungspotenziale in ${p.hauptleistung}.</li>
      <li><strong>Team-Enablement:</strong>
          Schulung der ${p.mitarbeiter} Mitarbeiter für effektiven KI-Einsatz.</li>
    </ol>
  </div>

  <table>
    <thead>
      <tr>
        <th>Maßnahme</th>
        <th>Aufwand</th>
        <th>Impact</th>
        <th>Priorität</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>KI-Tool-Evaluation</td>
        <td>Gering</td>
        <td>Hoch</td>
        <td>★★★</td>
      </tr>
      <tr>
        <td>Pilot-Projekt starten</td>
        <td>Mittel</td>
        <td>Sehr hoch</td>
        <td>★★★</td>
      </tr>
      <tr>
        <td>Governance aufsetzen</td>
        <td>Mittel</td>
        <td>Mittel</td>
        <td>★★☆</td>
      </tr>
      <tr>
        <td>Skalierung vorbereiten</td>
        <td>Hoch</td>
        <td>Hoch</td>
        <td>★★☆</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ============================================
     CHAPTER 3: ROADMAP
     ============================================ -->
<section class="chapter">
  <h2>3. Strategische Roadmap</h2>

  <div class="roadmap-phase no-break">
    <h4>📅 Phase 1: Foundation (Monate 1-3)</h4>
    <ul>
      <li>KI-Readiness-Assessment durchführen</li>
      <li>Datenqualität und -verfügbarkeit prüfen</li>
      <li>Quick Wins aus Kapitel 2 umsetzen</li>
      <li>Team-Schulungen initiieren</li>
    </ul>
  </div>

  <div class="roadmap-phase no-break">
    <h4>📅 Phase 2: Expansion (Monate 4-8)</h4>
    <ul>
      <li>Pilot-Projekte ausrollen</li>
      <li>KI-Governance etablieren</li>
      <li>ROI-Messung implementieren</li>
      <li>Change Management verstärken</li>
    </ul>
  </div>

  <div class="roadmap-phase no-break">
    <h4>📅 Phase 3: Skalierung (Monate 9-12)</h4>
    <ul>
      <li>Erfolgreiche Piloten unternehmensweit ausrollen</li>
      <li>Kontinuierliche Verbesserung etablieren</li>
      <li>Erreichung der Vision: ${p.vision_3_jahre}</li>
    </ul>
  </div>
</section>

<!-- ============================================
     CHAPTER 4: RISIKEN & COMPLIANCE
     ============================================ -->
<section class="chapter">
  <h2>4. Risiken & Compliance</h2>

  <h3>4.1 Identifizierte Risiken</h3>
  <table>
    <thead>
      <tr>
        <th>Risiko</th>
        <th>Wahrscheinlichkeit</th>
        <th>Auswirkung</th>
        <th>Mitigation</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Datenschutzverletzung</td>
        <td>Mittel</td>
        <td>Hoch</td>
        <td>DSGVO-konforme Tool-Auswahl</td>
      </tr>
      <tr>
        <td>Akzeptanzprobleme</td>
        <td>Mittel</td>
        <td>Mittel</td>
        <td>Change Management, Schulungen</td>
      </tr>
      <tr>
        <td>Vendor Lock-in</td>
        <td>Gering</td>
        <td>Mittel</td>
        <td>Multi-Vendor-Strategie</td>
      </tr>
    </tbody>
  </table>

  ${hasGuardrails ? `
  <h3>4.2 Guardrails-Compliance</h3>
  <p>Die definierten KI-Leitplanken werden in allen Empfehlungen berücksichtigt:</p>
  <ul>
    ${p.ki_guardrails.map(g => `<li>✓ ${g}</li>`).join('\n    ')}
  </ul>
  ` : `
  <h3>4.2 Compliance-Anforderungen</h3>
  <ul>
    <li>DSGVO-Konformität bei allen KI-Tools</li>
    <li>EU AI Act Anforderungen beachten</li>
    <li>Branchenspezifische Regularien prüfen (${p.branche})</li>
  </ul>
  `}
</section>

<!-- ============================================
     CHAPTER 5: KREATIVTOOLS & TECHNOLOGIE
     ============================================ -->
<section class="chapter">
  <h2>5. Empfohlene Kreativtools & Technologie</h2>

  <div class="context-grid">
    <div class="context-card card-goal no-break">
      <div class="context-card-title">
        ${SVG_ICONS.square}
        <span>Textgenerierung</span>
      </div>
      <p>ChatGPT, Claude, Jasper AI für ${p.zeitersparnis_prioritaet.split(',')[0] || 'Dokumentation'}</p>
    </div>

    <div class="context-card card-process no-break">
      <div class="context-card-title">
        ${SVG_ICONS.wave}
        <span>Bildgenerierung</span>
      </div>
      <p>Midjourney, DALL-E, Stable Diffusion für visuelle Inhalte</p>
    </div>
  </div>

  <!-- Long text test for overflow-wrap -->
  <h3>Technische Spezifikationen</h3>
  <p class="long-text-test">
    Superlongwordwithoutspacestotestoverflowwrapandwordbreakbehaviorinpdfrendering_and_also_with_underscores_and-hyphens-mixed-together
    URL-Test: https://www.example-domain-with-very-long-subdomain.company.enterprise.solutions/path/to/resource/with/many/segments?param=value&another=longvalue
  </p>
</section>

<!-- ============================================
     ANNEX: GLOSSAR (Page Break Before)
     ============================================ -->
<section class="annex-section">
  <h2>Annex A: Glossar</h2>

  <p><span class="glossary-term">KI (Künstliche Intelligenz):</span></p>
  <p class="glossary-def">Technologien, die menschenähnliche kognitive Fähigkeiten simulieren.</p>

  <p><span class="glossary-term">LLM (Large Language Model):</span></p>
  <p class="glossary-def">Große Sprachmodelle wie GPT-4, Claude oder LLaMA.</p>

  <p><span class="glossary-term">Guardrails:</span></p>
  <p class="glossary-def">Definierte Grenzen und Regeln für den ethischen KI-Einsatz.</p>

  <p><span class="glossary-term">ROI (Return on Investment):</span></p>
  <p class="glossary-def">Kennzahl zur Bewertung der Wirtschaftlichkeit von Investitionen.</p>

  <p><span class="glossary-term">DSGVO:</span></p>
  <p class="glossary-def">Datenschutz-Grundverordnung der Europäischen Union.</p>
</section>

<!-- ============================================
     FOOTER
     ============================================ -->
<footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #9ca3af; text-align: center;">
  <p>KI-Status-Report · Profil ${p.code}: ${p.name} · Generiert: ${timestamp}</p>
  <p>© 2025 KI-Beratung · Alle Rechte vorbehalten · PDF-Rendering Test Suite v1.0</p>
</footer>

</body>
</html>`;
}

// ============================================================================
// MAIN: Generate all test HTML files
// ============================================================================
function main() {
  const outputDir = path.join(__dirname, 'html');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating test HTML files for PDF rendering...\n');

  for (const [key, profile] of Object.entries(PROFILES)) {
    const filename = `test_profile_${profile.code}_${key}.html`;
    const filepath = path.join(outputDir, filename);
    const html = generateHTML(key);

    fs.writeFileSync(filepath, html, 'utf8');
    console.log(`✓ ${filename} (${(html.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nGenerated ${Object.keys(PROFILES).length} test HTML files in: ${outputDir}`);
}

module.exports = { generateHTML, PROFILES, CSS_STYLES, SVG_ICONS };

if (require.main === module) {
  main();
}
