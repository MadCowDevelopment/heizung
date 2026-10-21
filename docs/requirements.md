# Anforderungen – Heizungs-/Warmwasser-Abrechnung (Web-App)

> **Status:** Spezifikation. Offene Entscheidungen in §8.
> **Datenschutz-Hinweis:** Dieses Repo ist **öffentlich**. Es enthält ausschließlich Code.
> Bewohnernamen, E-Mail-Adressen und Zählerstände liegen **ausschließlich** im Cloud-Backend
> (privates Konto/Projekt), niemals im Repo, niemals im Frontend-Bundle.

## 1. Zweck & Scope

Web-App (mobil-first) für eine Wohngemeinschaft / Haus mit gemischter Zählerstruktur:

1. Zählerstände erfassen – Energie in MWh, Wasser in m³ – **an Ablesetagen** (auch rückdatiert, auch Zwischenablesungen).
2. Verbrauch je Bewohner berechnen: Energie anteilig nach Wasserverbrauch, enthaltene Zähler korrekt abgezogen.
3. Kosten je Bewohner berechnen (Preis/MWh, mit Preis-Historie).
4. Optionale Abschläge führen (monatlich oder Jahresbetrag).
5. **Jahresabrechnung:** Betreiberrechnung (Ist-Betrag) auf Bewohner nach Verbrauchsanteil verteilen, Abschläge verrechnen → Nachzahlung/Auszahlung.
6. **Versand:** Bewohner erhalten per **E-Mail** ihre Abrechnung (Zusammenfassung + PDF); nur der Admin arbeitet in der App.

**In Scope:** Warmwasser-/Energieverteilung, Wasser als Verteilungsbasis (warm/kalt getrennt), Abschläge, Jahresabrechnung, E-Mail-Versand, Export/Import, Offline-Fähigkeit.

**Später ergänzbar (bewusst offen gelassen):** Wasserpreis pro m³ (Preisfeld existiert, Default 0 €), weitere Preisbestandteile, Bewohner-Self-Service-Portal, Mahnwesen, Heizkostenabrechnung nach §556 BGB.

---

## 2. Domänenmodell

### 2.1 Entitäten

