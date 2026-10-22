# Anforderungen – Heizungs-/Warmwasser-Abrechnung (Web-App)

> **Status:** Spezifikation. Offene Entscheidungen in §8.
> **Datenschutz-Hinweis:** Dieses Repo ist **öffentlich**. Es enthält ausschließlich Code.
> Bewohnernamen, E-Mail-Adressen und Zählerstände liegen **ausschließlich** im privaten
> Daten-Repo (GitHub, privat) bzw. lokal im Gerät – niemals in diesem Repo, niemals im Frontend-Bundle.

## 1. Zweck & Scope

Web-App (mobil-first) für eine Wohngemeinschaft / Haus mit gemischter Zählerstruktur:

1. Zählerstände erfassen – Energie in MWh, Wasser in m³ – **an Ablesetagen** (auch rückdatiert, auch Zwischenablesungen).
2. Verbrauch je Bewohner berechnen: Energie anteilig nach Wasserverbrauch, enthaltene Zähler korrekt abgezogen.
3. Kosten je Bewohner berechnen (Preis/MWh, mit Preis-Historie).
4. Optionale Abschläge führen (monatlich oder Jahresbetrag).
5. **Jahresabrechnung:** Betreiberrechnung (Ist-Betrag) auf Bewohner nach Verbrauchsanteil verteilen, Abschläge verrechnen → Nachzahlung/Auszahlung.
6. **Ausgabe:** Die Abrechnung wird als **PDF** erzeugt (je Bewohner einzeln + gesammelt) und vom Admin verteilt; nur der Admin arbeitet in der App.

**In Scope:** Warmwasser-/Energieverteilung, Wasser als Verteilungsbasis (warm/kalt getrennt), Abschläge, Jahresabrechnung, PDF-Ausgabe, Cloud-Save, Export/Import, Offline-Fähigkeit.

**Später ergänzbar (bewusst offen gelassen):** Wasserpreis pro m³ (Preisfeld existiert, Default 0 €), weitere Preisbestandteile, Bewohner-Self-Service-Portal, Mahnwesen, Heizkostenabrechnung nach §556 BGB.

---

## 2. Domänenmodell

### 2.1 Entitäten

