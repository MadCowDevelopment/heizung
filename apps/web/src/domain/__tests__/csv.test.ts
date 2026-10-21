import { describe, expect, it } from "vitest";

import {
  detectTrennzeichen,
  exportiereAblesungen,
  idAus,
  importiereStartablesungen,
  normalisiereSpalte,
  parseCsv,
  parseDatum,
  parseZahl,
} from "../io/csv";
import { IDS, ablesungen, zaehler } from "./fixtures";

describe("R11 – CSV-Import von Startablesungen", () => {
  it("erkennt das Trennzeichen", () => {
    expect(detectTrennzeichen("a;b;c\n1;2;3")).toBe(";");
    expect(detectTrennzeichen("a,b,c\n1,2,3")).toBe(",");
    expect(detectTrennzeichen("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("normalisiert Spaltennamen", () => {
    expect(normalisiereSpalte("Zähler-ID")).toBe("zahlerid");
    expect(normalisiereSpalte("  Stand ")).toBe("stand");
    expect(normalisiereSpalte("Straße")).toBe("strasse");
  });

  it("liest Dezimalkomma und Dezimalpunkt", () => {
    expect(parseZahl("1.234,5")).toBe(1234.5);
    expect(parseZahl("12,5")).toBe(12.5);
    expect(parseZahl("12.5")).toBe(12.5);
    expect(parseZahl("")).toBeNull();
    expect(parseZahl("abc")).toBeNull();
  });

  it("liest Datumsformate", () => {
    expect(parseDatum("2025-01-31")).toBe("2025-01-31");
    expect(parseDatum("31.01.2025")).toBe("2025-01-31");
    expect(parseDatum("31.1.2025")).toBe("2025-01-31");
    expect(parseDatum("2025/01/31")).toBe("2025-01-31");
    expect(parseDatum("kein Datum")).toBeNull();
  });

  it("importiert Startablesungen mit Semikolon", () => {
    const csv = [
      "Zähler;Datum;Stand",
      `${IDS.zaehlerEnergie};31.12.2024;10`,
      `${IDS.zaehlerEnergie};31.12.2025;13`,
    ].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.fehler).toHaveLength(0);
    expect(ergebnis.trennzeichen).toBe(";");
    expect(ergebnis.ablesungen).toHaveLength(2);
    expect(ergebnis.ablesungen[0]).toMatchObject({
      zaehlerId: IDS.zaehlerEnergie,
      datum: "2024-12-31",
      stand: 10,
      unsicher: false,
    });
  });

  it("importiert mit Komma und Dezimalkomma", () => {
    const csv = ["Zaehler,Datum,Stand", `${IDS.zaehlerWarmA},31.12.2024,5,5`].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.fehler).toHaveLength(0);
    expect(ergebnis.ablesungen[0].stand).toBe(5);
  });

  it("findet Zähler über die Bezeichnung", () => {
    const csv = ["Zähler;Datum;Stand", "Heizung gesamt;31.12.2024;10"].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.fehler).toHaveLength(0);
    expect(ergebnis.ablesungen[0].zaehlerId).toBe(IDS.zaehlerEnergie);
  });

  it("meldet unbekannte Zähler als Fehler", () => {
    const csv = ["Zähler;Datum;Stand", "gibtsnicht;31.12.2024;10"].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.ablesungen).toHaveLength(0);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0].grund).toMatch(/Unbekannter Zähler/);
    expect(ergebnis.fehler[0].zeile).toBe(2);
  });

  it("meldet ein ungültiges Datum als Fehler", () => {
    const csv = ["Zähler;Datum;Stand", `${IDS.zaehlerEnergie};31.02.2025;10`].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0].grund).toMatch(/Datum/);
  });

  it("meldet einen fehlenden Stand als Fehler", () => {
    const csv = ["Zähler;Datum", `${IDS.zaehlerEnergie};31.12.2024`].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0].grund).toMatch(/Stand/);
  });

  it("erzeugt eindeutige IDs aus (Zähler, Datum)", () => {
    const csv = [
      "Zähler;Datum;Stand",
      `${IDS.zaehlerEnergie};31.12.2024;10`,
      `${IDS.zaehlerEnergie};31.12.2025;13`,
    ].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler());
    const ids = ergebnis.ablesungen.map((a) => a.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("respektiert eine Bestätigungs-Callback", () => {
    const csv = ["Zähler;Datum;Stand", `${IDS.zaehlerEnergie};31.12.2024;10`].join("\n");
    const ergebnis = importiereStartablesungen(csv, zaehler(), () => false);
    expect(ergebnis.ablesungen).toHaveLength(0);
    expect(ergebnis.fehler[0].grund).toMatch(/Überschrieben/);
  });

  it("exportiert Ablesungen als CSV und liest sie wieder ein", () => {
    const csv = exportiereAblesungen(ablesungen());
    expect(csv.split("\r\n")).toHaveLength(11);
    const { zeilen, spalten } = parseCsv(csv);
    expect(spalten).toContain("zaehlerid");
    expect(zeilen).toHaveLength(10);
  });

  it("erzeugt stabile IDs aus Text", () => {
    expect(idAus("Heizung gesamt", "z")).toBe("z-heizung-gesamt");
  });
});
