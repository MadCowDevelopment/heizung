/**
 * Erzeugung stabiler IDs.
 *
 * IDs müssen zwischen Sitzungen stabil bleiben (Import, Foto-Schlüssel,
 * GitHub-Commit-Nachweis), dürfen aber nicht global eindeutig sein. Deshalb
 * Zeitstempel + Zufallsanteil statt Zähler.
 */

let zaehler = 0;

/** Erzeugt eine ID mit Präfix, z. B. `id("z")` → `z-lx3k9a-4f2b`. */
export function id(praefix: string): string {
  zaehler = (zaehler + 1) % 1296;
  const zeit = Date.now().toString(36);
  const zaehlerTeil = zaehler.toString(36).padStart(2, "0");
  const zufall = Math.random().toString(36).slice(2, 6);
  return `${praefix}-${zeit}${zaehlerTeil}${zufall}`;
}