| Entität | Felder |
|---|---|
| **Bewohner** | `id`, `name`, `email` (optional, nur Kontakt), `notiz`, `aktiv`, `farbe` (optional, Listenfarbe) |
| **Zähler** | `id`, `bezeichnung`, `typ` (`energie` \| `wasser_warm` \| `wasser_kalt`), `einheit`, `bewohnerId` (null = Gemeinschafts-/Gesamtzähler), `enthaeltIds[]`, `ablesestelle`, `aktiv`, `startStand` (optional) |
| **Ablesung** | `id`, `zaehlerId`, `datum` (ISO-Datum), `stand` (Zahl), `notiz`, `unsicher` (bool), `foto` (optional Beleg), `preisMwhGenutzt` (Snapshot, s. R9), `createdAt`, `updatedAt` |
| **Preis** | `id`, `gueltigAb` (ISO-Datum), `preisMWh`, `preisM3` (Default 0), `notiz` |
| **AbschlagPlan** | `id`, `bewohnerId`, `betrag`, `rhythmus` (`monatlich` \| `jaehrlich`), `aktiv` |
| **Zahlung** | `id`, `bewohnerId`, `betrag`, `faelligAm`, `bezahltAm` (optional), `notiz` (z. B. „Abschlag 03/2026") |
| **Abrechnung** | `id`, `jahr`, `zeitraum` (von/bis), `betreiberBetrag`, `betreiberHinweis`, `status` (`entwurf` \| `verteilt` \| `beglichen`), `positionen[]` |
| **Einstellungen** | `preisDefaults` (siehe Preis), `verteilSchluessel`, `waehrung`, `objektName`, `ansprechpartner`, `pdfHinweis`, `schemaVersion` |

### 2.2 Zählertypen & Farbkodierung

| Typ | Einheit | Farbe (UI) | Rolle |
|---|---|---|---|
| `energie` | MWh | Bernstein/Gelb | Erzeugung Warmwasser (Anlage), ggf. weitere Energiezähler |
| `wasser_warm` | m³ | **Rot** | Warmwasserzähler → primärer Verteilungsschlüssel |
| `wasser_kalt` | m³ | **Blau** | Kaltwasserzähler → optionaler Zusatzschlüssel, Verbrauchsinfo |

Farben als Design-Tokens (`--farbe-warm: rot`, `--farbe-kalt: blau`, `--farbe-energie: bernstein`) und in **allen** Listen, Tabellen, Diagrammen, Karten und PDF durchgängig verwendet (Typ-Badge + Zählerkarte + Kurve). Kontrast/WCAG beachten.

### 2.3 Beziehungen

```
Bewohner ──1:n──> Zähler (wasser_warm / wasser_kalt, ggf. energie)
Zähler X ──enthaelt──> Zähler Y            (ΔX − ΔY = eigener Verbrauch von X)
Ablesung ──n:1──> Zähler                  (1 Ablesung je Zähler je Tag, beliebiges Datum)
Preis ──gueltigAb──> Ablesungen            (Snapshot pro Ablesung)
AbschlagPlan ──n:1──> Bewohner;  Zahlung ──n:1──> Bewohner
Abrechnung ──1:n──> Position ──n:1──> Bewohner
```

### 2.4 Abrechnungsposition

`{ bewohnerId, wasserWarmM3, wasserKaltM3, energieMWh, kostenTheoretisch, anteilProzent, rechnungsbetrag, summeAbschlaege, saldo }`
`saldo > 0` → Nachzahlung, `saldo < 0` → Auszahlung.

Sichtbare Abweichungen/Hinweise stehen in `hinweise` als **sprachneutrale Codes mit
Parametern** (`{ code, params? }`), nicht als fest verdrahteter Text – die Oberfläche
löst sie über i18n auf.

---

## 3. Fachregeln (Berechnungen)

**R0 – Einheiten & Präzision**
Intern wird in **kWh** bzw. **Litern** gerechnet (1 MWh = 1000 kWh, 1 m³ = 1000 l) → keine Fließkomma-Fehler. Anzeige: MWh mit 3 Nachkommastellen, m³ mit 1–2, Beträge in € mit 2 (kaufmännisch).

**R1 – Periodenverbrauch je Zähler**
`Δ = Stand(Ende) − Stand(Start)`; *Start* = letzte Ablesung mit Datum ≤ Periodenbeginn, *Ende* = letzte Ablesung mit Datum ≤ Periodenende.
Fehlt eine der beiden Ablesungen → Periode als **„unvollständig"** kennzeichnen (Wert wird nicht in die Abrechnung übernommen).
**Zwischenablesungen** sind erlaubt und verbessern die Auflösung: sie werden automatisch als Start/Ende-Stand genutzt, wenn sie innerhalb/nahe der Periode liegen. Der Nutzer wählt den Zeitraum; vorberechnet sind Standardzeiträume (laufendes Jahr, Vorjahr, letzter Ablesetag → heute, benutzerdefiniert).

**R2 – Enthaltene Zähler**
`eigener Verbrauch(X) = ΔX − Σ Δ(Y)` über alle **direkt** enthaltenen Zähler, rekursiv aufgelöst (keine Doppelabzüge), zyklensicher (visited-Set). Ergebnis: gutgeschrieben `bewohnerId` von X; bei `bewohnerId = null` → Gemeinschaftsverbrauch (nicht verrechnet, aber sichtbar).
Verschachtelung erlaubt: A enthält B, B enthält C.

**R3 – Energieverteilung auf Bewohner (Warmwasser)**
Ein gemeinschaftlicher Energie-/Warmwasserzähler wird **proportional zum Wasserverbrauch** der beteiligten Bewohner im Zeitraum verteilt:
`anteil_i = wasser_i / Σ wasser`, `energie_i = Δ(E) × anteil_i`.
*Beispiel:* Δ(E) = 3 MWh, Warmwasser Δ = 2 m³ und 1 m³ → 2 MWh und 1 MWh.

**Verteilungs-Schlüssel** (Settings, **Default `warm` – festgelegt**):

| Modus | Schlüssel |
|---|---|
| `warm` (**Default**) | Warmwasserzähler (rot) – energetisch passende Basis |
| `warm+kalt` | Summe warm (rot) + kalt (blau) |
| `kalt` | Kaltwasserzähler (blau) |

Sonderfall: Ein Bewohner hat im Zeitraum **keinen** Zähler des aktiven Schlüssels → für diesen Bewohner wird ersatzweise auf den anderen Wasserzähler umgeschaltet und die Abweichung sichtbar markiert (kein stiller Ausschluss). Bei Default `warm` ist das der Fall „Bewohner hat nur Kaltwasserzähler" → Verteilung nach Kaltwasser, Position wird mit Hinweis markiert.
Sonderfall `Σ wasser = 0` → „keine Verteilungsbasis": Admin-Rückfrage, Vorschlag gleichmäßige Aufteilung (mit sichtbarem Hinweis).
Wasserzähler, die selbst von anderen Zählern enthalten werden, zählen über R2 mit.

**R4 – Kosten**
`kosten_i = energieMWh_i × preisMWh` (+ `wasserM3_i × preisM3`, Default `preisM3 = 0` → Wasser ist derzeit kostenlos, später per Preis-Historie aktivierbar).
Preis/MWh ist einstellbar, Default **0,10 €** (in den Einstellungen änderbar).

**R5 – Theoretische Rechnung vs. Betreiberrechnung**
`theoretische Kosten` = Summe aus R4 (rechnerisch aus den Zählerständen, nachvollziehbar).
`Betreiberrechnung` = tatsächlicher Jahresbetrag des Betreibers; Eingabe wahlweise als **Betrag** (€) oder als **Ist-Verbrauch (MWh) × Preis** (rechnet den Betrag aus).
**Jahresabrechnung = Betreiberbetrag**, verteilt nach **Verbrauchsanteil**:
`verteilt_i = betreiberBetrag × (kostenTheoretisch_i / Σ kostenTheoretisch)`.
Differenz zum theoretischen Betrag wird als **Preisabweichung** ausgewiesen (transparent, nicht versteckt).

**R6 – Abschläge**
AbschlagPlan je Bewohner: `monatlich` (Betrag/Monat) oder `jaehrlich` (Betrag/Jahr, Vorschau ÷12). Zahlungen werden erfasst (Fälligkeitsdatum, Status offen/bezahlt, optional Zahlungsdatum).
Jahresabrechnung: `saldo_i = verteilt_i − Σ (gezahlte Abschläge_i im Jahr)` → Nachzahlung (positiv) oder Auszahlung (negativ). Offene Abschläge werden als Hinweis ausgewiesen, nicht verrechnet.

**R7 – Rundung**
Beträge kaufmännisch auf 2 Nachkommastellen. Die Summe der Einzelpositionen muss **exakt** dem Gesamtbetrag entsprechen → Restverteilung per Largest-Remainder-Methode (deterministisch, stabil → testbar).

**R8 – Unvollständige / unplausible Daten**
Fehlende Ablesungen, negative Deltas (Zählerwechsel/Fehlablesung) und unplausible Sprünge (> definierter Faktor, z. B. 3× Median der letzten Perioden) werden markiert und verhindern das **Abschließen** der Abrechnung (Warnung mit Freigabe-Möglichkeit, keine harte Blockade).

**R9 – Preis-Historie (Preisstufen mit Datum)**
Preise gelten **ab einem Datum** (`gueltigAb`) – **datumsgenaue Preisstufen, mehrere Wechsel pro Jahr möglich** (festgelegt). Jede Ablesung speichert den zu diesem Zeitpunkt gültigen Preis als Snapshot (`preisMwhGenutzt`) → historische Berechnungen bleiben reproduzierbar, auch wenn der Preis später geändert wird.
Liegt eine Periode über einen Preiswechsel, wird sie an der Preisgrenze geteilt und anteilig gewichtet (R9-Split in der Kostenberechnung).

**R10 – PDF-Ausgabe der Abrechnung**
Die Abrechnung wird **clientseitig** (im Browser, pdf-lib) erzeugt – kein Server, kein E-Mail-Versand, keine fremden Geheimnisse.
- **Einzel-PDF je Bewohner** (Hauptprodukt): Kopf (Objekt, Zeitraum, Bewohner, Datum), Tabelle (Warmwasser m³ rot, Kaltwasser m³ blau, Energie MWh, Anteil %, Kosten, Abschläge, Saldo), Fuß (Hinweis, Kontakt, Erläuterung zur Verteilung).
- **Sammel-PDF** aller Bewohner (Archiv für den Admin) und **CSV-Export** als maschinenlesbare Ergänzung.
- Erzeugung im Browser → personenbezogene Daten verlassen das Gerät nicht; PDF enthält den Stand der **eingefrorenen** Abrechnungspositionen (nicht neu berechnet).
- **Ausgabe:** Über den **„Teilen"-Dialog des Browsers** (iOS/Android) an ein beliebiges E-Mail-Programm bzw. Druck-/Chat-App; zusätzlich klassischer Download als Datei. Die App verschickt selbst **keine** E-Mails (kein Mailserver, keine Fremd-Dienste).

**R11 – Startablesungen & rückdatierte Erfassung**
Beim Einrichten der App können **Startablesungen** (Zähler + Datum + Startstand) importiert werden (CSV/Tabellen-Paste oder manuell). Ablesungen dürfen **beliebig in der Vergangenheit** erfasst werden (Datum in S3 frei wählbar, auch mehrere Zähler an verschiedenen Tagen). Bereits erfasste Tage werden beim erneuten Erfassen überschrieben (mit Bestätigung) oder als Korrektur protokolliert.

---

## 4. Screens & Operationen

### S1 – Dashboard
- **Anzeige:** aktueller Zeitraum, Gesamtverbrauch (Energie MWh, Warmwasser/Kaltwasser getrennt in den Zielfarben), Kosten je Bewohner (Karten), offene Abschläge, letzte Ablesung, Sync-/Versandstatus, offene Plausibilitätswarnungen.
- **Operationen:** „Neue Ablesung", „Bewohner", „Abrechnung", Einstellungen.

### S2 – Zählerverwaltung
- **Anzeige:** alle Zähler mit Typ-Badge in Zielfarbe (Energie / Warm rot / Kalt blau), Einheit, Besitzer, enthaltene Zähler, letzter Stand + Datum.
- **Operationen:** Zähler anlegen/bearbeiten/deaktivieren, Besitzer zuweisen, „enthält"-Relation setzen/entfernen (mit Zyklenprüfung + Struktur-Vorschau), Zählerwechsel (neuer Zähler mit Startstand, alter Zähler schließen), Startablesung importieren.

### S3 – Ablesung erfassen (Kamera-tauglich)
- **Anzeige:** Datum (frei wählbar, Default heute, **Vergangenheit erlaubt**), Grid aller aktiven Zähler gruppiert nach Typ/Farbe, je Zähler aktueller Stand + Einheit + großes Eingabefeld; visuell neu / unleserlich / geschätzt.
- **Operationen:** Stand eingeben, Foto der Anzeige aufnehmen (Beleg, optional OCR-Vorschlag), „unleserlich"/„geschätzt" markieren, Notiz, Zähler ausblenden, **alle speichern** (Batch), Entwurf fortsetzen, Tagesverlauf der letzten Ablesungen je Zähler ansehen, Korrektur/Löschung einer Ablesung.
- **Anforderung:** Hochformat, eine Hand bedienbar, große Tap-Flächen, `inputmode="numeric"`, keine Einheiten-Egingabe, kein Verlust bei App-Wechsel (Entwurf lokal gespeichert).

### S4 – Bewohner
- **Anzeige:** Liste (Name, Zähler mit Farben, Abschlag, Saldo letzte Abrechnung).
- **Operationen:** Bewohner anlegen/bearbeiten/deaktivieren, Kontakt (E-Mail/Telefon) pflegen, Zähler zuweisen/entfernen, Abschlag planen, Detailansicht (Verbrauchsverlauf, Abrechnungen, Zahlungen, PDF-Download der Abrechnung).

### S5 – Verbrauch & Verteilung
- **Anzeige:** Zeitraum wählen (Jahr / benutzerdefiniert / seit letzter Ablesung) → Tabelle je Zähler (Startstand, Endstand, Δ, enthaltene Abzüge) und Tabelle je Bewohner (Warmwasser m³ rot, Kaltwasser m³ blau, Energie MWh, Anteil %, Kosten) + Summen-/Plausibilitätscheck.
- **Operationen:** Zeitraum wechseln, Zwischenablesungen anzeigen, CSV-Export.

### S6 – Abschläge
- **Anzeige:** Plan je Bewohner (Rhythmus, Betrag), Raster offen/bezahlt je Monat, Summe je Jahr.
- **Operationen:** Betrag/Rhythmus setzen, Zahlung als bezahlt markieren (Datum), Zahlung stornieren, Plan deaktivieren, Jahresvorschau („wäre gezahlt worden: X").

### S7 – Jahresabrechnung
- **Anzeige:** Jahr wählen → Operatorbetrag eingeben (Betrag oder Ist-MWh × Preis) → Vorschau je Bewohner (theoretisch vs. verteilt, Abschläge, Saldo) + Summencheck + Abweichungshinweis.
- **Operationen:** Betreiberbetrag + Hinweis erfassen, Verteilung neu berechnen, Entwurf speichern, **PDF je Bewohner erzeugen** (Vorschau im Viewer, dann Speichern/Teilen), **Sammel-PDF** aller Bewohner, CSV-Export, Positionen einfrieren („Abrechnung abschließen"), Statuspflege (offen / verteilt / bezahlt).

### S8 – Einstellungen
- **Operationen:** **Preise** (Preis-Historie: „gültig ab", MWh-Preis, optionaler m³-Preis), **Verteilungs-Schlüssel** (warm / warm+kalt / kalt), Standard-Preis MWh, Währung, **Konto & Cloud** (GitHub-Verbindung: anmelden/abmelden, Daten-Repo `owner/repo` wählen, Sync-Intervall, „jetzt synchronisieren", Sync-Log), **PDF** (Objektbezeichnung, Ansprechpartner, Hinweistext, Logo/Briefkopf optional), Export/Import (JSON mit `schemaVersion`, CSV), Komplettlöschung, Impressum/Datenschutz.

### S9 – Status/Fehler (global)
Sync-Fehler-Banner, Offline-Hinweis, Validierungs- und Plausibilitäts-Markierungen, Wiederherstellen nach Fehlern, GitHub-Verbindungsstatus (angemeldet / Token abgelaufen / kein Zugriff aufs Daten-Repo).

---

## 5. Nicht-funktionale Anforderungen

- **Mobil-first**, PWA-installierbar, offline-fähige Eingabe (lokale Queue) mit Nachsenden.
- **Statisches Frontend auf GitHub Pages**, **kein eigenes Backend** – Datenhaltung über privates GitHub-Repo (siehe Architektur).
- **Admin-only-Zugriff:** Anmeldung über ein **GitHub-Fine-grained PAT**, das auf genau das private Daten-Repo (`Contents: Read and write`) beschränkt ist; die App prüft es per `GET /user`. Kein eigener Login, Token-Widerruf im GitHub-UI. Bewohner haben **keinen** Login, sie erhalten die PDF. (Ein OAuth-Device-Flow ist aus dem Browser nicht aufrufbar – CORS, siehe [architecture.md §2.1](./architecture.md).)
- **Personenbezogene Daten** (Namen, Stände) liegen ausschließlich im **privaten** Daten-Repo; Zugriff nur über den GitHub-Token des Admins. Export & vollständige Löschung, Historie/Restore über Git-Commits.
- **PDF-Erzeugung clientseitig** → keine PDF-/Mail-Dienste, keine zusätzlichen Geheimnisse, Daten verlassen das Gerät nicht.
- **Sprache:** UI Deutsch und Englisch über die lokale Sprachwahl; Zahlen, Datum und Währung folgen der gewählten Sprache (`de-DE` bzw. `en-GB`).
- **Performance:** < 2 s Ladezeit im Mobilnetz, Bedienung offline nach Erstladen.
- **Export/Import** (JSON-Backup mit `schemaVersion` + Migrationen) als Notlösung/Umzug.
- **Nachvollziehbarkeit:** jede Position zeigt die Herleitung (Betrag ← Anteil ← Verbrauch ← Zählerstände).

---

## 6. Architekturentscheidungen

Detail: [architecture.md](./architecture.md)

### 6.1 Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Frontend-Build | **Vite + React + TypeScript** | schnelles HMR, kleine Bundles, GitHub Actions → `gh-pages` trivial; HashRouter oder `404.html`-Fallback für Deep Links |
| State | **TanStack Query** (Server-State) + **Zustand** (UI-/Entwurfs-State) | Offline-Cache, Retry, klar getrennte Zuständigkeit |
| Formular/Validierung | **React Hook Form + Zod** | geteilte Schema für UI und Im-/Export |
| Styling | **Tailwind CSS** | schnelles Mobile-Layout, Design-Tokens für die Farbkodierung |
| PWA | **Service Worker + Web App Manifest** | gecachte Offline-Shell, installierbare Oberfläche |
| PDF/CSV | **clientseitig** (pdf-lib für PDF, CSV-Export) | PDF enthält personenbezogene Daten → bleibt auf dem Admin-Gerät, kein Versanddienst nötig |
| i18n | `react-i18next` | de/en |
| Tests | Vitest (Rechenlogik) + Playwright (Erfassungs- & Login-Flow) | R1–R11 sind das Kernrisiko |
| Backend | **keins** – GitHub API als Datenspeicher | Fine-grained PAT + privates Daten-Repo: Cloud-Save ohne eigenes Backend |

### 6.2 Cloud-Speicher – Optionen

Ohne E-Mail-Versand und ohne eigenes Backend reicht die **GitHub API** als Datenspeicher.

| Option | Datenspeicher | Admin-Login | Aufwand | Passt, wenn… |
|---|---|---|---|---|
| **GitHub API + privates Daten-Repo** (empfohlen) | privates Repo (`data/state.json`) | ✅ **GitHub-Fine-grained PAT** (nur Daten-Repo) | sehr gering (kein Server!) | Cloud-Save ohne Zusatzkonto; Commits = Historie/Rollback |
| **Cloudflare Workers + D1** | eigenes SQLite (D1) | selbst implementiert (Passwort-Hash + Session) **oder** Token-Broker für GitHub-Login | mittel | echtes Mehrbenutzer-Rechtemodell, Realtime, Secrets serverseitig |
| **Supabase** (Postgres + Auth) | eigener Postgres | ✅ eingebaut | mittel (SQL + RLS + CLI) | SQL/RLS-Fortgeschrittenheit vorhanden, Realtime gewünscht |
| **Firebase** (Firestore) | Firestore | Google-Login | mittel | Firebase-Ökosystem gewünscht |
| **Nur Browser** (IndexedDB) + Export/Import | Gerät | PIN | keiner | Single-Device-Betrieb ohne Cloud-Save |

**Empfehlung**
1. **GitHub API + privates Daten-Repo** mit Fine-grained PAT (nur Daten-Repo, nur `Contents: R/W`): kein Backend, kein Deployment außer GitHub Pages, Cloud-Save inkl. Historie über Git-Commits. Der Token wird nie im Code-Repo abgelegt, sondern zur Laufzeit in den Einstellungen hinterlegt. Ein echter OAuth-Login (Device-Flow) ist aus dem Browser **nicht** aufrufbar (CORS-Blocker, [architecture.md §2.1](./architecture.md)) – der Ausbaupfad ist ein Token-Broker (Cloudflare Worker).
2. **Alternative Cloudflare Workers + D1**, falls später echtes Mehrbenutzer-Rechtemodell, Realtime oder serverseitige Secrets nötig werden.
3. Im Frontend **`StorageAdapter`**-Abstraktion (`list/read/write/delete`), damit der Provider austauschbar bleibt (späterer Wechsel = Konfiguration).
4. **Immer** lokaler Cache (IndexedDB) + Export/Import (JSON, `schemaVersion`) → App funktioniert offline, Datenverlust ist abgesichert.

### 6.3 Datenfluss

```mermaid
flowchart LR
  UI[Screens S1-S9] --> ST[Zustand / RHF]
  ST --> CALC[domain: R1-R11\n(pure functions)]
  CALC --> QU[TanStack Query Cache]
  QU --> SYNC[Sync-Engine\nQueue + LWW + Retry]
  SYNC --> IDB[(IndexedDB Cache)]
  SYNC --> API[GitHub REST API\n(privates Daten-Repo)]
  CALC --> PDF[PDF-Erzeugung\nim Browser]
```

- **Berechnung als reine Funktionen** (`computePeriod(period, meters, readings, prices)`), testbar, ohne Store/Netz.
- **Sync-Engine:** lokale Mutation sofort in IndexedDB → Queue → ein Schreib-Request je Sync-Zyklus (SHA-Optimistic-Locking, bei 409 Merge + Retry).
- **Auth:** Fine-grained PAT im Browser (`localStorage`); jeder Request mit `Authorization: Bearer <token>`; 401/403 → Re-Auth-Dialog (Token neu einfügen).
- **PDF:** entsteht vollständig im Browser aus den eingefrorenen Abrechnungspositionen.

### 6.4 Umsetzungsschritte

1. **M0 Statischer Prototyp:** Domänenmodell + Rechenkern (R1–R11) + Unit-Tests; S2/S3/S4 mit lokalem Adapter; Startablesungen-Import.
2. **M1 Cloud:** ✅ umgesetzt – Token-Verwaltung (Fine-grained PAT), GitHub-`StorageAdapter`, lokale Queue mit SHA-Merge/Retry sowie S5 Verbrauch & Verteilung und S6 Abschläge.
3. **M2 Abrechnung:** S7 (Betreiberbetrag, Verteilung, Abschläge, Einzel-/Sammel-PDF, CSV), Export/Import.
4. **M3 Politur:** ✅ umgesetzt – Kamera-/OCR-Beleg, PWA-Offline, Preis-Historie-UI, Settings, i18n und GitHub Actions → Pages.

---

## 7. Datenmodell (Kurzform)

Ablage als **eine JSON-Datei** in einem privaten GitHub-Repo (`data/state.json`), Commit je Änderung.

```jsonc
{
  "schemaVersion": 4,
  "updatedAt": "…",
  "bewohner":   [ { "id", "name", "email", "notiz", "aktiv", "farbe", "updatedAt", "deleted" } ],
  "zaehler":    [ { "id", "bezeichnung", "typ", "einheit", "bewohnerId", "enthaeltIds": [],
                    "ablesestelle", "aktiv", "startStand", "updatedAt", "deleted" } ],
  "ablesung":  [ { "id", "zaehlerId", "datum", "stand", "notiz", "unsicher", "fotoKey",
                    "preisMwhGenutzt", "createdAt", "updatedAt", "deleted" } ],
  "preis":      [ { "id", "gueltigAb", "preisMWh", "preisM3", "notiz" } ],
  "abschlagPlan":[ { "id", "bewohnerId", "betrag", "rhythmus", "aktiv" } ],
  "zahlung":    [ { "id", "bewohnerId", "betrag", "faelligAm", "bezahltAm", "notiz" } ],
  "abrechnung": [ { "id", "jahr", "von", "bis", "betreiberBetrag", "betreiberHinweis",
                    "status", "positionen": [], "updatedAt" } ],
  "einstellungen": { "verteilSchluessel", "waehrung", "objektName", "ansprechpartner",
                     "pdfHinweis", "datenRepo" }
}
```

`ablesung` ist pro `(zaehlerId, datum)` eindeutig. `abrechnung.positionen` enthält eingefrorene Positionen (inkl. `hinweise` als Code-Listen). Fotos/Belege bleiben lokal im Gerät (IndexedDB), nicht im Daten-Repo.

---

## 8. Priorisierte offene Punkte

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Wie wird die PDF verteilt? | **entschieden:** pro Bewohner PDF → „Teilen"-Dialog des Browsers (E-Mail-/Druck-/Chat-App des Nutzers); Download als Datei zusätzlich. Sammel-PDF + CSV als Archiv |
| 2 | Sammel-PDF als Archiv für den Admin zusätzlich? | ja |
| 3 | Verteilungs-Schlüssel: nur Warmwasser, oder warm+kalt? | **entschieden:** Default `warm` (Fallback auf kalt, sichtbar markiert); umschaltbar in Settings |
| 4 | Enthält die Abrechnung auch Trinkwasser-Kosten, wenn später ein Preis gepflegt wird? | ja, Preis-Feld existiert, Default 0 € |
| 5 | Abschlagsform: monatlicher Betrag oder Jahresbetrag (÷12)? | beide, Standard monatlich |
| 6 | Zählerwechsel-Behandlung: alter Zähler bis Wechsel gültig, neuer mit Startstand? | ja, Startstand-Pflicht beim neuen Zähler |
| 7 | Bewohner ohne eigene Zähler (z. B. untervermietet) | von der Verteilung ausgenommen + in der Abrechnung sichtbar markiert |
| 8 | Währung EUR; CHF später | EUR |
| 9 | Preiskonvention: pro Kalenderjahr oder Preisstufen mit Datum? | **entschieden:** datumsgenaue Preisstufen („gültig ab"), mehrere Wechsel pro Jahr; Perioden werden an der Grenze geteilt |
| 10 | Startablesungen: als Import-Datei (CSV) oder manuell in der UI? | beide (CSV-Paste + manuell) |
| 11 | Zugriffsschutz der App | **entschieden:** GitHub-Fine-grained PAT, beschränkt auf das Daten-Repo (`Contents: R/W`) – kein eigenes Passwort, Widerruf im GitHub-UI, Token-Ablauf sichtbar in den Einstellungen |
| 12 | Cloud-Save von mehreren Geräten nötig oder reicht ein Gerät + Export/Import? | **entschieden:** Cloud-Save via privates GitHub-Daten-Repo + lokale Kopie + Export/Import |
| 13 | Daten-Repo: eigenes privates Repo (z. B. `MadCowDevelopment/heizung-data`) oder im Code-Repo (nicht möglich, öffentlich)? | eigenes privates Daten-Repo → **angelegt:** `MadCowDevelopment/heizung-data` (privat, `data/state.json`) |
| 14 | Wie meldet sich der Admin an? | **entschieden:** Fine-grained PAT (nur Daten-Repo). Device-Flow/OAuth ist aus dem Browser nicht aufrufbar (CORS) → Ausbaupfad: Token-Broker (Cloudflare Worker). Einrichtung: [setup.md](./setup.md) |
