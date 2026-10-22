/**
 * Datums-Hilfsfunktionen. Alle Kalenderdaten werden als `YYYY-MM-DD` geführt
 * und in UTC gerechnet, damit Zeitzonen/DST die Periodenlogik nicht beeinflussen.
 */

import type { ISODate } from "../types";

const MS_PER_DAY = 86_400_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(datum: string): boolean {
  if (!ISO_DATE_RE.test(datum)) return false;
  const ts = Date.parse(`${datum}T00:00:00Z`);
  if (Number.isNaN(ts)) return false;
  return new Date(ts).toISOString().slice(0, 10) === datum;
}

/** ISO-Datum → UTC-Millis (Mitternacht). */
export function toUTC(date: ISODate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** UTC-Millis → ISO-Datum. */
export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, tage: number): ISODate {
  return fromUTC(toUTC(date) + tage * MS_PER_DAY);
}

/** Differenz in Tagen (`b - a`). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / MS_PER_DAY);
}

/** Vergleich zweier ISO-Daten: -1, 0 oder 1. */
export function compareDate(a: ISODate, b: ISODate): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Ist `datum` in `[von, bis]` (einschließlich)? */
export function isWithin(datum: ISODate, von: ISODate, bis: ISODate): boolean {
  return compareDate(datum, von) >= 0 && compareDate(datum, bis) <= 0;
}

/** Heutiges Datum als ISO-Datum (lokale Zeitzone des Geräts). */
export function today(): ISODate {
  const jetzt = new Date();
  const lokal = new Date(jetzt.getTime() - jetzt.getTimezoneOffset() * 60_000);
  return lokal.toISOString().slice(0, 10);
}

/** Jahreszeitraum als `{ von, bis }`. */
export function yearPeriod(jahr: number): { von: ISODate; bis: ISODate } {
  return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
}
