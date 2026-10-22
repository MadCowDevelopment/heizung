/**
 * R5/R6/R7 – Jahresabrechnung.
 *
 * Ablauf:
 *  1. R1: Deltas je Zähler bestimmen.
 *  2. R2: Eigenverbrauch je Zähler (enthaltene Zähler herausrechnen).
 *  3. Direktzuordnung: Zähler mit `bewohnerId` werden dem Bewohner gutgeschrieben.
 *  4. R3: Gemeinschaftsverbrauch (Energie / Warmwasser) proportional zum
 *     Wasserverbrauch auf die Bewohner verteilen.
 *  5. R4: Theoretische Kosten je Bewohner (mit R9-Preisstufen).
 *  6. R5: Betreiberbetrag nach theoretischem Kostenanteil verteilen.
 *  7. R7: Rundung per Largest-Remainder → Summe == Gesamtbetrag, exakt.
 *  8. R6: Saldo = verteilter Betrag − gezahlte Abschläge im Jahr.
 */

import type {
  Abrechnung,
  AbrechnungsPosition,
  AppState,
  FachMeldung,
  ISODate,
  VerteilSchluessel,
} from "../types";
import { compareDate } from "./dates";
import { ownDelta } from "./contains";
import { distributeEnergy, wasserJeBewohner, type WasserVerbrauch } from "./distribute";
import { energieKosten, wasserKosten } from "./costs";
import { meterDeltas, type MeterDelta } from "./period";
import { allocateEuro } from "./allocate";
import { checkPlausibility, type PlausibilitaetPruefung } from "./plausibility";
import { kwhToMwh, litreToM3, roundTo } from "./units";

/** Parameter der Abrechnungsberechnung. */
export interface SettlementOptionen {
  von: ISODate;
  bis: ISODate;
  /**
   * Betreiberbetrag in Euro (R5). `null`/`undefined` → es wird mit der
   * theoretischen Summe gerechnet (reine Vorschau).
   */
  betreiberBetrag?: number | null;
  /** Verteilungs-Schlüssel (R3), Default aus den Einstellungen. */
  verteilSchluessel?: VerteilSchluessel;
  /** Manuelle Preis-Overrides (R4). */
  preisMWh?: number | null;
  preisM3?: number | null;
}

/** Gemeinschaftsverbrauch (sichtbar, aber nicht verrechnet). */
export interface Gemeinschaftsverbrauch {
  energieKwh: number;
  wasserWarmL: number;
  wasserKaltL: number;
}

/** Ergebnis der Abrechnungsberechnung. */
export interface SettlementErgebnis {
  jahr: number;
  von: ISODate;
  bis: ISODate;
  positionen: AbrechnungsPosition[];
  /** Summe der theoretischen Kosten (R4). */
  theoretischGesamt: number;
  /** Betreiberbetrag (R5). */
  betreiberBetrag: number;
  /** Summe der verteilten Beträge – == `betreiberBetrag` (R7). */
  verteiltGesamt: number;
  /** Differenz Betreiberbetrag − theoretische Kosten (R5, Preisabweichung). */
  preisabweichung: number;
  /** Effektiver Energiepreis der Periode (€/MWh) inkl. R9-Split. */
  effektiverPreisMWh: number;
  /** Effektiver Wasserpreis der Periode (€/m³) inkl. R9-Split. */
  effektiverPreisM3: number;
  /** Globale Hinweise (unvollständige Zähler, Administratorfrage …). */
  globaleHinweise: FachMeldung[];
  /** Plausibilitätsprüfung (R8). */
  plausibilitaet: PlausibilitaetPruefung;
  /** Gemeinschaftsverbrauch. */
  gemeinschaft: Gemeinschaftsverbrauch;
  /** `true`, wenn mindestens ein Zähler unvollständig ist. */
  unvollstaendig: boolean;
  /** `true`, wenn die Abrechnung abgeschlossen werden darf (R8 ohne Freigabe). */
  abschliessbar: boolean;
}

