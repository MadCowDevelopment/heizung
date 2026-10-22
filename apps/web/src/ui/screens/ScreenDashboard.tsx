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
  const hatVollstaendigeVerbrauchsdaten =
    state.zaehler.some((meter) => !meter.deleted) && !ergebnis.unvollstaendig;
  const gesamtverbrauch = ergebnis.positionen.length
    ? ergebnis.positionen.reduce(
        (sum, position) => ({
          energieMWh: sum.energieMWh + position.energieMWh,
          wasserWarmM3: sum.wasserWarmM3 + position.wasserWarmM3,
          wasserKaltM3: sum.wasserKaltM3 + position.wasserKaltM3,
        }),
        { energieMWh: 0, wasserWarmM3: 0, wasserKaltM3: 0 },
      )
    : {
        energieMWh: ergebnis.gemeinschaft.energieKwh / 1000,
        wasserWarmM3: ergebnis.gemeinschaft.wasserWarmL / 1000,
        wasserKaltM3: ergebnis.gemeinschaft.wasserKaltL / 1000,
      };
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
    <section className="screen-stack">
      <div className="page-heading">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("dashboard.titel")}</h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("dashboard.zeitraum", { year: jahr })}</p>
        </div>
        <Link
          className="button-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[0.9375rem] font-medium sm:w-auto"
          to="/ablesung"
        >
          {t("dashboard.neueAblesung")}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <h3 className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("dashboard.verbrauch")}</h3>
          {hatVollstaendigeVerbrauchsdaten ? (
            <>
              <p className="mt-2 tnum text-[1.125rem]">
                <span style={{ color: "#a34f00" }}>◈ {t("dashboard.energie")}: {zahl(gesamtverbrauch.energieMWh)} MWh</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-x-4 tnum text-[0.875rem]">
                <span style={{ color: "#c62828" }}>▲ {t("dashboard.warm")}: {zahl(gesamtverbrauch.wasserWarmM3)} m³</span>
                <span style={{ color: "#1565c0" }}>▼ {t("dashboard.kalt")}: {zahl(gesamtverbrauch.wasserKaltM3)} m³</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-[0.875rem]" style={{ color: "#6b6862" }}>
              {t("dashboard.keineVerbrauchsdaten")}
            </p>
          )}
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h3 className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("dashboard.abschlaege")}</h3>
          <p className="mt-2 tnum text-[1.125rem]">{geld(offeneAbschlaege)}</p>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("dashboard.offen")}</p>
        </section>
      </div>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("dashboard.kostenBewohner")}</h3>
          <Link className="min-h-11 py-2 text-[0.875rem] underline underline-offset-4" style={{ color: "#1b1a17" }} to="/abrechnung">
            {t("dashboard.zurAbrechnung")}
          </Link>
        </div>
        {ergebnis.positionen.length ? (
          <div className="mt-2 divide-y" style={{ borderColor: "#e1e5df" }}>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <h3 className="font-semibold">{t("dashboard.letzteAblesung")}</h3>
          <p className="mt-2 text-[0.875rem]">
            {letzteAblesung ? (
              <>
                <span className="block break-words">
                  {letzterZaehler?.bezeichnung ?? t("dashboard.unbekannterZaehler")}
                </span>
                <span className="tnum text-[0.8125rem]" style={{ color: "#55524c" }}>
                  {datum(letzteAblesung.datum)} · {zahl(letzteAblesung.stand)} {letzterZaehler?.einheit ?? ""}
                </span>
              </>
            ) : t("dashboard.keineAblesung")}
          </p>
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h3 className="font-semibold">{t("dashboard.sync")}</h3>
          <p className="mt-2 text-[0.875rem]">{t(`cloud.syncStatus.${syncStatus}`)}</p>
        </section>
      </div>

      <section className="surface-card surface-card--soft p-4 sm:p-5">
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
        <Link className={KNOPF_SEKUNDAER_KLASSE} style={KNOPF_SEKUNDAER_STIL} to="/einstellungen">{t("nav.einstellungen")}</Link>
      </div>
    </section>
  );
}
