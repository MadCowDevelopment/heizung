/**
 * R3 – Verteilung der Energie auf die Bewohner.
 *
 * Grundsatz: Die Energie wird **proportional zum Wasserverbrauch** verteilt
 * (`anteil_i = wasser_i / Σ wasser`).
 *
 * Verteilungs-Schlüssel (`verteilSchluessel`):
 *  - `warm`      (Vorgabe): Warmwasser je Bewohner.
 *  - `warm+kalt`: Warmwasser + Kaltwasser.
 *  - `kalt`:      Kaltwasser.
 *
 * Sonderfälle (docs/requirements.md R3):
 *  - Bewohner ohne Zähler des aktiven Schlüssels → Rückfall auf den
 *    *anderen* Wasserzähler, sichtbar gekennzeichnet (kein stiller Ausschluss).
 *  - `Σ wasser = 0` → keine Verteilungsbasis: Administratorfrage, Vorschlag
 *    gleichmäßige Aufteilung (mit sichtbarem Hinweis).
 */

import type { Bewohner, FachMeldung, VerteilSchluessel, Zaehler } from "../types";
import { roundTo } from "./units";

/** Wasserverbrauch eines Bewohners in Litern. */
export interface WasserVerbrauch {
  bewohnerId: string;
  warmL: number;
  kaltL: number;
  /** Bewohner hat einen Warmwasserzähler (unabhängig von der Periode). */
  hatWarmZaehler: boolean;
  /** Bewohner hat einen Kaltwasserzähler. */
  hatKaltZaehler: boolean;
  /** Warmwasserzähler hat in der Periode einen auswertbaren Wert. */
  hatWarmWert: boolean;
  /** Kaltwasserzähler hat in der Periode einen auswertbaren Wert. */
  hatKaltWert: boolean;
}

/** Ergebnis der Verteilung. */
export interface VerteilungsErgebnis {
  /** Energieanteil je Bewohner in kWh. */
  anteile: Map<string, number>;
  /** Anteil in Prozent (Summe = 100, auf 2 Nachkommastellen). */
  prozente: Map<string, number>;
  /** Je Bewohner sichtbare Hinweise (sprachneutrale Codes + Parameter). */
  hinweise: Map<string, FachMeldung[]>;
  /** Summe der Verteilungsbasis (Liter). */
  summeSchluessel: number;
  /** `true`, wenn statt des Verteilungs-Schlüssels gleichmäßig verteilt wurde. */
  gleichverteilung: boolean;
  /** `true`, wenn eine Administratorfrage nötig ist (Σ wasser = 0). */
  administratorfrage: boolean;
}

/** Ermittelt den Wasserverbrauch je Bewohner aus den Zählern. */
export function wasserJeBewohner(
  zaehler: Zaehler[],
  deltaVonMeter: Map<string, number>,
): WasserVerbrauch[] {
  const map = new Map<string, WasserVerbrauch>();
  for (const z of zaehler) {
    if (z.deleted || !z.bewohnerId) continue;
    if (z.typ !== "wasser_warm" && z.typ !== "wasser_kalt") continue;
    const eintrag = map.get(z.bewohnerId) ?? {
      bewohnerId: z.bewohnerId,
      warmL: 0,
      kaltL: 0,
      hatWarmZaehler: false,
      hatKaltZaehler: false,
      hatWarmWert: false,
      hatKaltWert: false,
    };
    const delta = deltaVonMeter.get(z.id);
    if (z.typ === "wasser_warm") {
      eintrag.hatWarmZaehler = true;
      if (delta !== undefined) {
        eintrag.warmL += delta;
        eintrag.hatWarmWert = true;
      }
    } else {
      eintrag.hatKaltZaehler = true;
      if (delta !== undefined) {
        eintrag.kaltL += delta;
        eintrag.hatKaltWert = true;
      }
    }
    map.set(z.bewohnerId, eintrag);
  }
  return [...map.values()];
}

/** Ergebnis der Schlüssel-Berechnung. */
export interface SchluesselErgebnis {
  wert: number;
  /** `true`, wenn auf den anderen Wasserzähler umgeschaltet wurde. */
  fallback: boolean;
}

