/**
 * Auflösung der sprachneutralen fachlichen Meldungen.
 *
 * Die Domäne liefert Codes plus Parameter (`FachMeldung`), weil sie keine
 * Sprache kennt (docs/architecture.md §3). Erst die Oberfläche übersetzt
 * sie – hier zentral, damit alle Aufrufer denselben Text sehen.
 */

import type { FachMeldung } from "../domain/types";
import i18n from "./index";

/**
 * Löst eine fachliche Meldung in einen Text der aktuellen Sprache auf.
 *
 * Unbekannte Codes liefern (wie bei i18next üblich) den Schlüssel selbst
 * zurück – sie werfen nicht.
 */
export function meldeText(meldung: FachMeldung): string {
  return i18n.t(meldung.code, meldung.params ?? {});
}

/** Löst mehrere fachliche Meldungen nacheinander auf. */
export function meldeTexte(meldungen: FachMeldung[]): string[] {
  return meldungen.map(meldeText);
}
