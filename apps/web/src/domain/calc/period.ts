/**
 * R1 – Perioden-Delta je Zähler.
 *
 * Start = letzte Ablesung mit `datum <= von`, Ende = letzte Ablesung mit
 * `datum <= bis`. Fehlt eine der beiden, ist die Periode **unvollständig**
 * und wird nicht abgerechnet. Zwischenliegende Ablesungen werden
 * automatisch berücksichtigt (nur Start/Ende zählen).
 */

import type { Ablesung, ISODate, MeterUnit, Zaehler } from "../types";
import { compareDate } from "./dates";
import { zuBasis } from "./units";

/** Ergebnis der Delta-Berechnung für einen Zähler. */
export interface MeterDelta {
  zaehlerId: string;
  /** Delta in kWh (Energie) bzw. Litern (Wasser). */
  delta: number | null;
  start: Ablesung | null;
  end: Ablesung | null;
  /** `true`, wenn Start- und Endablesung vorhanden sind. */
  complete: boolean;
  /** Anzahl der Ablesungen innerhalb der Periode (inkl. Start/Ende). */
  anzahlAblesungen: number;
}

/** Sortiert Ablesungen eines Zählers chronologisch (stabil, Datum + Stand). */
export function sortReadings(ablesungen: Ablesung[]): Ablesung[] {
  return [...ablesungen].sort((a, b) => {
    const c = compareDate(a.datum, b.datum);
    if (c !== 0) return c;
    return a.stand - b.stand;
  });
}

/**
 * Findet die für die Periode maßgebliche Ablesungen eines Zählers.
 */
export function periodReadings(
  ablesungen: Ablesung[],
  zaehlerId: string,
  von: ISODate,
  bis: ISODate,
): { start: Ablesung | null; end: Ablesung | null; innerhalb: Ablesung[] } {
  const eigene = sortReadings(
    ablesungen.filter((a) => a.zaehlerId === zaehlerId && !a.deleted),
  );
  const start = [...eigene].reverse().find((a) => compareDate(a.datum, von) <= 0) ?? null;
  const end = [...eigene].reverse().find((a) => compareDate(a.datum, bis) <= 0) ?? null;
  const innerhalb = eigene.filter(
    (a) => compareDate(a.datum, von) >= 0 && compareDate(a.datum, bis) <= 0,
  );
  return { start, end, innerhalb };
}

/**
 * Delta eines Zählers in der Periode.
 *
 * Das Ergebnis ist in der **Basiseinheit**: kWh (Energie) bzw. Liter (Wasser).
 * Die Umrechnung erfolgt über die Anzeigeeinheit des Zählers (R0).
 *
 * Bei negativem Delta (Zählerwechsel) ist `delta` negativ und `complete` bleibt
 * `true` – die Plausibilitätsprüfung (R8) meldet den Fall.
 */
export function meterDelta(
  ablesungen: Ablesung[],
  zaehlerId: string,
  von: ISODate,
  bis: ISODate,
  einheit: MeterUnit = "MWh",
): MeterDelta {
  const { start, end, innerhalb } = periodReadings(ablesungen, zaehlerId, von, bis);
  // R1: Start und Ende muessen zwei verschiedene Ablesungen sein - ein
  // einzelner Zaehlerstand beschreibt noch keine Periode. Fehlt die
  // Endablesung, faellt sie automatisch mit dem Startstand zusammen.
  const complete =
    start !== null && end !== null && compareDate(end.datum, start.datum) > 0;
  const delta = complete
    ? zuBasis((end as Ablesung).stand, einheit) - zuBasis((start as Ablesung).stand, einheit)
    : null;
  return {
    zaehlerId,
    delta,
    start,
    end,
    complete,
    anzahlAblesungen: innerhalb.length,
  };
}

/** Deltas für alle (nicht gelöschten) Zähler. */
export function meterDeltas(
  ablesungen: Ablesung[],
  zaehler: Zaehler[],
  von: ISODate,
  bis: ISODate,
): Map<string, MeterDelta> {
  const ergebnis = new Map<string, MeterDelta>();
  for (const z of zaehler) {
    if (z.deleted) continue;
    ergebnis.set(z.id, meterDelta(ablesungen, z.id, von, bis, z.einheit));
  }
  return ergebnis;
}
