import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_EINSTELLUNGEN, type Abrechnung } from "../../domain/types";
import { abrechnungAlsPdf } from "../pdf";

const abrechnung: Abrechnung = {
  id: "abrechnung-2025",
  jahr: 2025,
  von: "2025-01-01",
  bis: "2025-12-31",
  betreiberBetrag: 320,
  betreiberHinweis: "Für die gemeinschaftliche Wärmeversorgung",
  status: "entwurf",
  positionen: [
    {
      bewohnerId: "b-anna",
      bewohnerName: "Anna Müller",
      wasserWarmM3: 12.345,
      wasserKaltM3: 5.678,
      energieMWh: 2.5,
      kostenTheoretisch: 180,
      anteilProzent: 56.25,
      rechnungsbetrag: 180,
      summeAbschlaege: 150,
      saldo: 30,
      hinweise: [],
    },
    {
      bewohnerId: "b-bert",
      bewohnerName: "Bert",
      wasserWarmM3: 8,
      wasserKaltM3: 3,
      energieMWh: 1.5,
      kostenTheoretisch: 140,
      anteilProzent: 43.75,
      rechnungsbetrag: 140,
      summeAbschlaege: 160,
      saldo: -20,
      hinweise: [],
    },
  ],
};

describe("Abrechnungs-PDF", () => {
  it("erzeugt ein Sammel-PDF mit einer Seite je Bewohner", async () => {
    const bytes = await abrechnungAlsPdf(abrechnung, {
      ...DEFAULT_EINSTELLUNGEN,
      objektName: "Haus Müller",
      ansprechpartner: "Änne",
    });
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getPageCount()).toBe(2);
  });

  it("erzeugt ein Einzel-PDF nur für den ausgewählten Bewohner", async () => {
    const bytes = await abrechnungAlsPdf(abrechnung, DEFAULT_EINSTELLUNGEN, "b-anna");
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(1);
  });

  it("meldet fehlende Einzelpositionen explizit", async () => {
    await expect(abrechnungAlsPdf(abrechnung, DEFAULT_EINSTELLUNGEN, "unbekannt"))
      .rejects.toThrow("Für diese Abrechnung gibt es keine Positionen.");
  });
});
