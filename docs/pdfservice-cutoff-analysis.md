# Sprint 1027.5.2-DIAG — Cutoff-Analyse `make-ki-pdfservice`

**Datum:** 2026-05-30
**Branch analysiert:** `claude/jolly-newton-L2UjA` (Stand HEAD = `150f167`)
**Scope:** Statische Repo-Analyse, **kein** Code-Eingriff.
**Auslöser:** KIS-1201 — Backend sendet 3 `<li>` (1557 chars), PDF zeigt 1 abgeschnittenen Bullet (~162 chars).

---

## 1. Repo-Struktur (2 Ebenen)

```
make-ki-pdfservice/
├── Dockerfile              # ghcr.io/puppeteer/puppeteer:22.10.0
├── package.json            # express, helmet, prom-client, puppeteer ^22.10.0, pino
├── railway.toml            # Railway-Deploy-Config, healthcheck /health
├── README.md
├── PLATIN-AUDIT-REPORT.md
├── .env.example
├── .dockerignore
├── index.js                # ★ EINZIGE Service-Logik (793 LOC)
├── test-render.js          # Self-Test (153 LOC)
└── test/
    ├── pdf-rendering-test.js          # E2E-Render-Tests
    ├── dual-lang-pdf-test.js
    ├── generate-test-html.js          # ★ Test-HTML-Generator (eigene CSS!)
    ├── generate-dual-lang-html.js     # ★ Test-HTML-Generator (eigene CSS!)
    ├── test-profiles.js
    ├── test-profiles-dual-lang.js
    ├── RENDERING-TEST-REPORT.md
    └── DUAL-LANG-TEST-REPORT.md
```

**Keine eigenen Templates, kein `templates/`, kein `css/`, kein `assets/`.**
Die einzigen HTML/CSS-Artefakte im Repo liegen in `test/` und werden ausschließlich für Selbsttests verwendet.

---

## 2. Tech-Stack

| Komponente | Wert |
|---|---|
| Runtime | Node.js (CommonJS) |
| HTTP | express ^4.19.2 |
| Headless-Browser | **puppeteer ^22.10.0**, Chromium aus `ghcr.io/puppeteer/puppeteer:22.10.0` |
| Headless-Modus | `PUPPETEER_HEADLESS=new` (also `headless: true` / "new headless mode") |
| Pool | 6 BrowserContexts pro Browser (FIFO-Queue, max 24 wartend, 25s Wait-Timeout) |
| Render-Timeout | 60 s |
| Body-Limit | 20 MB JSON / 20 MB urlencoded |
| HTML-Payload-Limit | 1024 KB (`PDF_MAX_HTML_KB`) — hard fail bei Überschreitung |

---

## 3. HTML-Verarbeitungs-Flow

```
┌──────────────────────────────┐
│ POST /generate-pdf           │
│ { html, filename, maxBytes,  │
│   pdf_options }              │
└──────────────┬───────────────┘
               │
       handleRender (index.js:670)
               │
   ┌───────────▼────────────┐
   │ checkAndSlimPayload    │  ← 413 wenn > HTML_MAX_BYTES (Default 1 MB)
   │  (Default: hard fail)  │
   └───────────┬────────────┘
               │
   ┌───────────▼────────────┐
   │ sanitizePdfOptions     │  ← Whitelist: format,printBackground,
   │                        │     displayHeaderFooter,headerTemplate,
   │                        │     footerTemplate,margin
   └───────────┬────────────┘
               │
   ┌───────────▼─────────────────────────────────────────────┐
   │ renderToBufferAdaptive  →  4 Degradierungs-Pässe        │
   │  Pass1: PDF_PRINT_BG, scale=0.94                        │
   │  Pass2: printBackground=false, scale=0.94               │
   │  Pass3: scale=0.90                                      │
   │  Pass4: scale=0.85 + blockAssets (Bilder/Fonts blocked) │
   │  → wechselt nur bei 413 (pdf_too_large)                 │
   └───────────┬─────────────────────────────────────────────┘
               │
   ┌───────────▼────────────┐
   │ renderWithOptions      │  (index.js:477)
   │                        │
   │  1. sanitize(html)     │  ★★★ MUTIERT EINGEHENDES HTML
   │     ├─ stripScripts    │     (entfernt <script>)
   │     ├─ stripAtRules    │     (entfernt @page { ... } !!!)
   │     └─ minifySoft      │
   │        ├─ HTML-Kommentare entfernen
   │        ├─ consolidateStyles   ★ Alle <style>-Blöcke werden
   │        │   zusammengeführt und in <head> umgehängt
   │        ├─ minifyCSS per <style>
   │        ├─ />\s+</  → "><"
   │        └─ /\s{2,}/ → " "
   │                        │
   │  2. page.setViewport(794×1123, dsf=1) │
   │  3. page.setContent(safeHtml,         │
   │     { waitUntil: 'networkidle0' })    │
   │  4. page.pdf({                        │
   │       format: 'A4' (forced),          │
   │       preferCSSPageSize: true,        │
   │       scale: 0.94 (forced default),   │
   │       printBackground: false (def),   │
   │       margin: 15mm overall (forced),  │
   │       displayHeaderFooter: false      │
   │     })                                │
   └──────────────┬───────────────────────┘
                  │
            PDF bytes → 200
```

