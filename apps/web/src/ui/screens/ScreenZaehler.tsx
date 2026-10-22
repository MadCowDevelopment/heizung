/**
 * S2 – Zählerverwaltung.
 *
 * Der Bildschirm ist ein Register: jede Zeile ist ein Zähler, darunter öffnen
 * sich die Bearbeitungsblätter. „Enthält"-Relation, Zählerwechsel und
 * Startablesungen-Import liegen als eigene Blätter daneben, nicht in einem
 * Dialog – die Zeile bleibt dabei im Blick.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Zaehler } from "../../domain/types";
import { useAppStore } from "../../state/store";
import {
  besitzerVon,
  letzteAblesung,
  sichtbareZaehler,
} from "../auswahl";
import { datum, stand } from "../format";
import { MeterChip, Typstreifen } from "../components/MeterChip";
import {
  Eingabe,
  Feld,
  KnopfPrimär,
  KnopfSekundaer,
  Leerzustand,
  Textaktion,
} from "../components/Primitives";
import { EnthaeltBlatt, ZaehlerForm } from "../components/ZaehlerForm";
import { ImportStartablesungen } from "../components/ImportStartablesungen";

/** Welches Blatt ist bei welchem Zähler geöffnet. */
type Blatt =
  | { art: "form"; zaehlerId: string | null }
  | { art: "enthaelt"; zaehlerId: string }
  | { art: "wechsel"; zaehlerId: string }
  | { art: "import" }
  | null;

