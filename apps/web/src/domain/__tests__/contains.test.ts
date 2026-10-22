import { describe, expect, it } from "vitest";

import { containedMeterIds, findCycle, ownDelta, resolveContained } from "../calc/contains";
import type { Ablesung, Zaehler } from "../types";
import { IDS, ablesungen } from "./fixtures";

/** Hilfsfunktion: Zähler um `enthaeltIds` erweitern. */
function mitEnthaelt(liste: Zaehler[], id: string, enthaeltIds: string[]): Zaehler[] {
  return liste.map((z) => (z.id === id ? { ...z, enthaeltIds } : z));
}

/** Ablesungen für einen beliebigen Zähler erzeugen. */
function ablesungVon(id: string, zaehlerId: string, datum: string, stand: number): Ablesung {
  return { id, zaehlerId, datum, stand, unsicher: false };
}

const basis: Zaehler[] = [
  {
    id: "a",
    bezeichnung: "A",
    typ: "energie",
    einheit: "MWh",
    bewohnerId: null,
    enthaeltIds: [],
    aktiv: true,
  },
  {
    id: "b",
    bezeichnung: "B",
    typ: "energie",
    einheit: "MWh",
    bewohnerId: null,
    enthaeltIds: [],
    aktiv: true,
  },
  {
    id: "c",
    bezeichnung: "C",
    typ: "energie",
    einheit: "MWh",
    bewohnerId: null,
    enthaeltIds: [],
    aktiv: true,
  },
];

describe("R2 – Enthaltene Zähler", () => {
  it("löst direkte Kinder auf", () => {
    const z = mitEnthaelt(basis, "a", ["b"]);
    expect(resolveContained(z, "a")).toEqual(["b"]);
  });

  it("löst Verschachtelung rekursiv auf (A enthält B, B enthält C)", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["c"]);
    expect(containedMeterIds(z, "a").sort()).toEqual(["b", "c"]);
  });

  it("ist zyklensicher: A enthält B, B enthält A", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["a"]);
    expect(() => containedMeterIds(z, "a")).not.toThrow();
    expect(containedMeterIds(z, "a").sort()).toEqual(["a", "b"]);
  });

  it("erkennt einen Zyklus", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["a"]);
    const zyklus = findCycle(z, "a");
    expect(zyklus).not.toBeNull();
    expect(zyklus?.[0]).toBe("a");
  });

  it("erkennt keinen Zyklus bei einem Baum", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["c"]);
    expect(findCycle(z, "a")).toBeNull();
  });

  it("berechnet den Eigenverbrauch als Delta minus enthaltene Deltas", () => {
    const z = mitEnthaelt(basis, "a", ["b"]);
    // Die Zaehler laufen in MWh (Anzeigeeinheit); das Ergebnis ist kWh (R0).
    const ablesungen: Ablesung[] = [
      ablesungVon("1", "a", "2024-12-31", 1),
      ablesungVon("2", "a", "2025-12-31", 5),
      ablesungVon("3", "b", "2024-12-31", 0.5),
      ablesungVon("4", "b", "2025-12-31", 1.5),
    ];
    const o = ownDelta(ablesungen, z, "a", "2025-01-01", "2025-12-31");
    expect(o.complete).toBe(true);
    expect(o.delta).toBe(4000); // 4 MWh
    expect(o.own).toBe(3000); // 4000 - 1000
  });

  it("zieht bei Verschachtelung nur die direkten Kinder ab (keine Doppelabzüge)", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["c"]);
    const ablesungen: Ablesung[] = [
      ablesungVon("1", "a", "2024-12-31", 0),
      ablesungVon("2", "a", "2025-12-31", 3),
      ablesungVon("3", "b", "2024-12-31", 0),
      ablesungVon("4", "b", "2025-12-31", 2),
      ablesungVon("5", "c", "2024-12-31", 0),
      ablesungVon("6", "c", "2025-12-31", 0.5),
    ];
    const o = ownDelta(ablesungen, z, "a", "2025-01-01", "2025-12-31");
    expect(o.directChildIds).toEqual(["b"]);
    expect(o.containedIds.sort()).toEqual(["b", "c"]);
    // 3000 - 2000 = 1000 (nicht 3000 - 2000 - 500)
    expect(o.own).toBe(1000);
  });

  it("erhält die Summe über einen Zählerbaum (Total-Erhalt)", () => {
    let z = mitEnthaelt(basis, "a", ["b"]);
    z = mitEnthaelt(z, "b", ["c"]);
    const ablesungen: Ablesung[] = [
      ablesungVon("1", "a", "2024-12-31", 0),
      ablesungVon("2", "a", "2025-12-31", 3),
      ablesungVon("3", "b", "2024-12-31", 0),
      ablesungVon("4", "b", "2025-12-31", 2),
      ablesungVon("5", "c", "2024-12-31", 0),
      ablesungVon("6", "c", "2025-12-31", 0.5),
    ];
    const summe =
      (ownDelta(ablesungen, z, "a", "2025-01-01", "2025-12-31").own ?? 0) +
      (ownDelta(ablesungen, z, "b", "2025-01-01", "2025-12-31").own ?? 0) +
      (ownDelta(ablesungen, z, "c", "2025-01-01", "2025-12-31").own ?? 0);
    expect(summe).toBe(3000);
  });

  it("gibt `complete = false` zurück, wenn ein enthaltener Zähler unvollständig ist", () => {
    const z = mitEnthaelt(basis, "a", ["b"]);
    const ablesungen: Ablesung[] = [
      ablesungVon("1", "a", "2024-12-31", 0),
      ablesungVon("2", "a", "2025-12-31", 3),
      ablesungVon("3", "b", "2024-12-31", 0),
    ];
    const o = ownDelta(ablesungen, z, "a", "2025-01-01", "2025-12-31");
    expect(o.complete).toBe(false);
    expect(o.own).toBeNull();
    expect(o.unvollstaendigeIds).toContain("b");
  });

  it("arbeitet mit dem Referenz-Szenario (keine Enthalten-Relation)", () => {
    const z = [
      {
        id: IDS.zaehlerEnergie,
        bezeichnung: "Heizung",
        typ: "energie" as const,
        einheit: "MWh" as const,
        bewohnerId: null,
        enthaeltIds: [],
        aktiv: true,
      },
    ];
    const o = ownDelta(ablesungen(), z, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(o.complete).toBe(true);
    expect(o.own).toBe(3000);
  });
});