**Wichtig:** Es gibt **keinen** `page.emulateMediaType('print')`-Aufruf — `page.pdf()` aktiviert das Print-Medium implizit, das ist OK.

---

## 4. (Aufgabe A) Lebt der CSS-Fix in diesem Repo?

**Antwort: NEIN.**

Eine vollständige Repo-Suche nach allen Fix-Markern brachte keinerlei Treffer:

| Suchbegriff | Treffer im pdfservice-Repo |
|---|---|
| `exec-decision-box` | 0 |
| `decision > div` | 0 |
| `EXECUTIVE_DECISION` | 0 |
| `FIX-KIS-1027` | 0 |
| `1027.2` / `1027.4` / `1027.5` | 0 |
| `atomic` / `atomar` | 0 |

Daraus folgt eindeutig: **Die drei Iterationen 1027.2.3 / 1027.4 / 1027.5 wurden ausschließlich im Backend-Repo `api-ki-backend-neu` gepflegt**. In `make-ki-pdfservice` existiert weder die betroffene CSS-Klasse noch der zugehörige Fix.

---

## 5. (Aufgabe B) Was passiert mit dem Backend-HTML?

Das HTML wird **nicht** 1:1 an Chromium übergeben. Vor `page.setContent()` läuft `sanitize()` (index.js:158–164), die folgende Mutationen vornimmt — alle aktiv per Default:

| Schritt | Default-ENV | Risiko für Bullet-Cutoff |
|---|---|---|
| `stripScripts` | `PDF_STRIP_SCRIPTS=1` | Niedrig — entfernt nur `<script>` |
| **`stripAtRules`** | **`PDF_STRIP_PAGE_AT_RULES=1`** | ★★★ **Hoch** — entfernt jede `@page { … }` aus dem HTML |
| **`consolidateStyles`** | `PDF_MINIFY_HTML=1` | ★★ **Mittel-Hoch** — verändert Kaskaden-Reihenfolge |
| `minifyCSS` | `PDF_MINIFY_HTML=1` | Niedrig — sollte Selektoren intakt lassen |
| `>\s+<` → `><` | `PDF_MINIFY_HTML=1` | Niedrig (außer in `<pre>`, aber nicht relevant) |
| `\s{2,}` → ` ` | `PDF_MINIFY_HTML=1` | Niedrig (whitespace collapse) |

Pseudocode des `sanitize`-Pfads (gekürzt):
```js
function sanitize(html) {
  h = stripScripts(h);        // index.js:85
  h = stripAtRules(h);        // index.js:89 — @page weg!
  h = minifySoft(h);          // index.js:141
  return h;
}
function minifySoft(html) {
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = consolidateStyles(s);   // ★ alle <style> nach <head> verschoben
  s = s.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => `<style>${minifyCSS(css)}</style>`);
  s = s.replace(/>\s+</g, '><');
  s = s.replace(/\s{2,}/g, ' ');
}
```

