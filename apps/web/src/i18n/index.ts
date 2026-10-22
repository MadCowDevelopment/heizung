/**
 * i18n-Grundlage (react-i18next).
 *
 * Die Oberfläche bietet Deutsch und Englisch; die Auswahl wird lokal pro
 * Gerät gespeichert und nicht mit den fachlichen Daten synchronisiert.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { de } from "./de";
import { en } from "./en";

export const SPRACHEN = {
  de: "Deutsch",
  en: "English",
} as const;

export type Sprache = keyof typeof SPRACHEN;

const LANGUAGE_KEY = "heizung.sprache";
let gespeicherteSprache: string | null = null;
try {
  gespeicherteSprache = globalThis.localStorage?.getItem(LANGUAGE_KEY) ?? null;
} catch {
  // Die Sprache funktioniert auch dann, wenn der Browser lokale Präferenzen sperrt.
}
const startSprache: Sprache =
  gespeicherteSprache === "en" || gespeicherteSprache === "de" ? gespeicherteSprache : "de";

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: startSprache,
  fallbackLng: "de",
  interpolation: {
    // React escapet bereits; der Translator soll die Rohwerte sehen.
    escapeValue: false,
  },
});

if (typeof document !== "undefined") document.documentElement.lang = startSprache;

i18n.on("languageChanged", (sprache) => {
  if (sprache === "de" || sprache === "en") {
    if (typeof document !== "undefined") document.documentElement.lang = sprache;
    try {
      globalThis.localStorage?.setItem(LANGUAGE_KEY, sprache);
    } catch {
      // Die aktuelle Auswahl bleibt bis zum Neuladen aktiv.
    }
  }
});

export default i18n;
export { de } from "./de";
export { en } from "./en";
