import { describe, expect, it } from "vitest";

import { meldeText } from "../meldung";
import { de } from "../de";
import { en } from "../en";
import { MELDUNGS_CODES, type FachMeldung } from "../../domain/types";

/** Alle Blatt-Schlüssel eines Katalogs (flach, mit `abschnitt.schluessel`). */
function blattSchluessel(katalog: Record<string, unknown>, praefix = ""): string[] {
  const out: string[] = [];
  for (const [schluessel, wert] of Object.entries(katalog)) {
    const pfad = praefix ? `${praefix}.${schluessel}` : schluessel;
    if (wert && typeof wert === "object") {
      out.push(...blattSchluessel(wert as Record<string, unknown>, pfad));
    } else {
      out.push(pfad);
    }
  }
  return out.sort();
}

describe("i18n – Meldungskataloge", () => {
  it("hat in beiden Katalogen dieselben Schlüssel", () => {
    expect(blattSchluessel(en)).toEqual(blattSchluessel(de));
  });

  it("kennt jeden Meldungscode in beiden Katalogen", () => {
    for (const code of MELDUNGS_CODES) {
      expect(de, `de fehlt ${code}`).toHaveProperty(code);
      expect(en, `en fehlt ${code}`).toHaveProperty(code);
    }
  });

  it("löst eine Meldung mit Parameter auf", () => {
    const meldung: FachMeldung = {
      code: "csv.unbekannterZaehler",
      params: { name: "gibtsnicht" },
    };
    expect(meldeText(meldung)).toBe("Unbekannter Zähler „gibtsnicht“.");
  });

  it("formatiert Zahlen nach de-DE", () => {
    const meldung: FachMeldung = {
      code: "plausibilitaet.negativ",
      params: { name: "Heizung", wert: -6000 },
    };
    expect(meldeText(meldung)).toContain("6.000,00");
  });

  it("formatiert Beträge als Euro", () => {
    const meldung: FachMeldung = {
      code: "abrechnung.offeneAbschlaege",
      params: { betrag: 50 },
    };
    // de-DE setzt ein geschütztes Leerzeichen vor dem Eurozeichen.
    expect(meldeText(meldung)).toMatch(/50,00\s€/u);
  });

  it("liefert bei unbekanntem Code den Schlüssel selbst", () => {
    expect(meldeText({ code: "unbekannt" as never })).toBe("unbekannt");
  });

  // Der Fallback-Code benennt den Zähler, auf den zurückgefallen wurde.
  // Diese Zuordnung war einmal vertauscht – der Test verhindert das.
  it("nennt im Fallback-Text den Zähler, den der Code benennt", () => {
    expect(meldeText({ code: "verteilung.fallbackKalt" })).toContain("Kaltwasser");
    expect(meldeText({ code: "verteilung.fallbackKalt" })).not.toContain("Warmwasser");
    expect(meldeText({ code: "verteilung.fallbackWarm" })).toContain("Warmwasser");
    expect(meldeText({ code: "verteilung.fallbackWarm" })).not.toContain("Kaltwasser");
  });
});
