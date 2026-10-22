/**
 * Domänenmodell der Heizungs-/Warmwasser-Abrechnung.
 * Quelle der Wahrheit: docs/requirements.md §2 und §7, docs/architecture.md §4.
 *
 * Diese Datei importiert nichts – sie ist die gemeinsame Basis für `domain`,
 * `storage`, `pdf` und die UI.
 */

/** Kalenderdatum im Format `YYYY-MM-DD` (ohne Zeitzone). */
export type ISODate = string;

/** Zeitstempel (ISO 8601, UTC). */
export type ISOTimestamp = string;

/** Zählertyp. `energie` = MWh, `wasser_warm`/`wasser_kalt` = m³. */
export type MeterType = "energie" | "wasser_warm" | "wasser_kalt";

/** Anzeigeeinheit eines Zählers. */
export type MeterUnit = "MWh" | "m3";

/** Verteilungs-Schlüssel für die Energieverteilung (R3). */
export type VerteilSchluessel = "warm" | "warm+kalt" | "kalt";

/** Rhythmus eines Abschlagsplans (R6). */
export type AbschlagRhythmus = "monatlich" | "jaehrlich";

/** Status einer Abrechnung. */
export type AbrechnungStatus = "entwurf" | "verteilt" | "beglichen";

/**
 * Sprachneutraler fachlicher Hinweis.
 *
 * Die Domäne kennt keine Sprache (docs/architecture.md §3: „`domain`
 * importiert nichts außer `domain`"). Sie liefert deshalb **Codes plus
 * Interpolationsparameter**; die Oberfläche löst sie über i18n auf
 * (`i18n/meldung.ts`). Die Codes sind die Schlüssel der Kataloge in
 * `i18n/de.ts` und `i18n/en.ts`.
 */
export interface FachMeldung {
  /** Katalogschlüssel, z. B. `csv.unbekannterZaehler`. */
  code: MeldungsCode;
  /** Werte für die Platzhalter des Katalogs, z. B. `{ name: "Heizung" }`. */
  params?: Record<string, string | number>;
}

/**
 * Alle Codes, die Domäne und Speicher erzeugen können.
 *
 * Die Liste ist absichtlich geschlossen und die einzige Quelle der Wahrheit:
 * `MeldungsCode` wird daraus abgeleitet, und ein Test stellt sicher, dass
 * jeder Code in **beiden** Katalogen (`de.ts`, `en.ts`) vorhanden ist.
 */
export const MELDUNGS_CODES = [
  // CSV-Import (R11)
  "csv.spalteZaehlerFehlt",
  "csv.spalteDatumFehlt",
  "csv.spalteStandFehlt",
  "csv.unbekannterZaehler",
  "csv.ungueltigesDatum",
  "csv.ungueltigerStand",
  "csv.ueberschrieben",
  // JSON-Import
  "json.keinGueltigesJson",
  "json.keinDatenobjekt",
  "json.schemaVersion",
  // Plausibilität (R8)
  "plausibilitaet.unvollstaendig",
  "plausibilitaet.negativ",
  "plausibilitaet.ausreisser",
  // Abrechnung (R5/R6)
  "abrechnung.zaehlerUnvollstaendig",
  "abrechnung.keineVerteilungsbasisEnergie",
  "abrechnung.keineVerteilungsbasisWarm",
  "abrechnung.keinEigenerZaehler",
  "abrechnung.keineTheoretischenKosten",
  "abrechnung.offeneAbschlaege",
  // Verteilung (R3)
  "verteilung.fallbackWarm",
  "verteilung.fallbackKalt",
  "verteilung.administratorfrage",
  // Speicher
  "speicher.indexeddbOeffnenFehlgeschlagen",
  "speicher.indexeddbTransaktionFehlgeschlagen",
  "speicher.indexeddbNichtVerfuegbar",
  "speicher.indexeddbBlockiert",
  "speicher.pfadLeer",
] as const;

/** Katalogschlüssel einer fachlichen Meldung. */
export type MeldungsCode = (typeof MELDUNGS_CODES)[number];

/** Bewohner/in der Wohngemeinschaft. */
export interface Bewohner {
  id: string;
  name: string;
  email?: string;
  notiz?: string;
  aktiv: boolean;
  /** Optionale Listenfarbe (CSS-Farbe). */
  farbe?: string;
  updatedAt?: ISOTimestamp;
  deleted?: boolean;
}

/** Zähler (Heizung/Energie, Warmwasser, Kaltwasser). */
export interface Zaehler {
  id: string;
  bezeichnung: string;
  typ: MeterType;
  einheit: MeterUnit;
  /** null = Gemeinschafts-/Gesamtzähler. */
  bewohnerId: string | null;
  /** Zähler, die in diesem Zähler enthalten sind (R2). */
  enthaeltIds: string[];
  ablesestelle?: string;
  aktiv: boolean;
  /** Startstand bei Zählerwechsel (R11). */
  startStand?: number;
  updatedAt?: ISOTimestamp;
  deleted?: boolean;
}

