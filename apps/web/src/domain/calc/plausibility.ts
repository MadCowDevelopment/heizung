/**
 * R8 – Plausibilitätsprüfung.
 *
 * - Negative Deltas (Zählerwechsel / Fehlablesung) → Warnung.
 * - Delta > 3 × Median der vorherigen Perioden → Warnung.
 *
 * Die Prüfung blockiert nur den **Abschluss** der Abrechnung (mit
 * Override-Möglichkeit), nicht die Erfassung.
 */

import type { Ablesung, ISODate, MeterUnit } from "../types";
import { compareDate } from "./dates";
import { meterDelta } from "./period";
import { zuBasis } from "./units";

/** Schwellwert-Faktor für Ausreißer (R8). */
export const PLAUSIBILITAET_FAKTOR = 3;

/** Art der Plausibilitätswarnung. */
export type PlausibilitaetArt = "negativ" | "ausreisser" | "fehlt" | "unvollstaendig";

/** Eine Plausibilitätswarnung. */
export interface PlausibilitaetHinweis {
  zaehlerId: string;
  art: PlausibilitaetArt;
  text: string;
  /** Wert, der die Warnung ausgelöst hat. */
  wert?: number;
  /** Referenzwert (z. B. Median). */
  referenz?: number;
  /** Blockiert die Abrechnung (nur bei `ausreisser`/`negativ` mit `blockierend`). */
  blockierend: boolean;
}

export interface PlausibilitaetPruefung {
  hinweise: PlausibilitaetHinweis[];
  /** `true`, wenn mindestens ein blockierender Hinweis vorliegt. */
  blockiert: boolean;
}

/** Median einer Liste von Zahlen. */
export function median(werte: number[]): number {
  if (werte.length === 0) return 0;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 0
    ? (sortiert[mitte - 1] + sortiert[mitte]) / 2
    : sortiert[mitte];
}

/**
 * Deltas der Vorperioden eines Zählers – je Periode ein Delta, damit der
 * Median aussagekräftig bleibt.
 *
 * Als Vorperiode gilt jeweils der Zeitraum zwischen zwei aufeinander
 *folgenden Ablesungen, der **vor** der aktuellen Periode endet. Der Wert wird
 * in der Basiseinheit (kWh bzw. Liter) geliefert – wie `meterDelta`.
 */
export function previousDeltas(
  ablesungen: Ablesung[],
  zaehlerId: string,
  von: ISODate,
  _bis: ISODate,
  anzahlPerioden = 3,
  einheit: MeterUnit = "MWh",
): number[] {
  const eigene = ablesungen
    .filter((a) => a.zaehlerId === zaehlerId && !a.deleted)
    .sort((a, b) => compareDate(a.datum, b.datum));

  if (eigene.length < 2) return [];

  // Index der Ablesung, die den Start der aktuellen Periode bildet.
  let startIndex = -1;
  for (let i = 0; i < eigene.length; i++) {
    if (compareDate(eigene[i].datum, von) <= 0) startIndex = i;
  }
  if (startIndex < 1) return [];

  const deltas: number[] = [];
  for (let k = 1; k <= anzahlPerioden && startIndex - k >= 0; k++) {
    const ende = eigene[startIndex - k + 1];
    const beginn = eigene[startIndex - k];
    const delta = zuBasis(ende.stand, einheit) - zuBasis(beginn.stand, einheit);
    if (delta >= 0) deltas.push(delta);
  }
  return deltas.reverse();
}

/**
 * Prüft alle Zähler der Periode.
 */
export function checkPlausibility(
  ablesungen: Ablesung[],
  zaehler: { id: string; bezeichnung: string; einheit?: MeterUnit }[],
  von: ISODate,
  bis: ISODate,
): PlausibilitaetPruefung {
  const hinweise: PlausibilitaetHinweis[] = [];

  for (const z of zaehler) {
    const d = meterDelta(ablesungen, z.id, von, bis, z.einheit ?? "MWh");

    if (!d.complete) {
      hinweise.push({
        zaehlerId: z.id,
        art: "unvollstaendig",
        text: `Für „${z.bezeichnung}" fehlt eine Start- oder Endablesung im Zeitraum – nicht abrechenbar.`,
        blockierend: false,
      });
      continue;
    }

    const delta = d.delta as number;

    if (delta < 0) {
      hinweise.push({
        zaehlerId: z.id,
        art: "negativ",
        text: `„${z.bezeichnung}" hat einen negativen Verbrauch (${delta.toFixed(2)}) – Zählerwechsel oder Fehlablesung prüfen.`,
        wert: delta,
        blockierend: true,
      });
      continue;
    }

    const vorher = previousDeltas(ablesungen, z.id, von, bis, 3, z.einheit ?? "MWh");
    if (vorher.length > 0) {
      const med = median(vorher);
      if (med > 0 && delta > PLAUSIBILITAET_FAKTOR * med) {
        hinweise.push({
          zaehlerId: z.id,
          art: "ausreisser",
          text: `„${z.bezeichnung}" liegt mit ${delta.toFixed(2)} über dem ${PLAUSIBILITAET_FAKTOR}-fachen des Medians (${med.toFixed(2)}) der Vorperioden.`,
          wert: delta,
          referenz: med,
          blockierend: true,
        });
      }
    }
  }

  return { hinweise, blockiert: hinweise.some((h) => h.blockierend) };
}
