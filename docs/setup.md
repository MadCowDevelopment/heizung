# Setup – einmalige Einrichtung

Alles, was **einmal** gemacht werden muss, damit die App läuft. Stand: 21.10.2026.

## Übersicht

| # | Schritt | Wer | Status |
|---|---|---|---|
| 1 | Privates Daten-Repo `MadCowDevelopment/heizung-data` anlegen | Copilot | ✅ erledigt |
| 2 | `data/state.json` mit Grundgerüst anlegen | Copilot | ✅ erledigt |
| 3 | GitHub Pages für das Code-Repo aktivieren | Copilot | ✅ erledigt |
| 4 | Zugriffstoken erzeugen (Fine-grained PAT) | **du** | ⬜ offen |
| 5 | `VITE_GITHUB_CLIENT_ID` / Daten-Repo-Default ins Frontend | Copilot (nach Schritt 4) | ⬜ offen |

---

## 1. Daten-Repo (erledigt)

- **Repo:** https://github.com/MadCowDevelopment/heizung-data (privat, Branch `main`)
- **Datei:** `data/state.json` – enthält den gesamten Datenbestand (Bewohner, Zähler, Ablesungen, Preise, Abschläge, Abrechnungen, Einstellungen)
- **Zugriff:** nur `Mihi` (Admin). Weitere Mitglieder: `apphb`, `ZackDev` (Org-Mitglieder, aber kein Repo-Zugriff).
- **Historie:** jeder Sync erzeugt einen Commit → Historie, Diff und Rollback sind gratis. Bei Datenverlust: `git log` im Daten-Repo.

**Inhalt von `data/state.json` (Grundgerüst):**

```jsonc
{
  "schemaVersion": 3,
  "bewohner": [], "zaehler": [], "ablesung": [], "abschlagPlan": [], "zahlung": [], "abrechnung": [],
  "preis": [ { "id": "p-default", "gueltigAb": "2026-01-01", "preisMWh": 0.1, "preisM3": 0 } ],
  "einstellungen": {
    "verteilSchluessel": "warm", "waehrung": "EUR",
    "datenRepo": "MadCowDevelopment/heizung-data"
  }
}
```

> Der MWh-Preis (0,10 €) und der Verteilungs-Schlüssel (`warm`) sind die beschlossenen Defaults und lassen sich später in den Einstellungen der App ändern.

---

## 2. GitHub Pages (erledigt)

- **Pages-URL:** https://madcowdevelopment.github.io/heizung/
- Source = *GitHub Actions* (`build_type: workflow`) → das Deployment läuft automatisch über `.github/workflows/pages.yml` (wird mit dem Frontend gebaut).
- Basis-Pfad im Build: `/heizung/` → `vite.config.ts` mit `base: '/heizung/'`.
- Router: **HashRouter** (robust ohne 404-Fallback bei GitHub Pages).

---

## 3. Zugriffstoken (dein Schritt)

Die App liest und schreibt `state.json` direkt über die GitHub REST API aus dem Browser. Dafür braucht es ein Token.

### Empfohlen: Fine-grained Personal Access Token

Warum: Das Token ist **auf genau ein Repository und auf genau eine Berechtigung** beschränkt (`Contents: Read and write` auf `MadCowDevelopment/heizung-data`). Ein klassisches OAuth-Token wäre repo-**weit** für alle privaten Repos.

**So geht's (5 Minuten):**

1. Öffne: https://github.com/settings/personal-access-tokens/new
   (alternativ: Avatar rechts oben → Settings → Developer settings → Personal access tokens → *Fine-grained tokens* → *Generate new token*)
2. **Token name:** `heizung-app`
3. **Expiration:** 1 Jahr (danach wird die App nach einem Token-Update fragen – geplant ist dafür ein Hinweis in den Einstellungen)
4. **Resource owner:** `MadCowDevelopment`
5. **Repository access:** *Only select repositories* → `heizung-data` **hinzufügen**
6. **Repository permissions:** bei *Contents* auf **Read and write** setzen. Alles andere auf *No access* / *Read-only* lassen. **Wichtig:** *Metadata: Read-only* ist automatisch gesetzt und muss bleiben.
7. **Generate token** → das Token wird **einmalig** angezeigt → **sofort kopieren** (im Passwort-Manager ablegen, z. B. Bitwarden/KeePass; nicht ins Code-Repo, nicht in Chatverläufe).
8. Optional, aber empfohlen: **SSH-Key/GPG** ist für API-Tokens nicht nötig – 2FA ist bei Fine-grained PATs nicht zwingend, der Token ist jedoch eine vollwertige Berechtigung.

