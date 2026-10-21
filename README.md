# heizung

Web-App zur Erfassung von Heizungs-/Warmwasser- und Wasserzählerständen und zur jährlichen Kostenabrechnung für eine Wohngemeinschaft.
Deployment: statisch auf GitHub Pages. Datenspeicherung: Cloud-Provider über `StorageAdapter` (Supabase / GitHub-API / Cloudflare) + lokaler Offline-Cache.

## Dokumente

- [Anforderungen (Domänenmodell, Fachregeln, Screens)](docs/requirements.md)
- [Architektur (Stack, Datenmodell, Cloud-Optionen, Sync, Deployment)](docs/architecture.md)

## Status

Spezifikation erstellt, Implementierung noch offen (offene Punkte in `docs/requirements.md` §7).