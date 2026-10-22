import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { datum, formatLocale, geld, zahl } from "../format";

afterEach(async () => {
  await i18n.changeLanguage("de");
});

describe("Anzeigeformatierung", () => {
  it("formatiert Zahlen, Beträge und Daten nach der gewählten Sprache", async () => {
    await i18n.changeLanguage("en");
    expect(formatLocale()).toBe("en-GB");
    expect(zahl(1234.5, 2)).toBe("1,234.5");
    expect(geld(12.5)).toContain("12.50");
    expect(datum("2026-01-15")).toBe("15/01/2026");
  });

  it("behält deutsche Formate als Standardsprache", async () => {
    await i18n.changeLanguage("de");
    expect(formatLocale()).toBe("de-DE");
    expect(zahl(1234.5, 2)).toBe("1.234,5");
    expect(geld(12.5)).toMatch(/12,50\s€/u);
    expect(datum("2026-01-15")).toBe("15.01.2026");
  });
});