**Konsequenzen für den 1027.5-Fix:**
1. Falls das Backend `@page` für Seitengröße/Margins definiert → **wird im pdfservice entfernt**. Anschließend greift `preferCSSPageSize: true` ins Leere, und die im Code hartcodierten `format: 'A4'` + `margin: 15mm` werden wirksam. Die effektive Seitenhöhe weicht dadurch ggf. von dem ab, was der Backend-Designer geplant hat — eine `break-inside: avoid`-Box, die für die ursprüngliche Seitenhöhe gerade noch passte, wird damit potenziell zu groß.
2. `consolidateStyles` verändert die **Reihenfolge der Style-Blöcke**. Wenn der Backend-Designer einen späteren `<style>`-Block nach dem ersten platziert hat, um eine frühere Regel zu überschreiben (Cascade-by-order bei gleicher Spezifität), kann das nach dem Zusammenführen in falscher Reihenfolge enden — der 1027.5-Selector könnte überschrieben werden.

---

## 6. (Aufgabe C) Kritische Chromium-Print-Einstellungen

`page.pdf()`-Optionen aus `renderWithOptions` (index.js:510–544):

| Option | Default-Wert | Quelle |
|---|---|---|
| `format` | `'A4'` | Hardcoded (überschreibbar via `pdf_options.format`) |
| `landscape` | `false` | Hardcoded |
| `preferCSSPageSize` | `true` | Hardcoded |
| `printBackground` | **`false`** (`PDF_PRINT_BACKGROUND=0`) | Default-ENV |
| `scale` | `0.94` (`PDF_SCALE=0.94`) | Default-ENV |
| `displayHeaderFooter` | `false` | Hardcoded |
| `margin` | **`{top:15mm, right:15mm, bottom:15mm, left:15mm}`** | Hardcoded |
| `emulateMediaType('print')` | **nicht gesetzt** | (implizit durch `page.pdf()`) |
| `orphans` / `widows` | nicht gesetzt | — |
| `setViewport` | `794 × 1123 px, DSF=1` | Hardcoded (vor `setContent`) |
| `waitUntil` | `'networkidle0'` | Hardcoded |

**Adaptive-Pass-Kette** (nur ausgelöst, wenn `page.pdf()` ein PDF > `effectiveMaxBytes` liefert — also reine 413-Vermeidung; **nicht** ausgelöst durch Render-Probleme):
1. Default
2. `printBackground=false`, `scale=0.94`
3. `scale=0.90`
4. `scale=0.85` + `blockAssets=true` (alle Bilder/Fonts via `setRequestInterception` abgebrochen)

Ein Auslösen von Pass 3/4 würde Layouts schrumpfen lassen — sollte aber Bullets **nicht** verlieren, nur kleiner machen.

---

## 7. (Aufgabe D) Treffer-Tabelle der Fix-Marker

Repo-weite Suche (`grep -rEn`, `--include="*.{js,html,css,md}"`):

| Marker | Dateien × Zeilen | Inhalt (Auszug) |
|---|---|---|
| `exec-decision-box` | **0** | — |
| `decision > div` | **0** | — |
| `EXECUTIVE_DECISION` | **0** | — |
| `atomic` / `atomar` | **0** | — |
| `FIX-KIS-1027` | **0** | — |
| `1027.2`, `1027.4`, `1027.5` | **0** | — |
| `break-inside: avoid` (Service-Code) | **0** | — (nur in Test-HTML-Generatoren) |
| `break-inside: auto` | **0** | — |
| `@page` (Service-Code) | `index.js:91` | `stripAtRules` Regex (entfernt @page) |
| `preferCSSPageSize` | `index.js:514`, `PLATIN-AUDIT-REPORT.md:63`, `test/RENDERING-TEST-REPORT.md:176`, `test/dual-lang-pdf-test.js:24`, `test/pdf-rendering-test.js:25` | `preferCSSPageSize: true` |
| `page-break-inside: avoid` | `test/generate-dual-lang-html.js:67,84,96,103,108`, `test/generate-test-html.js:125,211,265,304,319`, `test/RENDERING-TEST-REPORT.md:41,77,127,128,149` | Nur in **Test-HTML-Erzeugern** und Doku; Service selbst injiziert nichts |

