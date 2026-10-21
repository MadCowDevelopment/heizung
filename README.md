# heizung

Web-App zur Erfassung von Heizungs-/Warmwasser- und Wasserzählerständen und zur jährlichen Kostenabrechnung für eine Wohngemeinschaft.
Deployment: statisch auf GitHub Pages – **ohne eigenes Backend**. Datenspeicherung: privates GitHub-Repo (`data/state.json`) via REST API, Admin-Login per GitHub-OAuth, lokaler Offline-Cache (IndexedDB).

## Dokumente

- [Anforderungen (Domänenmodell, Fachregeln, Screens)](docs/requirements.md)
- [Architektur (Stack, Datenmodell, Cloud-Optionen, Sync, Deployment)](docs/architecture.md)

## Status

Spezifikation erstellt, Implementierung noch offen (offene Punkte in `docs/requirements.md` §8).

## Architektur-Überblick

| Teil | Ort | Hosting |
|---|---|---|
| Frontend (Vite/React/TS, PWA) | `apps/web` | GitHub Pages (statisch) |
| Login | OAuth Device-Flow | github.com (kein eigener Server) |
| Daten | `data/state.json` | privates GitHub-Repo, Commits als Historie |

Die Berechnungslogik (`R0`–`R11`) liegt als reine Funktionen in `apps/web/src/domain` und ist unabhängig vom Store testbar.
Das Frontend spricht ausschließlich über die `StorageAdapter`-Abstraktion mit dem Datenspeicher → Provider-Wechsel (z. B. Cloudflare Workers + D1) bleibt Konfiguration.