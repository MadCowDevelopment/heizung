import { describe, expect, it } from "vitest";

import { buildSettlement, freezeSettlement, settlement } from "../calc/settlement";
import { DEFAULT_EINSTELLUNGEN, type AppState, type Zahlung } from "../types";
import { IDS, PERIODE, ablesungen, bewohner, preis, state, zaehler } from "./fixtures";

/** Referenz-Zustand mit Preisen und Zahlungen. */
function referenz(zahlung: Zahlung[] = []): AppState {
  return state({ preis: preis(), zahlung });
}

const posA = (s: ReturnType<typeof buildSettlement>) =>
  s.positionen.find((p) => p.bewohnerId === IDS.bewohnerA);
const posB = (s: ReturnType<typeof buildSettlement>) =>
  s.positionen.find((p) => p.bewohnerId === IDS.bewohnerB);

describe("Abrechnung – Referenzszenario (Ende zu Ende)", () => {
  it("verteilt 3 MWh im Verhältnis 2 m³ : 1 m³ auf die Bewohner", () => {
    const s = buildSettlement(referenz(), PERIODE);
    expect(posA(s)?.energieMWh).toBeCloseTo(2, 6);
    expect(posB(s)?.energieMWh).toBeCloseTo(1, 6);
  });

  it("weist den eigenen Wasserverbrauch direkt zu", () => {
    const s = buildSettlement(referenz(), PERIODE);
    expect(posA(s)?.wasserWarmM3).toBeCloseTo(2, 6);
    expect(posA(s)?.wasserKaltM3).toBeCloseTo(1, 6);
    expect(posB(s)?.wasserWarmM3).toBeCloseTo(1, 6);
    expect(posB(s)?.wasserKaltM3).toBeCloseTo(1, 6);
  });

  it("berechnet die theoretischen Kosten (R4)", () => {
    const s = buildSettlement(referenz(), PERIODE);
    // 2 MWh × 0,10 €/MWh = 0,20 €; 1 MWh × 0,10 €/MWh = 0,10 €
    expect(posA(s)?.kostenTheoretisch).toBeCloseTo(0.2, 6);
    expect(posB(s)?.kostenTheoretisch).toBeCloseTo(0.1, 6);
    expect(s.theoretischGesamt).toBeCloseTo(0.3, 6);
  });

  it("verwendet den eingestellten Standardpreis vor der ersten Preisstufe", () => {
    const daten = state({
      preis: [],
      einstellungen: {
        ...DEFAULT_EINSTELLUNGEN,
        preisMWhDefault: 0.25,
      },
    });
    const ergebnis = buildSettlement(daten, PERIODE);
    expect(ergebnis.theoretischGesamt).toBeCloseTo(0.75, 6);
    expect(posA(ergebnis)?.kostenTheoretisch).toBeCloseTo(0.5, 6);
    expect(posB(ergebnis)?.kostenTheoretisch).toBeCloseTo(0.25, 6);
  });

  it("verwendet ohne Betreiberbetrag die theoretischen Kosten (Vorschau)", () => {
    const s = buildSettlement(referenz(), PERIODE);
    expect(s.betreiberBetrag).toBeCloseTo(0.3, 6);
    expect(s.preisabweichung).toBeCloseTo(0, 6);
  });

  it("verteilt den Betreiberbetrag anteilig (R5)", () => {
    const s = buildSettlement(referenz(), { ...PERIODE, betreiberBetrag: 300 });
    expect(posA(s)?.rechnungsbetrag).toBeCloseTo(200, 6);
    expect(posB(s)?.rechnungsbetrag).toBeCloseTo(100, 6);
    expect(s.verteiltGesamt).toBeCloseTo(300, 6);
  });

  it("weist die Preisabweichung aus (R5)", () => {
    const s = buildSettlement(referenz(), { ...PERIODE, betreiberBetrag: 350 });
    expect(s.preisabweichung).toBeCloseTo(349.7, 6);
    expect(s.verteiltGesamt).toBeCloseTo(350, 6);
  });

  it("summiert die verteilten Beträge exakt auf den Betreiberbetrag (R7)", () => {
    for (const betrag of [100, 333.33, 999.99, 1234.57]) {
      const s = buildSettlement(referenz(), { ...PERIODE, betreiberBetrag: betrag });
      const summe = s.positionen.reduce((sum, p) => sum + p.rechnungsbetrag, 0);
      expect(Math.round(summe * 100)).toBe(Math.round(betrag * 100));
    }
  });

  it("berechnet den Saldo aus gezahlten Abschlägen (R6)", () => {
    const zahlung: Zahlung[] = [
      {
        id: "z1",
        bewohnerId: IDS.bewohnerA,
        betrag: 100,
        faelligAm: "2025-06-30",
        bezahltAm: "2025-06-28",
      },
    ];
    const s = buildSettlement(referenz(zahlung), { ...PERIODE, betreiberBetrag: 300 });
    expect(posA(s)?.summeAbschlaege).toBeCloseTo(100, 6);
    expect(posA(s)?.saldo).toBeCloseTo(100, 6);
    expect(posB(s)?.summeAbschlaege).toBeCloseTo(0, 6);
    expect(posB(s)?.saldo).toBeCloseTo(100, 6);
  });

  it("rechnet offene Abschläge nicht gegen den Saldo, sondern weist sie aus (R6)", () => {
    const zahlung: Zahlung[] = [
      {
        id: "z2",
        bewohnerId: IDS.bewohnerB,
        betrag: 50,
        faelligAm: "2025-09-30",
        bezahltAm: null,
      },
    ];
    const s = buildSettlement(referenz(zahlung), { ...PERIODE, betreiberBetrag: 300 });
    expect(posB(s)?.summeAbschlaege).toBeCloseTo(0, 6);
    expect(posB(s)?.saldo).toBeCloseTo(100, 6);
    expect(posB(s)?.hinweise.map((h) => h.code)).toContain("abrechnung.offeneAbschlaege");
    expect(posB(s)?.hinweise.find((h) => h.code === "abrechnung.offeneAbschlaege")?.params).toMatchObject({
      betrag: 50,
    });
  });

  it("rechnet Zahlungen dem Jahr von `bezahltAm` zu (R6)", () => {
    const zahlung: Zahlung[] = [
      {
        id: "z3",
        bewohnerId: IDS.bewohnerA,
        betrag: 42,
        faelligAm: "2025-03-01",
        bezahltAm: "2026-01-05",
      },
    ];
    const s = buildSettlement(referenz(zahlung), PERIODE);
    expect(posA(s)?.summeAbschlaege).toBeCloseTo(0, 6);
  });

  it("verteilt bei Schlüssel `warm+kalt` nach der Summe aus Warm- und Kaltwasser", () => {
    const s = buildSettlement(referenz(), { ...PERIODE, verteilSchluessel: "warm+kalt" });
    // A: 2 + 1 = 3 l-Basis, B: 1 + 1 = 2 l-Basis → 1,8 MWh / 1,2 MWh
    expect(posA(s)?.energieMWh).toBeCloseTo(1.8, 6);
    expect(posB(s)?.energieMWh).toBeCloseTo(1.2, 6);
  });

  it("verwendet den Verteilungs-Schlüssel aus den Einstellungen", () => {
    const s = state();
    s.einstellungen.verteilSchluessel = "kalt";
    const e = buildSettlement(s, PERIODE);
    // Kaltwasser: A 1 m³, B 1 m³ → 1,5 MWh / 1,5 MWh
    expect(e.positionen[0].energieMWh).toBeCloseTo(1.5, 6);
    expect(e.positionen[1].energieMWh).toBeCloseTo(1.5, 6);
  });

  it("meldet unvollständige Zähler und rechnet sie nicht ab", () => {
    const s = referenz();
    // Startablesung des Kaltwasserzählers Anna entfernen.
    s.ablesung = s.ablesung.filter(
      (a) => !(a.zaehlerId === IDS.zaehlerKaltA && a.datum === "2024-12-31"),
    );
    const e = buildSettlement(s, PERIODE);
    expect(e.unvollstaendig).toBe(true);
    expect(e.globaleHinweise.map((h) => h.code)).toContain("abrechnung.zaehlerUnvollstaendig");
  });

  it("ist ohne blockierende Plausibilitätswarnung abschließbar", () => {
    const e = buildSettlement(referenz(), PERIODE);
    expect(e.abschliessbar).toBe(true);
    expect(e.plausibilitaet.hinweise).toHaveLength(0);
  });

  it("blockiert bei einem negativen Verbrauch (R8)", () => {
    const s = referenz();
    const zaehlerEnergie = s.zaehler.find((z) => z.id === IDS.zaehlerEnergie);
    const abl = s.ablesung.find(
      (a) => a.zaehlerId === IDS.zaehlerEnergie && a.datum === "2025-12-31",
    );
    if (zaehlerEnergie && abl) abl.stand = 8; // 8 MWh < 10 MWh Startstand
    const e = buildSettlement(s, PERIODE);
    expect(e.plausibilitaet.blockiert).toBe(true);
    expect(e.abschliessbar).toBe(false);
  });

  it("rechnet einen Zählerbaum ohne Doppelabzug (R2)", () => {
    const s = state({ preis: preis() });
    // Gemeinschafts- Energiezähler enthält den Energiezähler von Anna.
    const energieA: AppState["zaehler"][number] = {
      id: "z-energie-a",
      bezeichnung: "Heizung Anna",
      typ: "energie",
      einheit: "MWh",
      bewohnerId: IDS.bewohnerA,
      enthaeltIds: [],
      aktiv: true,
    };
    s.zaehler = [...zaehler(), energieA];
    s.zaehler[0].enthaeltIds = [energieA.id];
    s.ablesung = [
      ...ablesungen(),
      { id: "a-e-a-0", zaehlerId: energieA.id, datum: "2024-12-31", stand: 1, unsicher: false },
      { id: "a-e-a-1", zaehlerId: energieA.id, datum: "2025-12-31", stand: 2, unsicher: false },
    ];
    const e = buildSettlement(s, PERIODE);
    // Gemeinschaft 3 MWh − 1 MWh (Anna) = 2 MWh Eigenverbrauch → Pool
    // Anna: 1 MWh direkt + 2/3 × 2 MWh = 2,333… MWh
    expect(e.gemeinschaft.energieKwh).toBeCloseTo(2000, 6);
    // Die Position wird auf 3 Nachkommastellen gerundet (R0-Anzeige).
    expect(posA(e)?.energieMWh).toBeCloseTo(1 + 2000 * (2 / 3) / 1000, 3);
  });

  it("friert die Positionen für die Abrechnung ein (R10)", () => {
    const e = buildSettlement(referenz(), { ...PERIODE, betreiberBetrag: 300 });
    const eingefroren = freezeSettlement(e, "ab-2025", "Hinweis des Betreibers");
    expect(eingefroren.id).toBe("ab-2025");
    expect(eingefroren.jahr).toBe(2025);
    expect(eingefroren.status).toBe("entwurf");
    expect(eingefroren.betreiberHinweis).toBe("Hinweis des Betreibers");
    expect(eingefroren.positionen).toHaveLength(2);
    // Änderungen am Ergebnis berühren die eingefrorene Abrechnung nicht.
    e.positionen[0].rechnungsbetrag = 999;
    expect(eingefroren.positionen[0].rechnungsbetrag).toBeCloseTo(200, 6);
  });
});

describe("R6 – Saldo auf Einzelsummenebene", () => {
  it("berechnet Nachzahlung und Auszahlung", () => {
    const verteilt = new Map([
      ["a", 100],
      ["b", 50],
    ]);
    const zahlungen = [
      { bewohnerId: "a", betrag: 40 },
      { bewohnerId: "b", betrag: 80 },
    ];
    const salden = settlement(verteilt, zahlungen);
    expect(salden.get("a")).toEqual({ saldoCents: 6000, nachzahlung: true, auszahlung: false });
    expect(salden.get("b")).toEqual({ saldoCents: -3000, nachzahlung: false, auszahlung: true });
  });
});

describe("Datenmodell – Stammdaten", () => {
  it("hält die Bewohnerliste aktiv", () => {
    expect(bewohner().every((b) => b.aktiv)).toBe(true);
  });
});
