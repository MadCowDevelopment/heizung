# Architektur – Heizungs-/Warmwasser-Abrechnung

> **Wichtig:** Dieses Repo ist öffentlich → enthält nur Code. Keine Bewohnerdaten, keine Secrets,
> keine echten Zählerstände im Repo. Geheimnisse liegen als Deployment-Secrets (z. B. `wrangler secret put`).

## 1. Überblick

Zwei Deployments:

1. **Frontend** – statisch auf GitHub Pages (Vite/React/TS, PWA).
2. **Backend** – Cloudflare Worker (+ D1) für Datenspeicherung, Admin-Auth und E-Mail-Versand inkl. PDF.

```
┌──────────── Browser / PWA (GitHub Pages) ────────────┐
│ Screens S1–S9 (React + Tailwind)                     │
│   ↓                                                 │
│ React Hook Form + Zod  →  TanStack Query             │
│   ↓                                                 │
│ domain/ (pure calc: R0–R11)                         │
│   ↓                                                 │
│ sync/ (Queue, LWW, Retry)  →  idb/ (IndexedDB)      │
│   ↓                                                 │
│ api/ (Fetch-Client + Session-Token)                 │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS + Bearer-Token
┌──────────────────────▼───────────────────────────────┐
│ Cloudflare Worker (TypeScript)                      │
│  ├─ Auth (Admin-Login, Passwort-Hash, Sessions)      │
│  ├─ REST-API (CRUD je Entität, Batch-Upsert)         │
│  ├─ Rechen-/PDF-Endpoint (Abrechnung + PDF)          │
│  ├─ Mailer (Resend/SMTP) + Templates                │
│  └─ D1 (SQLite) – alle Tabellen, schemaVersion      │
└──────────────────────────────────────────────────────┘
```

## 2. Projektstruktur

```
apps/                     # Monorepo-lite (npm workspaces)
  web/                    # Frontend → GitHub Pages
    src/
      domain/             # reine Logik, keine UI-/Netzabhängigkeit
        types.ts
        calc/
          period.ts       # R1  Periodenverbrauch je Zähler
          contains.ts     # R2  enthaltene Zähler auflösen (zyklensicher)
          distribute.ts   # R3  Energieverteilung nach Wasseranteil
          costs.ts        # R4  Kosten + Preis-Historie (R9)
          settlement.ts   # R5/R6/R7  Verteilung, Abschläge, Rundung
          plausibility.ts # R8  Warnungen
      storage/
        adapter.ts        # interface StorageAdapter
        api.ts            # Implementierung gegen das Backend
        indexeddb.ts      # lokaler Cache + Offline-Queue
      sync/               # Queue, Last-Write-Wins, Retry/Backoff, Status
      ui/screens/         # S1..S9
      ui/components/      # ZählerKarte, Eingabefeld, VerteilungsTabelle, …
      theme/              # Farbtokens: warm=rot, kalt=blau, energie=bernstein
      i18n/               # de, en
  api/                    # Worker → Cloudflare Pages/Workers
    src/
      index.ts            # Router (Hono oder plain fetch)
      routes/             # auth, meters, readings, residents, settlement, mail
      db/                 # D1-Schema + Migrationen
      mail/               # Resend-Client, Templates
      pdf/                # pdf-lib Layout
```

**Abhängigkeitsregeln:** `domain` importiert nichts außer `domain`. `api` kennt kein Frontend. UI greift über TanStack Query/Hooks auf `api` zu. Rechenlogik ist damit isoliert testbar (Vitest ohne Worker-Setup).

## 3. Datenmodell (D1 / Postgres)

Alle Tabellen: `id TEXT PRIMARY KEY`, `updated_at TEXT`, `deleted INTEGER DEFAULT 0`, `schema_version INTEGER`.

```sql
bewohner(id, name, email, notiz, aktiv INT, email_versand_aktiv INT, farbe, updated_at, deleted)
zaehler(id, bezeichnung, typ TEXT CHECK(typ IN ('energie','wasser_warm','wasser_kalt')),
        einheit TEXT, bewohner_id TEXT NULL, enthaelt_ids TEXT /*JSON*/, ablesestelle,
        aktiv INT, start_stand REAL NULL, updated_at, deleted)
ablesung(id, zaehler_id TEXT, datum TEXT, stand REAL, notiz, unsicher INT,
         foto_key TEXT NULL, preis_mwh_genutzt REAL, created_at, updated_at, deleted)
  -- UNIQUE(zaehler_id, datum)
preis(id, gueltig_ab TEXT, preis_mwh REAL, preis_m3 REAL DEFAULT 0, notiz, updated_at, deleted)
abschlag_plan(id, bewohner_id, betrag REAL, rhythmus TEXT CHECK(rhythmus IN ('monatlich','jaehrlich')),
               aktiv INT, updated_at, deleted)
zahlung(id, bewohner_id, betrag REAL, faellig_am TEXT, bezahlt_am TEXT NULL, notiz, updated_at, deleted)
abrechnung(id, jahr INT, von TEXT, bis TEXT, betreiber_betrag REAL, betreiber_hinweis,
           status TEXT, positionen TEXT /*JSON*/, updated_at, deleted)
email_vorgang(id, abrechnung_id, bewohner_id, empfaenger, betreff, status TEXT,
              gesendet_am TEXT NULL, fehler_text TEXT NULL, provider_id TEXT NULL, updated_at, deleted)
einstellungen(id='singleton', verteil_schluessel TEXT, waehrung TEXT, absender_name TEXT,
              email_betreff TEXT, email_text TEXT, verteiler_adresse TEXT, updated_at)
admin_user(id, email, passwort_hash, passwort_salt, mfa_secret NULL, created_at, updated_at)
session(id, admin_id, token_hash, expires_at, created_at)
```

