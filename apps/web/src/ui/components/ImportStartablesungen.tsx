/**
 * Import von Startablesungen (R11).
 *
 * CSV mit den Spalten Zähler, Datum und Stand. Die Prüfung liegt in der
 * Domäne (`importiereStartablesungen`); hier werden Datei, Trefferzahl und
 * Fehlerzeilen dargestellt.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../state/store";
import { KnopfPrimär, KnopfSekundaer, Meldungszeile } from "./Primitives";

export function ImportStartablesungen({ onFertig }: { onFertig: () => void }) {
  const { t } = useTranslation();
  const importStartablesungen = useAppStore((s) => s.importStartablesungen);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fehler, setFehler] = useState<{ zeile: number; roh: string; grund: string }[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);

  const dateiWaehlen = async (datei: File) => {
    const text = await datei.text();
    const ergebnis = importStartablesungen(text);
    setFehler(ergebnis.fehler);
    setMeldung(
      ergebnis.fehler.length === 0
        ? t("meter.importiert", { count: ergebnis.gespeichert })
        : t("meter.importMitFehlern", {
            count: ergebnis.gespeichert,
            fehler: ergebnis.fehler.length,
          }),
    );
  };

  return (
    <div
      className="px-3 py-4 sm:px-4"
      style={{ backgroundColor: "#f2eee6", borderTop: "1px solid #e3ded4" }}
    >
      <p className="mb-3 text-[0.875rem] leading-relaxed" style={{ color: "#55524c" }}>
        {t("meter.startablesungenHinweis")}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const datei = e.target.files?.[0];
          if (datei) void dateiWaehlen(datei);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <KnopfSekundaer onClick={() => fileRef.current?.click()}>
          {t("meter.dateiWaehlen")}
        </KnopfSekundaer>
        <KnopfPrimär onClick={onFertig}>{t("allg.fertig")}</KnopfPrimär>
      </div>

      {meldung ? (
        <div className="mt-3">
          <Meldungszeile art={fehler.length === 0 ? "erfolg" : "warnung"} text={meldung} />
        </div>
      ) : null}

      {fehler.length > 0 ? (
        <div className="mt-3 max-h-56 overflow-auto">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr style={{ color: "#6b6862" }}>
                <th className="w-12 py-1 text-left font-medium">{t("import.zeile")}</th>
                <th className="py-1 text-left font-medium">{t("import.grund")}</th>
              </tr>
            </thead>
            <tbody>
              {fehler.map((f) => (
                <tr key={f.zeile} style={{ borderTop: "1px solid #e3ded4" }}>
                  <td className="tnum py-1 pr-2 align-top">{f.zeile}</td>
                  <td className="py-1 align-top">{f.grund}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
