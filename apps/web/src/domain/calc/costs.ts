/**
 * R4 + R9 – Kostenberechnung und Preisstufen.
 *
 * R4: `kosten = energieMWh × preisMWh + wasserM3 × preisM3`
 *     Vorgaben: `preisMWh = 0,10 €`, `preisM3 = 0`.
 *
 * R9: Preisstufen sind **datumsgenau** (`gueltigAb`). Läuft eine Periode über
 *     einen Preiswechsel, wird sie am Stichtag geteilt und anteilig gewichtet
 *     (Tage je Teilperiode). Zusätzlich hält jede Ablesung einen
 *     Preis-Snapshot (`preisMwhGenutzt`).
 */

import type { Ablesung, ISODate, Preis } from "../types";
import { compareDate, addDays, daysBetween, isWithin } from "./dates";
import { kwhToMwh, litreToM3, roundTo } from "./units";

/** Vorgabe-Preise (R4). */
export const DEFAULT_PREIS_MWH = 0.1;
export const DEFAULT_PREIS_M3 = 0;

/** Sortiert Preise nach `gueltigAb` aufsteigend. */
export function sortPrices(preise: Preis[]): Preis[] {
  return [...preise].sort((a, b) => compareDate(a.gueltigAb, b.gueltigAb));
}

/**
 * Preis, der an einem Datum gilt (die letzte Stufe mit `gueltigAb <= datum`).
 * Ohne Preise gilt der Vorgabepreis.
 */
export function priceForDate(preise: Preis[], datum: ISODate): { preisMWh: number; preisM3: number } {
  const sortiert = sortPrices(preise);
  let gueltig: Preis | undefined;
  for (const p of sortiert) {
    if (compareDate(p.gueltigAb, datum) <= 0) gueltig = p;
    else break;
  }
  if (!gueltig) {
    return { preisMWh: DEFAULT_PREIS_MWH, preisM3: DEFAULT_PREIS_M3 };
  }
  return { preisMWh: gueltig.preisMWh, preisM3: gueltig.preisM3 };
}

/** Preise, die innerhalb der Periode einen Wechsel auslösen. */
export function priceChangesInPeriod(preise: Preis[], von: ISODate, bis: ISODate): ISODate[] {
  return sortPrices(preise)
    .map((p) => p.gueltigAb)
    .filter((d) => isWithin(d, von, bis) && compareDate(d, von) > 0);
}

/** Ein Teilsegment einer Periode mit anteiliger Menge. */
export interface PreisSegment {
  von: ISODate;
  bis: ISODate;
  tage: number;
  /** Anteil der Gesamtmenge in diesem Segment (0..1). */
  anteil: number;
  preisMWh: number;
  preisM3: number;
  /** Kosten des Segments in Euro. */
  kosten: number;
}

/**
 * Teilt eine Periode anhand der Preisstufen und gewichtet die Menge
 * proportional zu den Tagen.
 *
 * Die Periode `[von, bis]` ist inklusiv. Ein Preiswechsel am `gueltigAb` gilt
 * ab **diesem** Tag – der Stichtag wird also genau einmal gezählt und dem
 * neuen Preis zugeordnet.
 *
 * @param menge  Menge in der Basiseinheit (kWh bzw. Liter)
 * @param einheit 'energie' (kWh → MWh-Preis) oder 'wasser' (Liter → m³-Preis)
 */
export function splitByPrice(
  preise: Preis[],
  von: ISODate,
  bis: ISODate,
  menge: number,
  einheit: "energie" | "wasser",
): PreisSegment[] {
  const grenzen = [von, ...priceChangesInPeriod(preise, von, bis), bis];
  const unique = grenzen.filter((d, i) => i === 0 || compareDate(d, grenzen[i - 1]) !== 0);
  const gesamtTage = Math.max(1, daysBetween(von, bis) + 1);

  const segmente: PreisSegment[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const segVon = unique[i];
    // Letzter Tag des Segments: der Tag vor der nächsten Preisgrenze.
    const segBis = i === unique.length - 2 ? bis : addDays(unique[i + 1], -1);
    const tage = daysBetween(segVon, segBis) + 1;
    const anteil = tage / gesamtTage;
    const { preisMWh, preisM3 } = priceForDate(preise, segVon);
    const mengeSegment = menge * anteil;
    const kosten =
      einheit === "energie"
        ? kwhToMwh(mengeSegment) * preisMWh
        : litreToM3(mengeSegment) * preisM3;
    segmente.push({
      von: segVon,
      bis: segBis,
      tage,
      anteil,
      preisMWh,
      preisM3,
      kosten,
    });
  }
  return segmente;
}

/** Kosten eines Energiedeltas (kWh) in einer Periode, inkl. Preiswechsel (R9). */
export function energieKosten(
  preise: Preis[],
  von: ISODate,
  bis: ISODate,
  energieKwh: number,
): number {
  return splitByPrice(preise, von, bis, energieKwh, "energie").reduce((sum, s) => sum + s.kosten, 0);
}

/** Kosten eines Wasserdeltas (Liter) in einer Periode. */
export function wasserKosten(
  preise: Preis[],
  von: ISODate,
  bis: ISODate,
  wasserL: number,
): number {
  return splitByPrice(preise, von, bis, wasserL, "wasser").reduce((sum, s) => sum + s.kosten, 0);
}

/**
 * Preis-Snapshot einer Ablesung (R9): der zum Ablesedatum gültige Preis.
 * Liegt ein gespeicherter Snapshot vor, hat dieser Vorrang (damit bleibt eine
 * Abrechnung auch nach einer Preisanpassung reproduzierbar).
 */
export function snapshotPreis(
  preise: Preis[],
  ablesung: Ablesung | null | undefined,
): { preisMWh: number; preisM3: number } {
  if (!ablesung) {
    return { preisMWh: DEFAULT_PREIS_MWH, preisM3: DEFAULT_PREIS_M3 };
  }
  if (ablesung.preisMwhGenutzt !== undefined && ablesung.preisMwhGenutzt !== null) {
    return { preisMWh: ablesung.preisMwhGenutzt, preisM3: DEFAULT_PREIS_M3 };
  }
  return priceForDate(preise, ablesung.datum);
}

/** Theoretische Kosten eines Bewohners (R4). */
export function bewohnerKosten(
  energieMWh: number,
  wasserM3: number,
  preisMWh: number,
  preisM3: number,
): number {
  return roundTo(energieMWh * preisMWh + wasserM3 * preisM3, 2);
}
