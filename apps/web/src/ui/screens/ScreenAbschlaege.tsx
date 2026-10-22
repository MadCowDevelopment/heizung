import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AbschlagRhythmus } from "../../domain/types";
import { useAppStore } from "../../state/store";
import { datum, geld } from "../format";
import { Auswahl, Eingabe, KnopfPrimär, KnopfSekundaer, Textaktion } from "../components/Primitives";

const MONATE = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

export function ScreenAbschlaege() {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const zahlungAlsBezahlt = useAppStore((s) => s.zahlungAlsBezahlt);
  const zahlungStornieren = useAppStore((s) => s.zahlungStornieren);
  const abschlagSetzen = useAppStore((s) => s.abschlagSetzen);
  const abschlagLoeschen = useAppStore((s) => s.abschlagLoeschen);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [bearbeiten, setBearbeiten] = useState<{ bewohnerId: string; planId: string | null } | null>(null);
  const bewohner = useMemo(
    () => state.bewohner.filter((b) => !b.deleted && b.aktiv).sort((a, b) => a.name.localeCompare(b.name, "de")),
    [state.bewohner],
  );

  return (
    <section className="pt-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("abschlaege.titel")}</h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abschlaege.jahresraster")}</p>
        </div>
        <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
          {t("abschlaege.jahr")}
          <Eingabe type="number" min="2000" max="2200" value={jahr} onChange={(event) => setJahr(Number(event.target.value))} className="w-32" />
        </label>
      </div>

      {bewohner.map((person) => {
        const plaene = state.abschlagPlan.filter((p) => p.bewohnerId === person.id && p.aktiv);
        const records = state.zahlung.filter((p) => !p.deleted && p.bewohnerId === person.id && Number(p.faelligAm.slice(0, 4)) === jahr);
        const gesamtsumme = state.zahlung
          .filter((payment) =>
            !payment.deleted &&
            payment.bewohnerId === person.id &&
            Boolean(payment.bezahltAm) &&
            Number((payment.bezahltAm ?? payment.faelligAm).slice(0, 4)) === jahr,
          )
          .reduce((sum, payment) => sum + payment.betrag, 0);
        const plansumme = plaene.reduce(
          (sum, plan) => sum + plan.betrag * (plan.rhythmus === "jaehrlich" ? 1 : 12),
          0,
        );

        return (
          <article key={person.id} className="border-t py-4" style={{ borderColor: "#c9c3b6" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-semibold" style={{ color: "#1b1a17" }}>{person.name}</h3>
                <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>
                  {plaene.length ? t("abschlaege.planAnzahl", { count: plaene.length }) : t("abschlaege.keinPlan")} · {t("abschlaege.jahressumme")}: {geld(plansumme)} · {t("abschlaege.bezahltImJahr")}: {geld(gesamtsumme)}
                </p>
              </div>
              <Textaktion onClick={() => setBearbeiten({ bewohnerId: person.id, planId: null })}>
                {t("abschlaege.planHinzufuegen")}
              </Textaktion>
            </div>
            {bearbeiten?.bewohnerId === person.id && bearbeiten.planId === null ? (
              <PlanForm
                betrag={0}
                rhythmus="monatlich"
                onSave={(amount, cadence) => {
                  abschlagSetzen(person.id, amount, cadence);
                  setBearbeiten(null);
                  meldungSetzen({ art: "erfolg", text: t("abschlaege.planGespeichert") });
                }}
                onCancel={() => setBearbeiten(null)}
              />
            ) : null}
            {!plaene.length ? (
              <p className="mt-2 text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("abschlaege.planZumAnlegen")}</p>
            ) : (
              plaene.map((plan) => {
                const periodKeys = plan.rhythmus === "jaehrlich" ? [`${jahr}-01`] : MONATE.map((month) => `${jahr}-${month}`);
                return (
                  <div key={plan.id} className="mt-4 border-t pt-3" style={{ borderColor: "#e3ded4" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[0.8125rem] font-medium" style={{ color: "#1b1a17" }}>
                        {geld(plan.betrag)} / {t(`bewohner.${plan.rhythmus}`)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Textaktion onClick={() => setBearbeiten({ bewohnerId: person.id, planId: plan.id })}>{t("abschlaege.planBearbeiten")}</Textaktion>
                        <Textaktion gefahr onClick={() => abschlagLoeschen(plan.id)}>{t("abschlaege.planDeaktivieren")}</Textaktion>
                      </div>
                    </div>
                    {bearbeiten?.bewohnerId === person.id && bearbeiten.planId === plan.id ? (
                      <PlanForm
                        betrag={plan.betrag}
                        rhythmus={plan.rhythmus}
                        onSave={(amount, cadence) => {
                          abschlagSetzen(person.id, amount, cadence);
                          setBearbeiten(null);
                          meldungSetzen({ art: "erfolg", text: t("abschlaege.planGespeichert") });
                        }}
                        onCancel={() => setBearbeiten(null)}
                      />
                    ) : null}
                    <div className={`mt-2 grid gap-2 ${plan.rhythmus === "jaehrlich" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
                      {periodKeys.map((key) => {
                        const due = `${key}-01`;
                        const payment = records.find(
                          (item) => item.abschlagPlanId === plan.id && item.faelligAm.slice(0, 7) === key,
                        ) ?? records.find((item) => !item.abschlagPlanId && item.faelligAm.slice(0, 7) === key);
                        const paid = Boolean(payment?.bezahltAm);
                        return (
                          <div key={key} className="flex min-h-16 items-center justify-between gap-2 border-b px-1 py-2" style={{ borderColor: "#e3ded4" }}>
                            <div>
                              <p className="text-[0.8125rem] font-medium" style={{ color: "#1b1a17" }}>
                                {plan.rhythmus === "jaehrlich" ? jahr : t(`abschlaege.monat${key.slice(-2)}`)}
                              </p>
                              <p className="text-[0.75rem]" style={{ color: paid ? "#1f6f3f" : "#8a5a00" }}>
                                {paid ? `${t("abschlaege.bezahlt")} · ${datum(payment?.bezahltAm)}` : t("abschlaege.offen")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {paid && payment ? (
                                <Textaktion gefahr onClick={() => zahlungStornieren(payment.id)}>{t("abschlaege.stornieren")}</Textaktion>
                              ) : (
                                <KnopfSekundaer
                                  onClick={() => zahlungAlsBezahlt(person.id, payment?.faelligAm ?? due, payment?.betrag ?? plan.betrag, plan.id)}
                                >
                                  {t("abschlaege.alsBezahlt")}
                                </KnopfSekundaer>
                              )}
                              {!paid && payment ? <Textaktion gefahr onClick={() => zahlungStornieren(payment.id)}>{t("abschlaege.stornieren")}</Textaktion> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </article>
        );
      })}
      {!bewohner.length ? <p className="border-t py-4 text-[0.875rem]" style={{ borderColor: "#c9c3b6", color: "#6b6862" }}>{t("abschlaege.keineBewohner")}</p> : null}
    </section>
  );
}

function PlanForm({
  betrag: startBetrag,
  rhythmus: startRhythmus,
  onSave,
  onCancel,
}: {
  betrag: number;
  rhythmus: AbschlagRhythmus;
  onSave: (betrag: number, rhythmus: AbschlagRhythmus) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [betrag, setBetrag] = useState(String(startBetrag || ""));
  const [rhythmus, setRhythmus] = useState(startRhythmus);
  const [fehler, setFehler] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t py-3" style={{ borderColor: "#e3ded4" }}>
      <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
        {t("abschlaege.betrag")}
        <Eingabe inputMode="decimal" value={betrag} onChange={(event) => setBetrag(event.target.value)} className="w-36" />
      </label>
      <label className="flex flex-col gap-1 text-[0.75rem]" style={{ color: "#55524c" }}>
        {t("abschlaege.rhythmus")}
        <Auswahl value={rhythmus} onChange={(event) => setRhythmus(event.target.value as AbschlagRhythmus)}>
          <option value="monatlich">{t("bewohner.monatlich")}</option>
          <option value="jaehrlich">{t("bewohner.jaehrlich")}</option>
        </Auswahl>
      </label>
      <KnopfPrimär onClick={() => {
        const amount = Number(betrag.replace(",", "."));
        if (!Number.isFinite(amount) || amount < 0) {
          setFehler(t("bewohner.betragUngueltig"));
          return;
        }
        onSave(amount, rhythmus);
      }}>{t("allg.fertig")}</KnopfPrimär>
      <KnopfSekundaer onClick={onCancel}>{t("bewohner.abbrechen")}</KnopfSekundaer>
      {fehler ? <p role="alert" className="w-full text-[0.8125rem]" style={{ color: "#b3261e" }}>{fehler}</p> : null}
    </div>
  );
}
