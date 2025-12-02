/**
 * Dual-Language HTML Generator (DE + EN)
 * Generates complete PLATIN++ Gold Standard templates in both languages
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ALL_PROFILES, GERMAN_TERMS, ENGLISH_TERMS } = require('./test-profiles-dual-lang');

// ============================================================================
// SVG ICONS (identical for both languages)
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
// LOGOS (Base64 SVG)
// ============================================================================
const LOGOS = {
  ki_sicherheit: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="#1E3A8A" rx="4"/><text x="60" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">KI-Sicherheit</text></svg>`).toString('base64')}`,
  tuev: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><circle cx="20" cy="20" r="18" fill="#003399"/><text x="20" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">TÜV</text><text x="55" y="25" fill="#003399" font-family="Arial" font-size="10">CERT</text></svg>`).toString('base64')}`,
  ki_ready: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40"><rect width="100" height="40" fill="#059669" rx="4"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="11" font-weight="bold">KI-Ready 2025</text></svg>`).toString('base64')}`,
  dsgvo: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40"><rect width="60" height="40" fill="#1E40AF" rx="4"/><text x="30" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">DSGVO</text></svg>`).toString('base64')}`,
  eu_ai: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40"><rect width="60" height="40" fill="#003399" rx="4"/><circle cx="30" cy="15" r="8" fill="#FFCC00"/><text x="30" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="8" font-weight="bold">EU AI Act</text></svg>`).toString('base64')}`,
};

// ============================================================================
// CSS (PLATIN++ Gold Standard - Full Version)
// ============================================================================
const CSS = `
@page { size: A4 portrait; margin: 20mm 15mm 25mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #1f2937; background: #fff; }

/* Page Breaks */
.chapter { page-break-before: always; }
.chapter:first-of-type { page-break-before: auto; }
.annex-section { page-break-before: always; }
.no-break { page-break-inside: avoid; }

