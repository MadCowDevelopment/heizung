import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREIS_M3,
  DEFAULT_PREIS_MWH,
  energieKosten,
  priceForDate,
  priceChangesInPeriod,
  splitByPrice,
  wasserKosten,
} from "../calc/costs";
import { roundTo } from "../calc/units";
import type { Preis } from "../types";

const PREISE: Preis[] = [
  { id: "p1", gueltigAb: "2025-01-01", preisMWh: 0.1, preisM3: 0 },
  { id: "p2", gueltigAb: "2025-07-01", preisMWh: 0.2, preisM3: 2 },
];

describe("R4/R9 – Preise und Kosten", () => {
  it("liefert den Vorgabepreis, wenn keine Preisstufe gilt", () => {
    const p = priceForDate([], "2025-05-05");
    expect(p.preisMWh).toBe(DEFAULT_PREIS_MWH);
    expect(p.preisM3).toBe(DEFAULT_PREIS_M3);
  });

  it("liefert die Preisstufe, die am Datum gilt", () => {
    expect(priceForDate(PREISE, "2025-03-01").preisMWh).toBe(0.1);
    expect(priceForDate(PREISE, "2025-07-01").preisMWh).toBe(0.2);
  });

  it("ignoriert Preisstufen, die erst später gelten", () => {
    expect(priceForDate(PREISE, "2024-12-31").preisMWh).toBe(DEFAULT_PREIS_MWH);
  });

  it("findet Preiswechsel innerhalb der Periode", () => {
    expect(priceChangesInPeriod(PREISE, "2025-01-01", "2025-12-31")).toEqual(["2025-07-01"]);
    expect(priceChangesInPeriod(PREISE, "2025-01-01", "2025-06-30")).toEqual([]);
  });

  it("teilt eine Periode am Preiswechsel und gewichtet nach Tagen", () => {
    const segmente = splitByPrice(PREISE, "2025-01-01", "2025-12-31", 3000, "energie");
    expect(segmente).toHaveLength(2);
    // 1.1. – 30.6. = 181 Tage, 1.7. – 31.12. = 184 Tage, zusammen 365
    expect(segmente[0].tage).toBe(181);
    expect(segmente[1].tage).toBe(184);
    expect(segmente[0].preisMWh).toBe(0.1);
    expect(segmente[1].preisMWh).toBe(0.2);
    expect(roundTo(segmente[0].anteil + segmente[1].anteil, 6)).toBe(1);
  });

  it("rechnet die Energiekosten mit dem R9-Split", () => {
    // 3000 kWh anteilig: 1487,671 kWh × 0,10 €/MWh + 1512,329 kWh × 0,20 €/MWh
    // = 0,148767 + 0,302466 = 0,451233 €
    const kosten = energieKosten(PREISE, "2025-01-01", "2025-12-31", 3000);
    expect(roundTo(kosten, 6)).toBe(0.451233);
  });

  it("rechnet die Wasserkosten mit dem m³-Preis der jeweiligen Stufe", () => {
    // 1,81 m³ × 0 + 1,84 m³ × 2
    const kosten = wasserKosten(PREISE, "2025-01-01", "2025-12-31", 3650);
    expect(roundTo(kosten, 6)).toBe(3.68);
  });

  it("liefert bei einer Periode ohne Preiswechsel einen einzelnen Abschnitt", () => {
    const segmente = splitByPrice(PREISE, "2025-01-01", "2025-06-30", 3000, "energie");
    expect(segmente).toHaveLength(1);
    expect(segmente[0].tage).toBe(181);
  });
});