/**
 * Wert des Verteilungs-Schlüssels je Bewohner.
 *
 * Hat ein Bewohner im Zeitraum keinen Zähler des aktiven Schlüssels, wird auf
 * den anderen Wasserzähler umgeschaltet (R3-Sonderfall).
 */
export function schluesselWert(
  verbrauch: WasserVerbrauch,
  verteilSchluessel: VerteilSchluessel,
): SchluesselErgebnis {
  switch (verteilSchluessel) {
    case "warm": {
      if (verbrauch.hatWarmWert) return { wert: verbrauch.warmL, fallback: false };
      if (verbrauch.hatKaltWert) return { wert: verbrauch.kaltL, fallback: true };
      return { wert: 0, fallback: false };
    }
    case "kalt": {
      if (verbrauch.hatKaltWert) return { wert: verbrauch.kaltL, fallback: false };
      if (verbrauch.hatWarmWert) return { wert: verbrauch.warmL, fallback: true };
      return { wert: 0, fallback: false };
    }
    case "warm+kalt":
    default:
      return { wert: verbrauch.warmL + verbrauch.kaltL, fallback: false };
  }
}

/**
 * Verteilt `energieKwh` auf die Bewohner.
 *
 * @param energieKwh  zu verteilende Energie (Eigenverbrauch + gemischte Zähler)
 * @param verbrauch   Wasserverbrauch je Bewohner
 */
export function distributeEnergy(
  energieKwh: number,
  verbrauch: WasserVerbrauch[],
  verteilSchluessel: VerteilSchluessel = "warm",
): VerteilungsErgebnis {
  const anteile = new Map<string, number>();
  const prozente = new Map<string, number>();
  const hinweise = new Map<string, FachMeldung[]>();
  const aktive = verbrauch.filter((v) => v.bewohnerId);

  for (const v of aktive) {
    anteile.set(v.bewohnerId, 0);
    prozente.set(v.bewohnerId, 0);
    hinweise.set(v.bewohnerId, []);
  }

  const werte = aktive.map((v) => {
    const { wert, fallback } = schluesselWert(v, verteilSchluessel);
    if (fallback) {
      // Der Rückfall-Zähler hängt vom aktiven Verteilungs-Schlüssel ab.
      const code =
        verteilSchluessel === "warm" ? "verteilung.fallbackKalt" : "verteilung.fallbackWarm";
      hinweise.get(v.bewohnerId)?.push({ code });
    }
    return { bewohnerId: v.bewohnerId, wert, fallback };
  });

  const summe = werte.reduce((acc, w) => acc + Math.max(0, w.wert), 0);

  if (summe <= 0) {
    // Keine Verteilungsbasis → Administratorfrage, Vorschlag: gleiche Verteilung.
    const n = werte.length;
    for (const w of werte) {
      anteile.set(w.bewohnerId, n > 0 ? energieKwh / n : 0);
      prozente.set(w.bewohnerId, n > 0 ? roundTo(100 / n, 2) : 0);
      hinweise
        .get(w.bewohnerId)
        ?.push({ code: "verteilung.administratorfrage" });
    }
    return {
      anteile,
      prozente,
      hinweise,
      summeSchluessel: 0,
      gleichverteilung: true,
      administratorfrage: true,
    };
  }

  for (const w of werte) {
    const anteil = energieKwh * (Math.max(0, w.wert) / summe);
    anteile.set(w.bewohnerId, anteil);
    prozente.set(w.bewohnerId, roundTo((Math.max(0, w.wert) / summe) * 100, 2));
  }

  return {
    anteile,
    prozente,
    hinweise,
    summeSchluessel: summe,
    gleichverteilung: false,
    administratorfrage: false,
  };
}

/** Bewohner, die für die Verteilung berücksichtigt werden (aktiv, mit Zählern). */
export function verteilnehmer(bewohner: Bewohner[], zaehler: Zaehler[]): Bewohner[] {
  const ids = new Set(
    zaehler.filter((z) => !z.deleted && z.bewohnerId).map((z) => z.bewohnerId as string),
  );
  return bewohner.filter((b) => !b.deleted && b.aktiv && ids.has(b.id));
}