**Fazit:** Sämtliche Fix-Marker fehlen. Der Service ist „dumm" gegenüber dem konkreten Bullet-Bug — er greift weder fördernd noch schädlich gezielt in den 1027.5-Selector ein. Die einzige Berührung passiert über die generische `stripAtRules` + `consolidateStyles`.

---

## 8. (Aufgabe E) CSS-Kaskade-Befund

| Eingang | Ausgang nach `sanitize()` |
|---|---|
| `<style>A</style>` … `<style>B</style>` (in der Reihenfolge im Body / verteilt im Dokument) | Beide entfernt, **ein** konsolidierter Block `<style>A\nB</style>` direkt vor `</head>` |
| `@page { margin:12mm; size:A4; }` (in beliebigem `<style>`) | **Entfernt** durch `/@page\s*\{[^}]*\}/gi` |
| `style="…"` Inline-Styles | Bleiben erhalten (Inline > Internal, also höchste Priorität pro Element) |

**Kaskaden-Implikation:** Solange das Backend-Template seine Regeln über **Spezifität** durchsetzt (nicht über Reihenfolge), ist die Konsolidierung neutral. Wenn aber zwei Regeln gleicher Spezifität in zwei verschiedenen `<style>`-Blöcken existieren und der zweite Block die erste überschreiben soll, kann `consolidateStyles` durch die Reihenfolge im `styles[]`-Array (Dokumentenreihenfolge per `RegExp.exec`-Iteration) das Ergebnis verändern — in der Regel allerdings deterministisch in Dokumentenreihenfolge, was die Cascade-Semantik bewahrt. **Geringes Risiko**, sofern keine `<style>`-Blöcke an exotischen Stellen (etwa zwischen verschiedenen Tabellen) eingebettet sind.

**`@page`-Stripping ist die größere Bedrohung**: jede vom Backend definierte Seiten-Geometrie verschwindet stillschweigend.

---

## 9. (Aufgabe F) Deployment-Status

| Punkt | Wert / Befund |
|---|---|
| Letzter Commit auf `main` | `150f167 Merge pull request #8 from … add-pdf-options-support` |
| Letzter Feature-Commit | `455ef6f Add pdf_options support for Puppeteer page.pdf()` |
| Aktueller Branch hier | `claude/jolly-newton-L2UjA` (sauber, nichts staged) |
| Deploy-Pipeline | Railway (`railway.toml`), Healthcheck `/health` |
| Chromium-Version | Bundle aus `ghcr.io/puppeteer/puppeteer:22.10.0` (Chromium ≈ 125.x) |
| Build-Step für CSS | Keiner — Service kompiliert/transformiert kein Asset zur Build-Zeit |
| Asset-Cache | Keiner — Service hält keine Templates/CSS vor |
| Service-Version-String (Code) | `pdf service v2.4.0` (siehe `/health/html`) |

**Es gibt keine Drift zwischen Build und Source.** Was im Code steht, läuft so im Container.

---

## 10. (Aufgabe G) Gegenprobe Backend-Repo

**Konnte nicht direkt durchgeführt werden** — diese Session ist auf `wolf-achtung/make-ki-pdfservice` beschränkt (siehe System-Repository-Scope). Der Zugriff auf `api-ki-backend-neu` und `PR #1042` ist mit den verfügbaren GitHub-MCP-Tools für diesen Auftrag nicht freigegeben.

Indirekter Befund: Da im pdfservice **kein** Marker des Fixes existiert (siehe §7) und das Repo **kein** eigenes Template enthält, das den Selector `.exec-decision-box` erwähnt, **muss** der Fix tatsächlich im Backend-CSS-Template leben — andernfalls hätte er nirgendwo Wirkung entfalten können. Eine echte Diff-Verifikation der Backend-PR #1042 setzt eine separate Session auf dem Backend-Repo voraus.

---

## 11. (Aufgabe H) Pipeline-Lücken-Analyse

Aus 5.1-A-Instrumentierung: **Backend Stage 7** zeigt `len=1557, li=3` als Payload an `/generate-pdf`. Welche Mutationen schlucken Bullet-Form?