| Entität | Felder |
|---|---|
| **Bewohner** | `id`, `name`, `email`, `notiz`, `aktiv`, `emailVersandAktiv`, `farbe` (optional, Listenfarbe) |
| **Zähler** | `id`, `bezeichnung`, `typ` (`energie` \| `wasser_warm` \| `wasser_kalt`), `einheit`, `bewohnerId` (null = Gemeinschafts-/Gesamtzähler), `enthaeltIds[]`, `ablesestelle`, `aktiv`, `startStand` (optional) |
| **Ablesung** | `id`, `zaehlerId`, `datum` (ISO-Datum), `stand` (Zahl), `notiz`, `unsicher` (bool), `foto` (optional Beleg), `preisMwhGenutzt` (Snapshot, s. R9), `createdAt`, `updatedAt` |
| **Preis** | `id`, `gueltigAb` (ISO-Datum), `preisMWh`, `preisM3` (Default 0), `notiz` |
| **AbschlagPlan** | `id`, `bewohnerId`, `betrag`, `rhythmus` (`monatlich` \| `jaehrlich`), `aktiv` |
| **Zahlung** | `id`, `bewohnerId`, `betrag`, `faelligAm`, `bezahltAm` (optional), `notiz` (z. B. „Abschlag 03/2026") |
| **Abrechnung** | `id`, `jahr`, `zeitraum` (von/bis), `betreiberBetrag`, `betreiberHinweis`, `status` (`entwurf` \| `versendet` \| `beglichen`), `positionen[]` |
| **EmailVorgang** | `id`, `abrechnungId`, `bewohnerId`, `empfaenger`, `betreff`, `status` (`entwurf` \| `gesendet` \| `fehler`), `gesendetAm`, `fehlerText`, `providerId` |
| **Einstellungen** | `preisDefaults` (siehe Preis), `verteilSchluessel`, `waehrung`, `absenderName`, `emailTemplate`, `schemaVersion` |

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
Abrechnung ──1:n──> EmailVorgang ──n:1──> Bewohner
```

### 2.4 Abrechnungsposition

`{ bewohnerId, wasserWarmM3, wasserKaltM3, energieMWh, kostenTheoretisch, anteilProzent, rechnungsbetrag, summeAbschlaege, saldo }`
`saldo > 0` → Nachzahlung, `saldo < 0` → Auszahlung.

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

**Verteilungs-Schlüssel** (Settings, Default `warm`):

| Modus | Schlüssel |
|---|---|
| `warm` (Default) | Warmwasserzähler (rot) |
| `warm+kalt` | Summe warm (rot) + kalt (blau) |
| `kalt` | Kaltwasserzähler (blau) |

Sonderfall: Ein Bewohner hat im Zeitraum **keinen** Zähler des aktiven Schlüssels → für diesen Bewohner wird ersatzweise auf den anderen Wasserzähler umgeschaltet und die Abweichung sichtbar markiert (kein stiller Ausschluss).
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

**R9 – Preis-Historie**
Preise gelten **ab einem Datum** (`gueltigAb`). Jede Ablesung speichert den zu diesem Zeitpunkt gültigen Preis als Snapshot (`preisMwhGenutzt`) → historische Berechnungen bleiben reproduzierbar, auch wenn der Preis später geändert wird.
Mindestens **jährliche** Preise (z. B. 0,10 € für 2026), optional mehrere Preisstufen innerhalb eines Jahres. Liegt eine Periode über einen Preiswechsel, wird sie an der Preisgrenze geteilt und anteilig bewertet.

**R10 – E-Mail-Versand der Abrechnung**
Pro Bewohner wird eine E-Mail erzeugt: Betreff + Kurzfassung (Verbrauch, Anteil, Betrag, Abschläge, Saldo/Nachzahlung) + **PDF** der Abrechnung als Anhang (alternativ Link).
Status je Empfänger wird nachverfolgt (`entwurf`/`gesendet`/`fehler`), erneutes Senden möglich, Versandprotokoll einsehbar. Idempotenz: eine Abrechnung + Bewohner = max. 1 Versand, außer bewusst „erneut senden".
Der Versand läuft **serverseitig** (E-Mail-API + PDF-Erzeugung), nicht direkt aus dem Browser (Geheimnisse bleiben serverseitig).

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
- **Anzeige:** Liste (Name, E-Mail, Zähler mit Farben, Abschlag, Saldo letzte Abrechnung).
- **Operationen:** Bewohner anlegen/bearbeiten/deaktivieren, E-Mail-Adresse pflegen (Pflicht für Versand), Zähler zuweisen/entfernen, Abschlag planen, Detailansicht (Verbrauchsverlauf, Abrechnungen, Zahlungen, E-Mails).

### S5 – Verbrauch & Verteilung
- **Anzeige:** Zeitraum wählen (Jahr / benutzerdefiniert / seit letzter Ablesung) → Tabelle je Zähler (Startstand, Endstand, Δ, enthaltene Abzüge) und Tabelle je Bewohner (Warmwasser m³ rot, Kaltwasser m³ blau, Energie MWh, Anteil %, Kosten) + Summen-/Plausibilitätscheck.
- **Operationen:** Zeitraum wechseln, Zwischenablesungen anzeigen, CSV-Export.

### S6 – Abschläge
- **Anzeige:** Plan je Bewohner (Rhythmus, Betrag), Raster offen/bezahlt je Monat, Summe je Jahr.
- **Operationen:** Betrag/Rhythmus setzen, Zahlung als bezahlt markieren (Datum), Zahlung stornieren, Plan deaktivieren, Jahresvorschau („wäre gezahlt worden: X").

### S7 – Jahresabrechnung
- **Anzeige:** Jahr wählen → Operatorbetrag eingeben (Betrag oder Ist-MWh × Preis) → Vorschau je Bewohner (theoretisch vs. verteilt, Abschläge, Saldo) + Summencheck + Abweichungshinweis.
- **Operationen:** Betreiberbetrag + Hinweis erfassen, Verteilung neu berechnen, Entwurf speichern, **E-Mail-Versand**: einzelner Empfänger oder alle (Vorschau der E-Mail inkl. PDF), Versandstatus je Empfänger, erneutes Senden, Fehlerprotokoll, als bezahlt markieren, Einzel-PDF/CSV je Bewohner exportieren, Gesamtdokument exportieren.

### S8 – Einstellungen
- **Operationen:** **Preise** (Preis-Historie: „gültig ab", MWh-Preis, optionaler m³-Preis), **Verteilungs-Schlüssel** (warm / warm+kalt / kalt), Standard-Preis MWh, Währung, **Admin-Login** (E-Mail + Passwort ändern, 2FA optional), **E-Mail** (Absendername, Betreff-Template, Text-Template, Testversand), Export/Import (JSON mit `schemaVersion`, CSV), Komplettlöschung, Impressum/Datenschutz.

### S9 – Status/Fehler (global)
Sync-/Versandfehler-Banner, Offline-Hinweis, Validierungs- und Plausibilitäts-Markierungen, Wiederherstellen nach Fehlern, Fehlerprotokoll (E-Mail-Versand).

---

## 5. Nicht-funktionale Anforderungen

- **Mobil-first**, PWA-installierbar, offline-fähige Eingabe (lokale Queue) mit Nachsenden.
- **Statisches Frontend auf GitHub Pages**; Datenspeicherung + E-Mail über separates Backend (siehe Architektur).
- **Admin-only-Zugriff:** E-Mail+Passwort-Login; Bewohner haben **keinen** Login, sie erhalten E-Mails. Geschützte Seiten/Routen; Server erzwingt die Rechte (nicht nur UI).
- **Personenbezogene Daten** nur im Backend (privates Konto/Projekt, EU-Region), Verschlüsselung in transit/at rest, Export & vollständige Löschung, Backups.
- **E-Mail-Zustellbarkeit:** Absender-Domain mit SPF/DKIM/DMARC (Voraussetzung für Gmail/Yahoo), Bounce-Handling.
- **Sprache:** UI Deutsch (i18n EN vorbereitet), `de-DE`-Format für Datum/Zahl/Währung.
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
| PWA | **vite-plugin-pwa** | Offline-Shell, Install-Prompt |
| PDF/CSV | clientseitig (pdf-lib / print-CSS) bzw. serverseitig im Backend für den Versand | Bewohner-PDF enthält personenbezogene Daten → wird im Backend erzeugt/versendet |
| i18n | `react-i18next` | de/en |
| Tests | Vitest (Rechenlogik) + Playwright (Erfassungs- & Login-Flow) | R1–R11 sind das Kernrisiko |
| Backend | **Cloudflare Workers + D1** (empfohlen) – Alternativ Supabase | löst Datenspeicherung **und** E-Mail-Versand in einer Deployment-Einheit |

### 6.2 Cloud-Speicher & E-Mail – Optionen

Da nun E-Mail-Versand mit PDF nötig ist, braucht es zwingend ein Server-Backend (Geheimnisse dürfen nicht im Frontend liegen).

| Option | Datenspeicher | Admin-Login | E-Mail-Versand | Aufwand | Passt, wenn… |
|---|---|---|---|---|---|
| **Cloudflare Workers + D1** (empfohlen) | eigenes SQLite (D1) | selbst implementiert (Passwort-Hash + Session-Token) | ✅ im selben Worker (Resend/SMTP, PDF via pdf-lib) | mittel (ein TS-Projekt) | volle Kontrolle, ein Deploy, alles gratis bis großzügigem Free-Tier |
| **Supabase** (Postgres + Auth + Edge Function) | eigener Postgres | ✅ eingebaut (E-Mail/Passwort) | ✅ Edge Function (Resend) | mittel (SQL + RLS + CLI) | SQL/RLS-Funktionswissen vorhanden, Realtime gewünscht |
| **GitHub-API** (privates Repo) + separater Versand-Worker | privates Repo | Token am Gerät (≈ kein Login) | ⚠️ Worker braucht zusätzlich Repo-PAT | hoch (zwei Systeme) | nur, wenn Cloud-Save ohne eigenes Backend erwünscht ist – **nur für Prototyp** |
| **Firebase** (Firestore + Functions) | Firestore | Google-Login | ✅ Cloud Function | mittel | Firebase-Ökosystem gewünscht |
| **Nur Browser** (IndexedDB) | Gerät | PIN | ❌ | keiner | Demo/Prototyp ohne echten Cloud-Save |

**Empfehlung**
1. **Cloudflare Workers + D1 + Resend** als Backend: eine Codebasis, ein `wrangler deploy`, D1 als Datenbank, Worker erzeugt das Bewohner-PDF und versendet die E-Mail. Secrets (Resend-Key, Passwort-Hash) nur als Worker-Secrets.
2. **Alternative Supabase**, wenn SQL/RLS und eingebautes Auth bevorzugt werden (Edge Function für E-Mail).
3. Im Frontend trotzdem **`StorageAdapter`**-Abstraktion (`list/read/write/delete`), damit der Provider austauschbar bleibt und ein späterer Wechsel (z. B. zu Supabase) nur Konfiguration ist.
4. **Immer** lokaler Cache (IndexedDB) + Export/Import (JSON, `schemaVersion`) → App funktioniert offline, Datenverlust ist abgesichert.

### 6.3 Datenfluss

```mermaid
flowchart LR
  UI[Screens S1-S9] --> ST[Zustand / RHF]
  ST --> CALC[domain: R1-R11\n(pure functions)]
  CALC --> QU[TanStack Query Cache]
  QU --> SYNC[Sync-Engine\nQueue + LWW + Retry]
  SYNC --> IDB[(IndexedDB Cache)]
  SYNC --> API[Backend API\n(Worker / Supabase)]
  API --> DB[(D1 / Postgres)]
  API --> MAIL[E-Mail + PDF\n(Resend)]
  MAIL --> B[Bewohner]
```

- **Berechnung als reine Funktionen** (`computePeriod(period, meters, readings, prices)`), testbar, ohne Store/Netz.
- **Sync-Engine:** lokale Mutation sofort in IndexedDB → Queue → Batch-Upsert mit `updatedAt`; Konflikt Last-Write-Wins je Datensatz; Retry mit Backoff; Status sichtbar.
- **Auth:** Session-Token im Frontend + serverseitige Prüfung jeder Anfrage; kein Geheimnis im Bundle.

### 6.4 Umsetzungsschritte

1. **M0 Statischer Prototyp:** Domänenmodell + Rechenkern (R1–R11) + Unit-Tests; S2/S3/S4 mit lokalem Adapter; Startablesungen-Import.
2. **M1 Backend:** Worker + D1 + Auth + API + Sync-Engine + StorageAdapter; S5/S6.
3. **M2 Abrechnung & Versand:** S7 (Betreiberbetrag, Verteilung, Abschläge, PDF), E-Mail-Versand mit Status, Vorlagen, Testversand; Export/Import.
4. **M3 Politur:** Kamera/OCR-Beleg, PWA-Offline, Preis-Historie-UI, Settings, i18n, GitHub Actions → Pages + Worker-Deploy.

---

## 7. Datenmodell (Kurzform)

```
bewohner(id, name, email, notiz, aktiv, emailVersandAktiv, farbe, updatedAt)
zaehler(id, bezeichnung, typ, einheit, bewohnerId?, enthaeltIds: json, ablesestelle, aktiv, startStand?, updatedAt)
ablesung(id, zaehlerId, datum, stand, notiz, unsicher, foto?, preisMwhGenutzt, updatedAt)  # unique(zaehlerId, datum)
preis(id, gueltigAb, preisMWh, preisM3, notiz, updatedAt)
abschlag_plan(id, bewohnerId, betrag, rhythmus, aktiv, updatedAt)
zahlung(id, bewohnerId, betrag, faelligAm, bezahltAm?, notiz, updatedAt)
abrechnung(id, jahr, von, bis, betreiberBetrag, betreiberHinweis, status, positionen: json, updatedAt)
email_vorgang(id, abrechnungId, bewohnerId, empfaenger, betreff, status, gesendetAm?, fehlerText?, providerId?, updatedAt)
einstellungen(id=singleton, verteilSchluessel, waehrung, absenderName, emailBetreff, emailText, updatedAt)
```

Alle Tabellen: `id`, `updatedAt`, `deleted` (Soft-Delete), `schemaVersion`.

---

## 8. Priorisierte offene Punkte

| # | Frage | Vorschlag |
|---|---|---|
| 1 | E-Mail-Provider (Resend?) und eigene Absender-Domain inkl. SPF/DKIM/DMARC? | Resend + eigene Domain, sonst Gmail blockt Versand |
| 2 | Sammel-PDF oder Einzel-PDF je Bewohner? | Einzel-PDF je Bewohner (+ optionale Sammel-PDF fürs Archiv) |
| 3 | Verteilungs-Schlüssel: nur Warmwasser, oder warm+kalt? | Default warm; umschaltbar in Settings |
| 4 | Enthält die Abrechnung auch Trinkwasser-Kosten, wenn später ein Preis gepflegt wird? | ja, Preis-Feld existiert, Default 0 € |
| 5 | Abschlagsform: monatlicher Betrag oder Jahresbetrag (÷12)? | beide, Standard monatlich |
| 6 | Zählerwechsel-Behandlung: alter Zähler bis Wechsel gültig, neuer mit Startstand? | ja, Startstand-Pflicht beim neuen Zähler |
| 7 | Bewohner ohne eigene Zähler (z. B. untervermietet) | von der Verteilung ausgenommen + in der Abrechnung sichtbar markiert |
| 8 | Währung EUR; CHF später | EUR |
| 9 | Preiskonvention: pro Kalenderjahr oder Preisstufen mit Datum? | beides, Snapshot pro Ablesung |
| 10 | Startablesungen: als Import-Datei (CSV) oder manuell in der UI? | beide (CSV-Paste + manuell) |
| 11 | Passwortschutz der App: nur Passwort oder 2FA? | Passwort reicht, 2FA optional |
