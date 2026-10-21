/**
 * R11 – Import/Export von CSV (Startablesungen, Verbrauchs- und Abrechnungsdaten).
 *
 * Der CSV-Parser ist bewusst tolerant: Trennzeichen (`;`, `,`, Tab) und
 * Spaltennamen werden automatisch erkannt, Dezimalkomma und -punkt werden
 * akzeptiert und Datumsformate (`YYYY-MM-DD`, `DD.MM.YYYY`) gelesen.
 */

import type { Ablesung, ISODate, Zaehler } from "../types";
import { isValidISODate } from "../calc/dates";

/** Mögliche Trennzeichen. */
export type CsvTrennzeichen = ";" | "," | "\t" | "|";

/** Eine geparste CSV-Zeile als Schlüssel/Wert-Paare. */
export type CsvZeile = Record<string, string>;

/** Ergebnis eines CSV-Imports. */
export interface CsvImportErgebnis {
  /** Erfolgreich importierte Ablesungen. */
  ablesungen: Ablesung[];
  /** Zeilen mit Fehlern. */
  fehler: { zeile: number; roh: string; grund: string }[];
  /** Erkanntes Trennzeichen. */
  trennzeichen: CsvTrennzeichen;
  /** Erkannte Spaltennamen (normalisiert). */
  spalten: string[];
}

/** Normalisiert einen Spaltennamen (klein, ohne Sonderzeichen). */
export function normalisiereSpalte(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[äÄ]/g, "a")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Kanonische Vergleichsform eines Spaltennamens.
 *
 * Macht die Spaltenerkennung unabhaengig von der Schreibweise: `ae`/`a`,
 * `oe`/`o`, `ue`/`u` und `ss`/`s` gelten als gleich (`Zaehler` = `Zahler`).
 */
function kanonisch(name: string): string {
  return normalisiereSpalte(name)
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/ss/g, "s");
}

/** Erkennt das Trennzeichen aus der Kopfzeile. */
export function detectTrennzeichen(text: string): CsvTrennzeichen {
  const zeile = text.split(/\r?\n/).find((z) => z.trim().length > 0) ?? "";
  const kandidaten: CsvTrennzeichen[] = [";", ",", "\t", "|"];
  let best: CsvTrennzeichen = ";";
  let bestCount = 0;
  for (const k of kandidaten) {
    const count = zeile.split(k).length - 1;
    if (count > bestCount) {
      best = k;
      bestCount = count;
    }
  }
  return best;
}