**Hinweise**

- `zaehler.enthaelt_ids` als JSON-Array → Zyklenprüfung in der Domain-Schicht (schnell, testbar).
- `ablesung.preis_mwh_genutzt` = Preis-Snapshot (R9) → historische Berechnungen bleiben reproduzierbar.
- Fotos/Belege: **nicht** in D1 (Größe) → R2-Storage (Cloudflare R2) oder nur optional; alternativ nur lokal auf dem Gerät. Datenschutz: Beweisfotos gehören nicht in ein öffentliches Repo.
- `abrechnung.positionen` als JSON: eingefrorene Positionen einer abgeschlossenen Abrechnung dürfen sich nicht durch spätere Korrekturen verändern → Snapshot statt Neuberechnung.
- Indizes: `ablesung(zaehler_id, datum)`, `zahlung(bewohner_id, faellig_am)`, `email_vorgang(abrechnung_id)`.

## 4. Berechnungs-Kern (R0–R11) – Detail

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
- **R5/R7 Verteilung:** Gewichte = `kostenTheoretisch_i` (aus R4). Summe der Einzelbeträge == Betreiberbetrag **exakt**; Rest via Largest Remainder, deterministisch (Sortierung nach Bewohner-ID als Tie-Break → reproduzierbar).
- **R8 Plausibilität:** `delta < 0` → „Zählerwechsel/Fehlablesung"; `delta > 3× Median` → Warnung. Blockiert nur das *Abschließen* der Abrechnung.
- **R9 Preis:** Preistabelle `gueltigAb`; Periode über Preisgrenze → Teilintervalle je Preisstufe, anteilig gewichtet.

**Teststrategie:** Vitest-Table-Tests mit Referenzrechnungen (inkl. 3 MWh / 2 m³ / 1 m³-Beispiel, enthaltene Zähler, Preiswechsel, Rundungssummen-Gleichheit). Keine Snapshot-Heaviness.

## 5. Cloud-Backend: Optionen im Detail

### 5.1 Cloudflare Workers + D1 + Resend (empfohlen)

- **Warum:** Ein Deployment deckt Datenspeicherung **und** E-Mail-Versand ab. Secrets bleiben serverseitig. Der Free-Tier reicht für eine Wohngemeinschaft; D1 ist SQLite (einfach zu lesen, zu backuppen, zu migrieren).
- **Auth:** Admin-Login mit E-Mail + Passwort (Argon2id oder scrypt via `crypto.subtle`/WebCrypto bzw. `bcrypt`), Session-Token (Bearer, kurzlebig, in `httpOnly` Cookie wenn möglich, sonst `localStorage` + kurze TTL). Rate-Limit beim Login, 2FA optional (TOTP).
- **API:** REST, JSON, `Authorization: Bearer <token>`; je Entität `GET /list`, `POST /upsert` (Batch mit `updatedAt`), `POST /delete` (Soft-Delete). Für unsyncte Offline-Änderungen: Batch-Upsert in einem Request.
- **E-Mail:** `POST /abrechnungen/:id/versenden` → Worker erzeugt PDF (pdf-lib) + Text, ruft Resend auf, schreibt `email_vorgang` (Status, `providerId`, `gesendet_am`). Testversand an die eigene Adresse. Wiederholung: Button „erneut senden" → neue `email_vorgang`-Zeile.
- **Zustellbarkeit:** eigene Domain mit SPF/DKIM/DMARC (bei Gmail/Yahoo Pflicht), sonst Versand über die Resend-Testdomain mit Hinweis „nur an eigene Adresse".
- **Kosten:** Worker + D1 + R2 im Free-Tier gratis (Limit beachten), Resend free Tier 3.000 Mails/Monat, Domain ~10 €/Jahr.

### 5.2 Supabase (Postgres + Auth + Edge Function) – Alternative

