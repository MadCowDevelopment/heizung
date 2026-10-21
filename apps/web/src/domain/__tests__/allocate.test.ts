import { describe, expect, it } from "vitest";

import { allocate, allocateEuro } from "../calc/allocate";

describe("R7 – Rundung ohne Rundungsdifferenz", () => {
  it("verteilt einen Centbetrag ohne Rest", () => {
    const { cent } = allocate(100, [
      { id: "a", anteil: 1 },
      { id: "b", anteil: 1 },
      { id: "c", anteil: 1 },
    ]);
    // 100 / 3 = 33,33… → je 33 Cent ab, 1 Restcent nach Largest-Remainder.
    // Bei Gleichstand entscheidet die ID (aufsteigend) → "a" bekommt den Rest.
    expect(cent.get("a")).toBe(34);
    expect(cent.get("b")).toBe(33);
    expect(cent.get("c")).toBe(33);
    const summe = [...cent.values()].reduce((s, v) => s + v, 0);
    expect(summe).toBe(100);
  });

  it("summiert bei vielen Positionen exakt auf den Gesamtbetrag", () => {
    const positionen = Array.from({ length: 7 }, (_, i) => ({
      id: `b-${i}`,
      anteil: 1 / 7,
    }));
    const { cent } = allocate(9999, positionen);
    const summe = [...cent.values()].reduce((s, v) => s + v, 0);
    expect(summe).toBe(9999);
  });

  it("summiert bei zufälligen Beträgen exakt auf", () => {
    for (const betrag of [1, 7, 99, 1234, 100000, 33333]) {
      const positionen = [
        { id: "a", anteil: 0.37 },
        { id: "b", anteil: 0.41 },
        { id: "c", anteil: 0.22 },
      ];
      const { cent } = allocate(betrag, positionen);
      const summe = [...cent.values()].reduce((s, v) => s + v, 0);
      expect(summe).toBe(betrag);
    }
  });

  it("ist deterministisch bei Gleichstand (Tie-Break nach ID)", () => {
    const positionen = [
      { id: "b", anteil: 1 },
      { id: "a", anteil: 1 },
    ];
    const erste = allocate(10, positionen);
    const zweite = allocate(10, positionen);
    expect(erste.cent.get("a")).toBe(zweite.cent.get("a"));
    expect(erste.cent.get("a")).toBe(5);
  });

  it("ignoriert Positionen ohne Anteil", () => {
    const { cent } = allocate(100, [
      { id: "a", anteil: 1 },
      { id: "b", anteil: 0 },
    ]);
    expect(cent.get("a")).toBe(100);
    expect(cent.get("b")).toBe(0);
  });

  it("liefert 0, wenn keine Position einen Anteil hat", () => {
    const { cent } = allocate(100, [
      { id: "a", anteil: 0 },
      { id: "b", anteil: 0 },
    ]);
    expect([...cent.values()].every((v) => v === 0)).toBe(true);
  });

  it("rechnet Euro in Cent um und summiert exakt", () => {
    const betraege = allocateEuro(1000, [
      { id: "a", anteil: 1 },
      { id: "b", anteil: 1 },
      { id: "c", anteil: 1 },
    ]);
    const summe = [...betraege.values()].reduce((s, v) => s + v, 0);
    expect(round2(summe)).toBe(1000);
  });

  it("hält die Summe in Cent exakt", () => {
    const ergebnis = allocate(33333, [
      { id: "a", anteil: 1 / 3 },
      { id: "b", anteil: 1 / 3 },
      { id: "c", anteil: 1 / 3 },
    ]);
    const summe = [...ergebnis.cent.values()].reduce((s, v) => s + v, 0);
    expect(summe).toBe(33333);
  });
});

function round2(wert: number): number {
  return Math.round(wert * 100) / 100;
}
