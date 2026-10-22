/**
 * Gemeinsame Testdaten für den Rechenkern.
 *
 * Aufbau des Referenz-Szenarios (aus docs/architecture.md §5):
 *  - Gemeinschafts-Energiezähler E (3 MWh über die Periode)
 *  - Bewohner A: Warmwasser 2 m³, Kaltwasser 1 m³
 *  - Bewohner B: Warmwasser 1 m³, Kaltwasser 1 m³
 *  → Energieverteilung: A = 2 MWh, B = 1 MWh
 */

import type { Ablesung, AppState, Bewohner, Preis, Zaehler } from "../types";
import { emptyState } from "../types";

/** IDs der Testdaten. */
export const IDS = {
  bewohnerA: "b-a",
  bewohnerB: "b-b",
  zaehlerEnergie: "z-energie",
  zaehlerWarmA: "z-warm-a",
  zaehlerWarmB: "z-warm-b",
  zaehlerKaltA: "z-kalt-a",
  zaehlerKaltB: "z-kalt-b",
} as const;

/** Periode der Referenzrechnung. */
export const PERIODE = { von: "2025-01-01", bis: "2025-12-31" } as const;

export function bewohner(): Bewohner[] {
  return [
    { id: IDS.bewohnerA, name: "Anna Beispiel", aktiv: true, email: "anna@example.org" },
    { id: IDS.bewohnerB, name: "Bernd Beispiel", aktiv: true },
  ];
}

export function zaehler(): Zaehler[] {
  return [
    {
      id: IDS.zaehlerEnergie,
      bezeichnung: "Heizung gesamt",
      typ: "energie",
      einheit: "MWh",
      bewohnerId: null,
      enthaeltIds: [],
      aktiv: true,
    },
    {
      id: IDS.zaehlerWarmA,
      bezeichnung: "Warmwasser Anna",
      typ: "wasser_warm",
      einheit: "m3",
      bewohnerId: IDS.bewohnerA,
      enthaeltIds: [],
      aktiv: true,
    },
    {
      id: IDS.zaehlerWarmB,
      bezeichnung: "Warmwasser Bernd",
      typ: "wasser_warm",
      einheit: "m3",
      bewohnerId: IDS.bewohnerB,
      enthaeltIds: [],
      aktiv: true,
    },
    {
      id: IDS.zaehlerKaltA,
      bezeichnung: "Kaltwasser Anna",
      typ: "wasser_kalt",
      einheit: "m3",
      bewohnerId: IDS.bewohnerA,
      enthaeltIds: [],
      aktiv: true,
    },
    {
      id: IDS.zaehlerKaltB,
      bezeichnung: "Kaltwasser Bernd",
      typ: "wasser_kalt",
      einheit: "m3",
      bewohnerId: IDS.bewohnerB,
      enthaeltIds: [],
      aktiv: true,
    },
  ];
}

/** Ablesungen: Start 31.12.2024, Ende 31.12.2025. */
export function ablesungen(): Ablesung[] {
  return [
    // Energie: 10,000 MWh → 13,000 MWh (3 MWh)
    { id: "a-e-0", zaehlerId: IDS.zaehlerEnergie, datum: "2024-12-31", stand: 10, unsicher: false },
    { id: "a-e-1", zaehlerId: IDS.zaehlerEnergie, datum: "2025-12-31", stand: 13, unsicher: false },
    // Warmwasser Anna: 5 m³ → 7 m³ (2 m³)
    { id: "a-wa-0", zaehlerId: IDS.zaehlerWarmA, datum: "2024-12-31", stand: 5, unsicher: false },
    { id: "a-wa-1", zaehlerId: IDS.zaehlerWarmA, datum: "2025-12-31", stand: 7, unsicher: false },
    // Warmwasser Bernd: 3 m³ → 4 m³ (1 m³)
    { id: "a-wb-0", zaehlerId: IDS.zaehlerWarmB, datum: "2024-12-31", stand: 3, unsicher: false },
    { id: "a-wb-1", zaehlerId: IDS.zaehlerWarmB, datum: "2025-12-31", stand: 4, unsicher: false },
    // Kaltwasser Anna: 20 m³ → 21 m³ (1 m³)
    { id: "a-ka-0", zaehlerId: IDS.zaehlerKaltA, datum: "2024-12-31", stand: 20, unsicher: false },
    { id: "a-ka-1", zaehlerId: IDS.zaehlerKaltA, datum: "2025-12-31", stand: 21, unsicher: false },
    // Kaltwasser Bernd: 30 m³ → 31 m³ (1 m³)
    { id: "a-kb-0", zaehlerId: IDS.zaehlerKaltB, datum: "2024-12-31", stand: 30, unsicher: false },
    { id: "a-kb-1", zaehlerId: IDS.zaehlerKaltB, datum: "2025-12-31", stand: 31, unsicher: false },
  ];
}

/** Referenz-Zustand. */
export function state(overrides: Partial<AppState> = {}): AppState {
  return {
    ...emptyState(),
    bewohner: bewohner(),
    zaehler: zaehler(),
    ablesung: ablesungen(),
    preis: [],
    ...overrides,
  };
}

/** Preisstufen: 0,10 €/MWh ab 2025-01-01. */
export function preis(): Preis[] {
  return [{ id: "p-2025", gueltigAb: "2025-01-01", preisMWh: 0.1, preisM3: 0 }];
}
