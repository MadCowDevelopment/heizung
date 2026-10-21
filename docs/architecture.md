# Architektur – Heizungs-/Warmwasser-Abrechnung

> **Wichtig:** Dieses Repo ist öffentlich → enthält nur Code. Keine Bewohnernamen, keine Zählerstände,
> keine Tokens im Repo. Die Daten liegen in einem **privaten** Daten-Repo, die PDF entsteht im Browser.

## 1. Überblick

**Ein** Deployment: statisches Frontend auf GitHub Pages. Kein Backend, kein Worker, keine DB-Dienste.

- **Datenhaltung:** privates GitHub-Repo als JSON-Ablage (`data/state.json`) über die GitHub REST API.
- **Zugriff:** **GitHub-Login (OAuth Device-Flow)** – der Admin meldet sich mit GitHub an, ein OAuth-Token (Browser-Session) erlaubt Lesen/Schreiben im Daten-Repo. Kein eigenes Passwort, keine 2FA-Pflicht, Tokens nie im Repo.
- **PDF:** clientseitig (pdf-lib) im Browser.
- **Offline:** IndexedDB-Cache + Queue; Sync beim Start / bei Netzänderung.

```
┌──────────── Browser / PWA (GitHub Pages) ────────────┐
│ Screens S1–S9 (React + Tailwind)                     │
│   ↓                                                 │
│ React Hook Form + Zod  →  TanStack Query             │
│   ↓                                                 │
│ domain/ (pure calc: R0–R11)                         │
│   ↓                                                 │
│ pdf/ (pdf-lib)                                      │
│   ↓                                                 │
│ sync/ (Queue, LWW, Retry)  →  idb/ (IndexedDB)      │
│   ↓                                                 │
│ storage/github.ts  →  GitHub REST API                │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS + OAuth-Token
┌──────────────────────▼───────────────────────────────┐
│ Privates GitHub-Repo (Daten)                         │
│  data/state.json   (aktueller Stand)                │
│  data/history/*.json (Snapshot je Änderung)         │
└──────────────────────────────────────────────────────┘
```

**Kein Mail-Server, kein PDF-Server, kein Backend:** Die PDF entsteht im Browser, die Verteilung erfolgt manuell
(Admin hängt das PDF an bzw. druckt es). Damit bleibt die ganze Anlage ein statisches Deployment.

## 2. Datenzugriff: GitHub-Login + privates Daten-Repo

### 2.1 Anmeldung (OAuth Device-Flow)

- GitHub unterstützt den **Device Authorization Grant** (`/login/device/code`) – ideal für Browser-Apps, die kein Redirect-Secret besitzen:
  1. App fragt `POST https://github.com/login/device/code` (Client-ID) an → erhält `device_code` + `user_code` + `verification_uri`.
  2. App zeigt „Code `XXXX-XXXX` auf github.com/login/device eingeben" + QR-Link.
  3. Nutzer loggt sich bei GitHub ein, bestätigt die App, autorisiert die Scopes.
  4. App pollt `POST https://github.com/login/oauth/access_token` → erhält `access_token` (+ `refresh_token`, falls verfügbar) → legt es im `localStorage` ab (Browser-Session, 30 Tage).
- **Scopes:** `repo` (nötig für private Repos) bzw. möglichst eng `contents:read` + `contents:write` **auf genau das Daten-Repo** – dafür ist ein **Fine-grained PAT** nötig. Device-Flow mit OAuth-App unterstützt nur klassische, repo-weite Tokens → **wichtig**: Daten-Repo möglichst in einer eigenen Organisation/mit separaten Credentials halten, oder stattdessen einen Fine-grained PAT verwenden.
- **Empfehlung:** klassischer Device-Flow (einfach, echter GitHub-Login) + Daten-Repo in einem **eigenen privaten Repo**; Zugriffsrechte bewusst eng halten (Daten-Repo enthält keine anderen Daten als Zählerstände).

### 2.2 Datenzugriff

- Lesen: `GET /repos/{owner}/{repo}/contents/data/state.json` → Base64 dekodieren → JSON parsen.
- Schreiben: `PUT /repos/{owner}/{repo}/contents/data/state.json` mit `sha` des aktuellen Blobs (optimistische Nebenläufigkeitskontrolle) und Message `"sync 2026-10-21 12:03"`.
- **Commits = Audit-Trail:** Jeder Sync erzeugt einen Commit mit Zeitstempel → Historie, Diff und Rollback sind gratis. Zusätzlich `data/history/<ISO-Zeitstempel>.json` als Vollständigkeits-Backup.
- **Konflikte:** `sha` stimmt nicht mehr → `409` → App fragt den Serverstand ab, merged (Last-Write-Wins je Datensatz nach `updatedAt`) und schreibt erneut. Kein stiller Datenverlust.
- **Rate-Limit:** 5.000 Requests/h pro Token → mit Batching (ein Request pro Sync-Zyklus) völlig unkritisch.
- **Eigener API-Client:** `storage/github.ts` implementiert `StorageAdapter` (`list/read/write/delete`).

