/**
 * Tests des Anwendungszustands.
 *
 * Geprüft werden die Regeln, die nur im Zustand gelten: die Eindeutigkeit
 * einer Ablesung je (Zähler, Tag) (R11), die Zyklenprüfung der
 * „enthält"-Relation (R2), der weiche Verlauf und der CSV-Import.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAdapter } from "../../storage/memory";
import { STATE_PFAD, useAppStore } from "../store";
import type { Abrechnung, MeterUnit } from "../../domain/types";

/** Setzt den Store auf einen leeren, mit Memory-Speicher versehenen Zustand. */
async function frischerStore(): Promise<MemoryAdapter> {
  const speicher = new MemoryAdapter();
  await useAppStore.getState().laden(speicher);
  useAppStore.setState({
    state: {
      ...useAppStore.getState().state,
      bewohner: [],
      zaehler: [],
      ablesung: [],
      abschlagPlan: [],
      zahlung: [],
    },
    meldung: null,
    entwurf: null,
  });
  return speicher;
}

/** Legt einen Zähler an. */
function zaehlerAnlegen(
  bezeichnung: string,
  typ: "energie" | "wasser_warm" | "wasser_kalt" = "energie",
) {
  return useAppStore.getState().zaehlerAnlegen({
    bezeichnung,
    typ,
    einheit: (typ === "energie" ? "MWh" : "m3") as MeterUnit,
    bewohnerId: null,
    enthaeltIds: [],
    aktiv: true,
  });
}

