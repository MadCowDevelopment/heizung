/**
 * R2 – Eigenverbrauch und enthaltene Zähler.
 *
 * Der Eigenverbrauch eines Zählers ist die Differenz zwischen seinem Delta
 * und der Summe der Deltas der **direkt** enthaltenen Zähler. Die Auflösung
 * erfolgt rekursiv mit einer Besucht-Menge (zyklussicher).
 *
 * Enthaltene Zähler werden **nicht** separat verteilt – ihr Verbrauch ist
 * bereits im übergeordneten Zähler enthalten.
 */

import type { Ablesung, ISODate, Zaehler } from "../types";
import { meterDelta, type MeterDelta } from "./period";

/** Direkt enthaltene (nicht gelöschte) Zähler eines Zählers. */
export function directChildren(zaehler: Zaehler[], zaehlerId: string): Zaehler[] {
  const z = zaehler.find((x) => x.id === zaehlerId);
  if (!z) return [];
  const ids = new Set(z.enthaeltIds);
  return zaehler.filter((x) => ids.has(x.id) && !x.deleted);
}

/**
 * Rekursiv alle Zähler auflösen, die in `zaehlerId` enthalten sind
 * (inklusive der direkten Kinder).
 */
export function resolveContained(
  zaehler: Zaehler[],
  zaehlerId: string,
  besucht = new Set<string>(),
): string[] {
  if (besucht.has(zaehlerId)) return [];
  besucht.add(zaehlerId);
  const out: string[] = [];
  for (const kind of directChildren(zaehler, zaehlerId)) {
    out.push(kind.id);
    out.push(...resolveContained(zaehler, kind.id, besucht));
  }
  return out;
}

/** Alle Zähler-IDs, die in `zaehlerId` enthalten sind (direkt + rekursiv). */
export function containedMeterIds(zaehler: Zaehler[], zaehlerId: string): string[] {
  return resolveContained(zaehler, zaehlerId, new Set<string>());
}

/** Findet einen Zyklus in der Enthalten-Relation (R2, Zyklussicherheit). */
export function findCycle(zaehler: Zaehler[], startId: string): string[] | null {
  const kanten = new Map<string, string[]>();
  for (const z of zaehler) {
    kanten.set(z.id, (z.enthaeltIds ?? []).filter((id) => zaehler.some((k) => k.id === id)));
  }
  const stack: string[] = [];
  const imStack = new Set<string>();
  const besucht = new Set<string>();

  const walk = (id: string): string[] | null => {
    if (imStack.has(id)) {
      const index = stack.indexOf(id);
      return [...stack.slice(index), id];
    }
    if (besucht.has(id)) return null;
    besucht.add(id);
    imStack.add(id);
    stack.push(id);
    for (const kind of kanten.get(id) ?? []) {
      const zyklus = walk(kind);
      if (zyklus) return zyklus;
    }
    stack.pop();
    imStack.delete(id);
    return null;
  };

  return walk(startId);
}

/** Ergebnis der Eigenverbrauchs-Berechnung. */
export interface OwnDelta {
  zaehlerId: string;
  /** Eigenverbrauch = Delta − Summe (Deltas der **direkt** enthaltenen Zähler). */
  own: number | null;
  /** Delta des Zählers selbst. */
  delta: number | null;
  /** IDs der direkt enthaltenen Zähler. */
  directChildIds: string[];
  /** IDs aller enthaltenen Zähler (direkt + rekursiv) – für die Struktur-Anzeige. */
  containedIds: string[];
  /** `true`, wenn Zähler oder enthaltene Zähler unvollständig sind. */
  complete: boolean;
  /** Zähler, die nicht auflösbar waren (fehlende Ablesung). */
  unvollstaendigeIds: string[];
}

/**
 * Berechnet den Eigenverbrauch eines Zählers (R2).
 *
 * `eigener Verbrauch(X) = ΔX − Σ Δ(Y)` über alle **direkt** enthaltenen
 * Zähler. Verschachtelung ist erlaubt (A enthält B, B enthält C): C wird nur
 * einmal – von B – abgezogen, nie doppelt. Dadurch bleibt die Summe über
 * einen Zählerbaum gleich dem Delta der Wurzel.
 *
 * Enthaltene Zähler, deren Periode unvollständig ist, machen das Ergebnis
 * unvollständig (`complete = false`) – es wird nicht abgerechnet.
 */
export function ownDelta(
  ablesungen: Ablesung[],
  zaehler: Zaehler[],
  zaehlerId: string,
  von: ISODate,
  bis: ISODate,
  deltas?: Map<string, MeterDelta>,
): OwnDelta {
  const map = deltas ?? new Map<string, MeterDelta>();
  const getDelta = (id: string): MeterDelta => {
    if (!map.has(id)) {
      const z = zaehler.find((x) => x.id === id);
      map.set(id, meterDelta(ablesungen, id, von, bis, z?.einheit ?? "MWh"));
    }
    return map.get(id) as MeterDelta;
  };

  const eigen = getDelta(zaehlerId);
  const children = directChildren(zaehler, zaehlerId);
  const directChildIds = children.map((c) => c.id);
  const containedIds = containedMeterIds(zaehler, zaehlerId);
  const unvollstaendigeIds: string[] = [];
  let summeEnthalten = 0;

  for (const kind of children) {
    const d = getDelta(kind.id);
    if (!d.complete || d.delta === null) {
      unvollstaendigeIds.push(kind.id);
    } else {
      summeEnthalten += d.delta;
    }
  }

  if (!eigen.complete || eigen.delta === null) {
    return {
      zaehlerId,
      own: null,
      delta: null,
      directChildIds,
      containedIds,
      complete: false,
      unvollstaendigeIds: [zaehlerId, ...unvollstaendigeIds],
    };
  }

  if (unvollstaendigeIds.length > 0) {
    return {
      zaehlerId,
      own: null,
      delta: eigen.delta,
      directChildIds,
      containedIds,
      complete: false,
      unvollstaendigeIds,
    };
  }

  return {
    zaehlerId,
    own: eigen.delta - summeEnthalten,
    delta: eigen.delta,
    directChildIds,
    containedIds,
    complete: true,
    unvollstaendigeIds: [],
  };
}

/** Enthaltene Zähler, die **nicht** separat verteilt werden dürfen. */
export function nonDistributableMeterIds(zaehler: Zaehler[]): Set<string> {
  const gesperrt = new Set<string>();
  for (const z of zaehler) {
    if (z.deleted) continue;
    for (const id of resolveContained(zaehler, z.id, new Set<string>())) {
      gesperrt.add(id);
    }
  }
  return gesperrt;
}
