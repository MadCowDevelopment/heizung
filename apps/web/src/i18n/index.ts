/**
 * i18n-Grundlage (react-i18next).
 *
 * Die Oberfläche ist deutsch (docs/requirements.md §5). Englisch ist
 * vorbereitet: die Ressourcen liegen vollständig vor, der Sprachumschalter
 * folgt in M3, wenn die fachlichen Begriffe gemeinsam mit dem Betreiber
 * festgelegt werden.
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

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: "de",
  fallbackLng: "de",
  interpolation: {
    // React escapet bereits; der Translator soll die Rohwerte sehen.
    escapeValue: false,
  },
});

export default i18n;
export { de } from "./de";
export { en } from "./en";