describe("Anwendungszustand", () => {
  beforeEach(async () => {
    await frischerStore();
  });

  it("legt Zähler an und ändert sie", () => {
    const id = zaehlerAnlegen("Heizung Keller");
    expect(useAppStore.getState().state.zaehler).toHaveLength(1);
    useAppStore.getState().zaehlerAendern(id, { bezeichnung: "Heizung EG" });
    expect(useAppStore.getState().state.zaehler[0].bezeichnung).toBe("Heizung EG");
  });

  it("deaktiviert Zähler, ohne sie zu löschen", () => {
    const id = zaehlerAnlegen("Altzähler");
    useAppStore.getState().zaehlerDeaktivieren(id, false);
    const z = useAppStore.getState().state.zaehler[0];
    expect(z.aktiv).toBe(false);
    expect(z.deleted).toBeFalsy();
  });

  it("löscht Zähler weich (Verlauf bleibt erhalten)", () => {
    const id = zaehlerAnlegen("Altzähler");
    useAppStore.getState().zaehlerLoeschen(id);
    const z = useAppStore.getState().state.zaehler[0];
    expect(z.deleted).toBe(true);
    expect(z.aktiv).toBe(false);
  });

  it("speichert je (Zähler, Tag) nur eine Ablesung (R11)", () => {
    const id = zaehlerAnlegen("Heizung");
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: id,
      datum: "2026-01-15",
      stand: 100,
      unsicher: false,
    });
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: id,
      datum: "2026-01-15",
      stand: 111,
      unsicher: true,
      notiz: "korrigiert",
    });

    const ablesungen = useAppStore.getState().state.ablesung;
    expect(ablesungen).toHaveLength(1);
    expect(ablesungen[0].stand).toBe(111);
    expect(ablesungen[0].unsicher).toBe(true);
    expect(ablesungen[0].notiz).toBe("korrigiert");
  });

  it("speichert Preisstufen und kann sie aktualisieren oder entfernen", () => {
    const preisId = useAppStore.getState().preisSpeichern({
      gueltigAb: "2026-01-01",
      preisMWh: 0.15,
      preisM3: 0.02,
      notiz: "Jahrespreis",
    });
    expect(useAppStore.getState().state.preis).toHaveLength(1);
    useAppStore.getState().preisSpeichern({
      id: preisId,
      gueltigAb: "2026-01-01",
      preisMWh: 0.2,
      preisM3: 0,
    });
    expect(useAppStore.getState().state.preis).toEqual([
      expect.objectContaining({ id: preisId, preisMWh: 0.2, preisM3: 0 }),
    ]);
    useAppStore.getState().preisLoeschen(preisId);
    expect(useAppStore.getState().state.preis[0]).toMatchObject({ id: preisId, deleted: true });
  });

  it("persistiert einstellbare Standardpreise", async () => {
    const erfolgreich = await useAppStore.getState().einstellungenAendern({
      preisMWhDefault: 0.25,
      preisM3Default: 1.5,
    });
    expect(erfolgreich).toBe(true);
    const gespeicherterStand = JSON.parse(
      (await useAppStore.getState().speicher.read(STATE_PFAD)) as string,
    );
    expect(gespeicherterStand.einstellungen).toMatchObject({
      preisMWhDefault: 0.25,
      preisM3Default: 1.5,
    });
  });

  it("speichert den lokalen Foto-Schlüssel an einer Ablesung", () => {
    const meterId = zaehlerAnlegen("Heizung");
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: meterId,
      datum: "2026-01-15",
      stand: 100,
      unsicher: false,
      fotoKey: "ablesung-local-photo",
    });
    expect(useAppStore.getState().state.ablesung[0].fotoKey).toBe("ablesung-local-photo");
  });

  it("hält Ablesungen an verschiedenen Tagen getrennt", () => {
    const id = zaehlerAnlegen("Heizung");
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: id,
      datum: "2026-01-15",
      stand: 100,
      unsicher: false,
    });
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: id,
      datum: "2026-02-15",
      stand: 180,
      unsicher: false,
    });
    expect(useAppStore.getState().state.ablesung).toHaveLength(2);
  });

  it("löscht Ablesungen weich", () => {
    const id = zaehlerAnlegen("Heizung");
    useAppStore.getState().ablesungSpeichern({
      zaehlerId: id,
      datum: "2026-01-15",
      stand: 100,
      unsicher: false,
    });
    const ablesungId = useAppStore.getState().state.ablesung[0].id;
    useAppStore.getState().ablesungLoeschen(ablesungId);
    expect(useAppStore.getState().state.ablesung[0].deleted).toBe(true);
  });

  it("lehnt eine enthält-Relation ab, die einen Zirkel erzeugt (R2)", () => {
    const a = zaehlerAnlegen("A");
    const b = zaehlerAnlegen("B");
    const c = zaehlerAnlegen("C");

    expect(useAppStore.getState().enthaeltSetzen(a, b, true)).toBe(true);
    expect(useAppStore.getState().enthaeltSetzen(b, c, true)).toBe(true);
    // C enthält A würde A→B→C→A erzeugen.
    expect(useAppStore.getState().enthaeltSetzen(c, a, true)).toBe(false);

    const zaehler = useAppStore.getState().state.zaehler;
    expect(zaehler.find((z) => z.id === a)?.enthaeltIds).toEqual([b]);
    expect(zaehler.find((z) => z.id === c)?.enthaeltIds).toEqual([]);
    expect(useAppStore.getState().meldung?.art).toBe("warnung");
  });

  it("lehnt Selbstbezug ab", () => {
    const a = zaehlerAnlegen("A");
    expect(useAppStore.getState().enthaeltSetzen(a, a, true)).toBe(false);
  });

  it("verwaltet Bewohner und Abschlag", () => {
    const bewohnerId = useAppStore.getState().bewohnerAnlegen({
      name: "M. Muster",
      email: "m@example.org",
      aktiv: true,
    });
    useAppStore.getState().abschlagSetzen(bewohnerId, 42.5, "monatlich");
    const plan = useAppStore.getState().state.abschlagPlan[0];
    expect(plan.betrag).toBe(42.5);
    expect(plan.rhythmus).toBe("monatlich");

    // Derselbe Rhythmus überschreibt, ein anderer legt einen zweiten Plan an.
    useAppStore.getState().abschlagSetzen(bewohnerId, 45, "monatlich");
    expect(useAppStore.getState().state.abschlagPlan).toHaveLength(1);
    useAppStore.getState().abschlagSetzen(bewohnerId, 500, "jaehrlich");
    expect(useAppStore.getState().state.abschlagPlan).toHaveLength(2);
  });

  it("erfasst und storniert Zahlungen nachvollziehbar", () => {
    const bewohnerId = useAppStore.getState().bewohnerAnlegen({ name: "A. Beispiel", aktiv: true });
    useAppStore.getState().abschlagSetzen(bewohnerId, 42, "monatlich");
    const planId = useAppStore.getState().state.abschlagPlan[0].id;
    useAppStore.getState().zahlungAlsBezahlt(bewohnerId, "2026-01-01", 42, planId);
    const zahlung = useAppStore.getState().state.zahlung[0];
    expect(zahlung.bezahltAm).toBeTruthy();
    expect(zahlung.betrag).toBe(42);
    expect(zahlung.abschlagPlanId).toBe(planId);

    useAppStore.getState().zahlungStornieren(zahlung.id);
    expect(useAppStore.getState().state.zahlung[0].deleted).toBe(true);
  });

  it("speichert eingefrorene Abrechnungen und pflegt ihren Status", async () => {
    const abrechnung: Abrechnung = {
      id: "abrechnung-2026",
      jahr: 2026,
      von: "2026-01-01",
      bis: "2026-12-31",
      betreiberBetrag: 125,
      status: "entwurf",
      positionen: [],
    };
    useAppStore.getState().abrechnungSpeichern(abrechnung);
    useAppStore.getState().abrechnungAbschliessen(abrechnung);
    await useAppStore.getState().speichern();

    const gespeichert = useAppStore.getState().state.abrechnung[0];
    expect(gespeichert.status).toBe("verteilt");
    expect(gespeichert.betreiberBetrag).toBe(125);
    expect(JSON.parse((await useAppStore.getState().speicher.read(STATE_PFAD)) as string).abrechnung[0].status).toBe("verteilt");
  });

  it("löst Zähler eines gelöschten Bewohners", () => {
    const bewohnerId = useAppStore.getState().bewohnerAnlegen({ name: "X", aktiv: true });
    const zaehlerId = zaehlerAnlegen("Heizung X");
    useAppStore.getState().zaehlerAendern(zaehlerId, { bewohnerId });
    useAppStore.getState().bewohnerLoeschen(bewohnerId);

    const z = useAppStore.getState().state.zaehler[0];
    expect(z.bewohnerId).toBeNull();
    expect(useAppStore.getState().state.bewohner[0].deleted).toBe(true);
  });

  it("importiert Startablesungen aus CSV", () => {
    zaehlerAnlegen("Heizung Keller");
    const csv = [
      "Zähler;Datum;Stand",
      "Heizung Keller;01.01.2026;100,5",
      "Heizung Keller;01.02.2026;180,0",
    ].join("\n");

    const ergebnis = useAppStore.getState().importStartablesungen(csv);
    expect(ergebnis.gespeichert).toBe(2);
    expect(ergebnis.fehler).toHaveLength(0);
    expect(useAppStore.getState().state.ablesung).toHaveLength(2);
  });

  it("meldet Fehlerzeilen beim CSV-Import, ohne den Import zu verwerfen", () => {
    zaehlerAnlegen("Heizung Keller");
    const csv = [
      "Zähler;Datum;Stand",
      "Heizung Keller;01.01.2026;100,5",
      "Unbekannt;01.02.2026;50",
    ].join("\n");

    const ergebnis = useAppStore.getState().importStartablesungen(csv);
    expect(ergebnis.gespeichert).toBe(1);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(useAppStore.getState().state.ablesung).toHaveLength(1);
  });

  it("schreibt den Zustand in den Speicher", async () => {
    const speicher = new MemoryAdapter();
    await useAppStore.getState().laden(speicher);
    zaehlerAnlegen("Heizung");
    await useAppStore.getState().speichern();

    const roh = await speicher.read(STATE_PFAD);
    expect(roh).toBeTruthy();
    expect(JSON.parse(roh as string).zaehler).toHaveLength(1);
  });

  it("lädt einen gespeicherten Zustand wieder ein", async () => {
    const speicher = new MemoryAdapter();
    await useAppStore.getState().laden(speicher);
    zaehlerAnlegen("Heizung");
    await useAppStore.getState().speichern();

    await useAppStore.getState().laden(speicher);
    expect(useAppStore.getState().state.zaehler).toHaveLength(1);
    expect(useAppStore.getState().state.zaehler[0].bezeichnung).toBe("Heizung");
  });

  it("verwirft einen leeren Speicher und meldet den Zustand „leer“", async () => {
    const speicher = new MemoryAdapter();
    await useAppStore.getState().laden(speicher);
    expect(useAppStore.getState().state.zaehler).toHaveLength(0);
    expect(useAppStore.getState().status).toBe("leer");
  });

  it("verwahrt den Entwurf im Zustand", () => {
    const id = zaehlerAnlegen("Heizung");
    useAppStore.getState().entwurfSetzen("2026-01-15", [
      { zaehlerId: id, stand: "12,5", unsicher: false, notiz: "" },
    ]);
    expect(useAppStore.getState().entwurf?.eintraege).toHaveLength(1);
    useAppStore.getState().entwurfVerwerfen();
    expect(useAppStore.getState().entwurf).toBeNull();
  });
});
