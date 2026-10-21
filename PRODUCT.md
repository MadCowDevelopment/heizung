# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primär: eine Verwaltungsperson (Admin) in einer kleinen Wohngemeinschaft.** Sie erfasst
Zählerstände für Heizung, Warm- und Kaltwasser, teilt die Kosten auf die Bewohner auf und
erstellt die Jahresabrechnung. Situation: alle paar Wochen ein Termin im Keller mit
Handy/Tablet, unklares Licht, ein Zähler nach dem anderen; anschließend am Schreibtisch die
Abrechnung.

**Sekundär: Bewohner.** Sie haben keinen Login. Sie erhalten ausschließlich ein PDF bzw. eine
CSV-Zeile ihrer Abrechnung. Sie sind Lesende, nie Schreibende.

## Product Purpose

Die App ersetzt das manuelle Ablesen und das rechnerische Aufteilen der Nebenkosten für
Heizung und Warmwasser in einer Wohngemeinschaft. Sie macht die Herleitung jeder Position
nachvollziehbar: Betrag ← Anteil ← Verbrauch ← Zählerstände.

Erfolg heißt: Der Admin erfasst eine Ablesung in unter einer Minute pro Zähler ohne
Verlustrisiko (auch bei App-Wechsel), und die daraus erzeugte Abrechnung erzeugt keinen
Streit, weil jede Zahl hergeleitet und begründet ist.

## Positioning

Die Besonderheit ist die **transparente Verteilung**: Zähler-Bäume (ein Gesamtzähler, der
Unterzähler enthält) werden nach R2 aufgelöst, gemeinschaftlicher Verbrauch wird nach R3
proportional zum Warmwasser verteilt, und die Rundung nach R7 garantiert, dass die Summe
der Einzelbeträge exakt dem Betreiberbetrag entspricht. Es gibt kein Blackbox-Abrechnungs-
tool, sondern ein nachrechenbares Modell.

## Operating Context

- **Keller / Heizungsraum:** Zähler werden unter oft schlechtem Licht abgelesen, das Handy
  wird einhändig gehalten, der Nutzer ist im Dunkeln oder in gebückter Haltung. Große
  Tap-Flächen, hoher Kontrast, `inputmode="numeric"`, keine Einheiten-Eingabe.
- **Schreibtisch / Couch:** Die Abrechnung wird im Browser erstellt, Preise und Abschläge
  werden nachgetragen, PDF werden erzeugt und verteilt.
- **Unterwegs / kein Empfang:** Ablesungen werden offline erfasst und später nachgesendet.
- **Material:** Fotos der Zähleranzeige (Beleg) bleiben auf dem Admin-Gerät.
- **Dokumente:** PDF je Bewohner, Sammel-PDF, CSV-Export, JSON-Backup.

## Capabilities and Constraints

- **Bestätigte Fachregeln (R0–R11)** in `docs/requirements.md` §3 sind verbindlich und
  durch Unit-Tests abgesichert. Daran darf die Oberfläche nichts ändern.
- **Rechenkern als reine Funktionen** (`domain/`), ohne Store und ohne Netz – dadurch
  testbar und später serverfähig.
- **Kein Backend.** Persistenz über privates GitHub-Repo (`data/state.json`, Schema-Version 3)
  per Fine-grained PAT. Der Token wird zur Laufzeit eingegeben, nie gebaut.
- **Offline-fähige Eingabe** mit lokaler Queue; ein Request pro Sync-Zyklus.
- **Export/Import** (JSON mit `schemaVersion`, CSV) ist die Notlösung und der Umzugsweg.
- **Statisches Frontend** auf GitHub Pages, Basis-Pfad `/heizung/`, HashRouter.
- **Sprache:** UI Deutsch. EN ist vorbereitet, aber nicht freigegeben.
- **Datenschutz:** Personenbezogene Daten verlassen das Gerät nur in das private Daten-Repo.
- **Farbcodierung ist fachlich:** Warmwasser rot, Kaltwasser blau, Energie Bernstein. Farbe
  wird nie allein zur Informationsträgerin – immer mit Icon und Text.
- **Noch offen (nicht entschieden):** Token-Broker (Cloudflare Worker), Ende-zu-Ende-
  Verschlüsselung der JSON, mehrere Daten-Repos, Realtime-Sync.

## Brand Commitments

- **Name:** „Heizungsabrechnung" (Arbeitstitel, aus `package.json`/Seitentitel).
- **Sprache:** durchgehend Deutsch, `de-DE`-Format für Datum, Zahl und Währung.
- **Kein Nutzungs-Gamification:** keine Punkte, Badges, Streaks, Konfetti. Das Thema ist
  Geld und Vertrauen.
- **Fachfarben sind gesetzt** (siehe Capabilities) und dürfen nicht durch eine dekorative
  Palette überstimmt werden.

## Evidence on Hand

- `docs/requirements.md` – vollständige Fachspezifikation (R0–R11, S1–S9, Datenmodell).
- `docs/architecture.md` – Stack, Projektstruktur, Sync-Engine, Farbtokens, Deployment.
- `docs/setup.md` – Einrichtung des privaten Daten-Repos.
- `apps/web/src/domain/` – Rechenkern, bereits durch Tests abgesichert.
- **Keine** Screenshots, keine Testimonials, keine Nutzungsdaten, kein Logo, kein
  Briefing-Bildmaterial, kein Markenauftritt. Nichts davon darf erfunden werden.

## Product Principles

1. **Herleitung statt Ergebnis.** Jede Zahl zeigt, woher sie kommt. Summen sind nachprüfbar.
2. **Erfassung zuerst.** Der Keller-Termin ist die teuerste Situation der App; er darf
   nie Daten kosten.
3. **Ein Gerät, ein Admin.** Die App ist ein Werkzeug für eine Person, nicht ein
   Mehrbenutzer-Netzwerk.
4. **Offline ist Normalzustand, nicht Fehlerzustand.**
5. **KeinBlackbox-Verteilungsalgorithmus.** Jede Verteilungsentscheidung erzeugt einen
   sichtbaren Hinweis.

## Accessibility & Inclusion

- Kontrastverhältnis ≥ 4,5:1 für Text auf farbigem Grund (Pflicht aus `docs/architecture.md` §10).
- Farbige Zähler-Typen immer zusätzlich mit Icon und Text (Nutzende mit Farbsehschwäche).
- Große Tap-Flächen und Hochformat für die Erfassung (einhändig bedienbar).
- Vollständige Tastaturbedienbarkeit der Formulare, sichtbarer Fokus.
