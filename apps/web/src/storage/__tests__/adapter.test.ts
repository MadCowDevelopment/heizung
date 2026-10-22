/**
 * Tests der Speicher-Adapter.
 *
 * Der Memory-Adapter ist der Test-Double; der IndexedDB-Adapter wird gegen
 * dieselbe Erwartung geprüft (soweit die Umgebung IndexedDB anbietet).
 */

import { describe, expect, it } from "vitest";
import { IndexedDbAdapter } from "../indexeddb";
import { MemoryAdapter } from "../memory";
import { SpeicherFehler, istStorageAdapter, type StorageAdapter } from "../adapter";

/** Prüft das gemeinsame Verhalten aller Adapter. */
function beschreibtAdapter(adapter: StorageAdapter) {
  describe(adapter.name, () => {
    it("ist ein gültiger Adapter", () => {
      expect(istStorageAdapter(adapter)).toBe(true);
    });

    it("liest einen unbekannten Pfad als null", async () => {
      await expect(adapter.read("data/gibtsnicht.json")).resolves.toBeNull();
    });

    it("schreibt, liest und überschreibt", async () => {
      await adapter.write("data/state.json", '{"a":1}');
      await expect(adapter.read("data/state.json")).resolves.toBe('{"a":1}');
      await adapter.write("data/state.json", '{"a":2}');
      await expect(adapter.read("data/state.json")).resolves.toBe('{"a":2}');
    });

    it("listet geschriebene Pfade sortiert", async () => {
      await adapter.write("data/b.json", "{}");
      await adapter.write("data/a.json", "{}");
      const liste = await adapter.list();
      expect(liste).toContain("data/a.json");
      expect(liste).toContain("data/b.json");
      expect([...liste].sort()).toEqual(liste);
    });

    it("löscht einen Pfad", async () => {
      await adapter.write("data/weg.json", "{}");
      await adapter.delete("data/weg.json");
      await expect(adapter.read("data/weg.json")).resolves.toBeNull();
    });

    it("macht das Löschen eines unbekannten Pfads zum Erfolg", async () => {
      await expect(adapter.delete("data/nie-da.json")).resolves.toBeUndefined();
    });

    it("lehnt einen leeren Pfad ab", async () => {
      await expect(adapter.write("", "x")).rejects.toBeInstanceOf(SpeicherFehler);
    });
  });
}

describe("MemoryAdapter", () => {
  beschreibtAdapter(new MemoryAdapter());

  it("liefert eine Momentaufnahme des Inhalts", async () => {
    const adapter = new MemoryAdapter();
    await adapter.write("data/state.json", "{}");
    expect(adapter.snapshot()).toEqual({ "data/state.json": "{}" });
  });
});

describe("IndexedDbAdapter", () => {
  const adapter = new IndexedDbAdapter();

  it("meldet die Verfügbarkeit der Umgebung", () => {
    expect(typeof adapter.verfuegbar).toBe("boolean");
  });

  it("verwirft Operationen, wenn IndexedDB fehlt", async () => {
    if (adapter.verfuegbar) {
      await expect(adapter.read("data/x.json")).resolves.toBeNull();
      return;
    }
    await expect(adapter.read("data/x.json")).rejects.toBeInstanceOf(SpeicherFehler);
  });

  it("verhält sich wie ein Adapter, wenn IndexedDB verfügbar ist", async () => {
    if (!adapter.verfuegbar) return;
    const eigener = new IndexedDbAdapter();
    await eigener.write("data/test.json", '{"x":1}');
    await expect(eigener.read("data/test.json")).resolves.toBe('{"x":1}');
    await eigener.delete("data/test.json");
    await expect(eigener.read("data/test.json")).resolves.toBeNull();
    eigener.close();
  });
});
