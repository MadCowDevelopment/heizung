# Architektur – Heizungs-/Warmwasser-Abrechnung

## 1. Überblick

Statische Single-Page-App (kein Server-Code). GitHub Pages liefert nur HTML/CSS/JS.
Datenspeicherung: **Cloud-Provider über `StorageAdapter`** + **lokaler Cache (IndexedDB)** für Offline-Betrieb.

```
┌──────────────── Browser / PWA ────────────────┐
│ Screens (S1–S9)                              │
│   ↓                                           │
│ React Hook Form + Zod  →  TanStack Query      │
│   ↓                                           │
│ domain/ (pure calc: R1–R8)                    │
│   ↓                                           │
│ sync/ (Queue, Konflikt, Retry)                │
│   ↓                          ↓                │
│ idb/ (IndexedDB Cache)   StorageAdapter        │
│                              ↓  ↓  ↓          │
│                        Supabase / GitHub / CF │
└───────────────────────────────────────────────┘
```

## 2. Projektstruktur (geplant)

```
src/
  domain/          # reine Logik, keine UI-/Netzwerkabhängigkeit
    types.ts       # Zähler, Bewohner, Ablesung, Abschlag, Abrechnung
    calc/
      period.ts    # R1: Periodenverbrauch je Zähler
      contains.ts  # R2: enthaltene Zähler auflösen (zyklensicher)
      distribute.ts# R3: Energieverteilung nach Wasseranteil
      costs.ts     # R4: Kosten, Preise
      settlement.ts# R5/R6/R7: Abrechnung, Abschläge, Rundung
  storage/
    adapter.ts     # interface StorageAdapter
    supabase.ts    # Implementierung
    github.ts      # Implementierung
    indexeddb.ts   # lokaler Cache + Offline-Queue
  sync/            # Upsert-Queue, Last-Write-Wins, Retry/Backoff, Status
  ui/screens/      # S1..S9
  ui/components/   # ZählerKarte, Eingabefeld, VerteilungsTabelle, ...
  i18n/            # de, en
```

**Abhängigkeitsregel:** `domain` importiert nichts außer `domain`. `storage`/`sync` kennen kein UI. UI greift über TanStack Query/Hooks auf `sync` zu. Damit ist die Rechenlogik isoliert testbar.

## 3. Datenmodell (Storage-Schema)

Alle Tabellen: `id` (uuid/ULID), `updatedAt` (ISO), `deleted` (bool für Soft-Delete), `schemaVersion`.

```
bewohner(id, name, kontakt, notiz, aktiv, updatedAt)
zaehler(id, bezeichnung, typ, einheit, bewohnerId?, enthaelt: json[ids], ablesestelle, aktiv, updatedAt)
ablesung(id, zaehlerId, datum, stand, notiz, unsicher, updatedAt)   # unique(zaehlerId, datum)
abschlag_plan(id, bewohnerId, betrag, intervall, aktiv, updatedAt)
zahlung(id, bewohnerId, betrag, faelligAm, bezahltAm?, notiz, updatedAt)
abrechnung(id, jahr, betreiberBetrag, betreiberHinweis, status, positionen: json[], updatedAt)
einstellungen(id=singleton, preisMWh, preisM3, waehrung, pinHash, provider, updatedAt)
```

**Wichtig:** `zaehler.enthaelt` wird als JSON-Array von IDs gespeichert (Supabase: `uuid[]`/JSONB). Alternative: relationelle `zaehler_relation(enthaelt_id, enthalten_id)` – nötig, wenn die DB die Zyklenfreiheit erzwingen soll. Empfehlung: JSON + **Zyklenprüfung in der Domain-Schicht** (schnell, testbar).

## 4. Berechnungs-Kern (R1–R8) – Detail

```ts
// R1: Start/Ende-Stand eines Zählers für eine Periode
function meterDelta(meter, readings, from, to): { delta, complete, fromReading?, toReading? }

// R2: eigener Verbrauch inkl. enthaltener Zähler (memoisiert, zyklensicher)
function ownDelta(meterId, deltas, containsMap): number

// R3: Verteilung Energieanteil auf Bewohner nach Wasseranteil
function distributeEnergy(energyDelta, residentsWaterDelta[]): { residentId, mwh, share }[]

// R5: Betreiberbetrag nach theoretischen Kosten verteilen (Rundung via Largest Remainder)
function allocate(total, weights[]): number[]

// R6: Saldo je Bewohner
function settlement(total, allocations, payments[]): { saldo, nachzahlung | auszahlung }
```

**Berechnungsregeln im Detail**