- Auth eingebaut (E-Mail/Passwort), RLS, Realtime; E-Mail via Edge Function (Resend), PDF via pdf-lib in der Function.
- Passt, wenn SQL/RLS-Fortgeschrittenheit vorhanden ist oder Realtime gewünscht wird.
- Nachteile: mehr Konfiguration (Schema, RLS-Policies, Service/Anon-Keys, Supabase CLI), Preis-/Projektpausen, Edge-Function-Limits.

### 5.3 GitHub-API + separater Versand-Worker

- Daten in `data/state.json` eines privaten Repos (Commits = Audit-Trail), Token (fine-grained, nur dieses Repo) am Gerät.
- Für E-Mail-Versand wird zusätzlich ein Worker/Function mit Repo-PAT gebraucht → zwei Systeme, mehr Betriebsaufwand.
- **Nur für Prototyp**, sobald Admin-Login und Versand produktiv sind, überwiegt Cloudflare/Supabase.

### 5.4 Firebase (Firestore + Cloud Functions)

- Firestore mit Security Rules, Google-Login, Functions für Mail. Vendor-Lock-in, Regeln in eigener DSL.

### 5.5 Nur Browser (IndexedDB)

- Kein echter Cloud-Save, kein Versand → nur Demo/Prototyp.

### 5.6 Entscheidung

| Kriterium | CF Workers + D1 | Supabase | GitHub + Worker | Firebase | Nur Browser |
|---|---|---|---|---|---|
| Setup-Aufwand | mittel | mittel | hoch | mittel | keiner |
| Admin-Login | selbst (muss gebaut werden) | eingebaut | ≈ Token | eingebaut | PIN |
| E-Mail + PDF im selben System | ✅ | ✅ (Edge Function) | ⚠️ | ✅ | ❌ |
| Kostenlos für diesen Fall | ✅ | ✅ | ✅ | ✅ | ✅ |
| Datenschutz/EU | ✅ eigenes Konto | ✅ eigenes Projekt | ✅ | ✅ | ✅ lokal |
| Realtime | ⚠️ (Polling/Durable Objects) | ✅ | ❌ | ✅ | ❌ |
| Ein Deploy | ✅ | ⚠️ (DB + Function + Auth) | ❌ | ⚠️ | – |

**Empfehlung:** **Cloudflare Workers + D1 + Resend.** Ein Deploy, volle Kontrolle, Secrets serverseitig, alles im kostenlosen Bereich. Der Frontend-Adapter (`StorageAdapter`) hält den Wechsel zu Supabase später offen.

> Datenschutz: Namen/E-Mails sind personenbezogene Daten → eigenes Konto/Projekt (EU-Region), niemals Shared-Instance, Export & vollständige Löschung anbieten, Backups des eigenen Kontos.

## 6. Sync-Engine (Frontend)

- **Schreibvorgang:** UI mutiert den lokalen Cache (IndexedDB) sofort → UI ist instant & offline-fähig → Queue-Eintrag (`op: upsert|delete`, entity, payload, `updatedAt`).
- **Flush:** beim Start, bei `online`-Event und alle X Sekunden → Batch-Upserts an die API.
- **Konflikt:** Last-Write-Wins **je Datensatz** anhand `updatedAt`; bei Gleichstand gewinnt der Server. Konflikte erscheinen im Sync-Log (kein stiller Datenverlust).
- **Auth-Fehler:** 401 → `authRequired` → Re-Login-Dialog; Queue bleibt erhalten.
- **Status in der UI:** „Gespeichert · Synced 12:03" / „3 Änderungen ausstehend" / „Offline" / „Anmeldung nötig".

## 7. Admin-Auth

- Nur **ein** Admin (bzw. wenige) → Rollenmodell ist optional vorbereitet (`admin`, später `viewer`).
- Passwort-Hash: scrypt/Argon2id mit Salt; keine Klartext-Passwörter in der DB; `session`-Tabelle mit `expires_at`.
- Login-Seite geschützt; alle API-Routen prüfen den Bearer-Token; Frontend-Routen per `ProtectedRoute`.
- 2FA (TOTP) optional als Upgrade in S8.
- **Kein** Bewohner-Login (Entscheidung) → Bewohner erhalten ausschließlich E-Mails mit PDF.

## 8. E-Mail & PDF