/** IDs der Bewohner, die in der Abrechnung berücksichtigt werden. */
function aktiveBewohnerIds(state: AppState): Set<string> {
  return new Set(
    state.bewohner.filter((b) => !b.deleted && b.aktiv).map((b) => b.id),
  );
}

/**
 * Baut die Jahresabrechnung.
 */
export function buildSettlement(
  state: AppState,
  optionen: SettlementOptionen,
): SettlementErgebnis {
  const { von, bis } = optionen;
  const verteilSchluessel =
    optionen.verteilSchluessel ?? state.einstellungen.verteilSchluessel ?? "warm";
  const zaehler = state.zaehler.filter((z) => !z.deleted);
  const globaleHinweise: FachMeldung[] = [];

  // --- R1: Deltas -------------------------------------------------------
  const deltas: Map<string, MeterDelta> = meterDeltas(state.ablesung, zaehler, von, bis);

  // --- R2: Eigenverbrauch ----------------------------------------------
  const eigen = new Map<string, number>();
  const unvollstaendigIds = new Set<string>();
  for (const z of zaehler) {
    const o = ownDelta(state.ablesung, zaehler, z.id, von, bis, deltas);
    if (o.complete && o.own !== null) {
      eigen.set(z.id, o.own);
    } else {
      for (const id of o.unvollstaendigeIds) unvollstaendigIds.add(id);
    }
  }

  for (const z of zaehler) {
    if (unvollstaendigIds.has(z.id)) {
      globaleHinweise.push({
        code: "abrechnung.zaehlerUnvollstaendig",
        params: { name: z.bezeichnung },
      });
    }
  }

  // --- Gemeinschaftspool & Direktzuordnung ------------------------------
  const bewohnerIds = aktiveBewohnerIds(state);
  const eigenVonMeter = new Map<string, number>();
  const pool = { energieKwh: 0, wasserWarmL: 0, wasserKaltL: 0 };
  const direktEnergie = new Map<string, number>();
  const direktWarm = new Map<string, number>();
  const direktKalt = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, wert: number) => {
    map.set(key, (map.get(key) ?? 0) + wert);
  };

  for (const z of zaehler) {
    const wert = eigen.get(z.id);
    if (wert === undefined) continue;
    eigenVonMeter.set(z.id, wert);

    if (z.bewohnerId && bewohnerIds.has(z.bewohnerId)) {
      // Direktzuordnung (R2): eigener Verbrauch des Bewohners.
      if (z.typ === "energie") add(direktEnergie, z.bewohnerId, wert);
      else if (z.typ === "wasser_warm") add(direktWarm, z.bewohnerId, wert);
      else add(direktKalt, z.bewohnerId, wert);
    } else {
      // Gemeinschaftszähler → Pool (wird über R3 verteilt).
      if (z.typ === "energie") pool.energieKwh += wert;
      else if (z.typ === "wasser_warm") pool.wasserWarmL += wert;
      else pool.wasserKaltL += wert;
    }
  }

  // --- R3: Verteilung des Gemeinschaftsverbrauchs -----------------------
  const verbrauch: WasserVerbrauch[] = wasserJeBewohner(zaehler, eigenVonMeter);
  const verbrauchMap = new Map(verbrauch.map((v) => [v.bewohnerId, v]));

  const verteilEnergie = distributeEnergy(pool.energieKwh, verbrauch, verteilSchluessel);
  const verteilWarm = distributeEnergy(pool.wasserWarmL, verbrauch, verteilSchluessel);

  if (verteilEnergie.administratorfrage) {
    globaleHinweise.push({ code: "abrechnung.keineVerteilungsbasisEnergie" });
  }
  if (verteilWarm.administratorfrage && pool.wasserWarmL > 0) {
    globaleHinweise.push({ code: "abrechnung.keineVerteilungsbasisWarm" });
  }

  // --- R4/R9: Preise ----------------------------------------------------
  // Effektiver Periodenpreis (R9-Split über 1 MWh bzw. 1 m³).
  const effPreisMWh =
    optionen.preisMWh != null
      ? optionen.preisMWh
      : roundTo(energieKosten(state.preis, von, bis, 1000), 6);
  const effPreisM3 =
    optionen.preisM3 != null
      ? optionen.preisM3
      : roundTo(wasserKosten(state.preis, von, bis, 1000), 6);

  // --- Positionen aufbauen ---------------------------------------------
  const positionen: AbrechnungsPosition[] = [];

  for (const b of state.bewohner) {
    if (b.deleted || !b.aktiv) continue;
    if (!bewohnerIds.has(b.id)) continue;

    const verteiltEnergieKwh = verteilEnergie.anteile.get(b.id) ?? 0;
    const verteiltWarmL = verteilWarm.anteile.get(b.id) ?? 0;

    const energieKwh = (direktEnergie.get(b.id) ?? 0) + verteiltEnergieKwh;
    const warmL = (direktWarm.get(b.id) ?? 0) + verteiltWarmL;
    const kaltL = direktKalt.get(b.id) ?? 0;

    const energieMWh = kwhToMwh(energieKwh);
    const wasserWarmM3 = litreToM3(warmL);
    const wasserKaltM3 = litreToM3(kaltL);

    const kostenTheoretisch = roundTo(
      energieMWh * effPreisMWh + wasserWarmM3 * effPreisM3 + wasserKaltM3 * effPreisM3,
      2,
    );

    const hinweise: FachMeldung[] = [...(verteilEnergie.hinweise.get(b.id) ?? [])];
    hinweise.push(...(verteilWarm.hinweise.get(b.id) ?? []));
    const v = verbrauchMap.get(b.id);
    if (v && !v.hatWarmWert && !v.hatKaltWert) {
      hinweise.push({ code: "abrechnung.keinEigenerZaehler" });
    }

    positionen.push({
      bewohnerId: b.id,
      bewohnerName: b.name,
      wasserWarmM3: roundTo(wasserWarmM3, 3),
      wasserKaltM3: roundTo(wasserKaltM3, 3),
      energieMWh: roundTo(energieMWh, 3),
      kostenTheoretisch,
      anteilProzent: 0,
      rechnungsbetrag: 0,
      summeAbschlaege: 0,
      saldo: 0,
      hinweise,
    });
  }

  const theoretischGesamt = roundTo(
    positionen.reduce((sum, p) => sum + p.kostenTheoretisch, 0),
    2,
  );

  // --- R5: Betreiberbetrag verteilen -----------------------------------
  const betreiberBetrag =
    optionen.betreiberBetrag == null ? theoretischGesamt : roundTo(optionen.betreiberBetrag, 2);

  const gewichte = positionen.map((p) => ({ id: p.bewohnerId, anteil: p.kostenTheoretisch }));
  const summeGewichte = theoretischGesamt;

  let verteiltBetrag: Map<string, number>;
  if (summeGewichte > 0) {
    verteiltBetrag = allocateEuro(betreiberBetrag, gewichte, summeGewichte);
  } else {
    verteiltBetrag = allocateEuro(
      betreiberBetrag,
      positionen.map((p) => ({ id: p.bewohnerId, anteil: 1 })),
      positionen.length || 1,
    );
    if (positionen.length > 0) {
      globaleHinweise.push({ code: "abrechnung.keineTheoretischenKosten" });
    }
  }

  // --- R6: Abschläge ----------------------------------------------------
  const jahr = Number(von.slice(0, 4));
  const zahlungenImJahr = state.zahlung.filter((z) => {
    if (z.deleted || !bewohnerIds.has(z.bewohnerId)) return false;
    const stichtag = z.bezahltAm ?? z.faelligAm;
    return (
      compareDate(`${jahr}-01-01`, stichtag) <= 0 && compareDate(stichtag, `${jahr}-12-31`) <= 0
    );
  });
  const gezahltJeBewohner = new Map<string, number>();
  const offeneJeBewohner = new Map<string, number>();
  for (const z of zahlungenImJahr) {
    if (z.bezahltAm) add(gezahltJeBewohner, z.bewohnerId, z.betrag);
    else add(offeneJeBewohner, z.bewohnerId, z.betrag);
  }

  // --- Positionen finalisieren -----------------------------------------
  for (const p of positionen) {
    const betrag = verteiltBetrag.get(p.bewohnerId) ?? 0;
    p.rechnungsbetrag = roundTo(betrag, 2);
    p.anteilProzent =
      summeGewichte > 0
        ? roundTo((p.kostenTheoretisch / summeGewichte) * 100, 2)
        : roundTo(100 / Math.max(1, positionen.length), 2);
    const abschlaege = roundTo(gezahltJeBewohner.get(p.bewohnerId) ?? 0, 2);
    p.summeAbschlaege = abschlaege;
    p.saldo = roundTo(p.rechnungsbetrag - abschlaege, 2);
    const offene = offeneJeBewohner.get(p.bewohnerId);
    if (offene) {
      // Der Betrag bleibt eine Zahl; die Formatierung übernimmt die Oberfläche.
      p.hinweise.push({
        code: "abrechnung.offeneAbschlaege",
        params: { betrag: roundTo(offene, 2) },
      });
    }
  }

  const verteiltGesamt = roundTo(
    positionen.reduce((sum, p) => sum + p.rechnungsbetrag, 0),
    2,
  );
  const preisabweichung = roundTo(betreiberBetrag - theoretischGesamt, 2);

  // --- R8: Plausibilität ------------------------------------------------
  const plausibilitaet = checkPlausibility(
    state.ablesung,
    zaehler.map((z) => ({ id: z.id, bezeichnung: z.bezeichnung, einheit: z.einheit })),
    von,
    bis,
  );

  return {
    jahr,
    von,
    bis,
    positionen,
    theoretischGesamt,
    betreiberBetrag,
    verteiltGesamt,
    preisabweichung,
    effektiverPreisMWh: effPreisMWh,
    effektiverPreisM3: effPreisM3,
    globaleHinweise,
    plausibilitaet,
    gemeinschaft: {
      energieKwh: pool.energieKwh,
      wasserWarmL: pool.wasserWarmL,
      wasserKaltL: pool.wasserKaltL,
    },
    unvollstaendig: unvollstaendigIds.size > 0,
    abschliessbar: !plausibilitaet.blockiert,
  };
}