- **R1 Startstand**: letzte Ablesung mit `datum <= from`; **Endstand**: letzte mit `datum <= to`. Fehlt einer → `complete = false` → Kennzeichnung in der UI.
- **R2 Enthalten**: Rekursion mit `visited`-Set (Zyklen → Fehler). Enthaltene Zähler werden **nicht** nochmal direkt verteilt, ihr Verbrauch steckt schon im übergeordneten Zähler.
- **R3 Verteilung**: `share_i = wasser_i / Σ wasser`. Wasser-Verbrauch kommt aus den **eigenen Wasserzählern** der Bewohner (inkl. deren enthaltener Zähler). `Σ wasser = 0` → Admin-Rückfrage, Vorschlag: gleiche Aufteilung.
- **R5 Verteilung des Betreiberbetrags**: Gewichte = `kostenTheoretisch_i` (berechnet mit R4). Ergibt Summe exakt = Betreiberbetrag (R7).
- **R7 Rundung**: Beträge kaufmännisch auf 2 Nachkommastellen; Restdifferenz per Largest Remainder auf die größten Reste verteilen (deterministisch, stabil bei gleicher Eingabe → wichtig für Tests).
- **R8 Plausibilität**: `delta < 0` → „Zählerwechsel/Fehlablesung"; `delta > maxSchwelle` (z. B. 3× Median der letzten Perioden) → Warnung. Beides blockiert nur das *Abschließen* der Abrechnung.

**Teststrategie**: Tabelle mit Referenzrechnungen (inkl. des 3 MWh / 2 m³ / 1 m³-Beispiels) → Vitest-Table-Tests; keine Snapshot-Heaviness.

## 5. Cloud-Speicher: Optionen im Detail

### 5.1 Supabase (Postgres + Auth + RLS) — Empfehlung für Multi-User

- **Setup:** Projekt (EU-Region z. B. Frankfurt) → SQL-Schema anlegen → RLS-Policies:
  - Tabelle `app_data` (oder pro Entität eine Tabelle) mit `owner_id`.
  - Rolle `admin`: `all` auf eigene Zeilen; Rolle `bewohner`: `select` nur auf Zeilen mit `bewohnerId = auth.uid()`.
  - Auth: E-Mail/Passwort oder Magic Link; Passwort-Hash liegt in Supabase, App speichert nur Session-Token (localStorage).
- **Zugriff aus dem Browser:** nur `anon`-Key + Session-Token; **Service-Role-Key niemals** im Frontend. RLS erzwingt Rechte serverseitig.
- **Sync:** Realtime (`supabase.channel`) für Live-Sync zwischen Admin und Bewohnern; zusätzlich Poll-Fallback.
- **Kosten:** Free Tier (500 MB, 50k MAU) reicht für eine Wohngemeinschaft. Pause bei Inaktivität nach 1 Woche (Backup-Hinweis).
- **Risiken:** externe Abhängigkeit, Projekt-Setup nötig, EU-Region wählbar.

### 5.2 GitHub-API (private Repo-Datei) — Empfehlung für 1 Admin

- **Setup:** privates Repo `heizung-data` + Fine-grained PAT mit `contents:write` (nur dieses Repo). Ablage: `data/state.json` (+ optional `data/history/YYYY-MM.json`).
- **Sync:** jeder Write = Commit (Audit-Trail, Rollback über Git-Historie). Rate-Limit beachten (≈ 5000/h – reicht).
- **Zugriff:** Token nur im Gerät (optional mit PIN/Passphrase verschlüsselt im WebCrypto). Bewohner erhalten nur exportierte Dokumente, keinen Login.
- **Kosten:** gratis, kein zusätzliches Konto.
- **Risiken:** Token im Browser (XSS-Risiko) → Content-Security-Policy, keine Fremd-Skripte; Repo darf nie öffentlich sein.

### 5.3 Firebase Firestore

- Dokumenten-Store, Security Rules statt RLS, Realtime out of the box, OAuth (Google). Free-Tier reicht. Daten liegen in Google-Cloud (Region wählbar).
- Passt, wenn Firebase-Ökosystem (Auth, Hosting, Analytics) gewünscht ist. Nachteil: Vendor-Lock-in, Regeln in einer DSL, die eigene Fehlerquelle.

### 5.4 Cloudflare Workers + D1 (oder KV/R2)

- Eigene Mini-API (ein Deploy, `wrangler`), D1 = SQLite in der Edge, Secrets via `wrangler secret put`. Volle Kontrolle, Trigger/Job für E-Mail-Versand möglich.
- Kostenlos bis großzügigem Free-Tier. Aufwand: Worker schreiben, CORS/Auth selbst lösen.

### 5.5 Nur-Browser (IndexedDB) + Export/Import

- Kein Cloud, aber: Datenrettung über JSON-Export, geräteübergreifend manuell. Reicht für Prototyp/Demo, nicht als „automatischer Cloud-Save".

### 5.6 Entscheidung

