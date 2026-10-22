/**
 * S3 – Ablesung erfassen.
 *
 * Das Erfassungsfeld ist ein **durchgehender, linierter Beleg**: eine
 * Fläche, in der die Zähler als Bänder stehen – links die Farbe des Typs,
 * rechts der Wert, dazwischen der zuletzt gelesene Stand. Es ist keine
 * Kachelliste, sondern ein Blatt, das man abarbeitet.
 *
 * Die Bedienung ist für das Handy gedacht: Hochformat, große Tap-Flächen,
 * `inputmode="numeric"`, keine Einheiten-Eingabe, keine Trennzeichen (deutsche
 * Dezimalkomma-Eingabe wird angenommen).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ISODate, MeterType, Zaehler } from "../../domain/types";
import { today } from "../../domain/calc/dates";
import { useAppStore, type EntwurfEintrag } from "../../state/store";
import { IndexedDbAdapter } from "../../storage/indexeddb";
import { ablesungenVon, aktiveZaehler, letzteAblesung } from "../auswahl";
import { datum, stand } from "../format";
import { MeterChip, Typstreifen } from "../components/MeterChip";
import {
  Eingabe,
  KnopfPrimär,
  Leerzustand,
  Textaktion,
} from "../components/Primitives";

/** Reihenfolge der Zählertypen im Beleg. */
const TYP_REIHENFOLGE: MeterType[] = ["energie", "wasser_warm", "wasser_kalt"];

interface Zeile {
  zaehler: Zaehler;
  wert: string;
  unsicher: boolean;
  notiz: string;
  versteckt: boolean;
  fotoKey?: string | null;
}

interface TextDetectionResult {
  rawValue: string;
}

interface TextDetectorApi {
  detect(image: ImageBitmap): Promise<TextDetectionResult[]>;
}

interface TextDetectorGlobal {
  TextDetector?: new () => TextDetectorApi;
}

