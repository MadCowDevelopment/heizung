/**
 * S4 – Bewohner.
 *
 * Eine Liste, die man lesen kann: Name, die Zähler dieses Bewohners mit ihrer
 * Farbe, der geplante Abschlag. Die Zuordnung der Zähler und der Abschlag
 * sind die beiden Handgriffe, die hier wirklich gebraucht werden – beides
 * geschieht im selben Blatt, in dem der Bewohner steht.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AbschlagRhythmus, Bewohner, Zaehler } from "../../domain/types";
import { useAppStore } from "../../state/store";
import { abschlagVon, letzteZahlungVon, sichtbareBewohner, zaehlerVonBewohner } from "../auswahl";
import { datum, geld } from "../format";
import { MeterChip, Typstreifen } from "../components/MeterChip";
import {
  Auswahl,
  Eingabe,
  KnopfPrimär,
  KnopfSekundaer,
  Leerzustand,
  Textaktion,
  Textbereich,
} from "../components/Primitives";

type Blatt =
  | { art: "neu" }
  | { art: "bearbeiten"; bewohnerId: string }
  | { art: "abschlag"; bewohnerId: string }
  | null;

export function ScreenBewohner() {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const [blatt, setBlatt] = useState<Blatt>(null);
  const [nurAktive, setNurAktive] = useState(true);

  const bewohner = useMemo(() => {
    const alle = sichtbareBewohner(state.bewohner);
    const gefiltert = nurAktive ? alle.filter((b) => b.aktiv) : alle;
    return gefiltert.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [state.bewohner, nurAktive]);

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>
            {t("bewohner.titel")}
          </h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>
            {t("bewohner.anzahlText", { count: bewohner.length })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-0 text-[0.8125rem]">
            <input
              type="checkbox"
              checked={!nurAktive}
              onChange={(e) => setNurAktive(!e.target.checked)}
              className="check-44"
            />
            {t("bewohner.inaktivAnzeigen")}
          </label>
          <KnopfPrimär onClick={() => setBlatt({ art: "neu" })}>{t("bewohner.neu")}</KnopfPrimär>
        </div>
      </div>

      {bewohner.length === 0 ? (
        <Leerzustand
          text={t("bewohner.leer")}
          hinweis={t("bewohner.leerHinweis")}
          aktion={
            <KnopfPrimär onClick={() => setBlatt({ art: "neu" })}>{t("bewohner.neu")}</KnopfPrimär>
          }
        />
      ) : null}

      {bewohner.length > 0 ? (
        <div style={{ borderTop: "1px solid #c9c3b6" }}>
          {bewohner.map((b) => (
            <BewohnerZeile key={b.id} bewohner={b} onBlatt={setBlatt} />
          ))}
        </div>
      ) : null}

      {blatt?.art === "neu" ? <BewohnerBlatt onFertig={() => setBlatt(null)} /> : null}
      {blatt?.art === "bearbeiten" ? (
        <BewohnerBlatt bewohnerId={blatt.bewohnerId} onFertig={() => setBlatt(null)} />
      ) : null}
      {blatt?.art === "abschlag" ? (
        <AbschlagBlatt bewohnerId={blatt.bewohnerId} onFertig={() => setBlatt(null)} />
      ) : null}
    </div>
  );
}

/** Eine Bewohnerzeile: Name, Zähler, Abschlag, letzte Zahlung. */
function BewohnerZeile({
  bewohner,
  onBlatt,
}: {
  bewohner: Bewohner;
  onBlatt: (blatt: Blatt) => void;
}) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const bewohnerDeaktivieren = useAppStore((s) => s.bewohnerDeaktivieren);
  const zaehler = zaehlerVonBewohner(state.zaehler, bewohner.id);
  const abschlag = abschlagVon(state, bewohner.id);
  const letzteZahlung = letzteZahlungVon(state.zahlung, bewohner.id);

  return (
    <div
      className="py-3"
      style={{ borderBottom: "1px solid #e3ded4", opacity: bewohner.aktiv ? 1 : 0.55 }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[1rem] font-medium" style={{ color: "#1b1a17" }}>
          {bewohner.name}
        </span>
        {bewohner.email ? (
          <a
            href={`mailto:${bewohner.email}`}
            className="inline-flex min-h-11 items-center text-[0.8125rem] underline decoration-[#c9c3b6] underline-offset-4"
            style={{ color: "#55524c" }}
          >
            {bewohner.email}
          </a>
        ) : null}
        {!bewohner.aktiv ? (
          <span className="text-[0.75rem]" style={{ color: "#6b6862" }}>
            {t("bewohner.inaktiv")}
          </span>
        ) : null}
      </div>

      {/* Drei gleichrangige Angaben in eigenen Spalten. */}
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[0.8125rem] sm:grid-cols-3">
        <div>
          <dt style={{ color: "#6b6862" }}>{t("bewohner.zaehlerZugeordnet")}</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {zaehler.length === 0 ? (
              <span style={{ color: "#6b6862" }}>{t("bewohner.keinZaehler")}</span>
            ) : (
              zaehler.map((z) => (
                <span key={z.id} className="inline-flex items-center gap-1">
                  <Typstreifen typ={z.typ} hoehe="0.9rem" />
                  <MeterChip typ={z.typ} klein />
                  <span style={{ color: "#1b1a17" }}>{z.bezeichnung}</span>
                </span>
              ))
            )}
          </dd>
        </div>

        <div>
          <dt style={{ color: "#6b6862" }}>{t("bewohner.abschlag")}</dt>
          <dd className="mt-0.5" style={{ color: "#1b1a17" }}>
            {abschlag ? (
              <span className="tnum">
                {geld(abschlag.betrag)} /{" "}
                {abschlag.rhythmus === "monatlich"
                  ? t("bewohner.monatlich")
                  : t("bewohner.jaehrlich")}
              </span>
            ) : (
              <span style={{ color: "#6b6862" }}>{t("bewohner.keinAbschlag")}</span>
            )}
          </dd>
        </div>

        <div>
          <dt style={{ color: "#6b6862" }}>{t("bewohner.letzteZahlung")}</dt>
          <dd className="mt-0.5" style={{ color: "#1b1a17" }}>
            {letzteZahlung ? (
              <span className="tnum">
                {geld(letzteZahlung.betrag)} · {datum(letzteZahlung.bezahltAm ?? letzteZahlung.faelligAm)}
              </span>
            ) : (
              <span style={{ color: "#6b6862" }}>{t("bewohner.zahlungOffen")}</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-1 flex flex-wrap items-center gap-x-1">
        <Textaktion onClick={() => onBlatt({ art: "bearbeiten", bewohnerId: bewohner.id })}>
          {t("bewohner.bearbeiten")}
        </Textaktion>
        <Textaktion onClick={() => onBlatt({ art: "abschlag", bewohnerId: bewohner.id })}>
          {t("bewohner.abschlag")}
        </Textaktion>
        <Textaktion
          onClick={() => bewohnerDeaktivieren(bewohner.id, !bewohner.aktiv)}
        >
          {bewohner.aktiv ? t("bewohner.deaktivieren") : t("bewohner.aktivieren")}
        </Textaktion>
      </div>
    </div>
  );
}

/** Blatt zum Anlegen und Bearbeiten eines Bewohners. */
function BewohnerBlatt({
  bewohnerId,
  onFertig,
}: {
  bewohnerId?: string;
  onFertig: () => void;
}) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const bewohnerAnlegen = useAppStore((s) => s.bewohnerAnlegen);
  const bewohnerAendern = useAppStore((s) => s.bewohnerAendern);
  const zaehlerAendern = useAppStore((s) => s.zaehlerAendern);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const bewohner = bewohnerId ? state.bewohner.find((b) => b.id === bewohnerId) : undefined;

  const [name, setName] = useState(bewohner?.name ?? "");
  const [email, setEmail] = useState(bewohner?.email ?? "");
  const [notiz, setNotiz] = useState(bewohner?.notiz ?? "");
  const [zugeordnet, setZugeordnet] = useState<string[]>(
    bewohnerId
      ? state.zaehler.filter((z) => z.bewohnerId === bewohnerId).map((z) => z.id)
      : [],
  );

  // Frei verfügbare Zähler: keine sind einem anderen Bewohner zugewiesen.
  const freieZaehler = useMemo(
    () =>
      state.zaehler.filter(
        (z) => !z.deleted && (z.bewohnerId === null || z.bewohnerId === bewohnerId),
      ),
    [state.zaehler, bewohnerId],
  );

  const zaehlerUmschalten = (z: Zaehler) => {
    setZugeordnet((vorher) =>
      vorher.includes(z.id) ? vorher.filter((x) => x !== z.id) : [...vorher, z.id],
    );
  };

  const speichern = () => {
    if (name.trim() === "") {
      meldungSetzen({ art: "fehler", text: t("bewohner.nameFehlt") });
      return;
    }

    const id = bewohnerId
      ? (bewohnerAendern(bewohnerId, { name: name.trim(), email, notiz }), bewohnerId)
      : bewohnerAnlegen({ name: name.trim(), email, notiz, aktiv: true });

    // Zähler zuordnen bzw. entfernen – ein Zähler kann nur einen Besitzer haben.
    for (const z of state.zaehler) {
      if (z.deleted) continue;
      const soll = zugeordnet.includes(z.id);
      const hat = z.bewohnerId === id;
      if (soll && !hat) zaehlerAendern(z.id, { bewohnerId: id });
      if (!soll && hat) zaehlerAendern(z.id, { bewohnerId: null });
    }

    meldungSetzen({ art: "erfolg", text: t("bewohner.gespeichert", { name: name.trim() }) });
    onFertig();
  };

  return (
    <div style={{ backgroundColor: "#f2eee6", borderTop: "1px solid #c9c3b6" }} className="px-4 py-4">
      <h3 className="mb-3 text-[1.0625rem] font-semibold" style={{ color: "#1b1a17" }}>
        {bewohnerId ? t("bewohner.bearbeiten") : t("bewohner.neu")}
      </h3>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.name")}
          </span>
          <Eingabe value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.email")}
          </span>
          <Eingabe
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.notiz")}
          </span>
          <Textbereich rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </label>

        <div className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.zaehlerZugeordnet")}
          </span>
          {freieZaehler.length === 0 ? (
            <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>
              {t("bewohner.keineFreienZaehler")}
            </p>
          ) : (
            <div style={{ borderTop: "1px solid #c9c3b6" }}>
              {freieZaehler.map((z) => {
                const gewaehlt = zugeordnet.includes(z.id);
                return (
                  <label
                    key={z.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3"
                    style={{ borderBottom: "1px solid #e3ded4" }}
                  >
                    <input
                      type="checkbox"
                      checked={gewaehlt}
                      onChange={() => zaehlerUmschalten(z)}
                      className="check-44"
                    />
                    <Typstreifen typ={z.typ} hoehe="1.1rem" />
                    <span className="text-[0.9375rem]" style={{ color: "#1b1a17" }}>
                      {z.bezeichnung}
                    </span>
                    <MeterChip typ={z.typ} klein />
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-[0.75rem] leading-snug" style={{ color: "#6b6862" }}>
            {t("bewohner.zaehlerHinweis")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <KnopfPrimär onClick={speichern}>{t("bewohner.speichern")}</KnopfPrimär>
        <KnopfSekundaer onClick={onFertig}>{t("bewohner.abbrechen")}</KnopfSekundaer>
      </div>
    </div>
  );
}

/** Blatt für den Abschlagplan (R6). */
function AbschlagBlatt({ bewohnerId, onFertig }: { bewohnerId: string; onFertig: () => void }) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const abschlagSetzen = useAppStore((s) => s.abschlagSetzen);
  const abschlagLoeschen = useAppStore((s) => s.abschlagLoeschen);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const bewohner = state.bewohner.find((b) => b.id === bewohnerId);
  const plan = abschlagVon(state, bewohnerId);

  const [betrag, setBetrag] = useState(plan ? String(plan.betrag) : "");
  const [rhythmus, setRhythmus] = useState<AbschlagRhythmus>(plan?.rhythmus ?? "monatlich");

  const speichern = () => {
    const wert = Number(betrag.replace(",", "."));
    if (!Number.isFinite(wert) || wert < 0) {
      meldungSetzen({ art: "fehler", text: t("bewohner.betragUngueltig") });
      return;
    }
    abschlagSetzen(bewohnerId, wert, rhythmus);
    meldungSetzen({ art: "erfolg", text: t("bewohner.abschlagGespeichert") });
    onFertig();
  };

  return (
    <div style={{ backgroundColor: "#f2eee6", borderTop: "1px solid #c9c3b6" }} className="px-4 py-4">
      <h3 className="mb-3 text-[1.0625rem] font-semibold" style={{ color: "#1b1a17" }}>
        {t("bewohner.abschlag")} – {bewohner?.name ?? ""}
      </h3>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.abschlagBetrag")} (€)
          </span>
          <Eingabe
            type="text"
            inputMode="decimal"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            placeholder={t("allg.geldBeispiel")}
            className="tnum w-40 text-right"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1">
          <span
            className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
            style={{ color: "#55524c" }}
          >
            {t("bewohner.abschlagRhythmus")}
          </span>
          <Auswahl
            value={rhythmus}
            onChange={(e) => setRhythmus(e.target.value as AbschlagRhythmus)}
          >
            <option value="monatlich">{t("bewohner.monatlich")}</option>
            <option value="jaehrlich">{t("bewohner.jaehrlich")}</option>
          </Auswahl>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <KnopfPrimär onClick={speichern}>{t("bewohner.speichern")}</KnopfPrimär>
        {plan ? (
          <Textaktion gefahr onClick={() => {
            abschlagLoeschen(plan.id);
            meldungSetzen({ art: "info", text: t("bewohner.abschlagEntfernt") });
            onFertig();
          }}>
            {t("bewohner.abschlagEntfernen")}
          </Textaktion>
        ) : null}
        <KnopfSekundaer onClick={onFertig}>{t("bewohner.abbrechen")}</KnopfSekundaer>
      </div>
    </div>
  );
}
