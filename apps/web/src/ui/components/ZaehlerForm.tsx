/**
 * Zähler-Bearbeitung als eingebettetes Blatt (S2).
 *
 * Kein Modal: das Blatt klappt unter der Zeile auf, in der es bearbeitet
 * wird. So bleibt der Zusammenhang sichtbar – wer welchen Zähler
 * verändert, sieht den Zähler währenddessen.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeterType, MeterUnit, Zaehler } from "../../domain/types";
import { MeterChip } from "./MeterChip";
import { Auswahl, Eingabe, Feld, KnopfPrimär, KnopfSekundaer } from "./Primitives";
import { strukturVorschau, sichtbareBewohner, sichtbareZaehler } from "../auswahl";
import { useAppStore } from "../../state/store";

export interface ZaehlerFormProps {
  /** `null` = neuer Zähler. */
  zaehler: Zaehler | null;
  onFertig: () => void;
}

const TYPEN: MeterType[] = ["energie", "wasser_warm", "wasser_kalt"];

export function ZaehlerForm({ zaehler, onFertig }: ZaehlerFormProps) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const zaehlerAnlegen = useAppStore((s) => s.zaehlerAnlegen);
  const zaehlerAendern = useAppStore((s) => s.zaehlerAendern);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const [bezeichnung, setBezeichnung] = useState(zaehler?.bezeichnung ?? "");
  const [typ, setTyp] = useState<MeterType>(zaehler?.typ ?? "energie");
  const [bewohnerId, setBewohnerId] = useState<string>(zaehler?.bewohnerId ?? "");
  const [ablesestelle, setAbleseort] = useState(zaehler?.ablesestelle ?? "");
  const [startStand, setStartstand] = useState(
    zaehler?.startStand !== undefined ? String(zaehler.startStand) : "",
  );

  useEffect(() => {
    setBezeichnung(zaehler?.bezeichnung ?? "");
    setTyp(zaehler?.typ ?? "energie");
    setBewohnerId(zaehler?.bewohnerId ?? "");
    setAbleseort(zaehler?.ablesestelle ?? "");
    setStartstand(zaehler?.startStand !== undefined ? String(zaehler.startStand) : "");
  }, [zaehler]);

  const bewohner = sichtbareBewohner(state.bewohner);
  const speichern = () => {
    const name = bezeichnung.trim();
    if (name.length === 0) {
      meldungSetzen({ art: "warnung", text: t("meter.bezeichnungFehlt") });
      return;
    }
    const einheit: MeterUnit = typ === "energie" ? "MWh" : "m3";
    const startstandWert = startStand.trim() === "" ? undefined : Number(startStand);
    if (startstandWert !== undefined && !Number.isFinite(startstandWert)) {
      meldungSetzen({ art: "warnung", text: t("meter.startstandUngueltig") });
      return;
    }
    const daten = {
      bezeichnung: name,
      typ,
      einheit,
      bewohnerId: bewohnerId === "" ? null : bewohnerId,
      enthaeltIds: zaehler?.enthaeltIds ?? [],
      ablesestelle: ablesestelle.trim(),
      aktiv: zaehler?.aktiv ?? true,
      startStand: startstandWert,
    };
    if (zaehler) {
      zaehlerAendern(zaehler.id, daten);
    } else {
      zaehlerAnlegen(daten);
    }
    onFertig();
  };

  return (
    <div
      className="surface-editor px-3 py-4 sm:px-4"
    >
      <div className="flex flex-col gap-4">
        <Feld label={t("meter.bezeichnung")} id="f-bezeichnung">
          <Eingabe
            id="f-bezeichnung"
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            placeholder={t("meter.bezeichnungBeispiel")}
            autoFocus
          />
        </Feld>

        <Feld label={t("meter.typ")} id="f-typ">
          <div className="flex flex-wrap items-center gap-2">
            <Auswahl
              id="f-typ"
              value={typ}
              onChange={(e) => setTyp(e.target.value as MeterType)}
              className="max-w-48"
            >
              {TYPEN.map((t2) => (
                <option key={t2} value={t2}>
                  {t(`typ.${t2}`)}
                </option>
              ))}
            </Auswahl>
            <MeterChip typ={typ} />
          </div>
        </Feld>

        <Feld label={t("meter.besitzer")} id="f-besitzer">
          <Auswahl
            id="f-besitzer"
            value={bewohnerId}
            onChange={(e) => setBewohnerId(e.target.value)}
            className="max-w-64"
          >
            <option value="">{t("meter.gemeinschaft")}</option>
            {bewohner.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Auswahl>
        </Feld>

        <Feld label={t("meter.ablesestelle")} id="f-ort">
          <Eingabe
            id="f-ort"
            value={ablesestelle}
            onChange={(e) => setAbleseort(e.target.value)}
            placeholder={t("meter.ablesestelleBeispiel")}
          />
        </Feld>

        <Feld
          label={t("meter.startstand")}
          hinweis={t("meter.startstandHinweis")}
          id="f-startstand"
        >
          <Eingabe
            id="f-startstand"
            inputMode="decimal"
            value={startStand}
            onChange={(e) => setStartstand(e.target.value)}
            placeholder={t("allg.zahlBeispiel")}
            className="tnum max-w-40"
          />
        </Feld>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <KnopfPrimär onClick={speichern}>{t("meter.speichern")}</KnopfPrimär>
          <KnopfSekundaer onClick={onFertig}>{t("meter.abbrechen")}</KnopfSekundaer>
        </div>
      </div>
    </div>
  );
}

