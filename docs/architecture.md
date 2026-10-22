# Architektur – Heizungs-/Warmwasser-Abrechnung

> **Wichtig:** Dieses Repo ist öffentlich → enthält nur Code. Keine Bewohnernamen, keine Zählerstände,
> keine Tokens im Repo. Die Daten liegen in einem **privaten** Daten-Repo, die PDF entsteht im Browser.

## 1. Überblick

**Ein** Deployment: statisches Frontend auf GitHub Pages. Kein Backend, kein Worker, keine DB-Dienste.

- **Datenhaltung:** privates GitHub-Repo als JSON-Ablage (`data/state.json`) über die GitHub REST API.
- **Zugriff:** **GitHub-Fine-grained PAT** – der Admin hinterlegt ein Token, das auf **genau ein** Repository (`MadCowDevelopment/heizung-data`) und **nur `Contents: Read and write`** beschränkt ist. Kein eigenes Passwort, Tokens nie im Repo, jederzeit im GitHub-UI widerrufbar.
  - Ein echter „GitHub-Login"-Button (OAuth Device-Flow) ist **technisch nicht möglich**, solange es kein Backend gibt – Begründung und Messwerte in §2.1.
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
                       │ HTTPS + Bearer-Token
┌──────────────────────▼───────────────────────────────┐
│ Privates GitHub-Repo (Daten)                         │
│  data/state.json   (aktueller Stand)                │
│  data/history/*.json (Snapshot je Änderung)         │
└──────────────────────────────────────────────────────┘
```

**Kein Mail-Server, kein PDF-Server, kein Backend:** Die PDF entsteht im Browser, die Verteilung erfolgt manuell
(Admin hängt das PDF an bzw. druckt es). Damit bleibt die ganze Anlage ein statisches Deployment.

## 2. Datenzugriff: GitHub-Token + privates Daten-Repo

### 2.1 Anmeldung (Token statt OAuth-Login)

**Messung vom 21.10.2026 (gegen die echten Endpunkte, mit gültiger Client-ID einer öffentlichen OAuth-App):**

| Endpunkt | Antwort | `Access-Control-Allow-Origin` | OPTIONS-Preflight | Browserfähig? |
|---|---|---|---|---|
| `POST https://github.com/login/device/code` | `200` → `device_code`, `user_code`, `verification_uri` | **fehlt** | `404` | ❌ **nein** |
| `POST https://github.com/login/oauth/access_token` | `200` → `{"error":"authorization_pending"}` | **fehlt** | `404` | ❌ **nein** |
| `GET`/`PUT https://api.github.com/…` | `200` | `*` | `204`, Methoden GET/POST/PATCH/PUT/DELETE, Header `Authorization` erlaubt | ✅ **ja** |

**Mechanismus:** Die beiden `github.com`-Requests werden *ausgeführt* – `application/x-www-form-urlencoded` ist ein „simple request", löst also kein Preflight aus (die `404` auf `OPTIONS` fällt damit nicht ins Gewicht). Der Browser liefert die Antwort aber an JavaScript **nicht aus**, weil die Antwort keinen `Access-Control-Allow-Origin`-Header trägt. Ergebnis: `fetch()` liefert einen *opaque response* – die `device_code` bzw. das `access_token` sind für die App unerreichbar.

Folge: Der **OAuth Device-Flow lässt sich aus reinem Browser-JavaScript nicht durchführen** – unabhängig davon, ob PKCE gesetzt ist. Der Token-Tausch (`/login/oauth/access_token`) ist ebenfalls nicht CORS-fähig; klassische OAuth-Apps verlangen zudem `client_secret` (PKCE ist bei GitHub nur „strongly recommended", nicht verpflichtend).

> Ein Client-Secret im Frontend zu hinterlegen wäre ein Vollzugriff auf die OAuth-App – deshalb verworfen. Ein GitHub-App-„Client-Secret" wäre dasselbe Problem.

**Konsequenz:** Datenzugriff ja (CORS ok), *Anmeldung* über einen echten GitHub-OAuth-Flow nein (CORS blockiert). Zwei verbleibende Wege:

| Variante | Ablauf | Bewertung |
|---|---|---|
| **A – Fine-grained PAT ( gewählt)** | Admin erzeugt einmalig ein Token mit `Contents: R/W` **nur** auf `MadCowDevelopment/heizung-data` und trägt es in *Einstellungen → Konto & Cloud* ein. Die App prüft es mit `GET /user` (Anzeige des GitHub-Namens). | ✅ **empfohlen** – kein Server, kleinster Rechtekreis, sofort widerrufbar, Repo-übergreifend wirkungslos |
| **B – Token-Broker (Cloudflare Worker)** | Worker hält Client-Secret + Refresh-Token, Browser bekommt kurzlebige Sitzungstoken. Echter Login-Flow (Redirect zu GitHub). | sinnvoll, sobald mehrere Geräte/Personen je eigenes Token brauchen; wieder ein (kostenloses) Backend, ca. 30 Min Aufwand |

**Belegte Referenzprojekte** (Stand 21.10.2026): `PXL-Digital-Application-Samples/pxl-classroom` (statische Pages-SPA, Device-Flow über einen **eigenen** Cloudflare Worker, der genau die zwei `github.com/login/*`-Pfade allowlistet) und `meffysto/aetheris-protocol` (derselbe Aufbau, minimal). Beide bestätigen: **es braucht einen eigenen Proxy** – öffentliche CORS-Proxys (corsproxy.io, allorigins) sind unbrauchbar, weil sie inzwischen HTML-Antworten statt JSON liefern bzw. einen API-Key verlangen, und sie sehen den Token im Klartext. Ein **fremder** Proxy ist für ein Token mit Schreibrecht auf ein privates Repo nicht akzeptabel → der Broker muss selbst gehostet werden (Cloudflare Worker, kostenlos).

**Ausblick:** GitHub hat die SPA-Unterstützung für GitHub Apps auf der Roadmap ([github/roadmap#1153](https://github.com/github/roadmap/issues/1153), Stand 21.10.2026: **offen, `Preview`/`Paused`**) – dort ist CORS auf `/access_token` für als SPA-Client registrierte Redirect-URIs und PKCE **ohne** Client-Secret vorgesehen. Sobald das GA ist, entfällt der Broker. Der Hinweis auf dieses Issue gehört in die Architektur-Doku, damit die Entscheidung später bewusst neu bewertet werden kann.

**Umsetzung A im Detail**

- **Token-Erzeugung:** https://github.com/settings/personal-access-tokens/new → Resource owner `MadCowDevelopment` → *Only select repositories* → `heizung-data` → Permission *Contents: Read and write*, alles andere *No access* → fertig. Schritt-für-Schritt in [`docs/setup.md`](setup.md).
- **Token-Speicher:** `localStorage` (Key `heizung.token`), **nur** im Browser des Admins. Kein Analytics, keine Fremd-Skripte, restriktive CSP → XSS-Risiko minimiert.
- **Session-Status:** beim Verbinden `GET /user` und Prüfung des Daten-Repo-Zugriffs → Anzeige des GitHub-Namens; bei 401/403 zeigt die Konto-Seite den Fehler und erlaubt, ein erneuertes Token zu testen. Die Sync-Queue bleibt erhalten.
- **Widerruf:** GitHub → Settings → Developer settings → Personal access tokens → *Revoke* – wirkt sofort, Daten im Repo bleiben. Die App kann ein Fine-grained PAT nicht serverseitig widerrufen; *„Token lokal entfernen"* löscht nur den LocalStorage-Eintrag.
- **Abgelaufene Tokens:** das Token hat ein Ablaufdatum (max. 1 Jahr bei Fine-grained PAT), das in GitHub festgelegt wird. Bei einem abgelaufenen Token zeigt die Konto-Seite den API-Fehler; ein neues Token kann dort getestet und gespeichert werden. Eine Ablaufdatum-Anzeige oder Vorwarnung ist noch nicht implementiert.
- **Org-Kontext:** `MadCowDevelopment` ist eine Organisation, `Mihi` ist Admin. 2FA-Pflicht und SAML-SSO sind **nicht** aktiv → ein Fine-grained PAT ohne 2FA ist erzeugbar; SSO würde den Token-Broker (Variante B) erzwingen.
- **Rechte-Granularität:** *Kein* GitHub-Feature kann den Admin auf ein einzelnes privates Repo beschränken, wenn er mehreren Nutzern Zugriff geben will → Ablösung des PAT durch den Broker (B) ist der dokumentierte Ausbaupfad.


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
| 2FA | Für den Fine-grained PAT ist 2FA nicht zwingend (Org hat keine 2FA-Pflicht) – Token selbst ist ein Bearer, den man im GitHub-UI widerrufen kann |
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
      github.ts              # GitHub-REST-Implementierung (Contents-API, Fine-grained PAT)
      indexeddb.ts           # lokaler Cache + Offline-Queue
    sync/                    # Queue, Last-Write-Wins, Retry/Backoff, Status
    auth/                    # Token-Store (localStorage), Session-Status, Re-Auth-Dialog
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
  "schemaVersion": 4,
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
  "preis":      [ { "id": "p1", "gueltigAb": "2026-01-01", "preisMWh": 0.10, "preisM3": 0,
                    "notiz": "", "updatedAt": "…", "deleted": false } ],
  "abschlagPlan":[ { "id": "ap1", "bewohnerId": "b1", "betrag": 25, "rhythmus": "monatlich", "aktiv": true } ],
  "zahlung":    [ { "id": "z1", "bewohnerId": "b1", "betrag": 25, "faelligAm": "2026-03-01", "bezahltAm": "2026-03-04", "notiz": "" } ],
  "abrechnung": [ { "id": "ab1", "jahr": 2026, "von": "2026-01-01", "bis": "2026-12-31",
                    "betreiberBetrag": 1234.56, "betreiberHinweis": "…", "status": "entwurf",
                    "positionen": [ /* eingefrorene Positionen */ ], "updatedAt": "…" } ],
  "einstellungen": { "verteilSchluessel": "warm", "waehrung": "EUR", "preisMWhDefault": 0.10,
                     "preisM3Default": 0, "objektName": "…",
                     "ansprechpartner": "…", "pdfHinweis": "…", "datenRepo": "Mihi/heizung-data" }
}
```

**Hinweise**

- `ablesung` ist pro `(zaehlerId, datum)` eindeutig → Upsert-Key.
- `zaehler.enthaeltIds` als Array → Zyklenprüfung in der Domain-Schicht (schnell, testbar).
- `ablesung.preisMwhGenutzt` = Preis-Snapshot (R9) → historische Berechnungen bleiben reproduzierbar.
- `abrechnung.positionen` = eingefrorene Positionen → spätere Korrekturen verändern eine abgeschlossene Abrechnung nicht. Die Hinweise einer Position werden als **Code-Objekte** eingefroren (`{ "code": "…", "params": { … } }`), damit die Oberfläche sie sprachneutral auflösen und die Anzeigesprache wechseln kann.
- Meldungs-Codes benennen den **Sachverhalt, nicht die Anzeige**. Beispiel: `verteilung.fallbackKalt` bedeutet „es wurde auf den Kaltwasserzähler zurückgefallen" – der aktive Verteilungs-Schlüssel bleibt davon unberührt. Code und Katalogtext müssen dieselbe Sache bezeichnen; die Parität wird im Test festgeschrieben.
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
- **Auth-Fehler:** 401/403 → `authRequired` → Re-Auth-Dialog (Token neu einfügen); Queue bleibt erhalten.
- **Rate-Limit:** 1 Request pro Sync-Zyklus → weit unter 5.000/h. Optional „nur bei Änderung" schreiben (Dirty-Flag).
- **Status in der UI:** „Gespeichert · Synced 12:03" / „3 Änderungen ausstehend" / „Offline" / „Anmeldung nötig".

## 7. PDF-Erzeugung (clientseitig)

- **pdf-lib im Frontend:** Die PDF entsteht im Browser aus den **eingefrorenen** Positionen einer Abrechnung – kein Server-Rendering, keine zusätzlichen Secrets, personenbezogene Daten verlassen das Gerät nicht.
- **Inhalt Einzel-PDF je Bewohner:** Kopf (Objekt, Zeitraum, Bewohner, Datum), Tabelle (Warmwasser m³ rot, Kaltwasser m³ blau, Energie MWh, Anteil %, Kosten, Abschläge, Saldo), Fuß (Hinweis, Kontakt, Erläuterung der Verteilung). Farbcodierung warm/kalt/Energie wird übernommen.
- **Sammel-PDF** (alle Bewohner, Archiv) und **CSV-Export** (maschinenlesbar) ergänzend.
- **Ausgabe:** primär der **„Teilen"-Dialog des Browsers** (iOS/Android) → die PDF hängt als Anhang an eine beliebige E-Mail-/Druck-/Chat-App des Nutzers; zusätzlich klassischer Download als Datei. Kein Mailserver, keine Fremd-Dienste, keine Datenabgabe an Dritte.
- **Web Share API Level 2** (`navigator.share({ files: [pdf] })`) – nur mobile Browser; Desktop-Browser ohne Datei-Share → Fallback auf Download (`URL.createObjectURL` + `<a download>`). Feature-Detection statt Annahme.
- **Briefkopf optional:** Logo/Briefkopf als Bild (lokal im Browser hinterlegt); Textbausteine (Objektname, Ansprechpartner, Hinweistext) aus `einstellungen`.
- **Vorschau:** vor dem Download kann die PDF in einem Viewer geprüft werden (Blob-URL im Tab / in-app Vorschau).

## 8. Admin-Zugriff

- **Ein** Admin (bzw. wenige) → Rollenmodell optional vorbereitet (`admin`, später `viewer`).
- **Auth = GitHub-Token** (Fine-grained PAT, §2.1) → keine eigene Passwortverwaltung; Token-Widerruf im GitHub-UI.
- **Autorisierung:** Der Token muss auf das Daten-Repo schreiben können; ein Token ohne Repo-Zugriff liefert 403 → App meldet „Zugriff auf Daten-Repo fehlt" mit Hinweis auf die nötigen Scopes.
- **Grenze:** Jeder mit Token-Zugriff auf das Daten-Repo hat Vollzugriff → Token entsprechend behandeln (nur Admin-Rechner, Abmelden löscht den Token).

## 9. Kamera/OCR (optional)

- Foto über `<input type="file" accept="image/*" capture="environment">` → Gerätekamera direkt.
- Tesseract.js wird bei Bedarf geladen und verarbeitet das Bild clientseitig; Ziffernvorschläge **müssen vom Nutzer bestätigt** werden und werden nie automatisch gespeichert. Beim ersten Laden der OCR-Engine und Sprachdaten ist eine Internetverbindung nötig.
- Ohne OCR: Bild anbei + manuelles Tippen (empfohlen für M0/M1, da OCR bei schlechten Zählerfotos unzuverlässig ist).
- **Beleg-Speicher:** lokal (IndexedDB, nur auf dem Admin-Gerät); NICHT im Daten-Repo (Größe, Binärdaten, unnötige Verteilung).
- Die OCR benötigt nur die Engine-/Sprachdaten vom CDN; das Foto selbst wird nicht übertragen. Ohne geladene Engine bleibt manuelle Erfassung möglich.

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
  - `VITE_DATA_REPO` (Standard-Repo `MadCowDevelopment/heizung-data`) wird beim Build injiziert – **keine Secrets**. Das Zugriffstoken wird **nie** gebaut, sondern zur Laufzeit vom Admin eingegeben.
- **Daten-Repo:** `MadCowDevelopment/heizung-data` (privat, Branch `main`) mit `data/state.json` – **bereits angelegt**, siehe [`docs/setup.md`](setup.md).
- **Token:** Fine-grained PAT, vom Admin in den Einstellungen der App hinterlegt – **keine OAuth-App nötig** (Device-Flow ist aus dem Browser nicht aufrufbar, §2.1).
- **Kosten:** 0 € (GitHub Pages + private Repos + API).

## 12. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Falsche Verteilung → Geldstreit | Tests mit Referenzrechnungen, Herleitung je Position (Betrag ← Anteil ← Verbrauch ← Stände) |
| Datenverlust | Cloud-Save + lokales Backup + Export-Hinweis; Git-Historie des Daten-Repos ist der Restore |
| Token im Browser (XSS) | keine Fremd-Skripte/CDN/Analytics, restriktive CSP, `dangerouslySetInnerHTML` verboten |
| Token umfasst mehr als nötig | Fine-grained PAT ist auf **ein** Repo + **eine** Permission beschränkt; Daten-Repo isoliert; Widerruf jederzeit in GitHub |
| Kein echter GitHub-Login (CORS-Blocker bei Device-Flow) | PAT im Konto-Screen, minimaler Rechtekreis; Ausbaupfad Token-Broker (Cloudflare Worker) in §2.1 Variante B |
| Token verfällt (max. 1 Jahr) | Ablaufdatum im Konto-Screen anzeigen, 30 Tage vorher Erinnerung; Daten im Repo bleiben unberührt |
| Rate-Limit | 1 Request pro Sync-Zyklus, Dirty-Flag, `If-None-Match`/SHA-Prüfung vor dem Schreiben |
| Offline-Daten divergent | Sync-Log mit Konflikten, „Lokal zurücksetzen"-Aktion |
| DSGVO | eigenes privates Repo, Export/Löschen, Zugriffsschutz, Daten-Repo-Name im Impressum nennen |
| Repo ist öffentlich | Secret-Scan im CI, keine Daten im Code-Repo, `.gitignore` für lokale Exportdateien |

## 13. Offene Architektur-Entscheidungen

**Bereits entschieden (Round 4–6):** Backend-frei (Fine-grained PAT + privates Daten-Repo `MadCowDevelopment/heizung-data`) · Verteilungs-Schlüssel Default `warm` · Preisstufen datumsgenau („gültig ab", mehrere Wechsel pro Jahr, Split an der Preisgrenze) · PDF-Verteilung per „Teilen"-Dialog (Web Share API, Fallback Download), kein Mailserver · **kein OAuth-Device-Flow** (CORS-Blocker, §2.1) · Einmalige Einrichtung: [`docs/setup.md`](setup.md).

**Noch offen:**

- **Token-Broker (Cloudflare Worker)** als Ausbaupfad, sobald mehrere Geräte oder Personen je ein eigenes Token brauchen (echter Login-Flow, Refresh-Token).
- Ende-zu-Ende-Verschlüsselung der JSON (WebCrypto-Passphrase) → höchste Datenschutzstufe, Aufwand + Bedienhürde.
- Ein data-repo vs. mehrere (z. B. je Jahr ein Repo-File) → Historie im Repo reicht.
- Realtime-Sync (nötig?) oder Polling im 30-s-Takt reicht (nur ein Admin → Polling reicht).
- Preis-Stufen pro Jahr vs. Preis-Historie mit Datum (Empfehlung: Historie mit Datum deckt beides ab).
