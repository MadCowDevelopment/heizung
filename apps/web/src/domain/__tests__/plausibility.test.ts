import { describe, expect, it } from "vitest";

import {
  PLAUSIBILITAET_FAKTOR,
  checkPlausibility,
  median,
  previousDeltas,
} from "../calc/plausibility";
import type { Ablesung } from "../types";
import { IDS, PERIODE, ablesungen, zaehler } from "./fixtures";

/** Ablesungen für einen Zähler: je Periode ein Stand. */
function ablesungenKette(
  zaehlerId: string,
  staende: { datum: string; stand: number }[],
): Ablesung[] {
  return staende.map((s, i) => ({
    id: `ab-${i}`,
    zaehlerId,
    datum: s.datum,
    stand: s.stand,
    unsicher: false,
  }));
}

describe("R8 – Plausibilitätsprüfung", () => {
  it("berechnet den Median korrekt", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("nutzt den Schwellwertfaktor 3", () => {
    expect(PLAUSIBILITAET_FAKTOR).toBe(3);
  });

  it("meldet einen negativen Verbrauch als blockierend", () => {
    const abl: Ablesung[] = [
      { id: "1", zaehlerId: "z1", datum: "2024-12-31", stand: 10, unsicher: false },
      { id: "2", zaehlerId: "z1", datum: "2025-12-31", stand: 4, unsicher: false },
    ];
    const pruefung = checkPlausibility(
      abl,
      [{ id: "z1", bezeichnung: "Heizung", einheit: "MWh" }],
      PERIODE.von,
      PERIODE.bis,
    );
    expect(pruefung.blockiert).toBe(true);
    const h = pruefung.hinweise.find((x) => x.art === "negativ");
    expect(h?.blockierend).toBe(true);
    expect(h?.text.code).toBe("plausibilitaet.negativ");
    // 4 MWh − 10 MWh = −6 MWh = −6000 kWh
    expect(h?.wert).toBeCloseTo(-6000, 6);
  });

  it("meldet fehlende Ablesungen als nicht blockierend", () => {
    const pruefung = checkPlausibility(
      [],
      [{ id: IDS.zaehlerEnergie, bezeichnung: "Heizung gesamt", einheit: "MWh" }],
      PERIODE.von,
      PERIODE.bis,
    );
    expect(pruefung.hinweise).toHaveLength(1);
    expect(pruefung.hinweise[0].art).toBe("unvollstaendig");
    expect(pruefung.hinweise[0].text.code).toBe("plausibilitaet.unvollstaendig");
    expect(pruefung.hinweise[0].blockierend).toBe(false);
    expect(pruefung.blockiert).toBe(false);
  });

  it("berechnet die Deltas der Vorperioden", () => {
    // 4 gleich lange Jahresperioden à 1 MWh Verbrauch.
    const abl = ablesungenKette("z1", [
      { datum: "2021-12-31", stand: 0 },
      { datum: "2022-12-31", stand: 1 },
      { datum: "2023-12-31", stand: 2 },
      { datum: "2024-12-31", stand: 3 },
      { datum: "2025-12-31", stand: 4 },
    ]);
    const vorher = previousDeltas(abl, "z1", PERIODE.von, PERIODE.bis, 3, "MWh");
    expect(vorher).toHaveLength(3);
    expect(vorher.every((d) => Math.abs(d - 1000) < 1e-6)).toBe(true);
  });

  it("meldet einen Ausreißer über dem 3-fachen Median der Vorperioden", () => {
    // 3 Vorperioden à 1 MWh, aktuelle Periode 10 MWh → 10 > 3 × 1
    const abl = ablesungenKette("z1", [
      { datum: "2022-12-31", stand: 0 },
      { datum: "2023-12-31", stand: 1 },
      { datum: "2024-12-31", stand: 2 },
      { datum: "2025-12-31", stand: 12 },
    ]);
    const pruefung = checkPlausibility(
      abl,
      [{ id: "z1", bezeichnung: "Heizung", einheit: "MWh" }],
      PERIODE.von,
      PERIODE.bis,
    );
    const h = pruefung.hinweise.find((x) => x.art === "ausreisser");
    expect(h).toBeDefined();
    expect(h?.blockierend).toBe(true);
    expect(h?.text.code).toBe("plausibilitaet.ausreisser");
    expect(h?.referenz).toBeCloseTo(1000, 6);
    expect(h?.wert).toBeCloseTo(10000, 6);
    expect(pruefung.blockiert).toBe(true);
  });

  it("warnt nicht, wenn der Verbrauch im Rahmen liegt", () => {
    const abl = ablesungenKette("z1", [
      { datum: "2022-12-31", stand: 0 },
      { datum: "2023-12-31", stand: 1 },
      { datum: "2024-12-31", stand: 2 },
      { datum: "2025-12-31", stand: 3.5 },
    ]);
    const pruefung = checkPlausibility(
      abl,
      [{ id: "z1", bezeichnung: "Heizung", einheit: "MWh" }],
      PERIODE.von,
      PERIODE.bis,
    );
    expect(pruefung.blockiert).toBe(false);
    expect(pruefung.hinweise.filter((h) => h.art === "ausreisser")).toHaveLength(0);
  });

  it("prüft alle Zähler des Referenz-Szenarios ohne Beanstandung", () => {
    const pruefung = checkPlausibility(
      ablesungen(),
      zaehler().map((z) => ({ id: z.id, bezeichnung: z.bezeichnung, einheit: z.einheit })),
      PERIODE.von,
      PERIODE.bis,
    );
    expect(pruefung.hinweise).toHaveLength(0);
    expect(pruefung.blockiert).toBe(false);
  });

  it("rechnet Wasser in Litern (m³ → l)", () => {
    const abl = ablesungenKette("zw", [
      { datum: "2024-12-31", stand: 5 },
      { datum: "2025-12-31", stand: 7 },
    ]);
    const vorher = previousDeltas(abl, "zw", PERIODE.von, PERIODE.bis, 3, "m3");
    expect(vorher).toHaveLength(0);
    const pruefung = checkPlausibility(
      abl,
      [{ id: "zw", bezeichnung: "Warmwasser", einheit: "m3" }],
      PERIODE.von,
      PERIODE.bis,
    );
    expect(pruefung.blockiert).toBe(false);
  });
});
