/**
 * R0 – Einheiten & Präzision.
 *
 * Intern wird in **kWh** (Energie) bzw. **Litern** (Wasser) und **Cent** (Geld)
 * gerechnet, damit keine Fließkomma-Fehler entstehen. Anzeige erst in
 * MWh / m³ / Euro.
 *
 * `stand` einer Ablesung wird in der **Anzeigeeinheit** des Zählers
 * gespeichert (MWh bzw. m³ – so wird er auch erfasst). Die Umrechnung in die
 * Basiseinheit passiert an der Grenze des Rechenkerns (`zuBasis`).
 */

import type { MeterUnit } from "../types";

export const KWH_PER_MWH = 1000;
export const LITRE_PER_M3 = 1000;

export function mwhToKwh(mwh: number): number {
  return mwh * KWH_PER_MWH;
}

export function kwhToMwh(kwh: number): number {
  return kwh / KWH_PER_MWH;
}

export function m3ToLitre(m3: number): number {
  return m3 * LITRE_PER_M3;
}

export function litreToM3(litre: number): number {
  return litre / LITRE_PER_M3;
}

/**
 * Kaufmännische Rundung (halbe aufwärts, weg von null) auf `nachkomma` Stellen.
 * Kompensiert die binäre Gleitkommadarstellung (1.005 → 1.01).
 */
export function roundTo(value: number, nachkomma = 0): number {
  if (!Number.isFinite(value)) return NaN;
  const faktor = 10 ** nachkomma;
  const skaliert = value * faktor;
  const kompensiert = Math.abs(skaliert) + 1e-9;
  const gerundet = Math.round(kompensiert) * Math.sign(skaliert);
  return gerundet / faktor;
}

/** Euro → Cent (ganzzahlig). */
export function toCents(euro: number): number {
  if (!Number.isFinite(euro)) return 0;
  return Math.round(euro * 100 + (euro >= 0 ? 1e-9 : -1e-9));
}

/** Cent → Euro. */
export function fromCents(cents: number): number {
  return roundTo(cents / 100, 2);
}

/** Anzeige: MWh mit 3 Nachkommastellen. */
export function formatMWh(kwh: number): number {
  return roundTo(kwhToMwh(kwh), 3);
}

/** Anzeige: m³ mit 2 Nachkommastellen. */
export function formatM3(litre: number): number {
  return roundTo(litreToM3(litre), 2);
}

/** Anzeige: Betrag in Euro mit 2 Nachkommastellen. */
export function formatEuro(euro: number): number {
  return roundTo(euro, 2);
}

/**
 * Rechnet einen Zählerstand aus der Anzeigeeinheit in die Basiseinheit
 * (kWh bzw. Liter).
 */
export function zuBasis(stand: number, einheit: MeterUnit): number {
  return einheit === "MWh" ? mwhToKwh(stand) : m3ToLitre(stand);
}

/** Rechnet einen Wert aus der Basiseinheit zurück in die Anzeigeeinheit. */
export function ausBasis(wert: number, einheit: MeterUnit): number {
  return einheit === "MWh" ? kwhToMwh(wert) : litreToM3(wert);
}
