/**
 * Test-Profile für PDF-Rendering End-to-End Tests
 * Simuliert die 4 Testprofile aus dem Backend
 */
'use strict';

const PROFILES = {
  // Profil A: Solo/Beratung
  solo_beratung: {
    name: 'Solo/Beratung',
    code: 'A',
    strategische_ziele: 'Zeitersparnis bei Routineaufgaben, Qualitätssteigerung der Beratungsleistungen',
    zeitersparnis_prioritaet: 'Dokumentation, E-Mail-Korrespondenz, Recherche',
    hauptleistung: 'Unternehmensberatung für KMU',
    ki_projekte: 'ChatGPT für Textvorlagen, erste Versuche mit Midjourney',
    geschaeftsmodell_evolution: 'Von Stunden-Abrechnung zu Pauschal-Paketen',
    vision_3_jahre: 'Führender KI-gestützter Berater in der Region',
    ki_guardrails: null, // Keine Guardrails
    branche: 'Beratung',
    mitarbeiter: 1,
  },

  // Profil B: Team/IT
  team_it: {
    name: 'Team/IT',
    code: 'B',
    strategische_ziele: 'Automatisierung von DevOps, Code-Review-Beschleunigung',
    zeitersparnis_prioritaet: 'Testing, Dokumentation, Code-Reviews',
    hauptleistung: 'Software-Entwicklung und IT-Consulting',
    ki_projekte: 'GitHub Copilot, Claude für Dokumentation, eigene LLM-Experimente',
    geschaeftsmodell_evolution: 'SaaS-Transformation, AI-first Produktentwicklung',
    vision_3_jahre: 'KI-native Entwicklungsprozesse, 50% weniger Time-to-Market',
    ki_guardrails: null,
    branche: 'IT/Software',
    mitarbeiter: 12,
  },

  // Profil C: KMU/Industrie
  kmu_industrie: {
    name: 'KMU/Industrie',
    code: 'C',
    strategische_ziele: 'Predictive Maintenance, Qualitätskontrolle optimieren, Lieferketten-Transparenz',
    zeitersparnis_prioritaet: 'Berichtswesen, Qualitätsprotokolle, Lieferanten-Kommunikation',
    hauptleistung: 'Maschinenbau und Fertigung von Präzisionsteilen',
    ki_projekte: 'ERP-Integration geplant, Bildanalyse für QS in Pilotphase',
    geschaeftsmodell_evolution: 'Von Einzelfertigung zu Smart Factory',
    vision_3_jahre: 'Industrie 4.0 Vorreiter im Mittelstand',
    ki_guardrails: null,
    branche: 'Industrie/Maschinenbau',
    mitarbeiter: 85,
  },

  // Profil D: KMU mit Guardrails (NEU)
  kmu_guardrails: {
    name: 'KMU mit Guardrails',
    code: 'D',
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
  },
};

module.exports = { PROFILES };