### 2.3 Sicherheit

| Thema | Maßnahme |
|---|---|
| Token im Browser | inevitable bei reinem Frontend → daher: **Daten-Repo enthält ausschließlich Zählerstände/Bewohnernamen**, alles andere (Code, Secrets) bleibt getrennt. Bei Personenbezug: Token mit Ablauf, Logout löscht Token, Gerät absichern. |
| XSS → Token-Diebstahl | keine Fremd-Skripte/CDN-Skripte, keine Analytics, restriktive CSP, keine `dangerouslySetInnerHTML` |
| Repo-Sichtbarkeit | Daten-Repo **privat**; im Code-Repo liegt nur Code |
| Verschlüsselung | HTTPS/TLS (GitHub) + GitHub-At-Rest-Verschlüsselung; optional zusätzlich Ende-zu-Ende-Verschlüsselung der JSON (WebCrypto, Passphrase) → Aufwand steigt, deshalb optional |
| 2FA | GitHub-2FA gilt automatisch mit; Token selbst ist ein Bearer, den man im GitHub-UI widerrufen kann |
| Löschung | Daten-Repo löschen = alle Daten weg; zusätzlich Export/Import im App |

### 2.4 Alternativen (kurz)

| Option | Wann sinnvoll |
|---|---|
| **Cloudflare Workers + D1** | wenn echtes Mehrbenutzer-Rechtemodell, Realtime oder viele Geräte nötig werden; Secrets serverseitig, Token nur im Worker |
| **Supabase** | wenn SQL/RLS-Fortgeschrittenheit vorhanden ist; eingebautes Auth |
| **Nur Browser (IndexedDB)** | wenn nur 1 Gerät genutzt wird; zusätzlich Export/Import als Backup |

Der `StorageAdapter` hält den Wechsel offen: `storage/github.ts` → später `storage/api.ts` (Worker) ohne Änderung an UI/Domain.

## 3. Projektstruktur

```
apps/web/                    # Frontend → GitHub Pages
  src/
    domain/                  # reine Logik, keine UI-/Netzabhängigkeit
      types.ts
      calc/
        period.ts            # R1  Periodenverbrauch je Zähler
        contains.ts          # R2  enthaltene Zähler auflösen (zyklensicher)
        distribute.ts        # R3  Energieverteilung nach Wasseranteil
        costs.ts             # R4  Kosten + Preis-Historie (R9)
        settlement.ts        # R5/R6/R7  Verteilung, Abschläge, Rundung
        plausibility.ts      # R8  Warnungen
    storage/
      adapter.ts             # interface StorageAdapter
      github.ts              # GitHub-REST-Implementierung (+ OAuth Device-Flow)
      indexeddb.ts           # lokaler Cache + Offline-Queue
    sync/                    # Queue, Last-Write-Wins, Retry/Backoff, Status
    auth/                    # Device-Flow, Token-Store, Session-Status
    pdf/                     # pdf-lib Layout, Einzel- + Sammel-PDF
    ui/screens/              # S1..S9
    ui/components/           # ZählerKarte, Eingabefeld, VerteilungsTabelle, …
    theme/                   # Farbtokens: warm=rot, kalt=blau, energie=bernstein
    i18n/                    # de, en
```

**Abhängigkeitsregeln:** `domain` importiert nichts außer `domain`. `pdf` importiert nur `domain`-Typen. `auth`/`storage` kennen kein UI. UI greift über TanStack Query/Hooks auf `sync` zu. Rechenlogik ist isoliert testbar (Vitest, ohne Netz).

## 4. Datenmodell (JSON-Ablage)

`data/state.json`:

