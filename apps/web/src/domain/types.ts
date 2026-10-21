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
}

/** Abschlagplan eines Bewohners (R6). */
export interface AbschlagPlan {
  id: string;
  bewohnerId: string;
  betrag: number;
  rhythmus: AbschlagRhythmus;
  aktiv: boolean;
}

/** Erfasste Zahlung (R6). */
export interface Zahlung {
  id: string;
  bewohnerId: string;
  betrag: number;
  faelligAm: ISODate;
  /** Nur gesetzt, wenn die Zahlung erfolgt ist. */
  bezahltAm?: ISODate | null;
  notiz?: string;
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
  /** Sichtbare Abweichungen/Hinweise (z. B. Verteilungs-Fallback). */
  hinweise: string[];
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
  objektName?: string;
  ansprechpartner?: string;
  pdfHinweis?: string;
  /** Ziel-Repo `owner/repo` für den Cloud-Speicher. */
  datenRepo?: string;
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

/** Schema-Version der Ablage. */
export const SCHEMA_VERSION = 3;

/** Standard-Einstellungen (docs/requirements.md §3, R3/R4). */
export const DEFAULT_EINSTELLUNGEN: Einstellungen = {
  verteilSchluessel: "warm",
  waehrung: "EUR",
  objektName: "",
  ansprechpartner: "",
  pdfHinweis: "",
  datenRepo: "MadCowDevelopment/heizung-data",
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
