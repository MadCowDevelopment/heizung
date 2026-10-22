import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildSettlement } from "../../domain/calc/settlement";
import { today } from "../../domain/calc/dates";
import { useAppStore } from "../../state/store";
import { datum, geld, zahl } from "../format";
import { KNOPF_SEKUNDAER_KLASSE, KNOPF_SEKUNDAER_STIL } from "../components/Primitives";

export function ScreenDashboard() {
  const { t } = useTranslation();
  const state = useAppStore((store) => store.state);
  const syncStatus = useAppStore((store) => store.syncStatus);
  const jahr = new Date().getFullYear();
  const von = `${jahr}-01-01`;
  const bis = `${jahr}-12-31`;
  const ergebnis = useMemo(
    () => buildSettlement(state, { von, bis, verteilSchluessel: state.einstellungen.verteilSchluessel }),
    [state, von, bis],
  );
  const letzteAblesung = useMemo(
    () =>
      [...state.ablesung]
        .filter((reading) => !reading.deleted)
        .sort((a, b) => b.datum.localeCompare(a.datum))[0],
    [state.ablesung],
  );
  const letzterZaehler = letzteAblesung
    ? state.zaehler.find((meter) => meter.id === letzteAblesung.zaehlerId)
    : undefined;
  const stichtag = today();
  const zugeordneteZahlungen = new Set<string>();
  let offeneAbschlaege = 0;
  for (const plan of state.abschlagPlan.filter((item) => item.aktiv)) {
    const anzahlMonate = plan.rhythmus === "jaehrlich" ? 1 : 12;
    for (let monat = 1; monat <= anzahlMonate; monat++) {
      const faelligAm = `${jahr}-${String(plan.rhythmus === "jaehrlich" ? 1 : monat).padStart(2, "0")}-01`;
      if (faelligAm > stichtag) continue;
      const zahlung = state.zahlung.find(
        (item) =>
          !item.deleted &&
          item.bewohnerId === plan.bewohnerId &&
          (item.abschlagPlanId === plan.id || !item.abschlagPlanId) &&
          item.faelligAm.slice(0, 7) === faelligAm.slice(0, 7),
      );
      if (zahlung) zugeordneteZahlungen.add(zahlung.id);
      if (!zahlung?.bezahltAm) offeneAbschlaege += zahlung?.betrag ?? plan.betrag;
    }
  }
  offeneAbschlaege += state.zahlung
    .filter(
      (payment) =>
        !payment.deleted &&
        !payment.bezahltAm &&
        !zugeordneteZahlungen.has(payment.id) &&
        payment.faelligAm.slice(0, 4) === String(jahr) &&
        payment.faelligAm <= stichtag,
    )
    .reduce((sum, payment) => sum + payment.betrag, 0);
  const warnungen = [
    ...ergebnis.globaleHinweise,
    ...ergebnis.plausibilitaet.hinweise.map((hinweis) => hinweis.text),
  ];

  return (
    <section className="pt-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "#c9c3b6" }}>
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("dashboard.titel")}</h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("dashboard.zeitraum", { year: jahr })}</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] px-4 text-[0.9375rem] font-medium"
          style={{ backgroundColor: "#1b1a17", color: "#faf8f4" }}
          to="/ablesung"
        >
          {t("dashboard.neueAblesung")}
        </Link>
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
          <h3 className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("dashboard.verbrauch")}</h3>
          <p className="mt-2 tnum text-[1.125rem]">
            <span style={{ color: "#a34f00" }}>◈ {t("dashboard.energie")}: {zahl(ergebnis.positionen.reduce((sum, position) => sum + position.energieMWh, 0))} MWh</span>
          </p>
          <p className="tnum text-[0.875rem]">
            <span style={{ color: "#c62828" }}>▲ {t("dashboard.warm")}: {zahl(ergebnis.positionen.reduce((sum, position) => sum + position.wasserWarmM3, 0))} m³</span>
            {" · "}
            <span style={{ color: "#1565c0" }}>▼ {t("dashboard.kalt")}: {zahl(ergebnis.positionen.reduce((sum, position) => sum + position.wasserKaltM3, 0))} m³</span>
          </p>
        </section>
        <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
          <h3 className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("dashboard.abschlaege")}</h3>
          <p className="mt-2 tnum text-[1.125rem]">{geld(offeneAbschlaege)}</p>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("dashboard.offen")}</p>
        </section>
      </div>

      <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("dashboard.kostenBewohner")}</h3>
          <Link className="min-h-11 py-2 text-[0.875rem] underline underline-offset-4" style={{ color: "#1b1a17" }} to="/abrechnung">
            {t("dashboard.zurAbrechnung")}
          </Link>
        </div>
        {ergebnis.positionen.length ? (
          <div className="mt-2 divide-y" style={{ borderColor: "#e3ded4" }}>
            {ergebnis.positionen.map((position) => (
              <div key={position.bewohnerId} className="flex min-h-11 items-center justify-between gap-3 py-2 text-[0.875rem]">
                <span>{position.bewohnerName}</span>
                <span className="tnum text-right">{geld(position.rechnungsbetrag)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[0.875rem]" style={{ color: "#6b6862" }}>{t("dashboard.keineBewohner")}</p>
        )}
      </section>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
          <h3 className="font-semibold">{t("dashboard.letzteAblesung")}</h3>
          <p className="mt-2 text-[0.875rem]">
            {letzteAblesung
              ? `${letzterZaehler?.bezeichnung ?? t("dashboard.unbekannterZaehler")} · ${datum(letzteAblesung.datum)} · ${zahl(letzteAblesung.stand)} ${letzterZaehler?.einheit ?? ""}`
              : t("dashboard.keineAblesung")}
          </p>
        </section>
        <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
          <h3 className="font-semibold">{t("dashboard.sync")}</h3>
          <p className="mt-2 text-[0.875rem]">{t(`cloud.syncStatus.${syncStatus}`)}</p>
        </section>
      </div>

      <section className="border-b py-4" style={{ borderColor: "#e3ded4" }}>
        <h3 className="font-semibold">{t("dashboard.warnungen", { count: warnungen.length })}</h3>
        {warnungen.length ? (
          <ul className="mt-2 list-inside list-disc text-[0.8125rem]" style={{ color: "#8a5a00" }}>
            {warnungen.map((hinweis, index) => <li key={`${hinweis.code}-${index}`}>{t(hinweis.code, hinweis.params)}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-[0.8125rem]" style={{ color: "#1f6f3f" }}>{t("dashboard.keineWarnungen")}</p>
        )}
      </section>

      <div className="flex flex-wrap gap-2 pt-4">
        <Link className={KNOPF_SEKUNDAER_KLASSE} style={KNOPF_SEKUNDAER_STIL} to="/bewohner">{t("nav.bewohner")}</Link>
        <Link className={KNOPF_SEKUNDAER_KLASSE} style={KNOPF_SEKUNDAER_STIL} to="/abrechnung">{t("nav.abrechnung")}</Link>
        <Link className={KNOPF_SEKUNDAER_KLASSE} style={KNOPF_SEKUNDAER_STIL} to="/konto">{t("nav.konto")}</Link>
      </div>
    </section>
  );
}