/** Ablesung eines Zählers an einem Tag. */
export interface Ablesung {
  id: string;
  zaehlerId: string;
  datum: ISODate;
  stand: number;
  notiz?: string;
  /** Markierung „unleserlich/geschätzt" (S3). */
  unsicher: boolean;
  /** Schlüssel des Beleg-Fotos im lokalen Gerätespeicher (nicht im Daten-Repo). */
  fotoKey?: string | null;
  /** Preis-Snapshot (R9) – Preis, der zum Zeitpunkt der Ablesung gültig war. */
  preisMwhGenutzt?: number;
  createdAt?: ISOTimestamp;
  updatedAt?: ISOTimestamp;
  deleted?: boolean;
}

/** Preisstufe, gültig ab einem Datum (R9). */
export interface Preis {
  id: string;
  gueltigAb: ISODate;
  preisMWh: number;
  preisM3: number;
  notiz?: string;
  updatedAt?: ISOTimestamp;
  deleted?: boolean;
}

/** Abschlagplan eines Bewohners (R6). */
export interface AbschlagPlan {
  id: string;
  bewohnerId: string;
  betrag: number;
  rhythmus: AbschlagRhythmus;
  aktiv: boolean;
  updatedAt?: ISOTimestamp;
}

/** Erfasste Zahlung (R6). */
export interface Zahlung {
  id: string;
  bewohnerId: string;
  abschlagPlanId?: string;
  betrag: number;
  faelligAm: ISODate;
  /** Nur gesetzt, wenn die Zahlung erfolgt ist. */
  bezahltAm?: ISODate | null;
  notiz?: string;
  updatedAt?: ISOTimestamp;
  deleted?: boolean;
}

/** Eingefrorene Abrechnungsposition (docs/requirements.md §2.4). */
export interface AbrechnungsPosition {
  bewohnerId: string;
  bewohnerName: string;
  wasserWarmM3: number;
  wasserKaltM3: number;
  energieMWh: number;
  /** Theoretische Kosten (R4) in Euro. */
  kostenTheoretisch: number;
  /** Anteil in Prozent (R5). */
  anteilProzent: number;
  /** Verteilter Betreiberbetrag (R5) in Euro. */
  rechnungsbetrag: number;
  /** Summe der verrechneten Abschläge (R6) in Euro. */
  summeAbschlaege: number;
  /** Saldo in Euro: > 0 Nachzahlung, < 0 Auszahlung (R6). */
  saldo: number;
  /**
   * Sichtbare Abweichungen/Hinweise (z. B. Verteilungs-Fallback).
   *
   * Sprachneutral: Codes + Parameter, die die Oberfläche auflöst.
   */
  hinweise: FachMeldung[];
}

/** Jahresabrechnung. */
export interface Abrechnung {
  id: string;
  jahr: number;
  von: ISODate;
  bis: ISODate;
  /** Betreiberbetrag in Euro (R5). */
  betreiberBetrag: number;
  betreiberHinweis?: string;
  status: AbrechnungStatus;
  /** Eingefrorene Positionen – spätere Korrekturen verändern sie nicht. */
  positionen: AbrechnungsPosition[];
  updatedAt?: ISOTimestamp;
}

/** App-Einstellungen. */
export interface Einstellungen {
  verteilSchluessel: VerteilSchluessel;
  waehrung: string;
  /** Fallback-Preise vor der ersten Preisstufe. */
  preisMWhDefault: number;
  preisM3Default: number;
  objektName?: string;
  ansprechpartner?: string;
  pdfHinweis?: string;
  /** Ziel-Repo `owner/repo` für den Cloud-Speicher. */
  datenRepo?: string;
  /** Intervall für Wiederholungsversuche bei ausstehenden Sync-Aufträgen. */
  syncIntervallSekunden?: number;
  schemaVersion: number;
}

/** Gesamter persistierter Zustand (`data/state.json`). */
export interface AppState {
  schemaVersion: number;
  updatedAt: ISOTimestamp;
  bewohner: Bewohner[];
  zaehler: Zaehler[];
  ablesung: Ablesung[];
  preis: Preis[];
  abschlagPlan: AbschlagPlan[];
  zahlung: Zahlung[];
  abrechnung: Abrechnung[];
  einstellungen: Einstellungen;
}

/**
 * Schema-Version der Ablage.
 *
 * Version 4: Die fachlichen Hinweise sind von fest verdrahtetem deutschem
 * Text auf sprachneutrale Codes umgestellt (docs/architecture.md §3).
 */
export const SCHEMA_VERSION = 4;

/** Standard-Einstellungen (docs/requirements.md §3, R3/R4). */
export const DEFAULT_EINSTELLUNGEN: Einstellungen = {
  verteilSchluessel: "warm",
  waehrung: "EUR",
  preisMWhDefault: 0.1,
  preisM3Default: 0,
  objektName: "",
  ansprechpartner: "",
  pdfHinweis: "",
  datenRepo: "MadCowDevelopment/heizung-data",
  syncIntervallSekunden: 30,
  schemaVersion: SCHEMA_VERSION,
};

/** Leerer Zustand mit Standard-Einstellungen. */
export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    bewohner: [],
    zaehler: [],
    ablesung: [],
    preis: [],
    abschlagPlan: [],
    zahlung: [],
    abrechnung: [],
    einstellungen: { ...DEFAULT_EINSTELLUNGEN },
  };
}

/** Einstellungen mit Defaults ergänzen (für Import fremder/älterer Dateien). */
export function withDefaults(einstellungen: Partial<Einstellungen> | undefined): Einstellungen {
  return { ...DEFAULT_EINSTELLUNGEN, ...(einstellungen ?? {}) };
}
