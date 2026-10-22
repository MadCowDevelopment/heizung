import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ownDelta } from "../../domain/calc/contains";
import { buildSettlement } from "../../domain/calc/settlement";
import { meterDeltas } from "../../domain/calc/period";
import { kwhToMwh, litreToM3 } from "../../domain/calc/units";
import { isValidISODate } from "../../domain/calc/dates";
import { useAppStore } from "../../state/store";
import { geld, zahl } from "../format";
import { KnopfSekundaer, Auswahl, Eingabe } from "../components/Primitives";

type ZeitraumArt = "jahr" | "benutzerdefiniert" | "letzte";

function zeitraumLetzteAblesungen(state: ReturnType<typeof useAppStore.getState>["state"]): [string, string] {
  const dates = [...new Set(state.ablesung.filter((a) => !a.deleted).map((a) => a.datum))].sort();
  if (dates.length >= 2) return [dates[dates.length - 2], dates[dates.length - 1]];
  const year = new Date().getFullYear();
  return [`${year}-01-01`, `${year}-12-31`];
}

function csvFeld(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvZahl(value: number, stellen: number): string {
  return value.toFixed(stellen).replace(".", ",");
}

export function ScreenVerbrauch() {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const [art, setArt] = useState<ZeitraumArt>("jahr");
  const [jahr, setJahr] = useState(String(new Date().getFullYear()));
  const [vonCustom, setVonCustom] = useState(`${new Date().getFullYear()}-01-01`);
  const [bisCustom, setBisCustom] = useState(`${new Date().getFullYear()}-12-31`);
  const [letzteVon, letzteBis] = useMemo(() => zeitraumLetzteAblesungen(state), [state.ablesung]);
  const [von, bis] =
    art === "jahr"
      ? [`${jahr}-01-01`, `${jahr}-12-31`]
      : art === "benutzerdefiniert"
        ? [vonCustom, bisCustom]
        : [letzteVon, letzteBis];
  const gueltigerZeitraum = isValidISODate(von) && isValidISODate(bis) && von <= bis;

  const zaehler = useMemo(() => state.zaehler.filter((z) => !z.deleted), [state.zaehler]);
  const deltas = useMemo(
    () => gueltigerZeitraum ? meterDeltas(state.ablesung, zaehler, von, bis) : new Map(),
    [state.ablesung, zaehler, von, bis, gueltigerZeitraum],
  );
  const ablesungenJeZaehler = useMemo(
    () =>
      gueltigerZeitraum ? zaehler.map((z) => {
        const d = deltas.get(z.id);
        const eigen = ownDelta(state.ablesung, zaehler, z.id, von, bis, deltas);
        const children = eigen.directChildIds.flatMap((id) => {
          const child = zaehler.find((meter) => meter.id === id);
          return child ? [{ meter: child, delta: deltas.get(id)?.delta }] : [];
        });
        const raw = eigen.own;
        const display =
          raw === null ? null : z.einheit === "MWh" ? kwhToMwh(raw) : litreToM3(raw);
        return { zaehler: z, start: d?.start?.stand ?? null, ende: d?.end?.stand ?? null, display, children };
      }) : [],
    [state.ablesung, zaehler, deltas, von, bis, gueltigerZeitraum],
  );
  const ergebnis = useMemo(
    () => gueltigerZeitraum ?
      buildSettlement(state, {
        von,
        bis,
        verteilSchluessel: state.einstellungen.verteilSchluessel,
      }) : null,
    [state, von, bis, gueltigerZeitraum],
  );
  const preisMwh = ergebnis?.effektiverPreisMWh ?? 0;
  const preisM3 = ergebnis?.effektiverPreisM3 ?? 0;

  const csvExportieren = () => {
    if (!ergebnis) return;
    const header = [
      t("verbrauch.bewohner"),
      t("verbrauch.csvWarmwasser"),
      t("verbrauch.csvKaltwasser"),
      t("verbrauch.csvEnergie"),
      t("verbrauch.csvAnteil"),
      t("verbrauch.csvKosten"),
    ];
    const lines = [
      header,
      ...ergebnis.positionen.map((p) => [
        p.bewohnerName,
        csvZahl(p.wasserWarmM3, 3),
        csvZahl(p.wasserKaltM3, 3),
        csvZahl(p.energieMWh, 3),
        csvZahl(p.anteilProzent, 2),
        csvZahl(p.kostenTheoretisch, 2),
      ]),
    ]
      .map((row) => row.map(csvFeld).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", lines], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `verbrauch-${von}-${bis}.csv`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="pt-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("verbrauch.titel")}</h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{von} – {bis}</p>
        </div>
        <KnopfSekundaer
          disabled={!ergebnis || ergebnis.positionen.length === 0}
          onClick={csvExportieren}
        >
          {t("verbrauch.csvExport")}
        </KnopfSekundaer>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
          {t("verbrauch.zeitraum")}
          <Auswahl value={art} onChange={(event) => setArt(event.target.value as ZeitraumArt)}>
            <option value="jahr">{t("verbrauch.jahr")}</option>
            <option value="benutzerdefiniert">{t("verbrauch.benutzerdefiniert")}</option>
            <option value="letzte">{t("verbrauch.letzteAblesung")}</option>
          </Auswahl>
        </label>
        {art === "jahr" ? (
          <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
            {t("verbrauch.jahr")}
            <Eingabe type="number" min="2000" max="2200" value={jahr} onChange={(event) => setJahr(event.target.value)} className="w-32" />
          </label>
        ) : art === "benutzerdefiniert" ? (
          <>
            <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
              {t("verbrauch.von")}
              <Eingabe type="date" value={vonCustom} onChange={(event) => setVonCustom(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
              {t("verbrauch.bis")}
              <Eingabe type="date" value={bisCustom} onChange={(event) => setBisCustom(event.target.value)} />
            </label>
          </>
        ) : null}
      </div>

      {!gueltigerZeitraum || !ergebnis ? (
        <p role="alert" className="border-t py-3 text-[0.875rem]" style={{ borderColor: "#e3ded4", color: "#b3261e" }}>
          {t("verbrauch.zeitraumUngueltig")}
        </p>
      ) : (
      <>
      <h3 className="mb-2 text-[1rem] font-semibold" style={{ color: "#1b1a17" }}>{t("verbrauch.zaehler")}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <thead><tr style={{ borderBottom: "1px solid #c9c3b6" }}>
            <th className="py-2 pr-3">{t("verbrauch.zaehler")}</th>
            <th className="py-2 pr-3">{t("verbrauch.start")}</th>
            <th className="py-2 pr-3">{t("verbrauch.ende")}</th>
            <th className="py-2 pr-3">{t("verbrauch.delta")}</th>
            <th className="py-2">{t("verbrauch.abzug")}</th>
          </tr></thead>
          <tbody>
            {ablesungenJeZaehler.map(({ zaehler: meter, start, ende, display, children }) => (
              <tr key={meter.id} style={{ borderBottom: "1px solid #e3ded4" }}>
                <td className="py-2 pr-3">{meter.bezeichnung} <span style={{ color: "#6b6862" }}>({meter.einheit})</span></td>
                <td className="tnum py-2 pr-3 text-right">{zahl(start, 3)}</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(ende, 3)}</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(display, 3)}</td>
                <td className="py-2">{children.length
                  ? children.map(({ meter: child, delta }) => {
                    const deduction = delta == null
                      ? null
                      : child.einheit === "MWh"
                        ? kwhToMwh(delta)
                        : litreToM3(delta);
                    return `${child.bezeichnung}: ${zahl(deduction, 3)} ${child.einheit}`;
                  }).join(", ")
                  : "—"}</td>
              </tr>
            ))}
            {!ablesungenJeZaehler.length ? <tr><td className="py-3" colSpan={5}>{t("verbrauch.keineZaehler")}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 mt-7 text-[1rem] font-semibold" style={{ color: "#1b1a17" }}>{t("verbrauch.verteilung")}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <thead><tr style={{ borderBottom: "1px solid #c9c3b6" }}>
            <th className="py-2 pr-3">{t("verbrauch.bewohner")}</th>
            <th className="py-2 pr-3">{t("verbrauch.warm")}</th>
            <th className="py-2 pr-3">{t("verbrauch.kalt")}</th>
            <th className="py-2 pr-3">{t("verbrauch.energie")}</th>
            <th className="py-2 pr-3">{t("verbrauch.anteil")}</th>
            <th className="py-2">{t("verbrauch.kosten")}</th>
          </tr></thead>
          <tbody>
            {ergebnis.positionen.map((p) => (
              <tr key={p.bewohnerId} style={{ borderBottom: "1px solid #e3ded4" }}>
                <td className="py-2 pr-3">{p.bewohnerName}</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(p.wasserWarmM3, 3)} m³</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(p.wasserKaltM3, 3)} m³</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(p.energieMWh, 3)} MWh</td>
                <td className="tnum py-2 pr-3 text-right">{zahl(p.anteilProzent, 2)} %</td>
                <td className="tnum py-2 text-right">{geld(p.kostenTheoretisch)}</td>
              </tr>
            ))}
            {!ergebnis.positionen.length ? <tr><td className="py-3" colSpan={6}>{t("verbrauch.keineBewohner")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 border-t pt-3 text-[0.8125rem]" style={{ borderColor: "#c9c3b6", color: "#55524c" }}>
        <p>{t("verbrauch.summe")}: {geld(ergebnis.theoretischGesamt)} · {t("verbrauch.preise")}: {zahl(preisMwh, 4)} €/MWh, {zahl(preisM3, 4)} €/m³</p>
        {ergebnis.globaleHinweise
          .filter((hinweis) =>
            hinweis.code !== "abrechnung.keineVerteilungsbasisEnergie" ||
            ergebnis.gemeinschaft.energieKwh > 0,
          )
          .map((hinweis, index) => (
            <p key={`${hinweis.code}-${index}`} className="mt-1">{t(hinweis.code, hinweis.params)}</p>
          ))}
        {ergebnis.plausibilitaet.hinweise.map((hinweis, index) => (
          <p key={`${hinweis.zaehlerId}-${index}`} className="mt-1">
            {t(hinweis.text.code, hinweis.text.params)}
          </p>
        ))}
      </div>
      </>
      )}
    </section>
  );
}