- **Inhalt E-Mail:** Betreff (`Heizkostenabrechnung {jahr} – {bewohner}`), Kurzfassung (Zeitraum, Warmwasser/Kaltwasser in m³, Energieanteil MWh, Anteil %, Rechnungsbetrag, Abschläge, Saldo/Nachzahlung), Hinweis (z. B. Preisabweichung), Anhang: PDF.
- **PDF (pdf-lib, serverseitig):** Kopf (Objekt, Zeitraum, Absender), Tabelle (Verbrauch, Anteil, Kosten, Abschläge, Saldo), Fuß (Datum, Kontakt, Hinweis zur Abrechnung). Farbcodierung warm/kalt/Energie wird im PDF übernommen.
- **Templates:** Betreff- und Text-Template in `einstellungen` mit Platzhaltern (`{{name}}`, `{{jahr}}`, `{{betrag}}`, `{{saldo}}`, `{{verbrauch}}`).
- **Versandstatus je Empfänger** in S7 sichtbar; Fehler (Bounce, invalid address) werden protokolliert; Bewohner ohne E-Mail-Adresse werden markiert („kein Empfänger").
- **DSGVO/Praxis:** E-Mail enthält personenbezogene Daten → Transportverschlüsselung (TLS), keine Empfängerliste im Repo, Löschfristen/Export/Archivierung anbieten.

## 9. Kamera/OCR (optional)

- Foto über `<input type="file" accept="image/*" capture="environment">` → Gerätekamera direkt.
- Optional: Tesseract.js (clientseitig, lazy geladen) liefert Ziffernvorschlag → **muss vom Nutzer bestätigt** werden, nie automatisch gespeichert.
- Ohne OCR: Bild anbei + manuelles Tippen (empfohlen für M0/M1, da OCR bei schlechten Zählerfotos unzuverlässig ist).
- **Beleg-Speicher:** standardmäßig lokal (IndexedDB, nur auf dem Admin-Gerät); optional später in R2 mit Ablaufdatum.

## 10. Farbkodierung (Design-System)

| Token | Wert | Verwendung |
|---|---|---|
| `--c-warm` | Rot (z. B. `#c62828`) | Warmwasser-Zähler, warm-Kennzahlen, Badge |
| `--c-kalt` | Blau (z. B. `#1565c0`) | Kaltwasser-Zähler, kalt-Kennzahlen, Badge |
| `--c-energie` | Bernstein (z. B. `#ef6c00`) | Energiezähler, MWh-Werte |

- Zähler-Typ-Badge in allen Listen/Tabellen, Zählerkarte, Kurven, PDF.
- Nicht nur Farbe: zusätzlich Icon/Text („Warm"/"Kalt"/"Energie") → Barrierefreiheit.
- Kontrastverhältnis ≥ 4.5:1 für Text auf farbigem Grund prüfen.

## 11. Deployment

- **Frontend (GitHub Pages):** `.github/workflows/pages.yml` → `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages`. Repo-Settings: Pages-Source = *GitHub Actions*.
  - Basis-Pfad: `vite.config.ts` mit `base: '/heizung/'` (Repo-Name!) → `VITE_BASE_PATH`.
  - Router: **HashRouter** (robust bei GitHub Pages ohne 404-Fallback) oder BrowserRouter + `404.html`-Copy.
  - `VITE_API_BASE_URL` (URL des Workers) wird beim Build injiziert – kein Secret.
- **Backend (Cloudflare):** `wrangler deploy` (manuell oder via GitHub Action mit `CLOUDFLARE_API_TOKEN`-Secret); Secrets: `wrangler secret put RESEND_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`.
- **Domain/Sender:** eigene Domain → SPF/DKIM/DMARC bei Resend einrichten.

## 12. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Falsche Verteilung → Geldstreit | Tests mit Referenzrechnungen, Herleitung je Position (Betrag ← Anteil ← Verbrauch ← Stände) |
| Datenverlust | Cloud-Sync + lokales Backup + Export-Hinweis; D1-Backups (D1 time-travel / Export) |
| E-Mail landet im Spam | eigene Domain + SPF/DKIM/DMARC, `email_vorgang`-Status, Bounce-Monitoring |
| Backend-Ausfall | Frontend bleibt offline nutzbar (IndexedDB + Queue), Sync Later |
| Preisänderung im Betrieb | Preis-Historie + Snapshot pro Ablesung (R9) |
| Komplexe Zählerstruktur | Zyklenprüfung + visuelle Strukturansicht in S2 |
| DSGVO | eigene Cloud-Instanz, Export/Löschen, Zugriffsschutz, Logs ohne personenbezogene Daten |
| Repo ist öffentlich | Secret-Scan im CI, keine Daten im Repo, `.gitignore` für lokale Exportdateien |

## 13. Offene Architektur-Entscheidungen

- E-Mail-Provider & eigene Domain (Resend vs. SMTP-eigener Server) – Voraussetzung für Gmail-Zustellung.
- Einzel-PDF je Bewohner vs. Sammel-PDF (+ Archiv).
- Zwei-Faktor-Login für den Admin.
- Realtime-Sync (nötig?) oder Polling im 30-s-Takt reicht (nur ein Admin → Polling reicht).
- Preis-Stufen pro Jahr vs. Preis-Historie mit Datum (Empfehlung: Historie mit Datum deckt beides ab).
