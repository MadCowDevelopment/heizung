/**
 * Formatierung für die Anzeige (de-DE).
 *
 * Alle Zahlen der Oberfläche laufen durch diese Funktionen, damit
 * Dezimalkomma, Tausenderpunkt und Datum einheitlich aussehen
 * (docs/requirements.md §5).
 */

import { isValidISODate } from "../domain/calc/dates";
import type { ISODate } from "../domain/types";

const geldFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Zahl mit deutschem Dezimalkomma. */
export function zahl(wert: number | null | undefined, nachkomma = 3): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: nachkomma,
  }).format(wert);
}

/** Betrag in Euro. */
export function geld(wert: number | null | undefined): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return geldFormat.format(wert);
}

/** Zählerstand in der Anzeigeeinheit (MWh / m³), 3 Nachkommastellen. */
export function stand(wert: number | null | undefined): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return zahl(wert, 3);
}

/** Kalenderdatum in deutscher Schreibweise (TT.MM.JJJJ). */
export function datum(wert: ISODate | null | undefined): string {
  if (!wert || !isValidISODate(wert)) return "—";
  const [j, m, t] = wert.split("-");
  return `${t}.${m}.${j}`;
}
