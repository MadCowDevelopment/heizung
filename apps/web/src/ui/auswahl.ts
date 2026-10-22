/**
 * Ableitungen für die Oberfläche.
 *
 * Reine Funktionen auf dem Zustand – kein React, keine Nebenwirkungen. Die
 * Aufbereitung bleibt so getrennt von der Domäne (Rechenkern) und von der
 * Darstellung.
 */

import { compareDate } from "../domain/calc/dates";
import { directChildren } from "../domain/calc/contains";
import type { Ablesung, AppState, Bewohner, Zahlung, Zaehler } from "../domain/types";

/** Zähler, die nicht gelöscht sind. */
export function sichtbareZaehler(zaehler: Zaehler[]): Zaehler[] {
  return zaehler.filter((z) => !z.deleted);
}

/** Aktive Zähler (nicht gelöscht, nicht deaktiviert). */
export function aktiveZaehler(zaehler: Zaehler[]): Zaehler[] {
  return zaehler.filter((z) => !z.deleted && z.aktiv);
}

/** Bewohner, die nicht gelöscht sind. */
export function sichtbareBewohner(bewohner: Bewohner[]): Bewohner[] {
  return bewohner.filter((b) => !b.deleted);
}

/**
 * Die zuletzt bezahlte Zahlung eines Bewohners.
 *
 * Bezahlt wird nach dem Zahlungsdatum sortiert; eine offene Zahlung ist die
 * jüngste, wenn es keine bezahlte gibt.
 */
export function letzteZahlungVon(zahlungen: Zahlung[], bewohnerId: string): Zahlung | null {
  const eigene = zahlungen.filter((z) => z.bewohnerId === bewohnerId && !z.deleted);
  if (eigene.length === 0) return null;

  const sortiert = [...eigene].sort((a, b) => {
    const da = a.bezahltAm ?? a.faelligAm;
    const db = b.bezahltAm ?? b.faelligAm;
    return compareDate(db, da);
  });
  return sortiert[0];
}

/** Die zuletzt erfasste Ablesung eines Zählers. */
export function letzteAblesung(
  ablesungen: Ablesung[],
  zaehlerId: string,
): Ablesung | null {
  let neueste: Ablesung | null = null;
  for (const a of ablesungen) {
    if (a.zaehlerId !== zaehlerId || a.deleted) continue;
    if (!neueste || compareDate(a.datum, neueste.datum) > 0) {
      neueste = a;
    }
  }
  return neueste;
}

/** Alle Ablesungen eines Zählers, neueste zuerst. */
export function ablesungenVon(ablesungen: Ablesung[], zaehlerId: string): Ablesung[] {
  return ablesungen
    .filter((a) => a.zaehlerId === zaehlerId && !a.deleted)
    .sort((a, b) => compareDate(b.datum, a.datum));
}

/** Zähler, die einem Bewohner zugeordnet sind. */
export function zaehlerVonBewohner(zaehler: Zaehler[], bewohnerId: string): Zaehler[] {
  return sichtbareZaehler(zaehler).filter((z) => z.bewohnerId === bewohnerId);
}

/** Der Bewohner hinter einem Zähler (oder `null` für Gemeinschaftszähler). */
export function besitzerVon(bewohner: Bewohner[], zaehler: Zaehler): Bewohner | null {
  if (!zaehler.bewohnerId) return null;
  return bewohner.find((b) => b.id === zaehler.bewohnerId) ?? null;
}

/** Ein Knoten der Struktur-Vorschau. */
export interface Strukturknoten {
  zaehler: Zaehler;
  tiefe: number;
  /** `true`, wenn der Knoten im aktuellen Pfad wiederholt wurde (Zirkel). */
  zyklus: boolean;
}

/**
 * Baut die Struktur-Vorschau eines Zählers: der Zähler mit den Zählern, die
 * er enthält – verschachtelt, mit Tiefenangabe.
 */
export function strukturVorschau(zaehler: Zaehler[], zaehlerId: string): Strukturknoten[] {
  const knoten: Strukturknoten[] = [];
  const pfad: string[] = [];

  const lauf = (id: string, tiefe: number) => {
    const z = zaehler.find((x) => x.id === id);
    if (!z) return;
    const zyklus = pfad.includes(id);
    knoten.push({ zaehler: z, tiefe, zyklus });
    if (zyklus) return;
    pfad.push(id);
    for (const kind of directChildren(zaehler, id)) {
      lauf(kind.id, tiefe + 1);
    }
    pfad.pop();
  };

  lauf(zaehlerId, 0);
  return knoten;
}

/** Aktiver Abschlagplan eines Bewohners. */
export function abschlagVon(state: AppState, bewohnerId: string) {
  return state.abschlagPlan.find((a) => a.bewohnerId === bewohnerId && a.aktiv) ?? null;
}
