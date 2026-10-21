import { describe, expect, it } from "vitest";

import {
  distributeEnergy,
  schluesselWert,
  wasserJeBewohner,
  type WasserVerbrauch,
} from "../calc/distribute";
import { IDS, zaehler } from "./fixtures";

/** Wasserverbrauch je Bewohner aus den Zähler-Deltas. */
function verbrauchAusDeltas(): WasserVerbrauch[] {
  const eigenVonMeter = new Map<string, number>([
    [IDS.zaehlerWarmA, 2000],
    [IDS.zaehlerWarmB, 1000],
    [IDS.zaehlerKaltA, 1000],
    [IDS.zaehlerKaltB, 1000],
  ]);
  return wasserJeBewohner(zaehler(), eigenVonMeter);
}

describe("R3 – Energieverteilung nach Wasseranteil", () => {
  it("verteilt 3 MWh im Verhältnis 2 m³ : 1 m³ (Referenzbeispiel)", () => {
    const verbrauch = verbrauchAusDeltas();
    const e = distributeEnergy(3000, verbrauch, "warm");
    expect(e.anteile.get(IDS.bewohnerA)).toBeCloseTo(2000, 6);
    expect(e.anteile.get(IDS.bewohnerB)).toBeCloseTo(1000, 6);
  });

  it("gibt die Prozentanteile an (66,67 % / 33,33 %)", () => {
    const e = distributeEnergy(3000, verbrauchAusDeltas(), "warm");
    expect(e.prozente.get(IDS.bewohnerA)).toBeCloseTo(66.67, 2);
    expect(e.prozente.get(IDS.bewohnerB)).toBeCloseTo(33.33, 2);
  });

  it("verteilt bei Schlüssel `warm+kalt` nach der Summe", () => {
    // A: 2 m³ warm + 1 m³ kalt = 3; B: 1 m³ warm + 1 m³ kalt = 2
    const e = distributeEnergy(5000, verbrauchAusDeltas(), "warm+kalt");
    expect(e.anteile.get(IDS.bewohnerA)).toBeCloseTo(3000, 6);
    expect(e.anteile.get(IDS.bewohnerB)).toBeCloseTo(2000, 6);
  });

  it("verteilt bei Schlüssel `kalt` nach Kaltwasser", () => {
    // A: 1 m³ kalt, B: 1 m³ kalt → 50/50
    const e = distributeEnergy(2000, verbrauchAusDeltas(), "kalt");
    expect(e.anteile.get(IDS.bewohnerA)).toBeCloseTo(1000, 6);
    expect(e.anteile.get(IDS.bewohnerB)).toBeCloseTo(1000, 6);
  });

  it("schaltet auf den anderen Wasserzähler um und markiert die Position", () => {
    // Bernd hat keinen Warmwasser-Wert in der Periode → Fallback auf Kaltwasser.
    const verbrauch: WasserVerbrauch[] = [
      {
        bewohnerId: IDS.bewohnerA,
        warmL: 2000,
        kaltL: 0,
        hatWarmZaehler: true,
        hatKaltZaehler: false,
        hatWarmWert: true,
        hatKaltWert: false,
      },
      {
        bewohnerId: IDS.bewohnerB,
        warmL: 0,
        kaltL: 1000,
        hatWarmZaehler: false,
        hatKaltZaehler: true,
        hatWarmWert: false,
        hatKaltWert: true,
      },
    ];
    const e = distributeEnergy(3000, verbrauch, "warm");
    expect(e.hinweise.get(IDS.bewohnerB)?.[0]).toMatch(/Kaltwasser/);
    expect(e.anteile.get(IDS.bewohnerA)).toBeCloseTo(2000, 6);
    expect(e.anteile.get(IDS.bewohnerB)).toBeCloseTo(1000, 6);
  });

  it("meldet `Σ wasser = 0` als Administratorfrage und schlägt gleiche Verteilung vor", () => {
    const verbrauch: WasserVerbrauch[] = [
      {
        bewohnerId: IDS.bewohnerA,
        warmL: 0,
        kaltL: 0,
        hatWarmZaehler: true,
        hatKaltZaehler: false,
        hatWarmWert: false,
        hatKaltWert: false,
      },
      {
        bewohnerId: IDS.bewohnerB,
        warmL: 0,
        kaltL: 0,
        hatWarmZaehler: true,
        hatKaltZaehler: false,
        hatWarmWert: false,
        hatKaltWert: false,
      },
    ];
    const e = distributeEnergy(1000, verbrauch, "warm");
    expect(e.administratorfrage).toBe(true);
    expect(e.gleichverteilung).toBe(true);
    expect(e.anteile.get(IDS.bewohnerA)).toBeCloseTo(500, 6);
    expect(e.anteile.get(IDS.bewohnerB)).toBeCloseTo(500, 6);
    expect(e.hinweise.get(IDS.bewohnerA)?.[0]).toMatch(/Administrator/);
  });

  it("schlüsselWert liefert den Fallback-Zähler", () => {
    const v: WasserVerbrauch = {
      bewohnerId: "x",
      warmL: 0,
      kaltL: 500,
      hatWarmZaehler: false,
      hatKaltZaehler: true,
      hatWarmWert: false,
      hatKaltWert: true,
    };
    expect(schluesselWert(v, "warm")).toEqual({ wert: 500, fallback: true });
    expect(schluesselWert(v, "kalt")).toEqual({ wert: 500, fallback: false });
  });

  it("erkennt Bewohner ohne eigenen Wasserzähler", () => {
    const v = wasserJeBewohner(zaehler(), new Map());
    const anna = v.find((x) => x.bewohnerId === IDS.bewohnerA);
    expect(anna?.hatWarmZaehler).toBe(true);
    expect(anna?.hatWarmWert).toBe(false);
  });
});