```jsonc
{
  "schemaVersion": 3,
  "updatedAt": "2026-10-21T10:03:00Z",
  "bewohner": [
    { "id": "b1", "name": "…", "email": "…", "notiz": "", "aktiv": true, "farbe": "#c62828",
      "updatedAt": "…", "deleted": false }
  ],
  "zaehler": [
    { "id": "z1", "bezeichnung": "…", "typ": "energie|wasser_warm|wasser_kalt",
      "einheit": "MWh|m3", "bewohnerId": null, "enthaeltIds": ["z2"], "ablesestelle": "Keller",
      "aktiv": true, "startStand": 1234.5, "updatedAt": "…", "deleted": false }
  ],
  "ablesung": [
    { "id": "a1", "zaehlerId": "z1", "datum": "2026-01-15", "stand": 1300.2,
      "notiz": "", "unsicher": false, "fotoKey": null, "preisMwhGenutzt": 0.10,
      "createdAt": "…", "updatedAt": "…", "deleted": false }
  ],
  "preis":      [ { "id": "p1", "gueltigAb": "2026-01-01", "preisMWh": 0.10, "preisM3": 0, "notiz": "" } ],
  "abschlagPlan":[ { "id": "ap1", "bewohnerId": "b1", "betrag": 25, "rhythmus": "monatlich", "aktiv": true } ],
  "zahlung":    [ { "id": "z1", "bewohnerId": "b1", "betrag": 25, "faelligAm": "2026-03-01", "bezahltAm": "2026-03-04", "notiz": "" } ],
  "abrechnung": [ { "id": "ab1", "jahr": 2026, "von": "2026-01-01", "bis": "2026-12-31",
                    "betreiberBetrag": 1234.56, "betreiberHinweis": "…", "status": "entwurf",
                    "positionen": [ /* eingefrorene Positionen */ ], "updatedAt": "…" } ],
  "einstellungen": { "verteilSchluessel": "warm", "waehrung": "EUR", "objektName": "…",
                     "ansprechpartner": "…", "pdfHinweis": "…", "datenRepo": "Mihi/heizung-data" }
}
```

**Hinweise**

- `ablesung` ist pro `(zaehlerId, datum)` eindeutig → Upsert-Key.
- `zaehler.enthaeltIds` als Array → Zyklenprüfung in der Domain-Schicht (schnell, testbar).
- `ablesung.preisMwhGenutzt` = Preis-Snapshot (R9) → historische Berechnungen bleiben reproduzierbar.
- `abrechnung.positionen` = eingefrorene Positionen → spätere Korrekturen verändern eine abgeschlossene Abrechnung nicht.
- `einstellungen.datenRepo` → Ziel-Repo (`owner/repo`) in den Einstellungen konfigurierbar, damit das Frontend nicht fest verdrahtet ist.
- Fotos/Belege: bleiben **lokal** im Browser (IndexedDB) – nicht im Daten-Repo (groß, binär, unnötig).
- Schreibvorgang: **eine** JSON-Datei pro Sync → ein Commit, ein SHA, keine Teil-Konflikte.

## 5. Berechnungs-Kern (R0–R11) – Detail

```ts
// R1  Start-/Endstand je Zähler für eine Periode (Zwischenablesungen werden genutzt)
function meterDelta(meter, readings, from, to): { deltaKwh, complete, fromReading?, toReading? }

// R2  eigener Verbrauch inkl. enthaltener Zähler (memoisiert, zyklensicher)
function ownDelta(meterId, deltas, containsMap): number

// R3  Verteilung Energieanteil auf Bewohner nach Wasseranteil (warm/kalt/summe)
function distributeEnergy(energyKwh, residentsWater[]): { residentId, kwh, share }[]

// R9  Preis für Zeitraum (Preis-Historie, Snapshot je Ablesung)
function priceForDate(prices, date): { mwh, m3 }

// R5  Betreiberbetrag nach theoretischen Kosten verteilen (R7: Largest Remainder)
function allocate(totalCents, weights[]): number[]

// R6  Saldo je Bewohner (verteilt − gezahlte Abschläge)
function settlement(allocations, payments[]): { saldoCents, nachzahlung | auszahlung }
```

**Regeln im Detail**

- **R0 Einheiten:** Intern kWh und Liter (Integer wenn möglich) → Rundungsdrift minimal; Ausgabe erst in MWh/m³.
- **R1 Startstand:** letzte Ablesung mit `datum <= from`; **Endstand**: letzte mit `datum <= to`. Fehlt einer → `complete = false` → Kennzeichnung in der UI.
- **R2 Enthalten:** Rekursion mit `visited`-Set (Zyklen → Fehler). Enthaltene Zähler werden nicht zusätzlich direkt verteilt; ihr Verbrauch steckt schon im übergeordneten Zähler.
- **R3 Verteilung:** `share_i = wasser_i / Σ wasser`; Wasser aus den **eigenen** Wasserzählern des Bewohners (inkl. enthaltener Zähler über R2). `Σ wasser = 0` → Admin-Rückfrage, Vorschlag gleichmäßig.
- **R5/R7 Verteilung:** Gewichte = `kostenTheoretisch_i` (aus R4). Summe der Einzelbeträge == Betreiberbetrag **exakt**; Rest via Largest Remainder, deterministisch (Tie-Break nach Bewohner-ID → reproduzierbar).
- **R8 Plausibilität:** `delta < 0` → „Zählerwechsel/Fehlablesung"; `delta > 3× Median` → Warnung. Blockiert nur das *Abschließen* der Abrechnung.
- **R9 Preis:** Preistabelle `gueltigAb`; Periode über Preisgrenze → Teilintervalle je Preisstufe, anteilig gewichtet.