export function ScreenZaehler() {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const zaehlerDeaktivieren = useAppStore((s) => s.zaehlerDeaktivieren);
  const zaehlerLoeschen = useAppStore((s) => s.zaehlerLoeschen);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const [blatt, setBlatt] = useState<Blatt>(null);

  const zaehler = useMemo(
    () =>
      sichtbareZaehler(state.zaehler).sort((a, b) => {
        const rang = { energie: 0, wasser_warm: 1, wasser_kalt: 2 };
        const d = rang[a.typ] - rang[b.typ];
        return d !== 0 ? d : a.bezeichnung.localeCompare(b.bezeichnung, "de");
      }),
    [state.zaehler],
  );

  const offenesForm = blatt?.art === "form" ? blatt.zaehlerId : undefined;

  // Eine Ansicht traegt genau eine Primaeraktion (DESIGN.md). Traegt das
  // offene Blatt eine eigene, weicht der Kopfknopf zurueck - das Blatt
  // uebernimmt den Platz. Das Blatt "enthaelt" hat keine Primaeraktion,
  // dort bleibt der Kopfknopf stehen.
  const blattTraegtPrimaer =
    blatt?.art === "form" || blatt?.art === "wechsel" || blatt?.art === "import";

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>
            {t("nav.zaehler")}
          </h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>
            {t("meter.anzahlText", { count: zaehler.length })}
          </p>
        </div>
        {zaehler.length > 0 ? (
          <div className="flex items-center gap-2">
            <Textaktion onClick={() => setBlatt({ art: "import" })}>
              {t("meter.startablesungen")}
            </Textaktion>
            {!blattTraegtPrimaer ? (
              <KnopfPrimär onClick={() => setBlatt({ art: "form", zaehlerId: null })}>
                {t("meter.neuerZaehler")}
              </KnopfPrimär>
            ) : null}
          </div>
        ) : null}
      </div>

      {blatt?.art === "import" ? (
        <ImportStartablesungen onFertig={() => setBlatt(null)} />
      ) : null}

      {/* Das Blatt klappt unter der Zeile auf, in der bearbeitet wird - dort
          steht auch die Primaeraktion. Nur der neue Zaehler hat keine Zeile
          und bekommt das Blatt deshalb ueber der Liste. */}
      {blatt?.art === "form" && offenesForm === null ? (
        <div className="mb-3">
          <ZaehlerForm zaehler={null} onFertig={() => setBlatt(null)} />
        </div>
      ) : null}

      {zaehler.length === 0 && !blattTraegtPrimaer ? (
        <Leerzustand
          text={t("meter.leer")}
          hinweis={t("meter.leerHinweis")}
          aktion={
            <KnopfPrimär onClick={() => setBlatt({ art: "form", zaehlerId: null })}>
              {t("meter.neuerZaehler")}
            </KnopfPrimär>
          }
        />
      ) : null}

      <div>
        {zaehler.map((z) => {
          const letzte = letzteAblesung(state.ablesung, z.id);
          const besitzer = besitzerVon(state.bewohner, z);
          const enthaelt = (z.enthaeltIds ?? [])
            .map((id) => state.zaehler.find((x) => x.id === id))
            .filter((x): x is Zaehler => Boolean(x) && !x!.deleted);
          const istOffen = blatt !== null && "zaehlerId" in blatt && blatt.zaehlerId === z.id;

          return (
            <div key={z.id} style={{ borderBottom: "1px solid #e3ded4" }}>
              <div className="flex items-start gap-3 py-3">
                <Typstreifen typ={z.typ} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[1rem] font-medium" style={{ color: "#1b1a17" }}>
                      {z.bezeichnung}
                    </span>
                    <MeterChip typ={z.typ} klein />
                    {!z.aktiv ? (
                      <span className="text-[0.75rem]" style={{ color: "#6b6862" }}>
                        {t("meter.inaktiv")}
                      </span>
                    ) : null}
                  </div>

                  <dl className="mt-1 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[0.8125rem] sm:grid-cols-[9rem_minmax(0,1fr)]">
                    <dt style={{ color: "#6b6862" }}>{t("meter.letzterStand")}</dt>
                    <dd className="tnum" style={{ color: "#1b1a17" }}>
                      {letzte ? `${stand(letzte.stand)} ${z.einheit === "MWh" ? "MWh" : "m³"}` : t("meter.keineAblesung")}
                    </dd>
                    {letzte ? (
                      <>
                        <dt style={{ color: "#6b6862" }}>{t("meter.datum")}</dt>
                        <dd className="tnum" style={{ color: "#1b1a17" }}>
                          {datum(letzte.datum)}
                        </dd>
                      </>
                    ) : null}
                    <dt style={{ color: "#6b6862" }}>{t("meter.besitzer")}</dt>
                    <dd style={{ color: "#1b1a17" }}>
                      {besitzer ? besitzer.name : t("meter.besitzerKeiner")}
                    </dd>
                    {enthaelt.length > 0 ? (
                      <>
                        <dt style={{ color: "#6b6862" }}>{t("meter.enthaelt")}</dt>
                        <dd style={{ color: "#1b1a17" }}>
                          {enthaelt.map((k) => k.bezeichnung).join(", ")}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <div className="mt-1 flex flex-wrap items-center gap-x-1">
                    <Textaktion
                      onClick={() =>
                        setBlatt(
                          istOffen && blatt?.art === "form"
                            ? null
                            : { art: "form", zaehlerId: z.id },
                        )
                      }
                    >
                      {t("meter.zaehlerBearbeiten")}
                    </Textaktion>
                    <Textaktion
                      onClick={() =>
                        setBlatt(
                          istOffen && blatt?.art === "enthaelt"
                            ? null
                            : { art: "enthaelt", zaehlerId: z.id },
                        )
                      }
                    >
                      {t("meter.enthaeltRelation")}
                    </Textaktion>
                    <Textaktion
                      onClick={() =>
                        setBlatt(
                          istOffen && blatt?.art === "wechsel"
                            ? null
                            : { art: "wechsel", zaehlerId: z.id },
                        )
                      }
                    >
                      {t("meter.zaehlerwechsel")}
                    </Textaktion>
                    <Textaktion
                      onClick={() => zaehlerDeaktivieren(z.id, !z.aktiv)}
                    >
                      {z.aktiv ? t("meter.deaktivieren") : t("meter.aktivieren")}
                    </Textaktion>
                    <Textaktion
                      gefahr
                      onClick={() => {
                        zaehlerLoeschen(z.id);
                        meldungSetzen({ art: "info", text: t("meter.entfernt", { name: z.bezeichnung }) });
                      }}
                    >
                      {t("meter.loeschen")}
                    </Textaktion>
                  </div>
                </div>
              </div>

              {blatt?.art === "form" && blatt.zaehlerId === z.id ? (
                <ZaehlerForm zaehler={z} onFertig={() => setBlatt(null)} />
              ) : null}
              {blatt?.art === "enthaelt" && blatt.zaehlerId === z.id ? (
                <EnthaeltBlatt zaehler={z} onFertig={() => setBlatt(null)} />
              ) : null}
              {blatt?.art === "wechsel" && blatt.zaehlerId === z.id ? (
                <ZaehlerwechselBlatt zaehler={z} onFertig={() => setBlatt(null)} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Zählerwechsel (S2): der neue Zähler startet mit dem angegebenen Stand, der
 * alte wird geschlossen. Der Startstand wird als echte Ablesung angelegt –
 * ein einzelner Zählerstand ist noch keine Periode (R1), aber er ist der
 * gültige Ausgangspunkt für die nächste Ablesung.
 */
function ZaehlerwechselBlatt({ zaehler, onFertig }: { zaehler: Zaehler; onFertig: () => void }) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const zaehlerAnlegen = useAppStore((s) => s.zaehlerAnlegen);
  const zaehlerAendern = useAppStore((s) => s.zaehlerAendern);
  const ablesungSpeichern = useAppStore((s) => s.ablesungSpeichern);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const [bezeichnung, setBezeichnung] = useState(`${zaehler.bezeichnung} (neu)`);
  const [standWert, setStandwert] = useState("");
  const [datumWert, setDatumwert] = useState("");
  const [altSchliessen, setAltSchliessen] = useState(true);

  const letzte = letzteAblesung(state.ablesung, zaehler.id);

  const uebernehmen = () => {
    const name = bezeichnung.trim();
    const wert = Number(standWert.replace(",", "."));
    if (name.length === 0) {
      meldungSetzen({ art: "warnung", text: t("meter.bezeichnungFehlt") });
      return;
    }
    if (!Number.isFinite(wert)) {
      meldungSetzen({ art: "warnung", text: t("meter.startstandFehlt") });
      return;
    }
    const neuerId = zaehlerAnlegen({
      bezeichnung: name,
      typ: zaehler.typ,
      einheit: zaehler.einheit,
      bewohnerId: zaehler.bewohnerId,
      enthaeltIds: [],
      ablesestelle: zaehler.ablesestelle ?? "",
      aktiv: true,
    });
    const ablesungsDatum = datumWert.trim() !== "" ? datumWert : (letzte?.datum ?? "");
    if (ablesungsDatum) {
      ablesungSpeichern({
        zaehlerId: neuerId,
        datum: ablesungsDatum,
        stand: wert,
        unsicher: false,
        notiz: t("meter.startstandNotiz"),
      });
    }
    if (altSchliessen) {
      zaehlerAendern(zaehler.id, { aktiv: false });
    }
    meldungSetzen({ art: "erfolg", text: t("meter.neuerAngelegt", { name }) });
    onFertig();
  };

  return (
    <div
      className="px-3 py-4 sm:px-4"
      style={{ backgroundColor: "#f2eee6", borderTop: "1px solid #e3ded4" }}
    >
      <p className="mb-3 text-[0.875rem] leading-relaxed" style={{ color: "#55524c" }}>
        {t("meter.zaehlerwechselHinweis")}
      </p>

      <div className="flex flex-col gap-4">
        <Feld label={t("meter.bezeichnung")} id="w-bezeichnung">
          <Eingabe
            id="w-bezeichnung"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
          />
        </Feld>

        <Feld label={t("meter.startstand")} id="w-startstand">
          <Eingabe
            id="w-startstand"
            inputMode="decimal"
            value={standWert}
            onChange={(e) => setStandwert(e.target.value)}
            placeholder={t("allg.zahlBeispiel")}
            className="tnum max-w-40"
          />
        </Feld>

        <Feld
          label={t("ablesung.datum")}
          hinweis={t("meter.zaehlerwechselDatumHinweis")}
          id="w-datum"
        >
          <Eingabe
            id="w-datum"
            type="date"
            value={datumWert}
            onChange={(e) => setDatumwert(e.target.value)}
            className="tnum max-w-48"
          />
        </Feld>

        <label className="flex min-h-11 cursor-pointer items-center gap-0 text-[0.9375rem]">
          <input
            type="checkbox"
            checked={altSchliessen}
            onChange={(e) => setAltSchliessen(e.target.checked)}
            className="check-44"
          />
          {t("meter.altenSchliessen")}
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <KnopfPrimär onClick={uebernehmen}>{t("meter.neuerAnlegen")}</KnopfPrimär>
          <KnopfSekundaer onClick={onFertig}>{t("meter.abbrechen")}</KnopfSekundaer>
        </div>
      </div>
    </div>
  );
}