/**
 * Blatt zum Setzen der „enthält"-Relation (R2).
 *
 * Die Zyklenprüfung sitzt in der Domäne (`findCycle`); hier wird das
 * Ergebnis nur dargestellt und die Kandidatenliste gefiltert.
 */
export function EnthaeltBlatt({
  zaehler,
  onFertig,
}: {
  zaehler: Zaehler;
  onFertig: () => void;
}) {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const enthaeltSetzen = useAppStore((s) => s.enthaeltSetzen);

  const alle = sichtbareZaehler(state.zaehler);
  const enthaltenIds = new Set(zaehler.enthaeltIds ?? []);
  const kandidaten = alle.filter((z) => z.id !== zaehler.id);
  const vorschau = strukturVorschau(state.zaehler, zaehler.id);

  const umschalten = (kindId: string) => {
    enthaeltSetzen(zaehler.id, kindId, !enthaltenIds.has(kindId));
  };

  return (
    <div
      className="surface-editor px-3 py-4 sm:px-4"
    >
      <p className="mb-3 text-[0.875rem] leading-relaxed" style={{ color: "#55524c" }}>
        {t("meter.enthaeltHinweis")}
      </p>

      <div className="flex flex-col">
        {kandidaten.length === 0 ? (
          <p className="py-3 text-[0.875rem]" style={{ color: "#6b6862" }}>
            {t("meter.keineWeiteren")}
          </p>
        ) : (
          kandidaten.map((k) => {
            const drin = enthaltenIds.has(k.id);
            return (
              <label
                key={k.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 border-b py-2"
                style={{ borderColor: "#e1e5df" }}
              >
                <input
                  type="checkbox"
                  checked={drin}
                  onChange={() => umschalten(k.id)}
                  className="check-44"
                />
                <span className="flex-1 truncate text-[0.9375rem]">{k.bezeichnung}</span>
                <MeterChip typ={k.typ} klein />
              </label>
            );
          })
        )}
      </div>

      <div className="mt-4">
        <h3
          className="mb-2 text-[0.75rem] font-medium tracking-[0.04em] uppercase"
          style={{ color: "#55524c" }}
        >
          {t("meter.struktur")}
        </h3>
        <div className="flex flex-col">
          {vorschau.map((knoten) => (
            <div
              key={knoten.zaehler.id}
              className="flex items-center gap-2 border-b py-1.5 text-[0.875rem]"
              style={{
                borderColor: "#e1e5df",
                paddingLeft: `${knoten.tiefe * 1.1}rem`,
                color: knoten.zyklus ? "#b3261e" : "#1b1a17",
              }}
            >
              <span aria-hidden="true" className="text-[#6b6862]">
                {knoten.tiefe === 0 ? "▸" : "└"}
              </span>
              <span className="flex-1 truncate">{knoten.zaehler.bezeichnung}</span>
              {knoten.zyklus ? (
                <span className="text-[0.75rem]" style={{ color: "#b3261e" }}>
                  {t("meter.zirkel")}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <KnopfSekundaer onClick={onFertig}>{t("allg.fertig")}</KnopfSekundaer>
      </div>
    </div>
  );
}