**Teststrategie:** Vitest-Table-Tests mit Referenzrechnungen (inkl. 3 MWh / 2 m³ / 1 m³-Beispiel, enthaltene Zähler, Preiswechsel, Rundungssummen-Gleichheit). Keine Snapshot-Heaviness.

## 6. Sync-Engine (Frontend)

- **Schreibvorgang:** UI mutiert den lokalen Cache (IndexedDB) sofort → UI ist instant & offline-fähig → Queue-Eintrag (`op: upsert|delete`, entity, payload, `updatedAt`).
- **Flush:** beim Start, bei `online`-Event und alle X Sekunden → ein Request (gesamter State) an die GitHub-API.
- **Schreiben:** `PUT contents/data/state.json` mit aktuellem `sha`; bei `409` → Serverstand holen, mergen (Last-Write-Wins je Datensatz nach `updatedAt`), erneut schreiben; Konflikte erscheinen im Sync-Log.
- **Auth-Fehler:** 401/403 → `authRequired` → Re-Login-Dialog (Device-Flow erneut starten); Queue bleibt erhalten.
- **Rate-Limit:** 1 Request pro Sync-Zyklus → weit unter 5.000/h. Optional „nur bei Änderung" schreiben (Dirty-Flag).
- **Status in der UI:** „Gespeichert · Synced 12:03" / „3 Änderungen ausstehend" / „Offline" / „Anmeldung nötig".

## 7. PDF-Erzeugung (clientseitig)

- **pdf-lib im Frontend:** Die PDF entsteht im Browser aus den **eingefrorenen** Positionen einer Abrechnung – kein Server-Rendering, keine zusätzlichen Secrets, personenbezogene Daten verlassen das Gerät nicht.
- **Inhalt Einzel-PDF je Bewohner:** Kopf (Objekt, Zeitraum, Bewohner, Datum), Tabelle (Warmwasser m³ rot, Kaltwasser m³ blau, Energie MWh, Anteil %, Kosten, Abschläge, Saldo), Fuß (Hinweis, Kontakt, Erläuterung der Verteilung). Farbcodierung warm/kalt/Energie wird übernommen.
- **Sammel-PDF** (alle Bewohner, Archiv) und **CSV-Export** (maschinenlesbar) ergänzend.
- **Ausgabe:** Browser-Download bzw. „Teilen"-Dialog auf dem Handy (Teilen mit Mail-/Druck-App hängt die Datei als Anhang an → E-Mail ohne Mailserver möglich).
- **Briefkopf optional:** Logo/Briefkopf als Bild (lokal im Browser hinterlegt); Textbausteine (Objektname, Ansprechpartner, Hinweistext) aus `einstellungen`.
- **Vorschau:** vor dem Download kann die PDF in einem Viewer geprüft werden (Blob-URL im Tab / in-app Vorschau).

## 8. Admin-Zugriff

- **Ein** Admin (bzw. wenige) → Rollenmodell optional vorbereitet (`admin`, später `viewer`).
- **Auth = GitHub-Login** (Device-Flow) → keine eigene Passwortverwaltung, keine 2FA-Pflicht (GitHub-2FA gilt), Token-Widerruf im GitHub-UI.
- **Autorisierung:** Der Token muss auf das Daten-Repo schreiben können; ein Token ohne Repo-Zugriff liefert 403 → App meldet „Zugriff auf Daten-Repo fehlt" mit Hinweis auf die nötigen Scopes.
- **Grenze:** Jeder mit Token-Zugriff auf das Daten-Repo hat Vollzugriff → Token entsprechend behandeln (nur Admin-Rechner, Abmelden löscht den Token).

## 9. Kamera/OCR (optional)

