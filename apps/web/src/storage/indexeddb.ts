/**
 * Lokaler Cache + Offline-Queue in IndexedDB (docs/architecture.md §3, §6).
 *
 * Zwei Objekt-Speicher:
 *   `dateien` – Pfad → Inhalt (heute: `data/state.json`)
 *   `queue`   – ausstehende Schreibvorgänge (M1: Sync-Engine)
 *   `fotos`   – Beleg-Fotos (bleiben lokal, kommen nicht ins Daten-Repo)
 *
 * IndexedDB ist im Test-Environment (jsdom) nicht vorhanden; der Adapter
 * meldet das über `verfuegbar` und die UI fällt auf den Memory-Adapter
 * zurück.
 */

import { SpeicherFehler, type StorageAdapter } from "./adapter";

const DB_NAME = "heizung";
const DB_VERSION = 1;
const STORE_DATEIEN = "dateien";
const STORE_QUEUE = "queue";
const STORE_FOTOS = "fotos";

/** Ein ausstehender Schreibvorgang. */
export interface QueueEintrag {
  id: string;
  /** Betroffener Pfad. */
  pfad: string;
  /** Nutzlast (JSON-Text). */
  inhalt: string;
  /** Zeitstempel der Einreihung. */
  erstelltAm: string;
  /** Anzahl der Versuche. */
  versuche: number;
}

function indexedDbVerfuegbar(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function idbFehler(aktion: string, fehler: unknown): never {
  throw new SpeicherFehler(`IndexedDB ${aktion} fehlgeschlagen.`, fehler);
}

export class IndexedDbAdapter implements StorageAdapter {
  readonly name = "indexeddb";

  /** `false`, wenn IndexedDB in dieser Umgebung nicht existiert. */
  readonly verfuegbar: boolean;

  private db: IDBDatabase | null = null;

  constructor() {
    this.verfuegbar = indexedDbVerfuegbar();
  }

  private async dbOeffnen(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (!this.verfuegbar) {
      throw new SpeicherFehler("IndexedDB steht in dieser Umgebung nicht zur Verfügung.");
    }
    return new Promise<IDBDatabase>((resolve) => {
      const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
      anfrage.onupgradeneeded = () => {
        const db = anfrage.result;
        if (!db.objectStoreNames.contains(STORE_DATEIEN)) {
          db.createObjectStore(STORE_DATEIEN);
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_FOTOS)) {
          db.createObjectStore(STORE_FOTOS);
        }
      };
      anfrage.onsuccess = () => {
        this.db = anfrage.result;
        resolve(this.db);
      };
      anfrage.onerror = () => idbFehler("öffnen", anfrage.error);
      anfrage.onblocked = () => idbFehler("öffnen", new Error("Anderer Tab blockiert die Datenbank."));
    });
  }

  private async tx(
    store: string,
    modus: IDBTransactionMode,
    arbeit: (s: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const db = await this.dbOeffnen();
    return new Promise((resolve) => {
      const transaktion = db.transaction(store, modus);
      const anfrage = arbeit(transaktion.objectStore(store));
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => idbFehler("transaktion", anfrage.error);
      transaktion.onabort = () => idbFehler("transaktion", transaktion.error);
    });
  }

  async list(): Promise<string[]> {
    const schlüssel = await this.tx(STORE_DATEIEN, "readonly", (s) => s.getAllKeys());
    return (schlüssel as string[]).sort();
  }

  async read(pfad: string): Promise<string | null> {
    const wert = await this.tx(STORE_DATEIEN, "readonly", (s) => s.get(pfad));
    return typeof wert === "string" ? wert : null;
  }

  async write(pfad: string, inhalt: string): Promise<void> {
    if (typeof pfad !== "string" || pfad.length === 0) {
      throw new SpeicherFehler("Pfad darf nicht leer sein.");
    }
    await this.tx(STORE_DATEIEN, "readwrite", (s) => s.put(inhalt, pfad));
  }

  async delete(pfad: string): Promise<void> {
    await this.tx(STORE_DATEIEN, "readwrite", (s) => s.delete(pfad));
  }

  // --- Queue -------------------------------------------------------------

  /** Legt einen Schreibvorgang in die Offline-Queue. */
  async queueSchreiben(pfad: string, inhalt: string): Promise<QueueEintrag> {
    const eintrag: QueueEintrag = {
      id: `${pfad}#${new Date().toISOString()}#${Math.random().toString(36).slice(2, 8)}`,
      pfad,
      inhalt,
      erstelltAm: new Date().toISOString(),
      versuche: 0,
    };
    await this.tx(STORE_QUEUE, "readwrite", (s) => s.put(eintrag));
    return eintrag;
  }

  /** Alle offenen Schreibvorgänge, älteste zuerst. */
  async queueLesen(): Promise<QueueEintrag[]> {
    const eintraege = (await this.tx(STORE_QUEUE, "readonly", (s) => s.getAll())) as QueueEintrag[];
    return eintraege.sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));
  }

  /** Entfernt einen Eintrag aus der Queue. */
  async queueEntfernen(id: string): Promise<void> {
    await this.tx(STORE_QUEUE, "readwrite", (s) => s.delete(id));
  }

  /** Leert die Queue. */
  async queueLeeren(): Promise<void> {
    await this.tx(STORE_QUEUE, "readwrite", (s) => s.clear());
  }

  // --- Fotos -------------------------------------------------------------

  /** Speichert ein Beleg-Foto als Blob unter einem Schlüssel. */
  async fotoSpeichern(schluessel: string, blob: Blob): Promise<void> {
    await this.tx(STORE_FOTOS, "readwrite", (s) => s.put(blob, schluessel));
  }

  /** Liest ein Beleg-Foto. */
  async fotoLesen(schluessel: string): Promise<Blob | null> {
    const wert = await this.tx(STORE_FOTOS, "readonly", (s) => s.get(schluessel));
    return wert instanceof Blob ? wert : null;
  }

  /** Löscht ein Beleg-Foto. */
  async fotoLoeschen(schluessel: string): Promise<void> {
    await this.tx(STORE_FOTOS, "readwrite", (s) => s.delete(schluessel));
  }

  /** Schließt die Verbindung (z. B. beim Beenden). */
  close(): void {
    this.db?.close();
    this.db = null;
  }
}