| Punkt im pdfservice | Risiko, dass aus 3×`<li>` 1×abgeschnittenes wird |
|---|---|
| `checkAndSlimPayload` (1557 chars sind weit unter 1 MB) | **Null** |
| `sanitize → stripScripts` | **Null** |
| `sanitize → stripAtRules` | **Mittel** — verändert nicht die `<li>`, aber die Seitengeometrie |
| `sanitize → minifySoft` → `consolidateStyles` | **Niedrig-Mittel** — möglich, wenn 1027.5-CSS in einem späten Style-Block stand und Reihenfolge umsortiert wurde |
| `sanitize → minifySoft` → `/\s{2,}/ → ' '` | **Null** für `<li>`-Text-Erhalt |
| `setContent({ waitUntil: 'networkidle0' })` | **Null** — verändert kein HTML |
| `page.pdf({ format:'A4', margin:15mm, scale:0.94, preferCSSPageSize:true, printBackground:false })` | **Hoch** — die forciert hartcodierten Margins/Scale plus das entfernte `@page` ergeben eine **andere** druckbare Höhe als die im Backend angenommene; eine Box mit `break-inside: avoid`, die im Backend-Layout knapp gepasst hätte, wird Chromium-seitig nicht mehr auf die Seite gequetscht — er muss Inhalt entweder umbrechen (was der `avoid` verbietet) oder **clippen** |
| `printBackground: false` | **Mittel** — entfernt visuell Hintergründe; falls die fehlenden Bullets "da, aber unsichtbar" sind, ist das Erscheinungsbild "1 sichtbarer Bullet" — Diagnose-Aussage wäre dann falsch (echtes Cutoff vs. Sichtbarkeitsverlust)|
| Pass 3 (`scale=0.90`) / Pass 4 (`scale=0.85`+blockAssets) | Wird **nicht** in 5.1-A-Trace ausgelöst, weil kein 413-Loop dokumentiert ist |

**Lücke**: Im aktuellen Service ist **kein** Logging des post-sanitize-HTMLs vorgesehen. Das HTML, das **tatsächlich** in `page.setContent()` geht, ist nicht inspizierbar — nur dessen Byte-Größe (`html_minified_bytes`). Damit lässt sich aus statischer Analyse nicht abschließend beweisen, ob `consolidateStyles` oder `stripAtRules` im konkreten Backend-Template den 1027.5-Selektor neutralisiert.

---

## 12. Diagnose

**Aussage 1 — sicher:**
> Der konkrete CSS-Fix für `.exec-decision-box` / `break-inside`-Verteilung lebt **nicht** in `make-ki-pdfservice`. Drei Iterationen Patching im pdfservice-Repo hätten **garantiert** nichts geändert, weil weder der Selektor noch die Regel hier existieren.

**Aussage 2 — sehr wahrscheinlich:**
> Selbst wenn der Backend-Fix 1027.5 fachlich korrekt ist (Container `break-inside: auto`, `<li>` atomar), kann er im pdfservice durch **zwei Default-Transformationen** entwertet werden:
>
> 1. **`PDF_STRIP_PAGE_AT_RULES=1`** entfernt jede vom Backend definierte `@page`-Regel. Die effektive Druckseite wird dadurch durch die hartcodierten Werte `format:'A4'` + `margin:15mm` + `scale:0.94` bestimmt — vermutlich nicht das, was das Backend für seine Box-Höhe annimmt.
> 2. **`PDF_MINIFY_HTML=1` → `consolidateStyles`** vereinigt mehrere `<style>`-Blöcke zu einem im `<head>` und kann die Kaskade-Reihenfolge ändern, wenn Regeln gleicher Spezifität auf Reihenfolge angewiesen sind.

**Aussage 3 — nicht abschließbar aus rein statischer Analyse:**
> Ob im konkreten KIS-1201-Render der `<li>`-Inhalt **bereits im HTML-Eingang nach Sanitize** verloren geht oder **erst in Chromium beim Pagebreaking geclippt** wird, lässt sich ohne Capture des post-`sanitize`-HTMLs oder ohne Chromium-Layout-Tree nicht eindeutig sagen. Nächster Schritt: gezielter Dump in der Render-Pipeline (siehe Fix-Optionen 1 & 2).

---

