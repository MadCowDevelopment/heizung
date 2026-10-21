# Anforderungen – Heizungs-/Warmwasser-Abrechnung (Web-App)

## 1. Zweck & Scope

Web-App (mobil-first) für eine Wohngemeinschaft / Haus mit gemischter Zählerstruktur:

1. Zählerstände (Energie in MWh, Wasser in m³) an **Ablesetagen** erfassen – bevorzugt per Smartphone-Kamera.
2. Verbrauch je Bewohner berechnen (Energie anteilig auf Basis der Wasserzähler, enthaltene Zähler korrekt abgezogen).
3. Kosten je Bewohner berechnen (Preis/MWh einstellbar).
4. Optionale monatliche Abschläge führen.
5. Jahresabrechnung: Betreiberrechnung (Ist-Betrag) auf Bewohner nach tatsächlichem Verbrauch verteilen; Abschläge verrechnen → Nachzahlung oder Auszahlung.

Nicht im Scope: Heizkostenabrechnung nach §556 BGB, Lieferantenwechsel, Zähler-Ersatzstände, Mahnwesen.

---

## 2. Domänenmodell

### 2.1 Entitäten

| Entität | Felder |
|---|---|
| **Bewohner** | `id`, `name`, `kontakt` (optional), `notiz` (optional), `aktiv` |
| **Zähler** | `id`, `bezeichnung`, `typ` (`energie` \| `wasser`), `einheit` (`MWh` \| `m³`), `bewohnerId` (null = Gemeinschafts-/Gesamtzähler), `enthaeltId[]` (IDs der eingeschlossenen Zähler), `ablesestelle` (optional), `aktiv` |
| **Ablesung** | `id`, `zaehlerId`, `datum` (ISO-Datum), `stand` (Zahl), `notiz` (optional), `unsicher` (bool, „Wert geschätzt") |
| **Abschlag** | `id`, `bewohnerId`, `betrag`, `intervall` (`monatlich`), `faelligAm`, `bezahltAm` (optional), `status` (`offen` \| `bezahlt`) |
| **Abrechnung** | `id`, `jahr`, `betreiberBetrag`, `betreiberHinweis`, `status` (`entwurf` \| `versendet` \| `beglichen`), `positionen[]` (siehe 2.3) |
| **Einstellungen** | `preisMWh`, `preisM3` (optional, Default 0), `waehrung`, `pin` (optional), `cloudProvider`, `letzteSync` |

**Regeln zur Struktur**

- Ein Zähler kann **eingeschlossene Zähler** enthalten (`X.enthaelt = [Y]`): der eigene Verbrauch von X ist `ΔX − Σ Δ(enthaltene Zähler)`.
- Ein Zähler kann **geteilt** sein (`bewohnerId = null`): Der Energie-/Warmwasserzähler der Anlage wird von mehreren Bewohnern genutzt und nicht direkt einem Bewohner zugeordnet.
- Ein Bewohner kann **mehrere Zähler** haben.
- Wasserzähler sind i.d.R. personenbezogen (1 Bewohner : 1–n Wasserzähler), Energie-/Warmwasserzähler i.d.R. gemeinschaftlich.
- Zähler können verschachtet enthalten sein (A enthält B, B enthält C) → Auflösung muss rekursiv erfolgen, Zyklen werden verboten.

### 2.2 Beziehungen (Diagramm)

```
Bewohner ──1:n──> Zähler (wasser, ggf. energie)
Zähler X ──enthaelt──> Zähler Y          (ΔX − ΔY = eigener Verbrauch von X)
Ablesung ──n:1──> Zähler (1 Ablesung je Zähler je Tag)
Abschlag ──n:1──> Bewohner
Abrechnung ──1:n──> Position ──n:1──> Bewohner
```

### 2.3 Abrechnungsposition

`{ bewohnerId, verbrauchMWh, verbrauchM3, kostenTheoretisch, anteilProzent, rechnungsbetrag, summeAbschlaege, saldo }`
`saldo > 0` → Nachzahlung, `saldo < 0` → Auszahlung.

---

## 3. Fachregeln (Berechnungen)

**R1 – Periodenverbrauch je Zähler**
`Δ = Stand(Ende) − Stand(Start)`, wobei *Start* = letzter Ablesetag ≤ Periodenbeginn und *Ende* = letzter Ablesetag ≤ Periodenende (fehlt eine Ablesung, wird die Periode als „unvollständig" gekennzeichnet).

**R2 – Enthaltene Zähler**
`eigener Verbrauch(X) = ΔX − Σ Δ(Y) für alle direkten enthaltenen Zähler Y` (rekursiv aufgelöst, damit keine Doppelabzüge).
Ergebnis wird dem Besitzer von X gutgeschrieben (`bewohnerId`), bzw. bleibt bei `null` Gemeinschaftsverbrauch.

**R3 – Energieverteilung auf Bewohner (Warmwasser)**
Ein gemeinschaftlicher Energie-/Warmwasserzähler wird **proportional zum Wasserverbrauch** der beteiligten Bewohner im selben Zeitraum verteilt:
`anteil_i = wasserDelta_i / Σ wasserDelta`, `energie_i = Δ(E) × anteil_i`.
*Beispiel:* Δ(E) = 3 MWh, Wasser Δ = 2 m³ und 1 m³ → 2 MWh und 1 MWh.
Sonderfall `Σ wasserDelta = 0` (keine oder nur Null-Wasser): Anzeige „keine Verteilungsbasis" + Rückfrage an Admin (Default-Vorschlag: gleichmäßige Aufteilung, immer mit sichtbarem Hinweis).

**R4 – Kosten**
`kosten_i = Σ (energieAnteil_i × preisMWh) + Σ (wasserDelta_i × preisM3)`.
Preis/MWh ist einstellbar (Default 0,10 €). Optionaler Wasserpreis.

**R5 – Theoretische Rechnung vs. Operatorrechnung**
`theoretische Kosten` = Summe aus R4 (nachvollziehbar, aus Zählerständen).
`Betreiberrechnung` = tatsächlicher Jahresbetrag des Betreibers (manuell erfasst, optional als Ist-Verbrauch + Preis eingegeben).
**Jahresabrechnung = Betreiberbetrag**, verteilt nach **Verbrauchsanteil**:
`verteilt_i = betreiberBetrag × (kostenTheoretisch_i / Σ kostenTheoretisch)`.
Die Differenz zum theoretischen Betrag wird als **Preisabweichung** ausgewiesen (transparent, nicht versteckt).

**R6 – Abschläge**
Je Bewohner ein optionaler monatlicher Abschlag (Betrag). Erfassen als Zahlungen mit Fälligkeitsdatum/Status.
Jahresabrechnung: `saldo_i = verteilt_i − Σ gezahlte Abschläge_i` → Nachzahlung (positiv) oder Auszahlung (negativ).

**R7 – Rundung**
Alle Beträge kaufmännisch auf 2 Nachkommastellen runden. Die Summe der Einzelpositionen muss exakt dem Gesamtbetrag entsprechen → Restverteilung nach größtem Rest (Largest-Remainder-Methode).

**R8 – Unvollständige Daten**
Fehlende Ablesungen, negative Deltas (Zählerwechsel/Fehlablesung) und unplausible Werte (Sprung > definierter Faktor) werden markiert und verhindern das Abschließen einer Abrechnung (Freigabe-Warnung, nicht harte Blockade).

---

## 4. Screens & Operationen

### S1 – Dashboard
- **Zweck:** Überblick, Einstieg in den letzten Ablesetag.
- **Anzeige:** aktueller Zeitraum, Gesamtverbrauch Energie/Wasser, Kosten je Bewohner (Karten), Anzahl offener Abschläge, letzte Ablesung, Sync-Status.
- **Operationen:** „Neue Ablesung", „Bewohner", „Abrechnung", Einstellungen.

### S2 – Zählerverwaltung
- **Anzeige:** Liste aller Zähler (Typ, Einheit, Besitzer, enthaltene Zähler, letzter Stand).
- **Operationen:** Zähler anlegen / bearbeiten / löschen (deaktivieren), Besitzer zuweisen, „enthält"-Relation setzen/entfernen, Zählerwechsel (neuer Zähler mit Startstand).

### S3 – Ablesung erfassen (Kamera-tauglich)
- **Anzeige:** Datum wählen (Default: heute), Grid/Tabelle **aller** aktiven Zähler mit aktuellem Stand und Einheit; großes Eingabefeld je Zähler; visuelles Feld (neu / unleserlich).
- **Operationen:** Stand eingeben, „unleserlich"/„geschätzt" markieren, Notiz, Zähler ausblenden, **alle speichern** (Batch), Entwurf fortsetzen, Foto als Beleg anhängen (optional, OCR-Vorschlag).
- **Anforderung:** Bedienung mit einer Hand im Hochformat, große Tap-Flächen, keine Einheiten-Eingabe, Tastatur `numeric`, kamera → Foto → Zahl → Bestätigen.

### S4 – Bewohner
- **Anzeige:** Liste (Name, Zähler, Abschlag, Saldo letzte Abrechnung).
- **Operationen:** Bewohner anlegen/bearbeiten/deaktivieren, Zähler zuweisen/entfernen, Abschlag planen, Detailansicht (Verbrauchsverlauf, Abrechnungen, Zahlungen).

### S5 – Verbrauch & Verteilung
- **Anzeige:** Zeitraum wählen → Tabelle je Zähler (Start, Ende, Δ, enthaltene Abzüge) und Tabelle je Bewohner (Wasser m³, Energie MWh, Anteil %, Kosten).
- **Operationen:** Zeitraum wechseln, CSV-Export, Zwischenstand speichern.

### S6 – Abschläge
- **Anzeige:** Plan je Bewohner, Raster offen/bezahlt, Summe je Jahr.
- **Operationen:** Abschlagsbetrag/Höhe setzen, Zahlung als bezahlt markieren (Datum), Zahlung stornieren, „Abschlag = 0" deaktivieren.

### S7 – Jahresabrechnung
- **Anzeige:** Jahr wählen → Operatorbetrag eingeben → Verteilungsvorschau je Bewohner (theoretisch vs. verteilt, Abschläge, Saldo) + Summen-/Plausibilitätscheck.
- **Operationen:** Betreiberbetrag + Hinweis erfassen, Verteilung neu berechnen, Positionen anpassen (mit Begründung), Entwurf speichern, an Bewohner versenden (Status), als bezahlt markieren, Einzel-PDF/CSV je Bewohner exportieren, Gesamtdokument exportieren.

### S8 – Einstellungen
- **Operationen:** Preis MWh / optional Preis m³, Währung, PIN-Schutz, Cloud-Sync (Anbieter, Login/Token, Sync-Intervall, „jetzt synchronisieren"), Daten exportieren (JSON/CSV) & importieren, Schema-Migration, Komplettlöschung, Impressum/Datenschutz.

### S9 – Status/Fehler (global)
- Sync-Fehlerbanner, Offline-Hinweis, Validierungs- und Unleserlichkeits-Markierungen, Wiederherstellen nach Fehlern.

---

## 5. Nicht-funktionale Anforderungen

- **Mobil-first**, PWA-installierbar, offline-fähige Eingabe (Lokalpuffer) mit Nachsenden bei Netzfehler.
- **Statisch deploybar auf GitHub Pages** (kein Servercode, kein Node-Backend).
- **Automatische Cloud-Speicherung** mit Konfliktauflösung (Last-Write-Wins je Datensatz + `updatedAt`).
- **Datenschutz:** Bewohnernamen = personenbezogene Daten → Hosting/EU-Region, Zugriffsschutz, keine Daten im öffentlichen Repo, Export/Löschen.
- **Sprache:** UI Deutsch (i18n für EN vorbereitet), Datums-/Zahlformat `de-DE`.
- **Performance:** < 2 s Ladezeit auf Mobilnetz, Bedienung offline nach erstem Laden.
- **Datenexport/Import** (JSON-Backup mit `schemaVersion` + Migrationen) als Notlösung und Umzugsmöglichkeit.
- **Zugriff:** mindestens PIN-geschützt (offene Punkte).

---

## 6. Architekturentscheidungen

Detail: [architecture.md](./architecture.md)

### 6.1 Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Build | **Vite + React + TypeScript** | schnelles HMR, kleine Bundles, GitHub Actions → `gh-pages` trivial; Deep Links über Hash-Router oder `404.html`-Fallback |
| State | **TanStack Query** (Server-State) + **Zustand** (UI-/Entwurfs-State) | saubere Trennung, Offline-Cache & Retry out of the box |
| Formular/Validierung | **React Hook Form + Zod** | geteilte Schema = Validierung in UI und Im-/Export |
| Styling | **Tailwind CSS** | schnelles, konsistentes Mobile-Layout |
| PWA | **vite-plugin-pwa** | Offline-Shell, Install-Prompt, Service Worker |
| PDF/CSV | clientseitig (print-CSS bzw. `pdf-lib`) | keine Serverkosten, personenbezogene Daten verlassen das Gerät nicht |
| i18n | `react-i18next` | de/en |
| Tests | Vitest (Berechnungslogik) + Playwright (Erfassungsflow) | Rechenregeln R1–R8 sind das Kernrisiko |

### 6.2 Datenhaltung & Cloud-Speicher

GitHub Pages ist rein statisch → „Cloud Save" braucht einen externen Dienst, vom Browser direkt angesprochen.

| Option | Setup | Multi-User/Auth | Kosten | Datenhaltung | Passt, wenn… |
|---|---|---|---|---|---|
| **Supabase** (Postgres + Auth + RLS) | Projekt + Tabelle + RLS-Policies, ~30 min | ✅ echte Nutzer, Bewohner sehen nur ihren Anteil | Free Tier | eigenes (EU-)Projekt | **Empfehlung**, wenn Bewohner selbst einloggen sollen |
| **Firebase Firestore** | Projekt + Rules | ✅ Google-Login | Free Tier (Spark) | Google-Cloud | Firebase-Ökosystem gewünscht |
| **GitHub-API** (privates Repo-Datei / Gist) + PAT | nur Token | ⚠️ ein Token = alle | gratis | eigenes privates Repo | **Empfehlung**, wenn 1 Admin + Export/PDF für Bewohner reicht |
| **Cloudflare Workers + D1** | Konto + Deploy + Secrets | ✅ eigene API | Free Tier | eigenes Konto | volle Kontrolle, mehr Betriebsaufwand |
| **Nur Browser** (IndexedDB) + Export/Import | keins | ❌ | gratis | Gerät | Offline-Prototyp, kein echter Cloud-Save |

**Empfehlung**
1. **Speicher als Adapter gekapselt** (`StorageAdapter`: `list/read/write/delete`), um Provider später zu tauschen.
2. Start mit **Supabase** (Auth + RLS: Rolle `admin` schreibt, Rolle `bewohner` liest nur eigene Positionen). Anon-Key ist im Frontend unkritisch; **Service-Role-Key niemals** ins Frontend.
3. **Fallback GitHub-API** (privates Repo als JSON-Ablage, Commit pro Änderung = Audit-Trail) für den Ein-Admin-Betrieb – ohne Zusatzkonto, Token nur im Gerät.
4. Immer zusätzlich **lokaler Cache + Export/Import** (IndexedDB, `schemaVersion`), damit die App ohne Netz weiter funktioniert.

### 6.3 Datenfluss (Überblick)

```mermaid
flowchart LR
  UI[Screens S1-S8] --> ST[Zustand/Formular]
  ST --> CALC[Berechnung R1-R8\n(pure functions)]
  CALC --> QU[TanStack Query Cache]
  QU --> SYNC[Sync-Engine]
  SYNC --> IDB[(IndexedDB Cache)]
  SYNC --> AD[StorageAdapter]
  AD --> SB[(Supabase / GitHub / CF)]
```

- **Berechnung als reine Funktionen** (`computePeriod(period, meters, readings)`), testbar, unabhängig vom Store.
- **Sync-Engine**: Änderungen als upsert mit `updatedAt`; Konflikt = Last-Write-Wins je Datensatz; Offline-Queue; Retry mit Backoff; Status sichtbar in der UI.
- **Migrationen**: Schema-Version im Export; Upgrade-Pfad beim Import.

### 6.4 Umsetzungsschritte (Vorschlag)

1. **M0 Statischer Prototyp**: Datenmodell, Berechnungslogik (R1–R8) + Unit-Tests, S2/S3/S4 mit LocalStorage-Adapter.
2. **M1 Cloud**: StorageAdapter für Supabase (+ Auth), Sync-Engine, S5/S6.
3. **M2 Abrechnung**: S7 inkl. Betreiberbetrag, Verteilung, Abschlagsverrechnung, PDF/CSV-Export.
4. **M3 Politur**: Kamera/OCR-Beleg, PWA-Offline, Settings/Export/Import, i18n, Deployment-Pipeline (GitHub Actions → Pages).

---

## 7. Offene Punkte (Entscheidung nötig)

1. **Wasserpreis**: eigener Preis pro m³ (Standard 0 €) oder Wasser nur als Verteilungsbasis?
2. **Verteilungsschlüssel Jahresabrechnung**: Kostenanteil (empfohlen, inkl. Wasser) oder rein nach Energie-MWh?
3. **Rollen/Zugriff**: nur Admin (PIN) oder Bewohner mit Login? Sollen Bewohner self-service sehen?
4. **Startablesungen**: gibt es historische Stände zum Start, ab wann gerechnet wird?
5. **Preisänderungen**: Preis/MWh pro Jahr konfigurierbar (Historie) oder global?
6. **Zählerwechsel**: neuer Zähler mit Startstand – wie wird die Periode behandelt?
7. **Rundung**: auf kWh / ganze m³ oder volle Cent?
8. **Abschlagsform**: jährlicher Abschlag (÷12) vs. frei wählbare Raten?
9. **Währung**: nur €, oder auch CHF?
10. **Bewohner ohne eigene Zähler** (z. B. untervermietet) – wie anteilig?