export function ScreenAblesung() {
  const { t } = useTranslation();
  const state = useAppStore((s) => s.state);
  const ablesungSpeichern = useAppStore((s) => s.ablesungSpeichern);
  const ablesungLoeschen = useAppStore((s) => s.ablesungLoeschen);
  const entwurf = useAppStore((s) => s.entwurf);
  const entwurfSetzen = useAppStore((s) => s.entwurfSetzen);
  const entwurfVerwerfen = useAppStore((s) => s.entwurfVerwerfen);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  const [datumWert, setDatumWert] = useState<ISODate>(entwurf?.datum ?? today());
  const [zeilen, setZeilen] = useState<Map<string, Zeile>>(new Map());
  const [verlaufOffen, setVerlaufOffen] = useState<string | null>(null);
  const [ocr, setOcr] = useState<Map<string, { busy: boolean; kandidaten: string[]; nichtVerfuegbar: boolean }>>(new Map());

  const zaehler = useMemo(
    () =>
      aktiveZaehler(state.zaehler).sort((a, b) => {
        const d = TYP_REIHENFOLGE.indexOf(a.typ) - TYP_REIHENFOLGE.indexOf(b.typ);
        return d !== 0 ? d : a.bezeichnung.localeCompare(b.bezeichnung, "de");
      }),
    [state.zaehler],
  );

  // Was schon erfasst ist – daraus wird, ob die Linie noch weiterläuft.
  const erfasstAnzahl = useMemo(
    () =>
      zaehler.filter((z) => {
        const zeile = zeilen.get(z.id);
        return (
          (zeile?.wert ?? "").trim() !== "" ||
          (zeile?.notiz ?? "").trim() !== "" ||
          (zeile?.unsicher ?? false)
        );
      }).length,
    [zaehler, zeilen],
  );

  // Entwurf fortsetzen: Werte aus dem lokalen Entwurf übernehmen.
  useEffect(() => {
    if (!entwurf) return;
    const uebernommen = new Map<string, Zeile>();
    for (const eintrag of entwurf.eintraege) {
      const z = state.zaehler.find((x) => x.id === eintrag.zaehlerId);
      if (!z || z.deleted) continue;
      uebernommen.set(eintrag.zaehlerId, {
        zaehler: z,
        wert: eintrag.stand,
        unsicher: eintrag.unsicher,
        notiz: eintrag.notiz,
        versteckt: false,
        fotoKey: eintrag.fotoKey ?? null,
      });
    }
    if (uebernommen.size > 0) setZeilen(uebernommen);
  }, [entwurf, state.zaehler]);

  const zeileSetzen = (zaehlerId: string, aenderung: Partial<Zeile>) => {
    setZeilen((vorher) => {
      const z = state.zaehler.find((x) => x.id === zaehlerId);
      if (!z) return vorher;
      const alt = vorher.get(zaehlerId) ?? {
        zaehler: z,
        wert: "",
        unsicher: false,
        notiz: "",
        versteckt: false,
      };
      const neu = { ...alt, ...aenderung, zaehler: z };
      const kopie = new Map(vorher);
      kopie.set(zaehlerId, neu);
      return kopie;
    });
  };

  const zuruecksetzen = () => {
    setZeilen(new Map());
    entwurfVerwerfen();
  };

  const entwurfSichern = () => {
    const eintraege: EntwurfEintrag[] = [];
    for (const zeile of zeilen.values()) {
      if (zeile.wert.trim() === "" && !zeile.unsicher && zeile.notiz.trim() === "") continue;
      eintraege.push({
        zaehlerId: zeile.zaehler.id,
        stand: zeile.wert,
        unsicher: zeile.unsicher,
        notiz: zeile.notiz,
        fotoKey: zeile.fotoKey,
      });
    }
    entwurfSetzen(datumWert, eintraege);
    meldungSetzen({ art: "info", text: t("ablesung.entwurfGesichert") });
  };

  const speichern = () => {
    let gespeichert = 0;
    let ueberschrieben = 0;
    let fehler = 0;
    for (const zeile of zeilen.values()) {
      const text = zeile.wert.trim();
      if (text === "") {
        if (!zeile.unsicher && zeile.notiz.trim() === "" && !zeile.fotoKey) continue;
        if (zeile.fotoKey) {
          fehler += 1;
          continue;
        }
      }
      const wert = Number(text.replace(",", "."));
      if (text !== "" && !Number.isFinite(wert)) {
        fehler += 1;
        continue;
      }
      const vorhanden = state.ablesung.find(
        (a) => a.zaehlerId === zeile.zaehler.id && a.datum === datumWert && !a.deleted,
      );
      const ergebnis = ablesungSpeichern({
        zaehlerId: zeile.zaehler.id,
        datum: datumWert,
        stand: Number.isFinite(wert) ? wert : 0,
        unsicher: zeile.unsicher,
        notiz: zeile.notiz,
        fotoKey: zeile.fotoKey,
      });
      if (!ergebnis.ok) {
        fehler += 1;
      } else if (vorhanden) {
        ueberschrieben += 1;
      } else {
        gespeichert += 1;
      }
    }
    entwurfVerwerfen();
    setZeilen(new Map());
    if (fehler > 0) {
      meldungSetzen({
        art: "fehler",
        text: t("ablesung.speichernFehler", { count: fehler }),
      });
    } else {
      meldungSetzen({
        art: "erfolg",
        text:
          ueberschrieben > 0
            ? t("ablesung.gespeichertUeberschrieben", {
                saved: gespeichert,
                ueberschrieben,
              })
            : t("ablesung.gespeichertAnzahl", { count: gespeichert }),
      });
    }
  };

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>
            {t("ablesung.titel")}
          </h2>
          <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>
            {t("ablesung.vergangenheitErlaubt")}
          </p>
        </div>
      </div>

      {/* Werkzeugleiste: Datum, Entwurf, Speichern */}
      <div
        className="sticky top-[var(--kopf-hoehe)] z-10 -mx-4 mb-4 px-4 py-2 sm:-mx-4"
        style={{ backgroundColor: "#faf8f4", borderBottom: "1px solid #e3ded4" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="a-datum"
              className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
              style={{ color: "#55524c" }}
            >
              {t("ablesung.datum")}
            </label>
            <Eingabe
              id="a-datum"
              type="date"
              value={datumWert}
              onChange={(e) => setDatumWert(e.target.value)}
              className="tnum w-40"
            />
          </div>

          <div className="flex items-center gap-2 pb-1">
            {entwurf ? (
              <Textaktion onClick={zuruecksetzen}>{t("ablesung.verwerfen")}</Textaktion>
            ) : null}
            <Textaktion onClick={entwurfSichern}>{t("ablesung.entwerf")}</Textaktion>
          </div>

          <div className="ml-auto flex items-center gap-2 pb-1">
            <KnopfPrimär onClick={speichern}>{t("ablesung.speichern")}</KnopfPrimär>
          </div>
        </div>

        {entwurf ? (
          <p className="pt-2 text-[0.8125rem]" style={{ color: "#8a5a00" }}>
            {t("ablesung.entwerfHinweis")} ({entwurf.datum})
          </p>
        ) : null}
      </div>

      {zaehler.length === 0 ? (
        <Leerzustand text={t("ablesung.keineZaehler")} hinweis={t("ablesung.keineZaehlerHinweis")} />
      ) : null}

      {/* Die Lauflinie des Erfassens: sie läuft weiter, solange etwas fehlt. */}
      {zaehler.length > 0 ? (
        <div
          className={`lauflinie${erfasstAnzahl < zaehler.length ? " laeuft" : ""}`}
          role="presentation"
          aria-hidden="true"
        />
      ) : null}

      {/* Der Beleg: ein durchgehendes Blatt, Bänder durch Haarlinien getrennt. */}
      <div style={{ borderTop: "1px solid #c9c3b6" }}>
        {zaehler.map((z) => {
          const zeile = zeilen.get(z.id);
          const letzte = letzteAblesung(state.ablesung, z.id);
          const vorhandeneFotoKey = state.ablesung.find(
            (a) => a.zaehlerId === z.id && a.datum === datumWert && !a.deleted,
          )?.fotoKey;
          const fotoKey = zeile?.fotoKey ?? vorhandeneFotoKey ?? null;
          const versteckt = zeile?.versteckt ?? false;

          return (
            <div key={z.id} style={{ borderBottom: "1px solid #e3ded4" }}>
              <div
                className="flex items-start gap-3 py-3"
                style={versteckt ? { opacity: 0.4 } : undefined}
              >
                <Typstreifen typ={z.typ} hoehe="2.5rem" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[0.9375rem] font-medium" style={{ color: "#1b1a17" }}>
                      {z.bezeichnung}
                    </span>
                    <MeterChip typ={z.typ} klein />
                  </div>

                  <div className="mt-0.5 flex items-baseline gap-2 text-[0.8125rem]">
                    <span style={{ color: "#6b6862" }}>{t("ablesung.standAktuell")}:</span>
                    <span className="tnum" style={{ color: "#1b1a17" }}>
                      {letzte ? stand(letzte.stand) : "—"}
                    </span>
                    <span style={{ color: "#6b6862" }}>{z.einheit === "MWh" ? "MWh" : "m³"}</span>
                    {letzte ? (
                      <span className="tnum" style={{ color: "#6b6862" }}>
                        · {datum(letzte.datum)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="relative">
                    <Eingabe
                      type="text"
                      inputMode="decimal"
                      value={zeile?.wert ?? ""}
                      onChange={(e) => zeileSetzen(z.id, { wert: e.target.value })}
                      onFocus={() =>
                        setZeilen((v) => {
                          const k = new Map(v);
                          const alt = k.get(z.id);
                          k.set(z.id, {
                            zaehler: z,
                            wert: alt?.wert ?? "",
                            unsicher: alt?.unsicher ?? false,
                            notiz: alt?.notiz ?? "",
                            versteckt: alt?.versteckt ?? false,
                          });
                          return k;
                        })
                      }
                      placeholder={t("allg.zahlBeispiel")}
                      aria-label={`${t("ablesung.stand")} ${z.bezeichnung}`}
                      className="tnum w-32 pr-10 text-right text-[1.125rem]"
                    />
                    <span
                      className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.75rem]"
                      style={{ color: "#6b6862" }}
                    >
                      {z.einheit === "MWh" ? "MWh" : "m³"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Werkzeuge der Zeile: Merker und Notiz, darunter die Aktionen. */}
              <div className="flex flex-col pb-2 pl-6">
                <div className="flex flex-wrap items-center gap-x-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-0 text-[0.8125rem]">
                    <input
                      type="checkbox"
                      checked={zeile?.unsicher ?? false}
                      onChange={(e) => zeileSetzen(z.id, { unsicher: e.target.checked })}
                      className="check-44"
                    />
                    {t("ablesung.unsicher")}
                  </label>

                  <label className="flex min-h-11 min-w-44 flex-1 items-center">
                    <span className="sr-only">{t("ablesung.notiz")}</span>
                    <Eingabe
                      value={zeile?.notiz ?? ""}
                      onChange={(e) => zeileSetzen(z.id, { notiz: e.target.value })}
                      onFocus={() =>
                        setZeilen((v) => {
                          const k = new Map(v);
                          const alt = k.get(z.id);
                          k.set(z.id, {
                            zaehler: z,
                            wert: alt?.wert ?? "",
                            unsicher: alt?.unsicher ?? false,
                            notiz: alt?.notiz ?? "",
                            versteckt: alt?.versteckt ?? false,
                          });
                          return k;
                        })
                      }
                      placeholder={t("ablesung.notiz")}
                      className="text-[0.875rem]"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-x-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center text-[0.8125rem] underline underline-offset-4">
                    <span>{t("ablesung.fotoAufnehmen")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      aria-label={`${t("ablesung.foto")} ${z.bezeichnung}`}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void belegFotoSpeichern(z.id, file);
                      }}
                    />
                  </label>
                  {fotoKey ? (
                    <Textaktion gefahr onClick={() => void belegFotoEntfernen(z.id, fotoKey)}>
                      {t("ablesung.fotoEntfernen")}
                    </Textaktion>
                  ) : null}
                </div>
                {fotoKey ? (
                  <div className="py-2">
                    <FotoVorschau fotoKey={fotoKey} />
                    <p className="text-[0.75rem]" style={{ color: "#6b6862" }}>{t("ablesung.fotoGesichert")}</p>
                  </div>
                ) : null}
                {ocr.get(z.id)?.busy ? (
                  <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("ablesung.ocrLaden")}</p>
                ) : null}
                {ocr.get(z.id)?.nichtVerfuegbar ? (
                  <p className="text-[0.8125rem]" style={{ color: "#6b6862" }}>{t("ablesung.ocrNichtVerfuegbar")}</p>
                ) : null}
                {ocr.get(z.id)?.kandidaten.map((wert) => (
                  <Textaktion key={wert} onClick={() => zeileSetzen(z.id, { wert })}>
                    {t("ablesung.ocrVorschlag", { value: wert })}
                  </Textaktion>
                ))}

                <div className="flex flex-wrap items-center gap-x-1">
                  <Textaktion onClick={() => zeileSetzen(z.id, { versteckt: !versteckt })}>
                    {versteckt ? t("ablesung.einblenden") : t("ablesung.verstecken")}
                  </Textaktion>

                  <Textaktion
                    onClick={() => setVerlaufOffen(verlaufOffen === z.id ? null : z.id)}
                  >
                    {t("ablesung.verlauf")}
                  </Textaktion>
                </div>
              </div>

              {verlaufOffen === z.id ? (
                <Verlauf
                  zaehlerId={z.id}
                  onLoeschen={(id) => {
                    ablesungLoeschen(id);
                    meldungSetzen({ art: "info", text: t("ablesung.geloescht") });
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

    </div>
  );

  async function belegFotoSpeichern(zaehlerId: string, datei: File) {
    const speicher = useAppStore.getState().speicher;
    if (!(speicher instanceof IndexedDbAdapter)) {
      meldungSetzen({
        art: "fehler",
        text: t("ablesung.fotoSpeichernFehler", { reason: t("ablesung.fotoSpeicherNichtVerfuegbar") }),
      });
      return;
    }
    let blob: Blob;
    try {
      blob = await fotoKomprimieren(datei);
    } catch {
      meldungSetzen({
        art: "fehler",
        text: t("ablesung.fotoSpeichernFehler", {
          reason: t("ablesung.fotoVerarbeitungFehler"),
        }),
      });
      return;
    }
    const schluessel = `ablesung-${zaehlerId}-${datumWert}-${crypto.randomUUID()}`;
    try {
      await speicher.fotoSpeichern(schluessel, blob);
    } catch (error) {
      meldungSetzen({
        art: "fehler",
        text: t("ablesung.fotoSpeichernFehler", {
          reason: error instanceof Error ? error.message : t("cloud.unbekannterFehler"),
        }),
      });
      return;
    }
    const vorherigerKey = zeilen.get(zaehlerId)?.fotoKey ?? state.ablesung.find(
      (a) => a.zaehlerId === zaehlerId && a.datum === datumWert && !a.deleted,
    )?.fotoKey;
    zeileSetzen(zaehlerId, { fotoKey: schluessel });
    const gespeicherterKey = state.ablesung.find(
      (a) => a.zaehlerId === zaehlerId && a.datum === datumWert && !a.deleted,
    )?.fotoKey;
    if (vorherigerKey && vorherigerKey !== gespeicherterKey) {
      try {
        await speicher.fotoLoeschen(vorherigerKey);
      } catch (error) {
        meldungSetzen({
          art: "warnung",
          text: t("ablesung.fotoAufraeumenFehler", {
            reason: error instanceof Error ? error.message : t("cloud.unbekannterFehler"),
          }),
        });
      }
    }

    setOcr((vorher) => new Map(vorher).set(zaehlerId, {
      busy: true,
      kandidaten: [],
      nichtVerfuegbar: false,
    }));
    const textDetector = (globalThis as typeof globalThis & TextDetectorGlobal).TextDetector;
    if (!textDetector || typeof createImageBitmap !== "function") {
      setOcr((vorher) => new Map(vorher).set(zaehlerId, {
        busy: false,
        kandidaten: [],
        nichtVerfuegbar: true,
      }));
      return;
    }
    let bild: ImageBitmap | null = null;
    try {
      bild = await createImageBitmap(blob);
      const erkannteTexte = await new textDetector().detect(bild);
      const kandidaten = [...new Set(
        erkannteTexte.flatMap((eintrag) =>
          eintrag.rawValue.match(/\d+(?:[.,]\d+)?/g) ?? [],
        ).map((wert) => wert.replace(",", ".")),
      )];
      setOcr((vorher) => new Map(vorher).set(zaehlerId, {
        busy: false,
        kandidaten,
        nichtVerfuegbar: false,
      }));
    } catch {
      setOcr((vorher) => new Map(vorher).set(zaehlerId, {
        busy: false,
        kandidaten: [],
        nichtVerfuegbar: false,
      }));
      meldungSetzen({
        art: "info",
        text: t("ablesung.ocrFehler"),
      });
    } finally {
      bild?.close();
    }
  }

  async function belegFotoEntfernen(zaehlerId: string, fotoKey: string) {
    try {
      const speicher = useAppStore.getState().speicher;
      const gespeicherterKey = state.ablesung.find(
        (a) => a.zaehlerId === zaehlerId && a.datum === datumWert && !a.deleted,
      )?.fotoKey;
      if (speicher instanceof IndexedDbAdapter && fotoKey !== gespeicherterKey) {
        await speicher.fotoLoeschen(fotoKey);
      }
      zeileSetzen(zaehlerId, { fotoKey: null });
      setOcr((vorher) => new Map(vorher).set(zaehlerId, {
        busy: false,
        kandidaten: [],
        nichtVerfuegbar: false,
      }));
    } catch (error) {
      meldungSetzen({
        art: "fehler",
        text: t("ablesung.fotoSpeichernFehler", {
          reason: error instanceof Error ? error.message : t("cloud.unbekannterFehler"),
        }),
      });
    }
  }
}

async function fotoKomprimieren(datei: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return datei;
  const bild = await createImageBitmap(datei);
  const skalierung = Math.min(1, 1600 / Math.max(bild.width, bild.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bild.width * skalierung));
  canvas.height = Math.max(1, Math.round(bild.height * skalierung));
  const kontext = canvas.getContext("2d");
  if (!kontext) {
    bild.close();
    throw new Error("image-context-unavailable");
  }
  kontext.drawImage(bild, 0, 0, canvas.width, canvas.height);
  bild.close();
  const komprimiert = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!komprimiert) throw new Error("image-encoding-failed");
  return komprimiert;
}

function FotoVorschau({ fotoKey }: { fotoKey: string }) {
  const [url, setUrl] = useState("");
  const speicher = useAppStore((s) => s.speicher);
  useEffect(() => {
    if (!(speicher instanceof IndexedDbAdapter)) return;
    let aktiv = true;
    let objektUrl = "";
    void speicher.fotoLesen(fotoKey).then((blob) => {
      if (!blob || !aktiv) return;
      objektUrl = URL.createObjectURL(blob);
      setUrl(objektUrl);
    }).catch((error: unknown) => {
      console.error("Beleg-Foto konnte nicht geladen werden.", error);
    });
    return () => {
      aktiv = false;
      if (objektUrl) URL.revokeObjectURL(objektUrl);
    };
  }, [fotoKey, speicher]);

  return url ? <img src={url} alt="" className="max-h-40 max-w-full rounded border object-contain" style={{ borderColor: "#e3ded4" }} /> : null;
}
/** Verlauf der letzten Ablesungen eines Zählers (S3). */
function Verlauf({ zaehlerId, onLoeschen }: { zaehlerId: string; onLoeschen: (id: string) => void }) {
  const { t } = useTranslation();
  const ablesungen = useAppStore((s) => s.state.ablesung);
  const eintraege = ablesungenVon(ablesungen, zaehlerId).slice(0, 8);

  if (eintraege.length === 0) {
    return (
      <p className="pb-3 pl-6 text-[0.8125rem]" style={{ color: "#6b6862" }}>
        {t("ablesung.keinVerlauf")}
      </p>
    );
  }

  return (
    <div className="pb-3 pl-6">
      <div className="flex flex-col">
        {eintraege.map((a) => (
          <div
            key={a.id}
            className="flex items-baseline gap-3 border-b py-1.5 text-[0.8125rem]"
            style={{ borderColor: "#e3ded4" }}
          >
            <span className="tnum w-24 shrink-0" style={{ color: "#6b6862" }}>
              {datum(a.datum)}
            </span>
            <span className="tnum flex-1 text-right" style={{ color: "#1b1a17" }}>
              {stand(a.stand)}
            </span>
            {a.unsicher ? (
              <span className="text-[0.75rem]" style={{ color: "#a34f00" }}>
                {t("ablesung.unsicher")}
              </span>
            ) : null}
            {a.notiz ? (
              <span className="truncate" style={{ color: "#6b6862" }}>
                {a.notiz}
              </span>
            ) : null}
            <Textaktion gefahr onClick={() => onLoeschen(a.id)}>
              {t("ablesung.loeschen")}
            </Textaktion>
          </div>
        ))}
      </div>
    </div>
  );
}
