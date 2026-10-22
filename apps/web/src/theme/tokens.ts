/**
 * Gestaltungs-Konstanten der App (Spiegel von `src/index.css`).
 *
 * Die CSS-Variablen sind die Wahrheit fuer die Darstellung; dieses Modul
 * liefert die Werte fuer Stellen, die Farbe in JS brauchen (SVG, Inline-
 * Stile, Diagramme).
 *
 * Farbkontrast auf `--color-bench` (#faf8f4):
 *   warm    #c62828 -> 5.30:1
 *   kalt    #1565c0 -> 5.42:1
 *   energie #a34f00 -> 5.39:1  (Textvariante; #ef6c00 ist die Flaechenfarbe)
 *   ink-3   #6b6862 -> 5.24:1
 */

import type { MeterType } from "../domain/types";

/** Farbpalette der Oberflaeche. */
export const FARBEN = {
  bench: "#faf8f4",
  benchRaised: "#ffffff",
  benchSunk: "#f2eee6",
  ink: "#1b1a17",
  ink2: "#55524c",
  ink3: "#6b6862",
  rule: "#e3ded4",
  ruleStrong: "#c9c3b6",
  warm: "#c62828",
  warmSoft: "#fbeceb",
  kalt: "#1565c0",
  kaltSoft: "#eaf1fb",
  energie: "#ef6c00",
  energieSoft: "#fdf0e3",
  energieInk: "#a34f00",
  ok: "#1f6f3f",
  warn: "#8a5a00",
  danger: "#b3261e",
} as const;

/** Zaehlertyp -> Textvariante (immer >= 4.5:1 auf hellem Grund). */
export const TYP_TEXTFARBE: Record<MeterType, string> = {
  energie: FARBEN.energieInk,
  wasser_warm: FARBEN.warm,
  wasser_kalt: FARBEN.kalt,
};

/** Zaehlertyp -> helle Flaeche fuer Chips. */
export const TYP_FLAECHE: Record<MeterType, string> = {
  energie: FARBEN.energieSoft,
  wasser_warm: FARBEN.warmSoft,
  wasser_kalt: FARBEN.kaltSoft,
};

/** Zaehlertyp -> Glyphe. Immer zusammen mit dem Text verwenden. */
export const TYP_GLYPHE: Record<MeterType, string> = {
  energie: "◈",
  wasser_warm: "▲",
  wasser_kalt: "▼",
};
