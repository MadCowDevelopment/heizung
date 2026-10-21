import { describe, expect, it } from "vitest";

import { meterDelta, periodReadings } from "../calc/period";
import type { Ablesung } from "../types";
import { IDS, ablesungen } from "./fixtures";

const alle = ablesungen();

describe("R1 – Periodenverbrauch je Zähler", () => {
  it("nutzt die letzte Ablesung mit Datum <= Periodenbeginn als Start", () => {
    const { start } = periodReadings(alle, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(start?.datum).toBe("2024-12-31");
    expect(start?.stand).toBe(10);
  });

  it("nutzt die letzte Ablesung mit Datum <= Periodenende als Ende", () => {
    const { end } = periodReadings(alle, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(end?.datum).toBe("2025-12-31");
    expect(end?.stand).toBe(13);
  });

  it("rechnet MWh in kWh um (R0)", () => {
    const d = meterDelta(alle, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(true);
    expect(d.delta).toBe(3000); // 3 MWh
  });

  it("rechnet m³ in Liter um (R0)", () => {
    const d = meterDelta(alle, IDS.zaehlerWarmA, "2025-01-01", "2025-12-31", "m3");
    expect(d.delta).toBe(2000); // 2 m³
  });

  it("nutzt Zwischenablesungen automatisch als Start/Ende", () => {
    const mitZwischen = [
      ...alle,
      {
        id: "a-e-z",
        zaehlerId: IDS.zaehlerEnergie,
        datum: "2025-07-01",
        stand: 11.5,
        unsicher: false,
      },
    ];
    const d = meterDelta(mitZwischen, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(true);
    expect(d.delta).toBe(3000);
    expect(d.start?.datum).toBe("2024-12-31");
    expect(d.end?.datum).toBe("2025-12-31");
  });

  it("nutzt die vorangehende Ablesung, wenn keine innerhalb der Periode liegt", () => {
    const d = meterDelta(alle, IDS.zaehlerEnergie, "2025-06-01", "2025-12-31");
    expect(d.start?.datum).toBe("2024-12-31");
    expect(d.delta).toBe(3000);
  });

  it("nutzt eine Zwischenablesung als Start, wenn sie der Periodenbeginn ist", () => {
    const mitZwischen = [
      ...alle,
      {
        id: "a-e-z",
        zaehlerId: IDS.zaehlerEnergie,
        datum: "2025-01-01",
        stand: 10.5,
        unsicher: false,
      },
    ];
    const d = meterDelta(mitZwischen, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.start?.datum).toBe("2025-01-01");
    expect(d.delta).toBe(2500); // 13,0 − 10,5 MWh
  });

  it("markiert die Periode als unvollständig, wenn die Startablesung fehlt", () => {
    const ohneStart = alle.filter((a) => a.datum !== "2024-12-31");
    const d = meterDelta(ohneStart, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(false);
    expect(d.delta).toBeNull();
  });

  it("markiert die Periode als unvollstaendig, wenn die Endablesung fehlt", () => {
    const ohneEnde = alle.filter((a) => a.datum !== "2025-12-31");
    const d = meterDelta(ohneEnde, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(false);
    expect(d.delta).toBeNull();
  });

  it("behandelt eine einzelne Ablesung nicht als vollstaendige Periode (R1)", () => {
    // Nur eine Ablesung am Periodenbeginn: Start und Ende fallen zusammen,
    // es gibt keinen Verbrauch - die Periode ist unvollstaendig.
    const nurEine = alle.filter(
      (a) => a.zaehlerId !== IDS.zaehlerEnergie || a.datum === "2024-12-31",
    );
    const d = meterDelta(nurEine, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.start?.datum).toBe("2024-12-31");
    expect(d.end?.datum).toBe("2024-12-31");
    expect(d.complete).toBe(false);
    expect(d.delta).toBeNull();
  });

  it("erkennt eine Endablesung, die nicht nach dem Start liegt", () => {
    // Start- und Endablesung am selben Tag -> keine Periode.
    const amSelbenTag: Ablesung[] = [
      { id: "x-0", zaehlerId: "z1", datum: "2025-06-01", stand: 10, unsicher: false },
      { id: "x-1", zaehlerId: "z1", datum: "2025-06-01", stand: 12, unsicher: false },
    ];
    const d = meterDelta(amSelbenTag, "z1", "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(false);
  });

  it("ignoriert gelöschte Ablesungen", () => {
    const geloescht = alle.map((a) => (a.id === "a-e-0" ? { ...a, deleted: true } : a));
    const d = meterDelta(geloescht, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.complete).toBe(false);
  });

  it("zählt die Ablesungen innerhalb der Periode", () => {
    const mitZwischen = [
      ...alle,
      {
        id: "a-e-z",
        zaehlerId: IDS.zaehlerEnergie,
        datum: "2025-07-01",
        stand: 11.5,
        unsicher: false,
      },
    ];
    const d = meterDelta(mitZwischen, IDS.zaehlerEnergie, "2025-01-01", "2025-12-31");
    expect(d.anzahlAblesungen).toBe(2); // Zwischenablesung + Endablesung
  });
});
