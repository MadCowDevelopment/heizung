/**
 * R7 – Kaufmännische Rundung ohne Rundungsdifferenz.
 *
 * Die Einzelpositionen müssen **exakt** auf den Gesamtbetrag summieren.
 * Dazu wird das Largest-Remainder-Verfahren (Verteilung der Restcent nach
 * größtem Rest) verwendet. Bei Gleichstand entscheidet die Sortierung nach
 * Bewohner-ID – das Ergebnis ist damit deterministisch.
 */

import { toCents } from "./units";

/** Position für die Verteilung. */
export interface AllokationsPosition {
  /** Eindeutige ID (Bewohner-ID). */
  id: string;
  /** Anteil in Prozent oder als Bruchteil – skaliert wird mit `summeAnteil`. */
  anteil: number;
}

/** Ergebnis der Allokation: Cent-Beträge je Position. */
export interface AllokationsErgebnis {
  /** Cent je Position (Summe = Summe der Ausgangscent). */
  cent: Map<string, number>;
  /** Cent, die durch Rundung unterschiedlich zugewiesen wurden. */
  differenz: number;
}

/**
 * Verteilt einen Cent-Betrag anteilig auf Positionen.
 *
 * @param centGesamt  Gesamtbetrag in Cent
 * @param positionen  Positionen mit Anteilen
 * @param summeAnteil Summe der maßgeblichen Anteile (Default: Summe der Anteile)
 */
export function allocate(
  centGesamt: number,
  positionen: AllokationsPosition[],
  summeAnteil?: number,
): AllokationsErgebnis {
  const cent = new Map<string, number>();
  const relevant = positionen.filter((p) => p.anteil > 0);

  if (relevant.length === 0) {
    for (const p of positionen) cent.set(p.id, 0);
    return { cent, differenz: 0 };
  }

  const summe = summeAnteil ?? relevant.reduce((acc, p) => acc + p.anteil, 0);
  if (summe <= 0) {
    for (const p of positionen) cent.set(p.id, 0);
    return { cent, differenz: 0 };
  }

  // Exakte Anteile (Cent) je Position.
  const exakt = relevant.map((p) => {
    const wert = (centGesamt * p.anteil) / summe;
    const gerundet = Math.floor(wert);
    return {
      id: p.id,
      gerundet,
      rest: wert - gerundet,
    };
  });

  const verteilt = exakt.reduce((acc, p) => acc + p.gerundet, 0);
  let differenz = centGesamt - verteilt;

  // Rest nach größtem Rest verteilen; Gleichstand → nach ID sortiert.
  const rang = [...exakt].sort((a, b) => {
    if (b.rest !== a.rest) return b.rest - a.rest;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const zaehler = new Map(exakt.map((p) => [p.id, p.gerundet]));
  let index = 0;
  while (differenz !== 0 && rang.length > 0) {
    const schritt = differenz > 0 ? 1 : -1;
    const ziel = rang[index % rang.length];
    const neu = (zaehler.get(ziel.id) as number) + schritt;
    zaehler.set(ziel.id, neu);
    differenz -= schritt;
    index += 1;
  }

  for (const p of positionen) {
    cent.set(p.id, zaehler.get(p.id) ?? 0);
  }

  return { cent, differenz: 0 };
}

/**
 * Allokiert Euro-Beträge (mit kaufmännischer Rundung) und liefert die
 * gerundeten Beträge in Euro. Die Summe der Beträge entspricht exakt dem
 * gerundeten Gesamtbetrag.
 */
export function allocateEuro(
  euroGesamt: number,
  positionen: AllokationsPosition[],
  summeAnteil?: number,
): Map<string, number> {
  const { cent } = allocate(toCents(euroGesamt), positionen, summeAnteil);
  const out = new Map<string, number>();
  for (const [id, c] of cent) out.set(id, c / 100);
  return out;
}
