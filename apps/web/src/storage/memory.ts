/**
 * Speicher-Adapter im Arbeitsspeicher.
 *
 * Dient als Test-Double und als Rückfallebene, wenn IndexedDB nicht
 * verfügbar ist (z. B. privates Fenster in älteren Browsern). Der Inhalt
 * überlebt einen Seitenwechsel nicht.
 */

import { SpeicherFehler, type StorageAdapter } from "./adapter";

export class MemoryAdapter implements StorageAdapter {
  readonly name = "memory";

  private readonly inhalt = new Map<string, string>();

  async list(): Promise<string[]> {
    return [...this.inhalt.keys()].sort();
  }

  async read(pfad: string): Promise<string | null> {
    return this.inhalt.get(pfad) ?? null;
  }

  async write(pfad: string, inhalt: string): Promise<void> {
    if (typeof pfad !== "string" || pfad.length === 0) {
      throw new SpeicherFehler("Pfad darf nicht leer sein.");
    }
    this.inhalt.set(pfad, inhalt);
  }

  async delete(pfad: string): Promise<void> {
    this.inhalt.delete(pfad);
  }

  /** Nur für Tests: Momentaufnahme des Inhalts. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.inhalt);
  }
}
