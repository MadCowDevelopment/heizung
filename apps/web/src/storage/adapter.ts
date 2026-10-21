/**
 * Speicher-Abstraktion (docs/architecture.md §2.2, §6).
 *
 * Die UI kennt nur dieses Interface. Der lokale Adapter (IndexedDB) ist der
 * Default; ein GitHub-Adapter kann später ohne Eingriff in UI oder Domäne
 * dazukommen (M1).
 *
 * Ein Pfad ist ein einfacher Schlüssel, z. B. `data/state.json`.
 */

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

/** Fehler beim Zugriff auf den Speicher. */
export class SpeicherFehler extends Error {
  constructor(
    message: string,
    readonly ursache?: unknown,
  ) {
    super(message);
    this.name = "SpeicherFehler";
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
