/**
 * Dual-Language Test Profiles (DE + EN)
 * For comprehensive PDF rendering QA
 */
'use strict';

// ============================================================================
// GERMAN PROFILES (DE)
// ============================================================================
const PROFILES_DE = {
  solo_beratung_ki_assessments: {
    name: 'Solo/Beratung KI-Assessments',
    code: 'DE-A',
    lang: 'de',
    strategische_ziele: 'Zeitersparnis bei Routineaufgaben, Qualitätssteigerung der Beratungsleistungen',
    zeitersparnis_prioritaet: 'Dokumentation, E-Mail-Korrespondenz, Recherche',
    hauptleistung: 'Unternehmensberatung für KMU mit Fokus auf KI-Assessments',
    ki_projekte: 'ChatGPT für Textvorlagen, erste Versuche mit Midjourney',
    geschaeftsmodell_evolution: 'Von Stunden-Abrechnung zu Pauschal-Paketen',
    vision_3_jahre: 'Führender KI-gestützter Berater in der Region',
    ki_guardrails: null,
    branche: 'Beratung',
    mitarbeiter: 1,
    // Section labels (German)
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategischer Kontext & Leitplanken',
      quick_wins: 'Quick Wins & Sofortmaßnahmen',
      roadmap_90d: '90-Tage-Roadmap',
      roadmap_12m: '6–12 Monate Roadmap',
      risks: 'Risiken & Compliance',
      recommendations: 'Handlungsempfehlungen',
      business_case: 'Business Case & KPIs',
      tools: 'Empfohlene Tools & Technologien',
      change: 'Change Management',
      glossary: 'Glossar',
      focus: 'Fokus',
      key_challenges: 'Wesentliche Belastungen',
      guardrails: 'KI-Leitplanken (Guardrails)',
      phase: 'Phase',
      priority: 'Priorität',
      effort: 'Aufwand',
      impact: 'Impact',
    }
  },

  kmu_industrie_production_advisory: {
    name: 'KMU Industrie/Produktion',
    code: 'DE-B',
    lang: 'de',
    strategische_ziele: 'Predictive Maintenance, Qualitätskontrolle optimieren, Lieferketten-Transparenz',
    zeitersparnis_prioritaet: 'Berichtswesen, Qualitätsprotokolle, Lieferanten-Kommunikation',
    hauptleistung: 'Maschinenbau und Fertigung von Präzisionsteilen',
    ki_projekte: 'ERP-Integration geplant, Bildanalyse für QS in Pilotphase',
    geschaeftsmodell_evolution: 'Von Einzelfertigung zu Smart Factory',
    vision_3_jahre: 'Industrie 4.0 Vorreiter im Mittelstand',
    ki_guardrails: null,
    branche: 'Industrie/Maschinenbau',
    mitarbeiter: 85,
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategischer Kontext & Leitplanken',
      quick_wins: 'Quick Wins & Sofortmaßnahmen',
      roadmap_90d: '90-Tage-Roadmap',
      roadmap_12m: '6–12 Monate Roadmap',
      risks: 'Risiken & Compliance',
      recommendations: 'Handlungsempfehlungen',
      business_case: 'Business Case & KPIs',
      tools: 'Empfohlene Tools & Technologien',
      change: 'Change Management',
      glossary: 'Glossar',
      focus: 'Fokus',
      key_challenges: 'Wesentliche Belastungen',
      guardrails: 'KI-Leitplanken (Guardrails)',
      phase: 'Phase',
      priority: 'Priorität',
      effort: 'Aufwand',
      impact: 'Impact',
    }
  },

  kmu_guardrails_test: {
    name: 'KMU mit Guardrails (DE)',
    code: 'DE-C',
    lang: 'de',
    strategische_ziele: 'Digitalisierung mit Augenmaß, Mitarbeiter mitnehmen',
    zeitersparnis_prioritaet: 'HR-Prozesse, Bewerbermanagement, Onboarding',
    hauptleistung: 'Personaldienstleistungen und Zeitarbeit',
    ki_projekte: 'Bewerbungs-Screening-Tool evaluiert',
    geschaeftsmodell_evolution: 'Hybrid: Persönliche Beratung + KI-Unterstützung',
    vision_3_jahre: 'Ethischer KI-Einsatz als Differenzierungsmerkmal',
    ki_guardrails: [
      'Kein vollautomatisiertes Ablehnen von Bewerbungen',
      'Transparenz gegenüber Kandidaten bei KI-Einsatz',
      'Keine biometrische Analyse ohne Einwilligung',
      'Personalentscheidungen immer mit menschlicher Prüfung',
      'DSGVO-konforme Datenverarbeitung zwingend',
    ],
    branche: 'HR/Personaldienstleistung',
    mitarbeiter: 45,
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategischer Kontext & Leitplanken',
      quick_wins: 'Quick Wins & Sofortmaßnahmen',
      roadmap_90d: '90-Tage-Roadmap',
      roadmap_12m: '6–12 Monate Roadmap',
      risks: 'Risiken & Compliance',
      recommendations: 'Handlungsempfehlungen',
      business_case: 'Business Case & KPIs',
      tools: 'Empfohlene Tools & Technologien',
      change: 'Change Management',
      glossary: 'Glossar',
      focus: 'Fokus',
      key_challenges: 'Wesentliche Belastungen',
      guardrails: 'KI-Leitplanken (Guardrails)',
      phase: 'Phase',
      priority: 'Priorität',
      effort: 'Aufwand',
      impact: 'Impact',
    }
  },
};

