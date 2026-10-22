import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildSettlement, freezeSettlement } from "../../domain/calc/settlement";
import { exportiereJson, exportDateiname } from "../../domain/io/json";
import type { Abrechnung, AbrechnungStatus } from "../../domain/types";
import { useAppStore } from "../../state/store";
import { geld, zahl } from "../format";
import { Auswahl, Eingabe, KnopfPrimär, KnopfSekundaer } from "../components/Primitives";

function csvFeld(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvZahl(value: number, stellen: number): string {
  return value.toFixed(stellen).replace(".", ",");
}

function dateiSpeichern(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dateiname;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function abrechnungsCsv(abrechnung: Abrechnung): Blob {
  const zeilen: (string | number)[][] = [
    ["Jahr", "Bewohner", "Warmwasser (m³)", "Kaltwasser (m³)", "Energie (MWh)", "Anteil (%)", "Theoretische Kosten (EUR)", "Betreiberbetrag (EUR)", "Abschläge (EUR)", "Saldo (EUR)", "Hinweise"],
    ...abrechnung.positionen.map((position) => [
      abrechnung.jahr,
      position.bewohnerName,
      csvZahl(position.wasserWarmM3, 3),
      csvZahl(position.wasserKaltM3, 3),
      csvZahl(position.energieMWh, 3),
      csvZahl(position.anteilProzent, 2),
      csvZahl(position.kostenTheoretisch, 2),
      csvZahl(position.rechnungsbetrag, 2),
      csvZahl(position.summeAbschlaege, 2),
      csvZahl(position.saldo, 2),
      position.hinweise.map((hinweis) => hinweis.code).join(", "),
    ]),
  ];
  const inhalt = zeilen.map((zeile) => zeile.map(csvFeld).join(";")).join("\r\n");
  return new Blob(["\ufeff", inhalt], { type: "text/csv;charset=utf-8" });
}

function parseZahl(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export function ScreenAbrechnung() {
  const { t } = useTranslation();
  const state = useAppStore((store) => store.state);
  const abrechnungSpeichern = useAppStore((store) => store.abrechnungSpeichern);
  const abrechnungFinalisieren = useAppStore((store) => store.abrechnungAbschliessen);
  const abrechnungStatusSetzen = useAppStore((store) => store.abrechnungStatusSetzen);
  const importJson = useAppStore((store) => store.importJson);
  const meldungSetzen = useAppStore((store) => store.meldungSetzen);
  const [jahr, setJahr] = useState(String(new Date().getFullYear()));
  const [betreiberBetrag, setBetreiberBetrag] = useState("");
  const [istMwh, setIstMwh] = useState("");
  const [betragQuelle, setBetragQuelle] = useState<"betrag" | "mwh">("betrag");
  const [betreiberHinweis, setBetreiberHinweis] = useState("");
  const [pdfBewohnerId, setPdfBewohnerId] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfDateiname, setPdfDateiname] = useState("");
  const [neuBerechnen, setNeuBerechnen] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const gespeicherte = state.abrechnung.find((item) => item.jahr === Number(jahr));
  const eingabeParsed = parseZahl(betragQuelle === "betrag" ? betreiberBetrag : istMwh);
  const jahrGueltig = /^\d{4}$/.test(jahr) && Number(jahr) >= 2000 && Number(jahr) <= 2200;
  const basisErgebnis = useMemo(
    () =>
      jahrGueltig
        ? buildSettlement(state, {
            von: `${jahr}-01-01`,
            bis: `${jahr}-12-31`,
            verteilSchluessel: state.einstellungen.verteilSchluessel,
          })
        : null,
    [state, jahr, jahrGueltig, neuBerechnen],
  );
  const betragEffektiv =
    betragQuelle === "betrag"
      ? eingabeParsed
      : eingabeParsed !== null && basisErgebnis
        ? eingabeParsed * basisErgebnis.effektiverPreisMWh
        : null;
  const mwhPreisFehlt =
    betragQuelle === "mwh" &&
    eingabeParsed !== null &&
    (basisErgebnis?.effektiverPreisMWh ?? 0) <= 0;
  const betragUngueltig = Number.isNaN(eingabeParsed) || mwhPreisFehlt;
  const ergebnis = useMemo(
    () =>
      basisErgebnis && !betragUngueltig
        ? buildSettlement(state, {
            von: `${jahr}-01-01`,
            bis: `${jahr}-12-31`,
            betreiberBetrag: betragEffektiv,
            verteilSchluessel: state.einstellungen.verteilSchluessel,
          })
        : null,
    [state, jahr, basisErgebnis, betragUngueltig, betragEffektiv, neuBerechnen],
  );

  useEffect(() => {
    setBetreiberBetrag(gespeicherte ? String(gespeicherte.betreiberBetrag).replace(".", ",") : "");
    setBetreiberHinweis(gespeicherte?.betreiberHinweis ?? "");
    setBetragQuelle("betrag");
    setIstMwh("");
    setPdfBewohnerId("");
  }, [jahr, gespeicherte?.id]);

  useEffect(() => {
    setPdfUrl(null);
    setPdfBlob(null);
    setPdfDateiname("");
  }, [jahr, pdfBewohnerId, gespeicherte?.id, state.updatedAt]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const personBearbeitbar = !gespeicherte || gespeicherte.status === "entwurf";
  const positionenAnzeigen =
    gespeicherte && gespeicherte.status !== "entwurf"
      ? gespeicherte.positionen
      : ergebnis?.positionen ?? [];
  const theoretischeSumme = gespeicherte && gespeicherte.status !== "entwurf"
    ? gespeicherte.positionen.reduce((sum, position) => sum + position.kostenTheoretisch, 0)
    : ergebnis?.theoretischGesamt ?? 0;
  const verteilteSumme = gespeicherte && gespeicherte.status !== "entwurf"
    ? gespeicherte.positionen.reduce((sum, position) => sum + position.rechnungsbetrag, 0)
    : ergebnis?.verteiltGesamt ?? 0;
  const preisabweichung = verteilteSumme - theoretischeSumme;
  const statusText: Record<AbrechnungStatus, string> = {
    entwurf: t("abrechnungUI.statusEntwurf"),
    verteilt: t("abrechnungUI.statusVerteilt"),
    beglichen: t("abrechnungUI.statusBeglichen"),
  };

  const entwurfSichern = () => {
    if (!ergebnis || !personBearbeitbar) return;
    const eingefroren = freezeSettlement(
      ergebnis,
      gespeicherte?.id ?? `abrechnung-${jahr}`,
      betreiberHinweis.trim(),
    );
    abrechnungSpeichern(eingefroren);
    meldungSetzen({ art: "erfolg", text: t("abrechnungUI.entwurfGespeichert") });
  };

  const abschliessen = () => {
    if (!gespeicherte || gespeicherte.status !== "entwurf" || !ergebnis) return;
    if (ergebnis && (!ergebnis.abschliessbar || ergebnis.unvollstaendig)) {
      if (!globalThis.confirm(t("abrechnungUI.warnungFreigabe"))) return;
    }
    abrechnungFinalisieren(
      freezeSettlement(ergebnis, gespeicherte.id, betreiberHinweis.trim()),
    );
    meldungSetzen({ art: "erfolg", text: t("abrechnungUI.abgeschlossen") });
  };

  const pdfVorschauOeffnen = async () => {
    if (!gespeicherte) return;
    setPdfBusy(true);
    try {
      const { abrechnungAlsPdf } = await import("../pdf");
      const bytes = await abrechnungAlsPdf(gespeicherte, state.einstellungen, pdfBewohnerId || undefined);
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
      const suffix = pdfBewohnerId
        ? gespeicherte.positionen.find((position) => position.bewohnerId === pdfBewohnerId)?.bewohnerName ?? "bewohner"
        : "sammel";
      const dateiname = `abrechnung-${gespeicherte.jahr}-${suffix.toLocaleLowerCase("de-DE").replace(/[^a-z0-9-]+/g, "-")}.pdf`;
      setPdfBlob(blob);
      setPdfDateiname(dateiname);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (error) {
      meldungSetzen({
        art: "fehler",
        text: t("abrechnungUI.pdfFehler", { reason: error instanceof Error ? error.message : String(error) }),
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const pdfTeilen = async () => {
    if (!pdfBlob || !pdfDateiname) return;
    const file = new File([pdfBlob], pdfDateiname, { type: "application/pdf" });
    try {
      if (typeof navigator.share === "function" &&
          (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: t("abrechnungUI.pdfTitel", { year: gespeicherte?.jahr ?? jahr }),
        });
        return;
      }
      dateiSpeichern(pdfBlob, pdfDateiname);
      meldungSetzen({ art: "info", text: t("abrechnungUI.teilenNichtVerfuegbar") });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      meldungSetzen({
        art: "fehler",
        text: t("abrechnungUI.pdfFehler", { reason: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const jsonExportieren = () => {
    const dateiname = exportDateiname(state);
    dateiSpeichern(new Blob([exportiereJson(state)], { type: "application/json;charset=utf-8" }), dateiname);
  };

  const jsonImportieren = async (file?: File) => {
    if (!file) return;
    if (!globalThis.confirm(t("abrechnungUI.importBestaetigen"))) return;
    try {
      const result = importJson(await file.text());
      meldungSetzen({ art: result.ok ? "erfolg" : "fehler", text: result.text });
    } catch (error) {
      meldungSetzen({
        art: "fehler",
        text: t("abrechnungUI.importFehler", { reason: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  return (
    <section className="screen-stack">
      <div className="page-heading">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("abrechnungUI.titel")}</h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abrechnungUI.untertitel")}</p>
        </div>
        {gespeicherte ? (
          <span className="min-h-11 py-2 text-[0.875rem] font-medium">{statusText[gespeicherte.status]}</span>
        ) : null}
      </div>

      <div className="surface-card flex flex-wrap items-end gap-4 p-4 sm:p-5">
        <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
          {t("abrechnungUI.jahr")}
          <Eingabe type="number" min="2000" max="2200" value={jahr} onChange={(event) => setJahr(event.target.value)} className="w-32" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
          {t("abrechnungUI.betragBerechnung")}
          <Auswahl
            value={betragQuelle}
            onChange={(event) => setBetragQuelle(event.target.value as "betrag" | "mwh")}
            disabled={!personBearbeitbar}
          >
            <option value="betrag">{t("abrechnungUI.betragDirekt")}</option>
            <option value="mwh">{t("abrechnungUI.betragAusMwh")}</option>
          </Auswahl>
        </label>
        {betragQuelle === "betrag" ? (
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
            {t("abrechnungUI.betreiberBetrag")}
            <Eingabe
              inputMode="decimal"
              value={betreiberBetrag}
              onChange={(event) => setBetreiberBetrag(event.target.value)}
              disabled={!personBearbeitbar}
              placeholder={t("abrechnungUI.betragLeer")}
            />
          </label>
        ) : (
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
            {t("abrechnungUI.istMwh")}
            <Eingabe
              inputMode="decimal"
              value={istMwh}
              onChange={(event) => setIstMwh(event.target.value)}
              disabled={!personBearbeitbar}
              placeholder={t("abrechnungUI.mwhLeer")}
            />
          </label>
        )}
        {betragQuelle === "mwh" && eingabeParsed !== null && ergebnis ? (
          <p className="w-full text-[0.8125rem] sm:w-auto" style={{ color: "#6b6862" }}>
            {t("abrechnungUI.betragAusMwhInfo", {
              mwh: zahl(eingabeParsed),
              price: zahl(ergebnis.effektiverPreisMWh, 4),
              amount: geld(ergebnis.betreiberBetrag),
            })}
          </p>
        ) : null}
        <label className="flex min-w-full flex-col gap-1 text-[0.75rem] sm:min-w-0 sm:flex-1" style={{ color: "#55524c" }}>
          {t("abrechnungUI.betreiberHinweis")}
          <Eingabe value={betreiberHinweis} onChange={(event) => setBetreiberHinweis(event.target.value)} disabled={!personBearbeitbar} />
        </label>
      </div>
      {gespeicherte && gespeicherte.status !== "entwurf" ? (
        <p className="border-b py-2 text-[0.8125rem]" style={{ borderColor: "#e1e5df", color: "#6b6862" }}>
          {t("abrechnungUI.positionenEingefroren")}
        </p>
      ) : null}

      {betragUngueltig ? (
        <p role="alert" className="py-2 text-[0.8125rem]" style={{ color: "#b3261e" }}>
          {mwhPreisFehlt ? t("abrechnungUI.preisMwhFehlt") : t("abrechnungUI.betragUngueltig")}
        </p>
      ) : null}
      {!jahrGueltig ? (
        <p role="alert" className="border-b py-3 text-[0.875rem]" style={{ borderColor: "#e1e5df", color: "#b3261e" }}>{t("abrechnungUI.jahrUngueltig")}</p>
      ) : ergebnis ? (
        <>
          <div className="surface-card surface-card--soft flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[0.875rem]">
              {t("abrechnungUI.theoretisch")}: <strong className="tnum">{geld(theoretischeSumme)}</strong>
              {" · "}
              {t("abrechnungUI.verteilteSumme")}: <strong className="tnum">{geld(verteilteSumme)}</strong>
            </p>
            <KnopfSekundaer onClick={() => setNeuBerechnen((current) => current + 1)} disabled={!personBearbeitbar}>
              {t("abrechnungUI.neuBerechnen")}
            </KnopfSekundaer>
          </div>

          {preisabweichung !== 0 ? (
            <p className="border-b pb-3 text-[0.8125rem]" style={{ borderColor: "#e1e5df", color: "#8a5a00" }}>
              {t("abrechnungUI.abweichung", { amount: geld(preisabweichung) })}
            </p>
          ) : null}
          {(!gespeicherte || gespeicherte.status === "entwurf") ? ergebnis.globaleHinweise.map((hinweis, index) => (
            <p key={`${hinweis.code}-${index}`} className="border-b py-2 text-[0.8125rem]" style={{ borderColor: "#e1e5df", color: "#8a5a00" }}>
              {t(hinweis.code, hinweis.params)}
            </p>
          )) : null}
          {(!gespeicherte || gespeicherte.status === "entwurf") ? ergebnis.plausibilitaet.hinweise.map((hinweis, index) => (
            <p key={`${hinweis.zaehlerId}-${index}`} className="border-b py-2 text-[0.8125rem]" style={{ borderColor: "#e1e5df", color: hinweis.blockierend ? "#b3261e" : "#8a5a00" }}>
              {t(hinweis.text.code, hinweis.text.params)}
            </p>
          )) : null}

          <div className="surface-card p-3 sm:p-4">
            <div className="grid gap-3 md:hidden">
              {positionenAnzeigen.map((position) => (
                <article key={position.bewohnerId} className="surface-card--soft rounded-lg border p-3">
                  <h4 className="mb-2 font-semibold">{position.bewohnerName}</h4>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.8125rem]">
                    <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.warm")}</dt><dd className="tnum">{zahl(position.wasserWarmM3)} m³</dd></div>
                    <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.kalt")}</dt><dd className="tnum">{zahl(position.wasserKaltM3)} m³</dd></div>
                    <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.energie")}</dt><dd className="tnum">{zahl(position.energieMWh)} MWh</dd></div>
                    <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.anteil")}</dt><dd className="tnum">{zahl(position.anteilProzent, 2)} %</dd></div>
                    <div><dt style={{ color: "#6b6862" }}>{t("abrechnungUI.kosten")}</dt><dd className="tnum">{geld(position.rechnungsbetrag)}</dd></div>
                    <div><dt style={{ color: "#6b6862" }}>{t("abrechnungUI.abschlaege")}</dt><dd className="tnum">{geld(position.summeAbschlaege)}</dd></div>
                    <div className="col-span-2 border-t pt-2" style={{ borderColor: "#e1e5df" }}>
                      <dt style={{ color: "#6b6862" }}>{t("abrechnungUI.saldo")}</dt>
                      <dd className="tnum font-semibold">{geld(position.saldo)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              <article className="surface-card--soft rounded-lg border p-3" style={{ borderColor: "#c7cdc5" }}>
                <h4 className="mb-2 font-semibold">{t("abrechnungUI.summe")}</h4>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.8125rem]">
                  <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.warm")}</dt><dd className="tnum">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.wasserWarmM3, 0))} m³</dd></div>
                  <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.kalt")}</dt><dd className="tnum">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.wasserKaltM3, 0))} m³</dd></div>
                  <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.energie")}</dt><dd className="tnum">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.energieMWh, 0))} MWh</dd></div>
                  <div><dt style={{ color: "#6b6862" }}>{t("verbrauch.anteil")}</dt><dd className="tnum">100 %</dd></div>
                  <div><dt style={{ color: "#6b6862" }}>{t("abrechnungUI.kosten")}</dt><dd className="tnum">{geld(verteilteSumme)}</dd></div>
                  <div><dt style={{ color: "#6b6862" }}>{t("abrechnungUI.abschlaege")}</dt><dd className="tnum">{geld(positionenAnzeigen.reduce((sum, p) => sum + p.summeAbschlaege, 0))}</dd></div>
                  <div className="col-span-2 border-t pt-2" style={{ borderColor: "#e1e5df" }}>
                    <dt style={{ color: "#6b6862" }}>{t("abrechnungUI.saldo")}</dt>
                    <dd className="tnum font-semibold">{geld(positionenAnzeigen.reduce((sum, p) => sum + p.saldo, 0))}</dd>
                  </div>
                </dl>
              </article>
            </div>
            <div className="table-scroll hidden overflow-x-auto md:block">
            <table className="min-w-[68rem] w-full border-collapse text-left text-[0.8125rem]">
              <thead><tr style={{ borderBottom: "1px solid #c7cdc5" }}>
                <th className="py-2 pr-3">{t("verbrauch.bewohner")}</th>
                <th className="py-2 pr-3 text-right">{t("verbrauch.warm")}</th>
                <th className="py-2 pr-3 text-right">{t("verbrauch.kalt")}</th>
                <th className="py-2 pr-3 text-right">{t("verbrauch.energie")}</th>
                <th className="py-2 pr-3 text-right">{t("verbrauch.anteil")}</th>
                <th className="py-2 pr-3 text-right">{t("abrechnungUI.kosten")}</th>
                <th className="py-2 pr-3 text-right">{t("abrechnungUI.abschlaege")}</th>
                <th className="py-2 text-right">{t("abrechnungUI.saldo")}</th>
              </tr></thead>
              <tbody>
                {positionenAnzeigen.map((position) => (
                  <tr key={position.bewohnerId} style={{ borderBottom: "1px solid #e1e5df" }}>
                    <td className="py-2 pr-3">{position.bewohnerName}</td>
                    <td className="tnum py-2 pr-3 text-right">{zahl(position.wasserWarmM3)} m³</td>
                    <td className="tnum py-2 pr-3 text-right">{zahl(position.wasserKaltM3)} m³</td>
                    <td className="tnum py-2 pr-3 text-right">{zahl(position.energieMWh)} MWh</td>
                    <td className="tnum py-2 pr-3 text-right">{zahl(position.anteilProzent, 2)} %</td>
                    <td className="tnum py-2 pr-3 text-right">{geld(position.rechnungsbetrag)}</td>
                    <td className="tnum py-2 pr-3 text-right">{geld(position.summeAbschlaege)}</td>
                    <td className="tnum py-2 text-right">{geld(position.saldo)}</td>
                  </tr>
                ))}
                <tr className="font-semibold" style={{ borderTop: "1px solid #c7cdc5" }}>
                  <td className="py-2 pr-3">{t("abrechnungUI.summe")}</td>
                  <td className="tnum py-2 pr-3 text-right">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.wasserWarmM3, 0))} m³</td>
                  <td className="tnum py-2 pr-3 text-right">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.wasserKaltM3, 0))} m³</td>
                  <td className="tnum py-2 pr-3 text-right">{zahl(positionenAnzeigen.reduce((sum, p) => sum + p.energieMWh, 0))} MWh</td>
                  <td className="tnum py-2 pr-3 text-right">100 %</td>
                  <td className="tnum py-2 pr-3 text-right">{geld(verteilteSumme)}</td>
                  <td className="tnum py-2 pr-3 text-right">{geld(positionenAnzeigen.reduce((sum, p) => sum + p.summeAbschlaege, 0))}</td>
                  <td className="tnum py-2 text-right">{geld(positionenAnzeigen.reduce((sum, p) => sum + p.saldo, 0))}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <KnopfPrimär onClick={entwurfSichern} disabled={!personBearbeitbar || !ergebnis.positionen.length}>
              {gespeicherte ? t("abrechnungUI.entwurfAktualisieren") : t("abrechnungUI.entwurfSpeichern")}
            </KnopfPrimär>
            {gespeicherte?.status === "entwurf" ? (
              <KnopfSekundaer onClick={abschliessen}>{t("abrechnungUI.abschliessen")}</KnopfSekundaer>
            ) : null}
            {gespeicherte?.status === "verteilt" ? (
              <KnopfSekundaer onClick={() => abrechnungStatusSetzen(gespeicherte.id, "beglichen")}>{t("abrechnungUI.alsBeglichen")}</KnopfSekundaer>
            ) : null}
          </div>
        </>
      ) : null}

      <section className="surface-card p-4 sm:p-5">
        <h3 className="font-semibold">{t("abrechnungUI.pdfCsvTitel")}</h3>
        <p className="mt-1 text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abrechnungUI.pdfCsvHinweis")}</p>
        {gespeicherte ? (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
                {t("abrechnungUI.pdfZiel")}
                <Auswahl value={pdfBewohnerId} onChange={(event) => setPdfBewohnerId(event.target.value)}>
                  <option value="">{t("abrechnungUI.alleBewohner")}</option>
                  {gespeicherte.positionen.map((position) => (
                    <option key={position.bewohnerId} value={position.bewohnerId}>{position.bewohnerName}</option>
                  ))}
                </Auswahl>
              </label>
              <KnopfSekundaer disabled={pdfBusy} onClick={() => void pdfVorschauOeffnen()}>{t("abrechnungUI.pdfVorschauErzeugen")}</KnopfSekundaer>
              <KnopfSekundaer onClick={() => dateiSpeichern(abrechnungsCsv(gespeicherte), `abrechnung-${gespeicherte.jahr}.csv`)}>{t("abrechnungUI.csvExport")}</KnopfSekundaer>
            </div>
            {pdfUrl ? (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[0.875rem] font-medium">{t("abrechnungUI.pdfVorschau")}</h4>
                  <div className="flex flex-wrap gap-2">
                    {pdfBlob ? <KnopfSekundaer onClick={() => dateiSpeichern(pdfBlob, pdfDateiname)}>{t("abrechnungUI.pdfDownload")}</KnopfSekundaer> : null}
                    <KnopfSekundaer onClick={() => void pdfTeilen()}>{t("abrechnungUI.pdfTeilen")}</KnopfSekundaer>
                  </div>
                </div>
                <iframe title={t("abrechnungUI.pdfVorschau")} src={pdfUrl} className="h-[70vh] w-full rounded-lg border" style={{ borderColor: "#c7cdc5" }} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abrechnungUI.pdfErstSpeichern")}</p>
        )}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <h3 className="font-semibold">{t("abrechnungUI.backupTitel")}</h3>
        <p className="mt-1 text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abrechnungUI.backupHinweis")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <KnopfSekundaer onClick={jsonExportieren}>{t("abrechnungUI.jsonExport")}</KnopfSekundaer>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border bg-white px-4 text-[0.9375rem] font-medium" style={{ borderColor: "#c7cdc5", color: "#1b1a17" }}>
            {t("abrechnungUI.jsonImport")}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                void jsonImportieren(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </section>
  );
}
