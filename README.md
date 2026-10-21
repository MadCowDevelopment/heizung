# heizung

Web-App zur Erfassung von Heizungs-/Warmwasser- und Wasserzählerständen und zur jährlichen Kostenabrechnung für eine Wohngemeinschaft.
Deployment: statisch auf GitHub Pages. Datenspeicherung: Cloud-Provider über `StorageAdapter` (Supabase / GitHub-API / Cloudflare) + lokaler Offline-Cache.

## Dokumente

- [Anforderungen (Domänenmodell, Fachregeln, Screens)](docs/requirements.md)
- [Architektur (Stack, Datenmodell, Cloud-Optionen, Sync, Deployment)](docs/architecture.md)

## Status

Spezifikation erstellt, Implementierung noch offen (offene Punkte in `docs/requirements.md` §8).

## Architektur-Überblick

| Teil | Ort | Hosting |
|---|---|---|
| Frontend (Vite/React/TS, PWA) | `apps/web` | GitHub Pages (statisch) |
| Backend (Auth, API, D1, E-Mail + PDF) | `apps/api` | Cloudflare Workers + D1 (alt. Supabase) |

Die Berechnungslogik (`R0`–`R11`) liegt als reine Funktionen in `apps/web/src/domain` und ist unabhängig vom Store testbar.
Das Frontend spricht ausschließlich über die `StorageAdapter`-Abstraktion mit dem Backend → Provider-Wechsel bleibt Konfiguration.