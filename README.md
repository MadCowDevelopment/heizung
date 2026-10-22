# heizung – Heizungsabrechnung

Web-App zur Erfassung von Heizungs-/Warmwasser- und Wasserzählerständen und zur jährlichen Kostenabrechnung für eine Wohngemeinschaft.
Die App ist **local-first**: Sie läuft vollständig im Browser, speichert lokal und arbeitet
ohne eigenes Backend.

Das Repository ist **spec-first** aufgebaut: Die Dokumente in `docs/` sind die maßgebliche
Spezifikation, der Code in `apps/web` setzt sie um. Bei Widersprüchen gilt das Dokument –
nicht der Code.

## Spezifikation

| Dokument | Inhalt |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | Zweck & Scope, Domänenmodell, Fachregeln R0–R11, Screens S1–S9, Datenmodell, Meilensteine M0–M3 (§6.4) |
| [`docs/architecture.md`](docs/architecture.md) | Stack, Projektstruktur, Datenmodell, Berechnungs-Kern, Sync-Engine, PDF, Deployment (§11) |
| [`docs/setup.md`](docs/setup.md) | Einmalige Einrichtung: Daten-Repo `MadCowDevelopment/heizung-data`, GitHub Pages, Fine-grained PAT |
| [`PRODUCT.md`](PRODUCT.md) | Produktvision, Nutzerbild, Leitplanken |
| [`DESIGN.md`](DESIGN.md) | Gestaltungssystem „Werkbank": Farbpalette, Typografie, Flächen, Regeln |

Domänenmodell und Datenmodell stehen in `docs/requirements.md` §2 und §7; die Datenablage
als JSON (`data/state.json`, Schema-Version 4) in `docs/architecture.md` §4.

## Status: Meilenstein M2 („Abrechnung“)

**M0 und M1** (Cloud, Verbrauch & Abschläge) sowie **M2** (Abrechnung) sind laut
[`docs/requirements.md` §6.4](docs/requirements.md) umgesetzt. Kurzfassung:

**Umgesetzt und getestet**

- **Web-App** unter `apps/web`: Vite + React + TypeScript, Tailwind CSS, `HashRouter`
  (robuste Deep Links auf GitHub Pages ohne 404-Fallback).
- **Zustandsverwaltung** mit zustand; jede Mutation schreibt sofort in den lokalen Speicher.
- **Persistenz** über `StorageAdapter` – im Browser IndexedDB (Fallback: Arbeitsspeicher).
- **i18n** mit i18next/react-i18next: deutsche und englische Kataloge sind **schlüsselgleich**,
  und die gesamte Bedienoberfläche ist über den Katalog
  übersetzt – im Inneren wie in der Oberfläche steht kein fest verdrahteter deutscher Text.
  Die Domänen- und Speicherschicht liefert dazu **sprachneutrale Codes** (plus Parameter);
  erst die Oberfläche löst sie zum Text auf – so bleibt der Rechenkern frei von i18n.
  Ein Sprachumschalter in der Oberfläche folgt laut `docs/requirements.md` §6.4 in M3.
- **Domänenlogik** als reine Funktionen ohne UI- und Netzabhängigkeit: Periodenverbrauch je
  Zähler, enthaltene Zähler mit Zyklusschutz, Verteilung nach Wasseranteil, Kosten mit
  Preis-Historie, Plausibilitätsprüfungen, Jahresabrechnung (Verteilung nach Betreiberbetrag,
  Abschläge, Saldo, Largest-Remainder-Rundung) sowie der Import von Startablesungen (CSV)
  und der JSON-Export/-Import des Gesamtzustands – jeweils auf Domänenebene.
- **Bedienoberfläche** für S2 (Zähler), S3 (Ablesung), S4 (Bewohner), S5 (Verbrauch & Verteilung)
  und S6 (Abschläge) – mit Zeitraumwahl, Plausibilitätswarnungen, CSV-Export und Zahlungsraster.
- **Dashboard (S1)** mit Jahresverbrauch, Bewohnerkosten, offenen Abschlägen, letzter Ablesung,
  Cloud-Status und Plausibilitätswarnungen.
- **Jahresabrechnung (S7)** mit Betreiberbetrag, neu berechenbarer Verteilung, Abschlägen,
  Summencheck, speicherbarem Entwurf und explizitem Abschluss samt Warnungsfreigabe.
- **Eingefrorene Abrechnungspositionen** als Quelle für Bewohner-PDFs, Sammel-PDF und
  Abrechnungs-CSV. PDFs entstehen lokal im Browser und können in der Vorschau geprüft,
  heruntergeladen oder über Web Share geteilt werden.