## 13. Drei Fix-Optionen für Sprint 1027.5.2

### Option A — Diagnose erst (empfohlen)

**Inhalt:** Im pdfservice einen **opt-in HTML-Dump** vor `page.setContent()` einbauen. Per Header `X-PDF-Debug-Dump: 1` oder Query `?debug=1` werden post-sanitize-HTML + finale `pdf.options` als Datei in `/tmp/pdf-debug/<uuid>.{html,json}` geschrieben und der Pfad in einem Response-Header `X-PDF-Debug-Path` zurückgegeben. Default aus.

- **Aufwand:** ~30 min Code + Test, ~1 h Deploy/Verify
- **Risiko:** sehr niedrig — read-only Pfad, opt-in, kein Effekt auf Produktion
- **Wert:** entscheidet ein für alle Mal, ob der Bullet-Cutoff vor oder nach Chromium-Layout passiert. Erst danach lässt sich gezielt patchen.

### Option B — Sanitize-Defensive (mittelfristig)

**Inhalt:**
1. `PDF_STRIP_PAGE_AT_RULES=0` als neues Default — Backend-`@page` durchlassen.
2. `consolidateStyles` ausbauen oder hinter ENV-Flag stellen (`PDF_CONSOLIDATE_STYLES=0` Default).
3. Hartcodierte `format`/`margin`/`scale` nur als Fallback, wenn weder `pdf_options` noch `@page` etwas vorgibt.
4. Optional `page.emulateMediaType('print')` explizit setzen (klarere Semantik).

- **Aufwand:** ~2 h Code, ~2 h Tests (Render-Diff gegen Referenz-PDFs aus `test/`), ~1 h Deploy
- **Risiko:** mittel — Tests müssen sicherstellen, dass bestehende Reports nicht in der Größe (PDF-Bytes) regredieren; Pass-Logik kann ggf. häufiger 413 produzieren, wenn @page großzügig ist
- **Wert:** beseitigt die zwei Default-Transformationen, die am wahrscheinlichsten den Backend-Fix entwerten

### Option C — Backend-side Workaround (kurzfristig, wenn pdfservice nicht angefasst werden soll)

**Inhalt:** Im Backend (`api-ki-backend-neu`)
1. Den 1027.5-Fix in **einen einzigen** `<style>`-Block in `<head>` legen, am Ende des Heads (immun gegen `consolidateStyles`).
2. Keine `@page`-Rule verwenden — Seitengeometrie ausschließlich über `pdf_options.format` + `pdf_options.margin` an `/generate-pdf` mitschicken.
3. Wichtige Selektoren mit **höherer Spezifität** schreiben (`html body .exec-decision-box`), damit Reihenfolgen-Drift sie nicht überschreibt.

- **Aufwand:** ~1 h Code im Backend, ~1 h Tests
- **Risiko:** niedrig im pdfservice (kein Touch), mittel im Backend (Template-Patch in produktivem Renderpfad)
- **Wert:** löst das Symptom ohne pdfservice-Deploy; verdeckt aber die Ursache (Service mutiert weiter HTML)

**Empfehlung: A zuerst, dann B oder C je nach A-Befund.**

---

## 14. Abschließender Wolf-Ping

- **Doku:** `docs/pdfservice-cutoff-analysis.md` (dieses Dokument)
- **Kernerkenntnis:** Der pdfservice ist render-only, hat **keinerlei** Spuren der drei 1027er CSS-Iterationen, aber er **mutiert eingehendes HTML aggressiv** (`@page` weg, `<style>`-Blöcke konsolidiert, harte Defaults für Format/Scale/Margin/Background). Diese Mutationen können den im Backend gepflegten 1027.5-Fix entwerten — auch wenn der Fix dort fachlich richtig ist.
- **Empfehlung Sprint 1027.5.2-FIX:** Option A (Debug-Dump) ausrollen → eine Render-Probe → dann entscheiden zwischen B (Service-Sanitize entschärfen) und C (Backend-Workaround).
- **Nicht beweisbar aus statischer Analyse:** Welche der beiden Mutationen (`stripAtRules` vs `consolidateStyles`) im konkreten KIS-1201-Render der Auslöser war.
