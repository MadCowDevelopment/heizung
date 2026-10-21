import { describe, expect, it } from "vitest";

import {
  ImportFehler,
  exportDateiname,
  exportiereJson,
  importiereJson,
  looksLikeState,
} from "../io/json";
import { SCHEMA_VERSION } from "../types";
import { ablesungen, bewohner, preis, state, zaehler } from "./fixtures";

describe("JSON – Export/Import des Gesamt-Zustands", () => {
  it("exportiert den Zustand mit schemaVersion", () => {
    const json = exportiereJson(state());
    const obj = JSON.parse(json);
    expect(obj.schemaVersion).toBe(SCHEMA_VERSION);
    expect(obj.bewohner).toHaveLength(2);
  });

  it("round-trip: Export → Import liefert denselben Zustand", () => {
    const original = state({ preis: preis() });
    const roundtrip = importiereJson(exportiereJson(original));
    expect(roundtrip.bewohner).toEqual(original.bewohner);
    expect(roundtrip.zaehler).toEqual(original.zaehler);
    expect(roundtrip.ablesung).toEqual(original.ablesung);
    expect(roundtrip.preis).toEqual(original.preis);
    expect(roundtrip.einstellungen).toEqual(original.einstellungen);
    expect(roundtrip.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("behält gelöschte Datensätze bei", () => {
    const s = state();
    s.bewohner[0].deleted = true;
    const roundtrip = importiereJson(exportiereJson(s));
    expect(roundtrip.bewohner[0].deleted).toBe(true);
  });

  it("lehnt ein ungültiges JSON ab", () => {
    expect(() => importiereJson("{kein json")).toThrow(ImportFehler);
  });

  it("lehnt ein Array ab", () => {
    expect(() => importiereJson("[]")).toThrow(ImportFehler);
  });

  it("lehnt eine neuere schemaVersion ab", () => {
    const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, bewohner: [] });
    let fehler: unknown;
    try {
      importiereJson(json);
    } catch (e) {
      fehler = e;
    }
    expect(fehler).toBeInstanceOf(ImportFehler);
    expect((fehler as ImportFehler).meldung.code).toBe("json.schemaVersion");
    expect((fehler as ImportFehler).meldung.params).toMatchObject({
      datei: SCHEMA_VERSION + 1,
      appVersion: SCHEMA_VERSION,
    });
  });

  it("füllt fehlende Sektionen mit Defaults", () => {
    const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION, bewohner: bewohner() });
    const s = importiereJson(json);
    expect(s.bewohner).toHaveLength(2);
    expect(s.zaehler).toEqual([]);
    expect(s.ablesung).toEqual([]);
    expect(s.einstellungen.verteilSchluessel).toBe("warm");
    expect(s.einstellungen.waehrung).toBe("EUR");
  });

  it("erkennt einen Zustand", () => {
    expect(looksLikeState({ bewohner: [] })).toBe(true);
    expect(looksLikeState({ nichts: true })).toBe(false);
    expect(looksLikeState(null)).toBe(false);
  });

  it("erzeugt einen Dateinamen mit Datum", () => {
    expect(exportDateiname(state())).toMatch(/^heizung-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(exportDateiname(state(), "csv")).toMatch(/\.csv$/);
  });

  it("erhält alle Sektionen des Referenz-Zustands", () => {
    const s = state({ preis: preis() });
    s.zaehler = zaehler();
    s.ablesung = ablesungen();
    const roundtrip = importiereJson(exportiereJson(s));
    expect(roundtrip.zaehler).toHaveLength(5);
    expect(roundtrip.ablesung).toHaveLength(10);
  });
});