- **JSON-Backup** des vollständigen Datenbestands zum Export und bestätigungspflichtigen Import.
- **Cloud-Sync** über Fine-grained PAT und GitHub Contents API: lokale IndexedDB-Queue,
  SHA-optimistische Schreibvorgänge, Last-Write-Wins-Merge bei Konflikten und Retry.
- **Testsuite** mit Vitest für Rechenkern, Im-/Export, Store, Cloud-Sync und i18n-Parität.

**Noch nicht umgesetzt (M3)**

- **PWA-Offline-Shell und Kamera/OCR-Belege**.
- **Preis-Historie-Oberfläche, Sprachumschalter und weitere Einstellungsansichten**.

Der weitere Ziel-Stack inklusive TanStack Query, React Hook Form/Zod und `vite-plugin-pwa`
steht in `docs/requirements.md` §6.1.

## Web-App lokal starten

Voraussetzung: Node.js 22 (siehe `.github/workflows/pages.yml`).

```bash
cd apps/web
npm install        # Abhängigkeiten (Lockfile: package-lock.json)
npm run dev        # Entwicklungsserver
npm run build      # Typecheck + Produktionsbau nach apps/web/dist
npm run test       # Vitest-Testsuite (einmalig)
npm run typecheck  # TypeScript prüfen, ohne zu bauen
```

Weitere Skripte: `npm run preview` (gebauten Stand lokal ausliefern) und `npm run test:watch`
(Tests im Watch-Modus).

### Basis-Pfad `/heizung/`

Die App ist als **Projektseite** gedacht und läuft deshalb unter dem Basis-Pfad
`/heizung/`. Der Entwicklungsserver liefert sie entsprechend aus:

```
http://localhost:5173/heizung/
```

Der Basis-Pfad wird in `apps/web/vite.config.ts` gelesen:

```ts
const base = process.env.VITE_BASE_PATH ?? "/heizung/";
```

`VITE_BASE_PATH` steuert den Basis-Pfad; ohne die Umgebungsvariable gilt der Default
`/heizung/`. Für einen anderen Deployment-Ort genügt also:

```bash
VITE_BASE_PATH=/mein-pfad/ npm run build
```

Im Deployment-Workflow setzt der Build-Schritt zusätzlich `VITE_DATA_REPO` auf das
Daten-Repo `MadCowDevelopment/heizung-data`. Beides sind keine Geheimnisse; der
Zugriffstoken wird nie gebaut, sondern zur Laufzeit in den Einstellungen eingegeben.

## Deployment

Statisch auf GitHub Pages, ohne eigenes Backend: `.github/workflows/pages.yml` baut
`apps/web` bei jedem Push auf `master` (sowie manuell über `workflow_dispatch`) und
veröffentlicht das Ergebnis nach <https://madcowdevelopment.github.io/heizung/>.

## Projektstruktur

```
.
├── .github/workflows/pages.yml   # Build + Deploy nach GitHub Pages
├── docs/                         # Spezifikation (maßgeblich)
│   ├── requirements.md           # Domänenmodell, Regeln R0–R11, Screens, Meilensteine
│   ├── architecture.md           # Stack, Datenmodell, Sync, Deployment
│   └── setup.md                  # Einmalige Einrichtung (Daten-Repo, Pages, Token)
├── DESIGN.md                     # Gestaltungssystem „Werkbank" (Tokens + Regeln)
├── apps/web/                     # Frontend (Vite + React + TypeScript)
│   ├── src/
│   │   ├── domain/               # Rechenkern als reine Funktionen
│   │   │   ├── calc/             # R0–R9: Einheiten, Verbrauch, Verteilung, Kosten, Abrechnung
│   │   │   ├── io/               # CSV (Startablesungen, Ablesungen) und JSON (Zustand)
│   │   │   └── types.ts          # Domänenmodell (Entitäten, Schema-Version 4)
│   │   ├── state/                # zustand-Store
│   │   ├── storage/              # StorageAdapter: IndexedDB, Memory (kein GitHub-Adapter)
│   │   ├── ui/                   # Screens und Bausteine
│   │   ├── i18n/                 # de, en
│   │   ├── test/                 # Test-Setup (Vitest/jsdom)
│   │   └── theme/                # Farbtokens (warm = rot, kalt = blau, Energie = bernstein)
│   └── vite.config.ts            # Basis-Pfad, Build- und Test-Konfiguration
└── PRODUCT.md                    # Produktvision und Leitplanken
```

`domain` importiert nichts außer `domain` – die Rechenlogik bleibt dadurch isoliert
testbar und unabhängig von Oberfläche und Speicher.