// ============================================================================
// ENGLISH PROFILES (EN)
// ============================================================================
const PROFILES_EN = {
  solo_consulting_en: {
    name: 'Solo Consulting (EN)',
    code: 'EN-A',
    lang: 'en',
    strategische_ziele: 'Time savings on routine tasks, quality improvement of consulting services',
    zeitersparnis_prioritaet: 'Documentation, email correspondence, research',
    hauptleistung: 'Business consulting for SMEs with focus on AI assessments',
    ki_projekte: 'ChatGPT for text templates, initial experiments with Midjourney',
    geschaeftsmodell_evolution: 'From hourly billing to fixed-price packages',
    vision_3_jahre: 'Leading AI-powered consultant in the region',
    ki_guardrails: null,
    branche: 'Consulting',
    mitarbeiter: 1,
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategic Context & Guidelines',
      quick_wins: 'Quick Wins & Immediate Actions',
      roadmap_90d: '90-Day Roadmap',
      roadmap_12m: '6–12 Month Roadmap',
      risks: 'Risks & Compliance',
      recommendations: 'Recommendations',
      business_case: 'Business Case & KPIs',
      tools: 'Recommended Tools & Technologies',
      change: 'Change Management',
      glossary: 'Glossary',
      focus: 'Focus',
      key_challenges: 'Key Challenges',
      guardrails: 'AI Guardrails',
      phase: 'Phase',
      priority: 'Priority',
      effort: 'Effort',
      impact: 'Impact',
    }
  },

  team_it_en: {
    name: 'Team IT (EN)',
    code: 'EN-B',
    lang: 'en',
    strategische_ziele: 'DevOps automation, code review acceleration',
    zeitersparnis_prioritaet: 'Testing, documentation, code reviews',
    hauptleistung: 'Software development and IT consulting',
    ki_projekte: 'GitHub Copilot, Claude for documentation, custom LLM experiments',
    geschaeftsmodell_evolution: 'SaaS transformation, AI-first product development',
    vision_3_jahre: 'AI-native development processes, 50% less time-to-market',
    ki_guardrails: null,
    branche: 'IT/Software',
    mitarbeiter: 12,
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategic Context & Guidelines',
      quick_wins: 'Quick Wins & Immediate Actions',
      roadmap_90d: '90-Day Roadmap',
      roadmap_12m: '6–12 Month Roadmap',
      risks: 'Risks & Compliance',
      recommendations: 'Recommendations',
      business_case: 'Business Case & KPIs',
      tools: 'Recommended Tools & Technologies',
      change: 'Change Management',
      glossary: 'Glossary',
      focus: 'Focus',
      key_challenges: 'Key Challenges',
      guardrails: 'AI Guardrails',
      phase: 'Phase',
      priority: 'Priority',
      effort: 'Effort',
      impact: 'Impact',
    }
  },

  kmu_guardrails_en: {
    name: 'SME with Guardrails (EN)',
    code: 'EN-C',
    lang: 'en',
    strategische_ziele: 'Measured digitalization, employee engagement',
    zeitersparnis_prioritaet: 'HR processes, applicant management, onboarding',
    hauptleistung: 'HR services and temporary staffing',
    ki_projekte: 'Application screening tool evaluation',
    geschaeftsmodell_evolution: 'Hybrid: Personal consulting + AI support',
    vision_3_jahre: 'Ethical AI use as differentiator',
    ki_guardrails: [
      'No fully automated rejection of applications',
      'Transparency towards candidates regarding AI use',
      'No biometric analysis without consent',
      'Personnel decisions always with human review',
      'GDPR-compliant data processing mandatory',
    ],
    branche: 'HR/Staffing Services',
    mitarbeiter: 45,
    labels: {
      executive_summary: 'Executive Summary',
      strategic_context: 'Strategic Context & Guidelines',
      quick_wins: 'Quick Wins & Immediate Actions',
      roadmap_90d: '90-Day Roadmap',
      roadmap_12m: '6–12 Month Roadmap',
      risks: 'Risks & Compliance',
      recommendations: 'Recommendations',
      business_case: 'Business Case & KPIs',
      tools: 'Recommended Tools & Technologies',
      change: 'Change Management',
      glossary: 'Glossary',
      focus: 'Focus',
      key_challenges: 'Key Challenges',
      guardrails: 'AI Guardrails',
      phase: 'Phase',
      priority: 'Priority',
      effort: 'Effort',
      impact: 'Impact',
    }
  },
};

// ============================================================================
// COMBINED PROFILES
// ============================================================================
const ALL_PROFILES = {
  ...PROFILES_DE,
  ...PROFILES_EN,
};

// ============================================================================
// LANGUAGE-SPECIFIC TERMS (for parity checking)
// ============================================================================
const GERMAN_TERMS = [
  'Strategischer Kontext',
  'Leitplanken',
  'Sofortmaßnahmen',
  'Handlungsempfehlungen',
  'Risiken',
  'Glossar',
  'Aufwand',
  'Priorität',
  'Wesentliche Belastungen',
  'Geschäftsmodell',
  'Zeitersparnis',
  'Berichtswesen',
  'Qualitätskontrolle',
  'Bewerbermanagement',
  'Personalentscheidungen',
  'Datenverarbeitung',
];

const ENGLISH_TERMS = [
  'Strategic Context',
  'Guidelines',
  'Immediate Actions',
  'Recommendations',
  'Risks',
  'Glossary',
  'Effort',
  'Priority',
  'Key Challenges',
  'Business Model',
  'Time Savings',
  'Reporting',
  'Quality Control',
  'Applicant Management',
  'Personnel Decisions',
  'Data Processing',
];

module.exports = {
  PROFILES_DE,
  PROFILES_EN,
  ALL_PROFILES,
  GERMAN_TERMS,
  ENGLISH_TERMS,
};
