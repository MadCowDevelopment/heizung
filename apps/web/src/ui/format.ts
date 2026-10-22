/**
 * Sprachabhängige Formatierung für Zahlen, Beträge und Kalenderdaten.
 *
 * Alle Zahlen der Oberfläche laufen durch diese Funktionen, damit
 * Dezimalkomma, Tausenderpunkt und Datum einheitlich aussehen
 * (docs/requirements.md §5).
 */

import { isValidISODate } from "../domain/calc/dates";
import type { ISODate } from "../domain/types";
import i18n from "../i18n";

export function formatLocale(): string {
  return i18n.resolvedLanguage === "en" ? "en-GB" : "de-DE";
}

/** Zahl mit deutschem Dezimalkomma. */
export function zahl(wert: number | null | undefined, nachkomma = 3): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: nachkomma,
  }).format(wert);
}

/** Betrag in Euro. */
export function geld(wert: number | null | undefined): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(wert);
}

/** Zählerstand in der Anzeigeeinheit (MWh / m³), 3 Nachkommastellen. */
export function stand(wert: number | null | undefined): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return "—";
  return zahl(wert, 3);
}

/** Kalenderdatum in deutscher Schreibweise (TT.MM.JJJJ). */
export function datum(wert: ISODate | null | undefined): string {
  if (!wert || !isValidISODate(wert)) return "—";
  return new Intl.DateTimeFormat(formatLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${wert}T00:00:00.000Z`));
}