- Foto über `<input type="file" accept="image/*" capture="environment">` → Gerätekamera direkt.
- Optional: Tesseract.js (clientseitig, lazy geladen) liefert Ziffernvorschlag → **muss vom Nutzer bestätigt** werden, nie automatisch gespeichert.
- Ohne OCR: Bild anbei + manuelles Tippen (empfohlen für M0/M1, da OCR bei schlechten Zählerfotos unzuverlässig ist).
- **Beleg-Speicher:** lokal (IndexedDB, nur auf dem Admin-Gerät); NICHT im Daten-Repo (Größe, Binärdaten, unnötige Verteilung).

## 10. Farbkodierung (Design-System)

| Token | Wert | Verwendung |
|---|---|---|
| `--c-warm` | Rot (z. B. `#c62828`) | Warmwasser-Zähler, warm-Kennzahlen, Badge |
| `--c-kalt` | Blau (z. B. `#1565c0`) | Kaltwasserzähler, kalt-Kennzahlen, Badge |
| `--c-energie` | Bernstein (z. B. `#ef6c00`) | Energiezähler, MWh-Werte |

- Zähler-Typ-Badge in allen Listen/Tabellen, Zählerkarte, Kurven, PDF.
- Nicht nur Farbe: zusätzlich Icon/Text („Warm"/„Kalt"/„Energie") → Barrierefreiheit.
- Kontrastverhältnis ≥ 4.5:1 für Text auf farbigem Grund prüfen.

## 11. Deployment

- **Frontend (GitHub Pages):** `.github/workflows/pages.yml` → `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages`. Repo-Settings: Pages-Source = *GitHub Actions*.
  - Basis-Pfad: `vite.config.ts` mit `base: '/heizung/'` (Repo-Name!) → `VITE_BASE_PATH`.
  - Router: **HashRouter** (robust bei GitHub Pages ohne 404-Fallback) oder BrowserRouter + `404.html`-Copy.
  - `VITE_GITHUB_CLIENT_ID` (OAuth App) und `VITE_DATA_REPO` (Standard-Repo) werden beim Build injiziert – **keine Secrets** (Client-ID ist öffentlich).
- **Daten-Repo:** privates Repo anlegen, `data/state.json` mit leerem Grundgerüst anlegen, `owner/repo` in den Einstellungen der App eintragen (oder per `VITE_DATA_REPO` voreinstellen).
- **OAuth App:** GitHub → Settings → Developer settings → OAuth Apps → "Device flow" aktivieren; Client-ID wird ins Frontend eingebaut (öffentlich, kein Geheimnis).
- **Kosten:** 0 € (GitHub Pages + private Repos + API).

## 12. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Falsche Verteilung → Geldstreit | Tests mit Referenzrechnungen, Herleitung je Position (Betrag ← Anteil ← Verbrauch ← Stände) |
| Datenverlust | Cloud-Save + lokales Backup + Export-Hinweis; Git-Historie des Daten-Repos ist der Restore |
| Token im Browser (XSS) | keine Fremd-Skripte/CDN/Analytics, restriktive CSP, `dangerouslySetInnerHTML` verboten |
| Token umfasst mehr als nötig | Daten-Repo isoliert halten, Token nur mit Schreibrecht darauf, Widerruf jederzeit in GitHub |
| OAuth-Gerät-Idiotismus | `verification_uri_complete` als QR anzeigen, klare Anleitung, 10-min-Timeout |
| Rate-Limit | 1 Request pro Sync-Zyklus, Dirty-Flag, `If-None-Match`/SHA-Prüfung vor dem Schreiben |
| Offline-Daten divergent | Sync-Log mit Konflikten, „Lokal zurücksetzen"-Aktion |
| DSGVO | eigenes privates Repo, Export/Löschen, Zugriffsschutz, Daten-Repo-Name im Impressum nennen |
| Repo ist öffentlich | Secret-Scan im CI, keine Daten im Code-Repo, `.gitignore` für lokale Exportdateien |

## 13. Offene Architektur-Entscheidungen

- Fein-grained PAT (nur Daten-Repo) statt Device-Flow → sicherer, aber kein „GitHub-Login" und Token manuell zu pflegen.
- Ende-zu-Ende-Verschlüsselung der JSON (WebCrypto-Passphrase) → höchste Datenschutzstufe, Aufwand + Bedienhürde.
- Ein data-repo vs. mehrere (z. B. je Jahr ein Repo-File) → Historie im Repo reicht.
- Realtime-Sync (nötig?) oder Polling im 30-s-Takt reicht (nur ein Admin → Polling reicht).
- Preis-Stufen pro Jahr vs. Preis-Historie mit Datum (Empfehlung: Historie mit Datum deckt beides ab).