/* Header */
.header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 2px solid #1E3A8A; margin-bottom: 20px; }
.logo-strip { display: flex; gap: 12px; align-items: center; }
.logo-strip img { height: 32px; width: auto; object-fit: contain; }
.meta-info { text-align: right; font-size: 9pt; color: #6b7280; }

/* Executive Summary FINAL GOLD */
.executive-summary { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
.exec-title { font-size: 20pt; font-weight: 700; color: #1E3A8A; margin-bottom: 16px; letter-spacing: -0.02em; }
.exec-highlight { border-left: 4px solid #3B82F6; padding-left: 16px; margin: 16px 0; background: rgba(59, 130, 246, 0.05); padding: 12px 16px; border-radius: 0 6px 6px 0; }
.exec-highlight p { line-height: 1.45; margin: 0; }
.exec-divider { height: 1px; background: #e2e8f0; margin: 20px 0; border: none; }

/* Context Cards */
.context-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 20px 0; }
.context-card { border-radius: 8px; padding: 16px; page-break-inside: avoid; }
.context-card-title { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 11pt; color: #1E3A8A; margin-bottom: 10px; }
.context-card-title svg { flex-shrink: 0; }
.context-card p { font-size: 9.5pt; line-height: 1.5; color: #374151; overflow-wrap: break-word; hyphens: auto; }
.card-goal { background: rgba(59, 130, 246, 0.03); border: 1px solid rgba(59, 130, 246, 0.15); }
.card-process { background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.18); }
.card-model { background: rgba(59, 130, 246, 0.04); border: 1px solid rgba(59, 130, 246, 0.12); }
.card-vision { background: rgba(30, 58, 138, 0.03); border: 1px solid rgba(30, 58, 138, 0.15); }
.card-tools { background: rgba(16, 185, 129, 0.03); border: 1px solid rgba(16, 185, 129, 0.15); }
.card-change { background: rgba(245, 158, 11, 0.03); border: 1px solid rgba(245, 158, 11, 0.15); }

/* Guardrails Callout */
.callout { border-radius: 8px; padding: 16px 20px; margin: 20px 0; page-break-inside: avoid; }
.callout-guardrails { background: rgba(220, 131, 131, 0.05); border: 2px solid #DC8383; border-left-width: 4px; }
.callout-guardrails h4 { color: #DC8383; font-size: 12pt; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.callout-guardrails ul { margin: 0; padding-left: 20px; }
.callout-guardrails li { margin-bottom: 6px; line-height: 1.4; color: #4b5563; }

/* Quick Wins */
.quick-wins { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; page-break-inside: avoid; }
.quick-wins h3 { color: #166534; font-size: 12pt; margin-bottom: 12px; }
.quick-win-card { background: #fff; border: 1px solid #d1fae5; border-radius: 6px; padding: 12px; margin: 8px 0; }

/* Roadmap */
.roadmap-phase { background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 16px; margin: 12px 0; page-break-inside: avoid; }
.roadmap-phase h4 { color: #854d0e; font-size: 11pt; margin-bottom: 8px; }
.roadmap-phase.phase-2 { background: #fff7ed; border-color: #fed7aa; }
.roadmap-phase.phase-2 h4 { color: #c2410c; }
.roadmap-phase.phase-3 { background: #fef2f2; border-color: #fecaca; }
.roadmap-phase.phase-3 h4 { color: #b91c1c; }

/* Tables */
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 9pt; }
th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
th { background: #f3f4f6; font-weight: 600; color: #374151; }
tr:nth-child(even) { background: #f9fafb; }

/* Score Chips */
.score-chip { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 8pt; font-weight: 600; }
.score-high { background: #dcfce7; color: #166534; }
.score-medium { background: #fef3c7; color: #92400e; }
.score-low { background: #fee2e2; color: #991b1b; }

/* Typography */
h1 { font-size: 22pt; font-weight: 700; color: #1E3A8A; margin-bottom: 16px; line-height: 1.2; }
h2 { font-size: 16pt; font-weight: 600; color: #1e40af; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 2px solid #dbeafe; }
h3 { font-size: 13pt; font-weight: 600; color: #1f2937; margin: 16px 0 8px 0; }
h4 { font-size: 11pt; font-weight: 600; color: #374151; margin: 12px 0 6px 0; }
p { margin-bottom: 10px; line-height: 1.45; }
ul, ol { margin: 8px 0 16px 20px; }
li { margin-bottom: 4px; line-height: 1.4; }

/* Annex */
.annex-section { background: #fafafa; padding: 20px; border-radius: 8px; }
.glossary-term { font-weight: 600; color: #1E3A8A; }
.glossary-def { color: #4b5563; margin-left: 16px; margin-bottom: 12px; }

/* Print */
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  a { text-decoration: none; color: inherit; }
}

/* Footer */
.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #9ca3af; text-align: center; }
`;

// ============================================================================
// HTML GENERATOR
// ============================================================================
function generateDualLangHTML(profileKey) {
  const p = ALL_PROFILES[profileKey];
  if (!p) throw new Error(`Profile not found: ${profileKey}`);

  const isEN = p.lang === 'en';
  const L = p.labels;
  const hasGuardrails = p.ki_guardrails && p.ki_guardrails.length > 0;
  const timestamp = new Date().toISOString();

  // Language-specific content
  const quickWins = isEN ? [
    { title: 'Automated Documentation', desc: `Direct time savings through AI-powered templates for ${p.zeitersparnis_prioritaet.split(',')[0] || 'documentation'}` },
    { title: 'Process Analysis', desc: `Identify automation potential in ${p.hauptleistung}` },
    { title: 'Team Enablement', desc: `Train ${p.mitarbeiter} employees for effective AI use` },
    { title: 'Tool Evaluation', desc: 'Evaluate and select appropriate AI tools for your use case' },
  ] : [
    { title: 'Automatisierte Dokumentation', desc: `Direkte Zeitersparnis durch KI-gestützte Vorlagen für ${p.zeitersparnis_prioritaet.split(',')[0] || 'Dokumentation'}` },
    { title: 'Prozess-Analyse', desc: `Identifikation von Automatisierungspotenzial in ${p.hauptleistung}` },
    { title: 'Team-Enablement', desc: `Schulung der ${p.mitarbeiter} Mitarbeiter für effektiven KI-Einsatz` },
    { title: 'Tool-Evaluierung', desc: 'Bewertung und Auswahl geeigneter KI-Tools für Ihren Anwendungsfall' },
  ];

  const roadmap90d = isEN ? [
    { phase: 'Week 1-2', tasks: ['AI readiness assessment', 'Data quality review', 'Stakeholder alignment'] },
    { phase: 'Week 3-6', tasks: ['Quick wins implementation', 'Pilot project kickoff', 'Initial training sessions'] },
    { phase: 'Week 7-12', tasks: ['Pilot evaluation', 'Process documentation', 'Scale planning'] },
  ] : [
    { phase: 'Woche 1-2', tasks: ['KI-Readiness-Assessment', 'Datenqualitätsprüfung', 'Stakeholder-Abstimmung'] },
    { phase: 'Woche 3-6', tasks: ['Quick Wins umsetzen', 'Pilot-Projekt starten', 'Erste Schulungen'] },
    { phase: 'Woche 7-12', tasks: ['Pilot-Evaluation', 'Prozessdokumentation', 'Skalierungsplanung'] },
  ];

  const glossary = isEN ? [
    { term: 'AI (Artificial Intelligence)', def: 'Technologies that simulate human-like cognitive abilities.' },
    { term: 'LLM (Large Language Model)', def: 'Large language models like GPT-4, Claude, or LLaMA.' },
    { term: 'Guardrails', def: 'Defined boundaries and rules for ethical AI use.' },
    { term: 'ROI (Return on Investment)', def: 'Metric for evaluating the profitability of investments.' },
    { term: 'GDPR', def: 'General Data Protection Regulation of the European Union.' },
  ] : [
    { term: 'KI (Künstliche Intelligenz)', def: 'Technologien, die menschenähnliche kognitive Fähigkeiten simulieren.' },
    { term: 'LLM (Large Language Model)', def: 'Große Sprachmodelle wie GPT-4, Claude oder LLaMA.' },
    { term: 'Guardrails', def: 'Definierte Grenzen und Regeln für den ethischen KI-Einsatz.' },
    { term: 'ROI (Return on Investment)', def: 'Kennzahl zur Bewertung der Wirtschaftlichkeit von Investitionen.' },
    { term: 'DSGVO', def: 'Datenschutz-Grundverordnung der Europäischen Union.' },
  ];

  return `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KI-Status-Report – ${p.name} (${p.code})</title>
  <style>${CSS}</style>
</head>
<body>

<!-- HEADER -->
<header class="header">
  <div class="logo-strip">
    <img src="${LOGOS.ki_sicherheit}" alt="KI-Sicherheit">
    <img src="${LOGOS.tuev}" alt="TÜV">
    <img src="${LOGOS.ki_ready}" alt="KI-Ready 2025">
    <img src="${LOGOS.dsgvo}" alt="DSGVO">
    <img src="${LOGOS.eu_ai}" alt="EU AI Act">
  </div>
  <div class="meta-info">
    <strong>KI-Status-Report</strong><br>
    ${p.code}: ${p.name}<br>
    ${p.branche} · ${p.mitarbeiter} ${isEN ? 'employees' : 'MA'}<br>
    <small>${isEN ? 'Generated' : 'Erstellt'}: ${timestamp}</small>
  </div>
</header>

<!-- EXECUTIVE SUMMARY -->
<section class="executive-summary">
  <h1 class="exec-title">${L.executive_summary}</h1>
  <div class="exec-highlight">
    <p><strong>${L.focus}:</strong> ${p.strategische_ziele}</p>
  </div>
  <hr class="exec-divider">
  <div class="exec-highlight">
    <p><strong>${L.key_challenges}:</strong> ${p.zeitersparnis_prioritaet}</p>
  </div>
  <hr class="exec-divider">
  <p>${isEN
    ? `This report analyzes the AI potential for <strong>${p.hauptleistung}</strong> and provides concrete recommendations for strategic transformation.`
    : `Dieser Report analysiert das KI-Potenzial für <strong>${p.hauptleistung}</strong> und liefert konkrete Handlungsempfehlungen für die strategische Transformation.`
  }</p>
  ${hasGuardrails ? `
  <div class="exec-highlight" style="border-left-color: #DC8383; background: rgba(220, 131, 131, 0.05);">
    <p><strong>⚠️ ${isEN ? 'Guardrails Active' : 'Leitplanken aktiv'}:</strong> ${isEN
      ? `This report considers ${p.ki_guardrails.length} defined AI guardrails.`
      : `Dieser Report berücksichtigt ${p.ki_guardrails.length} definierte KI-Guardrails.`
    }</p>
  </div>` : ''}
</section>

<!-- STRATEGIC CONTEXT -->
<section class="chapter">
  <h2>1. ${L.strategic_context}</h2>
  <div class="context-grid">
    <div class="context-card card-goal no-break">
      <div class="context-card-title">${SVG_ICONS.circle}<span>${isEN ? 'Strategic Goals' : 'Strategische Ziele'}</span></div>
      <p>${p.strategische_ziele}</p>
    </div>
    <div class="context-card card-process no-break">
      <div class="context-card-title">${SVG_ICONS.triangle}<span>${isEN ? 'Time-Critical Processes' : 'Zeitkritische Prozesse'}</span></div>
      <p>${p.zeitersparnis_prioritaet}</p>
    </div>
    <div class="context-card card-model no-break">
      <div class="context-card-title">${SVG_ICONS.hexagon}<span>${isEN ? 'Business Model Evolution' : 'Geschäftsmodell-Evolution'}</span></div>
      <p>${p.geschaeftsmodell_evolution}</p>
    </div>
    <div class="context-card card-vision no-break">
      <div class="context-card-title">${SVG_ICONS.node}<span>${isEN ? 'Vision 2027' : 'Vision 2027'}</span></div>
      <p>${p.vision_3_jahre}</p>
    </div>
    <div class="context-card card-tools no-break">
      <div class="context-card-title">${SVG_ICONS.square}<span>${isEN ? 'Current AI Projects' : 'Aktuelle KI-Projekte'}</span></div>
      <p>${p.ki_projekte}</p>
    </div>
    <div class="context-card card-change no-break">
      <div class="context-card-title">${SVG_ICONS.wave}<span>${isEN ? 'Industry' : 'Branche'}</span></div>
      <p>${p.branche} – ${p.mitarbeiter} ${isEN ? 'employees' : 'Mitarbeiter'}</p>
    </div>
  </div>
  ${hasGuardrails ? `
  <div class="callout callout-guardrails no-break">
    <h4>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L2 18H18L10 2Z" fill="#DC8383" fill-opacity="0.2" stroke="#DC8383" stroke-width="1.5"/>
        <text x="10" y="14" text-anchor="middle" fill="#DC8383" font-size="10" font-weight="bold">!</text>
      </svg>
      ${L.guardrails}
    </h4>
    <ul>
      ${p.ki_guardrails.map(g => `<li>${g}</li>`).join('\n      ')}
    </ul>
  </div>` : ''}
</section>

<!-- QUICK WINS -->
<section class="chapter">
  <h2>2. ${L.quick_wins}</h2>
  <div class="quick-wins no-break">
    <h3>🚀 Top ${quickWins.length} Quick Wins</h3>
    ${quickWins.map((qw, i) => `
    <div class="quick-win-card">
      <strong>${i + 1}. ${qw.title}:</strong> ${qw.desc}
    </div>`).join('')}
  </div>
  <table>
    <thead>
      <tr>
        <th>${isEN ? 'Measure' : 'Maßnahme'}</th>
        <th>${L.effort}</th>
        <th>${L.impact}</th>
        <th>${L.priority}</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>${isEN ? 'AI Tool Evaluation' : 'KI-Tool-Evaluation'}</td><td>${isEN ? 'Low' : 'Gering'}</td><td>${isEN ? 'High' : 'Hoch'}</td><td><span class="score-chip score-high">★★★</span></td></tr>
      <tr><td>${isEN ? 'Start Pilot Project' : 'Pilot-Projekt starten'}</td><td>${isEN ? 'Medium' : 'Mittel'}</td><td>${isEN ? 'Very High' : 'Sehr hoch'}</td><td><span class="score-chip score-high">★★★</span></td></tr>
      <tr><td>${isEN ? 'Setup Governance' : 'Governance aufsetzen'}</td><td>${isEN ? 'Medium' : 'Mittel'}</td><td>${isEN ? 'Medium' : 'Mittel'}</td><td><span class="score-chip score-medium">★★☆</span></td></tr>
      <tr><td>${isEN ? 'Prepare Scaling' : 'Skalierung vorbereiten'}</td><td>${isEN ? 'High' : 'Hoch'}</td><td>${isEN ? 'High' : 'Hoch'}</td><td><span class="score-chip score-medium">★★☆</span></td></tr>
    </tbody>
  </table>
</section>

<!-- 90-DAY ROADMAP -->
<section class="chapter">
  <h2>3. ${L.roadmap_90d}</h2>
  ${roadmap90d.map((phase, i) => `
  <div class="roadmap-phase ${i === 1 ? 'phase-2' : i === 2 ? 'phase-3' : ''} no-break">
    <h4>📅 ${L.phase} ${i + 1}: ${phase.phase}</h4>
    <ul>
      ${phase.tasks.map(t => `<li>${t}</li>`).join('\n      ')}
    </ul>
  </div>`).join('')}
</section>

<!-- 6-12 MONTH ROADMAP -->
<section class="chapter">
  <h2>4. ${L.roadmap_12m}</h2>
  <div class="roadmap-phase no-break">
    <h4>📅 ${isEN ? 'Month 4-6: Expansion' : 'Monat 4-6: Expansion'}</h4>
    <ul>
      <li>${isEN ? 'Roll out pilot projects' : 'Pilot-Projekte ausrollen'}</li>
      <li>${isEN ? 'Establish AI governance' : 'KI-Governance etablieren'}</li>
      <li>${isEN ? 'Implement ROI measurement' : 'ROI-Messung implementieren'}</li>
    </ul>
  </div>
  <div class="roadmap-phase phase-2 no-break">
    <h4>📅 ${isEN ? 'Month 7-9: Optimization' : 'Monat 7-9: Optimierung'}</h4>
    <ul>
      <li>${isEN ? 'Process optimization' : 'Prozessoptimierung'}</li>
      <li>${isEN ? 'Advanced training' : 'Fortgeschrittene Schulungen'}</li>
      <li>${isEN ? 'Integration deepening' : 'Integrationsvertiefung'}</li>
    </ul>
  </div>
  <div class="roadmap-phase phase-3 no-break">
    <h4>📅 ${isEN ? 'Month 10-12: Scaling' : 'Monat 10-12: Skalierung'}</h4>
    <ul>
      <li>${isEN ? 'Enterprise-wide rollout' : 'Unternehmensweiter Rollout'}</li>
      <li>${isEN ? 'Continuous improvement' : 'Kontinuierliche Verbesserung'}</li>
      <li>${isEN ? 'Vision achievement' : 'Erreichung der Vision'}: ${p.vision_3_jahre}</li>
    </ul>
  </div>
</section>

<!-- RISKS & COMPLIANCE -->
<section class="chapter">
  <h2>5. ${L.risks}</h2>
  <h3>5.1 ${isEN ? 'Identified Risks' : 'Identifizierte Risiken'}</h3>
  <table>
    <thead>
      <tr>
        <th>${isEN ? 'Risk' : 'Risiko'}</th>
        <th>${isEN ? 'Probability' : 'Wahrscheinlichkeit'}</th>
        <th>${isEN ? 'Impact' : 'Auswirkung'}</th>
        <th>${isEN ? 'Mitigation' : 'Mitigation'}</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>${isEN ? 'Data Privacy Violation' : 'Datenschutzverletzung'}</td><td>${isEN ? 'Medium' : 'Mittel'}</td><td><span class="score-chip score-high">${isEN ? 'High' : 'Hoch'}</span></td><td>${isEN ? 'GDPR-compliant tool selection' : 'DSGVO-konforme Tool-Auswahl'}</td></tr>
      <tr><td>${isEN ? 'Acceptance Issues' : 'Akzeptanzprobleme'}</td><td>${isEN ? 'Medium' : 'Mittel'}</td><td><span class="score-chip score-medium">${isEN ? 'Medium' : 'Mittel'}</span></td><td>${isEN ? 'Change management, training' : 'Change Management, Schulungen'}</td></tr>
      <tr><td>${isEN ? 'Vendor Lock-in' : 'Vendor Lock-in'}</td><td>${isEN ? 'Low' : 'Gering'}</td><td><span class="score-chip score-medium">${isEN ? 'Medium' : 'Mittel'}</span></td><td>${isEN ? 'Multi-vendor strategy' : 'Multi-Vendor-Strategie'}</td></tr>
    </tbody>
  </table>
  ${hasGuardrails ? `
  <h3>5.2 ${isEN ? 'Guardrails Compliance' : 'Guardrails-Compliance'}</h3>
  <p>${isEN ? 'The defined AI guardrails are considered in all recommendations:' : 'Die definierten KI-Leitplanken werden in allen Empfehlungen berücksichtigt:'}</p>
  <ul>
    ${p.ki_guardrails.map(g => `<li>✓ ${g}</li>`).join('\n    ')}
  </ul>` : ''}
</section>

<!-- BUSINESS CASE -->
<section class="chapter">
  <h2>6. ${L.business_case}</h2>
  <table>
    <thead>
      <tr>
        <th>KPI</th>
        <th>${isEN ? 'Current' : 'Aktuell'}</th>
        <th>${isEN ? 'Target (12M)' : 'Ziel (12M)'}</th>
        <th>${isEN ? 'Improvement' : 'Verbesserung'}</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>${isEN ? 'Time Savings' : 'Zeitersparnis'}</td><td>0%</td><td>30%</td><td><span class="score-chip score-high">+30%</span></td></tr>
      <tr><td>${isEN ? 'Process Efficiency' : 'Prozesseffizienz'}</td><td>60%</td><td>85%</td><td><span class="score-chip score-high">+25%</span></td></tr>
      <tr><td>${isEN ? 'Error Rate' : 'Fehlerquote'}</td><td>5%</td><td>2%</td><td><span class="score-chip score-high">-60%</span></td></tr>
      <tr><td>${isEN ? 'Employee Satisfaction' : 'MA-Zufriedenheit'}</td><td>65%</td><td>80%</td><td><span class="score-chip score-medium">+15%</span></td></tr>
    </tbody>
  </table>
</section>

<!-- TOOLS -->
<section class="chapter">
  <h2>7. ${L.tools}</h2>
  <div class="context-grid">
    <div class="context-card card-goal no-break">
      <div class="context-card-title">${SVG_ICONS.square}<span>${isEN ? 'Text Generation' : 'Textgenerierung'}</span></div>
      <p>ChatGPT, Claude, Jasper AI</p>
    </div>
    <div class="context-card card-process no-break">
      <div class="context-card-title">${SVG_ICONS.wave}<span>${isEN ? 'Image Generation' : 'Bildgenerierung'}</span></div>
      <p>Midjourney, DALL-E, Stable Diffusion</p>
    </div>
  </div>
</section>

<!-- CHANGE MANAGEMENT -->
<section class="chapter">
  <h2>8. ${L.change}</h2>
  <div class="context-grid">
    <div class="context-card card-change no-break">
      <div class="context-card-title">${SVG_ICONS.node}<span>${isEN ? 'Communication' : 'Kommunikation'}</span></div>
      <p>${isEN ? 'Regular updates, transparent roadmap, open Q&A sessions' : 'Regelmäßige Updates, transparente Roadmap, offene Q&A-Sessions'}</p>
    </div>
    <div class="context-card card-vision no-break">
      <div class="context-card-title">${SVG_ICONS.circle}<span>${isEN ? 'Training' : 'Schulungen'}</span></div>
      <p>${isEN ? 'Role-specific training, hands-on workshops, peer learning' : 'Rollenspezifische Schulungen, Hands-on Workshops, Peer Learning'}</p>
    </div>
  </div>
</section>

<!-- GLOSSARY -->
<section class="annex-section">
  <h2>Annex: ${L.glossary}</h2>
  ${glossary.map(g => `
  <p><span class="glossary-term">${g.term}:</span></p>
  <p class="glossary-def">${g.def}</p>`).join('')}
</section>

<!-- FOOTER -->
<footer class="footer">
  <p>KI-Status-Report · ${p.code}: ${p.name} · ${isEN ? 'Generated' : 'Generiert'}: ${timestamp}</p>
  <p>© 2025 KI-Beratung · ${isEN ? 'All rights reserved' : 'Alle Rechte vorbehalten'} · PDF-Rendering Test v2.0 (${p.lang.toUpperCase()})</p>
</footer>

</body>
</html>`;
}

// ============================================================================
// MAIN
// ============================================================================
function main() {
  const outputDir = path.join(__dirname, 'html-dual-lang');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating dual-language test HTML files...\n');

  for (const [key, profile] of Object.entries(ALL_PROFILES)) {
    const filename = `test_${profile.code}_${key}.html`;
    const filepath = path.join(outputDir, filename);
    const html = generateDualLangHTML(key);

    fs.writeFileSync(filepath, html, 'utf8');
    console.log(`✓ ${filename} (${(html.length / 1024).toFixed(1)} KB) [${profile.lang.toUpperCase()}]`);
  }

  console.log(`\n✓ Generated ${Object.keys(ALL_PROFILES).length} HTML files in: ${outputDir}`);
}

module.exports = { generateDualLangHTML, ALL_PROFILES };

if (require.main === module) {
  main();
}