/**
 * R6 auf Einzelsummenebene: Saldo je Bewohner aus Verteilung und Zahlungen.
 */
export function settlement(
  verteilt: Map<string, number>,
  zahlungen: { bewohnerId: string; betrag: number }[],
): Map<string, { saldoCents: number; nachzahlung: boolean; auszahlung: boolean }> {
  const gezahlt = new Map<string, number>();
  for (const z of zahlungen) {
    gezahlt.set(z.bewohnerId, (gezahlt.get(z.bewohnerId) ?? 0) + z.betrag);
  }
  const out = new Map<string, { saldoCents: number; nachzahlung: boolean; auszahlung: boolean }>();
  for (const [id, betrag] of verteilt) {
    const saldoCents =
      Math.round(betrag * 100) - Math.round((gezahlt.get(id) ?? 0) * 100);
    out.set(id, {
      saldoCents,
      nachzahlung: saldoCents > 0,
      auszahlung: saldoCents < 0,
    });
  }
  return out;
}

/**
 * Erzeugt eine eingefrorene Abrechnung (R10 – das PDF nutzt den eingefrorenen Stand).
 */
export function freezeSettlement(
  ergebnis: SettlementErgebnis,
  id: string,
  betreiberHinweis?: string,
): Abrechnung {
  return {
    id,
    jahr: ergebnis.jahr,
    von: ergebnis.von,
    bis: ergebnis.bis,
    betreiberBetrag: ergebnis.betreiberBetrag,
    betreiberHinweis,
    status: "entwurf",
    positionen: ergebnis.positionen.map((p) => ({ ...p, hinweise: [...p.hinweise] })),
    updatedAt: new Date().toISOString(),
  };
}
