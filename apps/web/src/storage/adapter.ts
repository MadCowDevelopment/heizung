/**
 * Speicher-Abstraktion (docs/architecture.md §2.2, §6).
 *
 * Die UI kennt nur dieses Interface. Der lokale Adapter (IndexedDB) ist der
 * Default; ein GitHub-Adapter kann später ohne Eingriff in UI oder Domäne
 * dazukommen (M1).
 *
 * Ein Pfad ist ein einfacher Schlüssel, z. B. `data/state.json`.
 */

import type { FachMeldung, MeldungsCode } from "../domain/types";

export interface StorageAdapter {
  /** Kurzname des Adapters, z. B. `indexeddb` – für Statusanzeigen. */
  readonly name: string;

  /** Listet alle verfügbaren Pfade auf. */
  list(): Promise<string[]>;

  /** Liest den Inhalt eines Pfades. `null`, wenn er nicht existiert. */
  read(pfad: string): Promise<string | null>;

  /** Schreibt den Inhalt eines Pfades (überschreibt). */
  write(pfad: string, inhalt: string): Promise<void>;

  /** Löscht einen Pfad. Ein nicht existierender Pfad ist kein Fehler. */
  delete(pfad: string): Promise<void>;
}

/**
 * Fehler beim Zugriff auf den Speicher.
 *
 * Trägt einen **sprachneutralen** Code statt eines fest verdrahteten
 * deutschen Satzes; die Oberfläche löst den Code über i18n auf.
 */
export class SpeicherFehler extends Error {
  constructor(
    /** Katalogschlüssel des Fehlers, z. B. `speicher.pfadLeer`. */
    readonly code: MeldungsCode,
    /** Werte für die Platzhalter des Katalogs. */
    readonly params?: Record<string, string | number>,
    /** Technische Ursache (z. B. die DOMException von IndexedDB). */
    readonly ursache?: unknown,
  ) {
    super(code);
    this.name = "SpeicherFehler";
  }

  /** Die Meldung in Katalogform (Code + Parameter). */
  get meldung(): FachMeldung {
    return { code: this.code, params: this.params };
  }
}

/** Prüft, ob ein Objekt ein gültiger Adapter ist. */
export function istStorageAdapter(wert: unknown): wert is StorageAdapter {
  if (typeof wert !== "object" || wert === null) return false;
  const o = wert as Record<string, unknown>;
  return (
    typeof o.list === "function" &&
    typeof o.read === "function" &&
    typeof o.write === "function" &&
    typeof o.delete === "function"
  );
}