**Danach:** Beim ersten Start der App unter *Einstellungen → Konto & Cloud* das Token in das Feld *„Fine-grained PAT"* einfügen. Die App speichert es nur lokal im Browser (LocalStorage) und sendet es ausschließlich an `api.github.com`.

### Widerruf

Settings → Developer settings → Personal access tokens → Token anklicken → *Revoke*. Danach ist das Gerät sofort abgemeldet; die Daten im Repo bleiben erhalten.

### Alternativen

| Variante | Aufwand | Bewertung |
|---|---|---|
| **Fine-grained PAT** | 5 Min, einmalig | **empfohlen** – minimaler Rechtekreis, kein Server, kein Client-Secret |
| OAuth Device-Flow (App-Einstellung + Login per Code/QR) | 5 Min App + jedes Mal Code eintippen | **technisch nicht möglich**: `github.com/login/device/code` liefert keine CORS-Header → vom Browser nicht aufrufbar (geprüft am 21.10.2026) |
| OAuth Web-Flow mit PKCE | App + Redirect-URL | nur mit `client_secret` möglich → Secret im Frontend = unsicher, daher verworfen |
| Token-Broker (Cloudflare Worker) | Server + Deployment | echter Login-Flow, aber wieder ein Backend (kostenlos, ca. 30 Min) – sinnvoll, falls später mehrere Geräte/Personen mit eigenen Tokens dazukommen |

**Geplanter Standby:** Die App unterstützt in der ersten Version **PAT** (Feld in den Einstellungen). Der Code ist über den `StorageAdapter` so gebaut, dass ein späterer Token-Broker oder ein echter OAuth-Login nur den Auth-Teil ersetzt – die Datenlogik bleibt unverändert.

---

## 4. Was die App an GitHub braucht (technisch)

| Endpoint | Zweck | CORS-fähig? |
|---|---|---|
| `GET /repos/{owner}/{repo}/contents/data/state.json` | Stand laden | ✅ (`api.github.com`, `Access-Control-Allow-Origin: *`) |
| `PUT /repos/{owner}/{repo}/contents/data/state.json` | Stand speichern (mit `sha` des aktuellen Blobs) | ✅ (Preflight erlaubt `PUT` + `Authorization`) |
| `GET /user` | prüfen, ob der Token gültig ist, und Login-Namen anzeigen | ✅ |
| `POST /github.com/login/device/code` | Device-Flow | ❌ kein CORS → nicht browserfähig |

- **Rate-Limit:** 5.000 Requests/h (klassisch) bzw. 15.000/h (Fine-grained PAT) → die App schreibt **einen** Request pro Sync-Zyklus (ca. alle 30 s nur bei Änderung) → unkritisch.
- **Optimistische Nebenläufigkeitskontrolle:** der `sha` des Blobs wird mitgeschickt; bei `409` (Konflikt) lädt die App den Serverstand, merged (Last-Write-Wins je Datensatz nach `updatedAt`) und schreibt erneut → kein stiller Datenverlust.
- **Schutz gegen XSS (Token-Diebstahl):** keine Fremd-Skripte/CDN/Analytics, restriktive CSP, kein `dangerouslySetInnerHTML`, keine Drittanbieter-Fonts.

---

## 5. Checkliste für den Betrieb

- [ ] Token erzeugt und sicher verwahrt
- [ ] App gestartet, Token in *Einstellungen → Konto & Cloud* eingefügt
- [ ] *„Verbindung testen"* grün, Benutzername wird angezeigt
- [ ] Erste Test-Änderung (z. B. ein Bewohner) → Commit im Daten-Repo sichtbar
- [ ] Preise in den Einstellungen prüfen (Default 0,10 €/MWh)
- [ ] Verteilungs-Schlüssel prüfen (Default `warm`)