/** Zerlegt CSV-Text in Zeilen (mit Quotes-Unterstützung). */
export function splitCsvRows(text: string, trennzeichen: CsvTrennzeichen): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let feld = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        feld += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === trennzeichen) {
      current.push(feld);
      feld = "";
      continue;
    }
    if (c === "\n") {
      current.push(feld);
      rows.push(current);
      current = [];
      feld = "";
      continue;
    }
    if (c === "\r") continue;
    feld += c;
  }
  if (feld.length > 0 || current.length > 0) {
    current.push(feld);
    rows.push(current);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

/**
 * Liest eine Zahl (Dezimalkomma oder -punkt).
 *
 * Sind beide Trennzeichen vorhanden, ist das **letzte** das Dezimaltrennzeichen
 * und das andere ein Tausendertrennzeichen (`1.234,5` → `1234.5`).
 */
export function parseZahl(wert: string): number | null {
  const bereinigt = wert.trim().replace(/\s/g, "").replace(/"/g, "");
  if (bereinigt === "") return null;

  const komma = bereinigt.lastIndexOf(",");
  const punkt = bereinigt.lastIndexOf(".");
  let normalisiert: string;
  if (komma === -1 && punkt === -1) {
    normalisiert = bereinigt;
  } else {
    const dezimalIdx = Math.max(komma, punkt);
    const ganzteil = bereinigt.slice(0, dezimalIdx).replace(/[.,]/g, "");
    const nachkomma = bereinigt.slice(dezimalIdx + 1);
    normalisiert = `${ganzteil}.${nachkomma}`;
  }

  const n = Number(normalisiert);
  return Number.isFinite(n) ? n : null;
}

/** Liest ein Datum (YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD). */
export function parseDatum(wert: string): ISODate | null {
  const text = wert.trim().replace(/"/g, "");
  if (text === "") return null;
  if (isValidISODate(text)) return text;

  const dmj = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  if (dmj) {
    const iso = `${dmj[3]}-${dmj[2].padStart(2, "0")}-${dmj[1].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }

  const jm = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(text);
  if (jm) {
    const iso = `${jm[1]}-${jm[2].padStart(2, "0")}-${jm[3].padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }

  return null;
}

/** Parst CSV-Text in Objekte (Kopfzeile = Spaltennamen). */
export function parseCsv(text: string): {
  zeilen: CsvZeile[];
  trennzeichen: CsvTrennzeichen;
  spalten: string[];
} {
  const trennzeichen = detectTrennzeichen(text);
  const rows = splitCsvRows(text, trennzeichen);
  if (rows.length === 0) return { zeilen: [], trennzeichen, spalten: [] };

  const kopf = rows[0].map(normalisiereSpalte);
  const zeilen: CsvZeile[] = rows.slice(1).map((row) => {
    const obj: CsvZeile = {};
    kopf.forEach((name, index) => {
      if (!name) return;
      obj[name] = (row[index] ?? "").trim();
    });
    return obj;
  });
  return { zeilen, trennzeichen, spalten: kopf };
}

/** Sucht den ersten passenden Spaltennamen (mit Aliassen, schreibweise-tolerant). */
function findeSpalte(zeile: CsvZeile, aliase: string[]): string | undefined {
  const kanonischZuOriginal = new Map<string, string>();
  for (const name of Object.keys(zeile)) {
    const k = kanonisch(name);
    if (!kanonischZuOriginal.has(k)) kanonischZuOriginal.set(k, name);
  }
  for (const alias of aliase) {
    const treffer = kanonischZuOriginal.get(kanonisch(alias));
    if (treffer !== undefined && zeile[treffer] !== "") return treffer;
  }
  return undefined;
}

/** Erzeugt eine ID aus einem beliebigen String (deterministisch). */
export function idAus(text: string, praefix = "id"): string {
  const bereinigt = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return bereinigt ? `${praefix}-${bereinigt}` : `${praefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Importiert Startablesungen (R11) aus CSV-Text.
 *
 * Erwartete Spalten (flexibel): `zaehler` (ID oder Bezeichnung), `datum`,
 * `stand` – Aliase werden erkannt.
 */
export function importiereStartablesungen(
  text: string,
  zaehler: Zaehler[],
  bestaetigung?: (vorschlag: Ablesung) => boolean,
): CsvImportErgebnis {
  const { zeilen, trennzeichen, spalten } = parseCsv(text);
  const fehler: CsvImportErgebnis["fehler"] = [];
  const ablesungen: Ablesung[] = [];

  const zaehlerById = new Map(zaehler.map((z) => [z.id, z]));
  const zaehlerByName = new Map(zaehler.map((z) => [z.bezeichnung.trim().toLowerCase(), z]));

  zeilen.forEach((zeile, index) => {
    const zeilennummer = index + 2; // 1-basiert + Kopfzeile
    const zaehlerWert =
      zeile[findeSpalte(zeile, ["zaehler", "zaehlerid", "meter", "meterid", "id"]) ?? ""];
    const datumWert =
      zeile[findeSpalte(zeile, ["datum", "date", "ablesedatum", "standdatum"]) ?? ""];
    const standWert =
      zeile[findeSpalte(zeile, ["stand", "wert", "value", "zaehlerstand", "ablesewert"]) ?? ""];

    if (!zaehlerWert) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: "Spalte „Zähler“ fehlt.",
      });
      return;
    }
    if (!datumWert) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: "Spalte „Datum“ fehlt.",
      });
      return;
    }
    if (standWert === undefined) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: "Spalte „Stand“ fehlt.",
      });
      return;
    }

    const z = zaehlerById.get(zaehlerWert) ?? zaehlerByName.get(zaehlerWert.toLowerCase());
    if (!z) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: `Unbekannter Zähler „${zaehlerWert}“.`,
      });
      return;
    }

    const datum = parseDatum(datumWert);
    if (!datum) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: `Ungültiges Datum „${datumWert}“.`,
      });
      return;
    }

    const stand = parseZahl(standWert);
    if (stand === null) {
      fehler.push({
        zeile: zeilennummer,
        roh: JSON.stringify(zeile),
        grund: `Ungültiger Stand „${standWert}“.`,
      });
      return;
    }

    const vorschlag: Ablesung = {
      id: `ab-${z.id}-${datum}`,
      zaehlerId: z.id,
      datum,
      stand,
      unsicher: false,
    };

    if (bestaetigung && !bestaetigung(vorschlag)) {
      fehler.push({ zeile: zeilennummer, roh: JSON.stringify(zeile), grund: "Überschrieben." });
      return;
    }

    ablesungen.push(vorschlag);
  });

  return { ablesungen, fehler, trennzeichen, spalten };
}

/** Escaped ein Feld für CSV-Export. */
export function csvFeld(wert: string | number | null | undefined): string {
  if (wert === null || wert === undefined) return "";
  const text = String(wert);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Erzeugt eine CSV-Zeile. */
export function csvZeile(werte: (string | number | null | undefined)[]): string {
  return werte.map(csvFeld).join(";");
}

/** Exportiert Ablesungen als CSV (Semikolon, deutsches Dezimalkomma). */
export function exportiereAblesungen(ablesungen: Ablesung[]): string {
  const kopf = csvZeile(["ZaehlerId", "Datum", "Stand", "Unsicher", "Notiz"]);
  const zeilen = ablesungen.map((a) =>
    csvZeile([
      a.zaehlerId,
      a.datum,
      a.stand.toString().replace(".", ","),
      a.unsicher ? "ja" : "nein",
      a.notiz ?? "",
    ]),
  );
  return [kopf, ...zeilen].join("\r\n");
}
