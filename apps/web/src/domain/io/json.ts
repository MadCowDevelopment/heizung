/**
 * Export/Import des Gesamt-Zustands als JSON (mit `schemaVersion`).
 *
 * Der Import ist tolerant: fehlende Sektionen werden mit Defaults gefüllt,
 * gelöschte Datensätze (`deleted: true`) bleiben erhalten.
 */

import {
  DEFAULT_EINSTELLUNGEN,
  SCHEMA_VERSION,
  emptyState,
  type Abrechnung,
  type AbschlagPlan,
  type Ablesung,
  type AppState,
  type Bewohner,
  type Einstellungen,
  type FachMeldung,
  type Preis,
  type Zahlung,
  type Zaehler,
} from "../types";

/**
 * Fehler beim Import.
 *
 * Trägt einen **sprachneutralen** Code statt eines fest verdrahteten
 * deutschen Satzes; die Oberfläche löst den Code über i18n auf.
 */
export class ImportFehler extends Error {
  constructor(
    readonly meldung: FachMeldung,
    /** Technische Details (z. B. die Meldung des JSON-Parsers). */
    readonly hinweise: string[] = [],
  ) {
    super(meldung.code);
    this.name = "ImportFehler";
  }
}

/** Serialisiert den Zustand als JSON (schön formatiert, stabil sortiert). */
export function exportiereJson(state: AppState): string {
  const kopie: AppState = {
    ...state,
    schemaVersion: state.schemaVersion ?? SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(kopie, null, 2);
}

/** Erzeugt einen Dateinamen für den Export. */
export function exportDateiname(_state: AppState, format: "json" | "csv" = "json"): string {
  const datum = new Date().toISOString().slice(0, 10);
  return `heizung-export-${datum}.${format}`;
}

function alsArray<T>(wert: unknown): T[] {
  return Array.isArray(wert) ? (wert as T[]) : [];
}

/**
 * Liest einen JSON-Export ein und validiert die Grundstruktur.
 */
export function importiereJson(text: string): AppState {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch (fehler) {
    throw new ImportFehler({ code: "json.keinGueltigesJson" }, [
      fehler instanceof Error ? fehler.message : String(fehler),
    ]);
  }

  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) {
    throw new ImportFehler({ code: "json.keinDatenobjekt" });
  }

  const obj = roh as Partial<AppState> & Record<string, unknown>;
  const schemaVersion = typeof obj.schemaVersion === "number" ? obj.schemaVersion : SCHEMA_VERSION;

  if (schemaVersion > SCHEMA_VERSION) {
    throw new ImportFehler({
      code: "json.schemaVersion",
      params: { datei: schemaVersion, appVersion: SCHEMA_VERSION },
    });
  }

  const einstellungen: Einstellungen = {
    ...DEFAULT_EINSTELLUNGEN,
    ...(obj.einstellungen ?? {}),
    schemaVersion: SCHEMA_VERSION,
  };

  const base = emptyState();

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : base.updatedAt,
    bewohner: alsArray<Bewohner>(obj.bewohner),
    zaehler: alsArray<Zaehler>(obj.zaehler),
    ablesung: alsArray<Ablesung>(obj.ablesung),
    preis: alsArray<Preis>(obj.preis),
    abschlagPlan: alsArray<AbschlagPlan>(obj.abschlagPlan),
    zahlung: alsArray<Zahlung>(obj.zahlung),
    abrechnung: alsArray<Abrechnung>(obj.abrechnung),
    einstellungen,
  };
}

/**
 * Prüft, ob ein Objekt wie ein App-Zustand aussieht (flacher Check für den
 * Import-Dialog).
 */
export function looksLikeState(wert: unknown): boolean {
  if (typeof wert !== "object" || wert === null) return false;
  const obj = wert as Record<string, unknown>;
  return (
    Array.isArray(obj.bewohner) ||
    Array.isArray(obj.zaehler) ||
    Array.isArray(obj.ablesung) ||
    Array.isArray(obj.abrechnung)
  );
}