| Kriterium | Supabase | GitHub-API | Firestore | CF Workers | Nur Browser |
|---|---|---|---|---|---|
| Setup-Aufwand | mittel | sehr gering | mittel | hoch | keiner |
| Multi-User mit Login | ✅ | ❌ (1 Admin) | ✅ | ✅ | ❌ |
| Bewohner sehen nur eigenen Anteil | ✅ (RLS) | manuell exportieren | ✅ (Rules) | selbst zu bauen | ❌ |
| Kostenlos für diesen Fall | ✅ | ✅ | ✅ | ✅ | ✅ |
| Datenschutz/EU | ✅ | ✅ | ✅ | ✅ | ✅ (lokal) |
| Audit-Trail | Limit | ✅ Git-Historie | ⚠️ | selbst | ❌ |

**Empfehlung:** Adapter-Abstraktion von Tag 1; **Implementierung zuerst mit GitHub-API** (schnellster Weg zu echtem Cloud-Save ohne Zusatzkonto) **plus Supabase als zweite Implementierung**, sobald Bewohner-Login/self-service gebraucht wird. Provider-Wechsel ist dann nur eine Config-Änderung.

> Hinweis Datenschutz: Namen von Bewohnern sind personenbezogene Daten → eigenes Konto/Projekt (nicht Drittanbieter-Shared-Instance) nutzen, Tokens nur im Gerät, Export/Löschen-Funktion anbieten, Hosting in EU-Region.

## 6. Sync-Engine

- **Schreibvorgang:** UI mutiert den lokalen Cache (IndexedDB) sofort → UI ist instant & offline-fähig → Queue-Eintrag (`op: upsert|delete`, entity, payload, updatedAt`).
- **Flush:** beim Start, bei Netzwerkänderung (`online`-Event) und alle X Sekunden → Batch-Upserts an den Adapter.
- **Konflikt:** Last-Write-Wins **je Datensatz** anhand `updatedAt`; bei Gleichstand gewinnt der Server. Verlorene Konflikte werden im Sync-Log angezeigt (kein stiller Datenverlust).
- **Auth-Fehler:** 401 → Adapter meldet `authRequired` → UI zeigt Re-Login-Dialog.
- **Status in UI:** „Gespeichert · Synced 12:03" / „3 Änderungen ausstehend" / „Offline".

## 7. Kamera/OCR (optional)

- Foto über `<input type="file" accept="image/*" capture="environment">` → Gerätekamera direkt.
- Optional: Tesseract.js (clientseitig, im Bundle ~2 MB, lazy geladen) liefert Ziffernvorschlag → **muss vom Nutzer bestätigt** werden, nie automatisch gespeichert.
- Alternative ohne OCR: Bild anbei + manuelles Tippen (empfohlen für M0/M1, da OCR bei schlechten Zählerfotos unzuverlässig ist).

## 8. Deployment (GitHub Pages)

- **Workflow:** `.github/workflows/pages.yml` → `npm ci` → `npm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- **Settings:** Repo → Pages → Source = *GitHub Actions*.
- **Basis-Pfad:** App läuft unter `https://<user>.github.io/<repo>/` → `vite.config.ts` mit `base: '/<repo>/'`; **Router**: HashRouter (robust) oder BrowserRouter + `404.html`-Copy als Fallback.
- **Umgebungsvariablen:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DATA_PROVIDER` – werden beim Build injiziert, Secrets (PAT/service_role) gehören **nicht** ins Frontend.
- **CSP-Header** (in `public/_headers` bzw. GitHub Pages nicht direkt unterstützt → ggf. via `<meta http-equiv="Content-Security-Policy">`): verhindert Token-Diebstahl via XSS.
- **Kosten:** 0 € (GitHub Pages free für öffentliche Repos).

## 9. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Falsche Verteilung → Geldstreit | Tests mit Referenzrechnungen, Anzeige der Herleitung je Position (Betrag ← Anteil ← Verbrauch) |
| Datenverlust (Browser-Daten gelöscht) | Cloud-Sync + automatisches lokales Backup + Export-Hinweis |
| Token im Browser | nur fein-granulare Tokens (1 Repo), CSP, kein Third-Party-JS |
| Komplexe Zählerstruktur | Zyklenprüfung, visuelle Strukturansicht (Screenshot S2) |
| Offline-Daten divergent | Sync-Log mit Konflikten, "Lokal zurücksetzen"-Aktion |
| DSGVO | eigene Cloud-Instanz, Export/Löschen, Zugriffsschutz |
| Preiserhöhung im Betrieb | Preis-Historie je Jahr vorsehen (Settings: Preis pro Jahr) |

## 10. Offene Architektur-Entscheidungen (abhängig von §7 der Anforderungen)

- Multi-User (Bewohner-Login) → **dann Supabase**; sonst GitHub-API.
- Zugriffsschutz: PIN (clientseitig) vs. echter Login.
- Preis-Historie (Preis pro Jahr) vs. ein globaler Preis.
- Self-Service-Portal für Bewohner (eigene Abrechnung ansehen) → erhöht Anforderungen an RLS/PDF-Server (Mailversand) deutlich.
