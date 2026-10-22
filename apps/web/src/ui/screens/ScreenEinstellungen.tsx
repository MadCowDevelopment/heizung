import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sortPrices } from "../../domain/calc/costs";
import type { Preis, VerteilSchluessel } from "../../domain/types";
import i18n, { SPRACHEN, type Sprache } from "../../i18n";
import { useAppStore } from "../../state/store";
import { zahl } from "../format";
import { Auswahl, Eingabe, KnopfPrimär, KnopfSekundaer, Textbereich, Textaktion } from "../components/Primitives";

interface PreisForm {
  id?: string;
  gueltigAb: string;
  preisMWh: string;
  preisM3: string;
  notiz: string;
}

function leererPreis(einstellungen: { preisMWhDefault: number; preisM3Default: number }): PreisForm {
  return {
    gueltigAb: new Date().toISOString().slice(0, 10),
    preisMWh: String(einstellungen.preisMWhDefault),
    preisM3: String(einstellungen.preisM3Default),
    notiz: "",
  };
}

export function ScreenEinstellungen() {
  const { t } = useTranslation();
  const einstellungen = useAppStore((s) => s.state.einstellungen);
  const preise = useAppStore((s) => s.state.preis);
  const einstellungenAendern = useAppStore((s) => s.einstellungenAendern);
  const preisSpeichern = useAppStore((s) => s.preisSpeichern);
  const preisLoeschen = useAppStore((s) => s.preisLoeschen);
  const aktiveSprache = (i18n.resolvedLanguage === "en" ? "en" : "de") as Sprache;
  const [form, setForm] = useState<PreisForm>(() => leererPreis(einstellungen));
  const [standardPreise, setStandardPreise] = useState({
    preisMWh: String(einstellungen.preisMWhDefault),
    preisM3: String(einstellungen.preisM3Default),
  });
  const [pdfDaten, setPdfDaten] = useState(() => ({
    objektName: einstellungen.objektName ?? "",
    ansprechpartner: einstellungen.ansprechpartner ?? "",
    pdfHinweis: einstellungen.pdfHinweis ?? "",
  }));
  const [fehler, setFehler] = useState("");
  const [standardFehler, setStandardFehler] = useState("");
  const [standardGespeichert, setStandardGespeichert] = useState(false);
  const [pdfGespeichert, setPdfGespeichert] = useState(false);
  const aktivePreise = useMemo(() => sortPrices(preise), [preise]);
  const sortiertePreise = [...aktivePreise].reverse();

  const preisEintragen = () => {
    const preisMWh = Number(form.preisMWh.replace(",", "."));
    const preisM3 = Number(form.preisM3.replace(",", "."));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.gueltigAb) ||
      !Number.isFinite(Date.parse(`${form.gueltigAb}T00:00:00Z`)) ||
      new Date(`${form.gueltigAb}T00:00:00Z`).toISOString().slice(0, 10) !== form.gueltigAb ||
      form.preisMWh.trim() === "" ||
      form.preisM3.trim() === "" ||
      !Number.isFinite(preisMWh) ||
      preisMWh < 0 ||
      !Number.isFinite(preisM3) ||
      preisM3 < 0
    ) {
      setFehler(t("einstellungen.preisUngueltig"));
      return;
    }
    if (aktivePreise.some((preis) => preis.gueltigAb === form.gueltigAb && preis.id !== form.id)) {
      setFehler(t("einstellungen.preisDatumDoppelt"));
      return;
    }
    preisSpeichern({
      id: form.id,
      gueltigAb: form.gueltigAb,
      preisMWh,
      preisM3,
      notiz: form.notiz.trim(),
    });
    setForm(leererPreis(einstellungen));
    setFehler("");
  };

  const preisBearbeiten = (preis: Preis) => {
    setForm({
      id: preis.id,
      gueltigAb: preis.gueltigAb,
      preisMWh: String(preis.preisMWh),
      preisM3: String(preis.preisM3),
      notiz: preis.notiz ?? "",
    });
    setFehler("");
  };

  return (
    <section className="screen-stack">
      <div>
        <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>
          {t("einstellungen.titel")}
        </h2>
        <p className="mt-1 max-w-[65ch] text-[0.875rem] leading-relaxed" style={{ color: "#6b6862" }}>
          {t("einstellungen.untertitel")}
        </p>
      </div>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h3 className="text-[1rem] font-semibold">{t("einstellungen.sprache")}</h3>
        <label className="flex max-w-sm flex-col gap-1">
          <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>
            {t("einstellungen.anzeigesprache")}
          </span>
          <Auswahl
            value={aktiveSprache}
            onChange={(event) => void i18n.changeLanguage(event.target.value as Sprache)}
          >
            {Object.entries(SPRACHEN).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </Auswahl>
        </label>
      </section>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h3 className="text-[1rem] font-semibold">{t("einstellungen.standardPreise")}</h3>
        <p className="max-w-[65ch] text-[0.8125rem] leading-relaxed" style={{ color: "#6b6862" }}>
          {t("einstellungen.preisHinweis", {
            preisMWh: zahl(einstellungen.preisMWhDefault, 4),
            preisM3: zahl(einstellungen.preisM3Default, 4),
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label={t("einstellungen.standardPreisMWh")}>
            <Eingabe
              inputMode="decimal"
              value={standardPreise.preisMWh}
              onChange={(e) => { setStandardPreise({ ...standardPreise, preisMWh: e.target.value }); setStandardGespeichert(false); }}
            />
          </Feld>
          <Feld label={t("einstellungen.standardPreisM3")}>
            <Eingabe
              inputMode="decimal"
              value={standardPreise.preisM3}
              onChange={(e) => { setStandardPreise({ ...standardPreise, preisM3: e.target.value }); setStandardGespeichert(false); }}
            />
          </Feld>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <KnopfSekundaer
            onClick={async () => {
              const preisMWh = Number(standardPreise.preisMWh.replace(",", "."));
              const preisM3 = Number(standardPreise.preisM3.replace(",", "."));
              if (
                standardPreise.preisMWh.trim() === "" ||
                standardPreise.preisM3.trim() === "" ||
                !Number.isFinite(preisMWh) ||
                preisMWh < 0 ||
                !Number.isFinite(preisM3) ||
                preisM3 < 0
              ) {
                setStandardFehler(t("einstellungen.preisUngueltig"));
                return;
              }
              const gespeichert = await einstellungenAendern({
                preisMWhDefault: preisMWh,
                preisM3Default: preisM3,
              });
              setStandardFehler("");
              setStandardGespeichert(gespeichert);
              setForm((vorher) => vorher.id ? vorher : {
                ...vorher,
                preisMWh: String(preisMWh),
                preisM3: String(preisM3),
              });
            }}
          >
            {t("einstellungen.standardPreiseSpeichern")}
          </KnopfSekundaer>
          {standardGespeichert ? <p role="status" className="text-[0.8125rem]" style={{ color: "#1f6f3f" }}>{t("einstellungen.standardPreiseGespeichert")}</p> : null}
        </div>
        {standardFehler ? <p role="alert" className="text-[0.8125rem]" style={{ color: "#b3261e" }}>{standardFehler}</p> : null}
        <h4 className="pt-3 text-[0.875rem] font-semibold">{t("einstellungen.preishistorie")}</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label={t("einstellungen.gueltigAb")}>
            <Eingabe type="date" value={form.gueltigAb} onChange={(e) => setForm({ ...form, gueltigAb: e.target.value })} />
          </Feld>
          <Feld label={t("einstellungen.preisMWh")}>
            <Eingabe inputMode="decimal" value={form.preisMWh} onChange={(e) => setForm({ ...form, preisMWh: e.target.value })} />
          </Feld>
          <Feld label={t("einstellungen.preisM3")}>
            <Eingabe inputMode="decimal" value={form.preisM3} onChange={(e) => setForm({ ...form, preisM3: e.target.value })} />
          </Feld>
          <Feld label={t("einstellungen.preisNotiz")}>
            <Eingabe value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} />
          </Feld>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KnopfPrimär onClick={preisEintragen}>
            {form.id ? t("einstellungen.preisAktualisieren") : t("einstellungen.preisHinzufuegen")}
          </KnopfPrimär>
          {form.id ? (
            <KnopfSekundaer onClick={() => { setForm(leererPreis(einstellungen)); setFehler(""); }}>
              {t("einstellungen.abbrechen")}
            </KnopfSekundaer>
          ) : null}
        </div>
        {fehler ? <p role="alert" className="text-[0.8125rem]" style={{ color: "#b3261e" }}>{fehler}</p> : null}
        {sortiertePreise.length === 0 ? (
          <p className="py-2 text-[0.875rem]" style={{ color: "#6b6862" }}>{t("einstellungen.keinePreise")}</p>
        ) : (
          <div className="divide-y border-y" style={{ borderColor: "#e1e5df" }}>
            {sortiertePreise.map((preis) => (
              <div key={preis.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="tnum w-28 text-[0.875rem]">{preis.gueltigAb}</span>
                <span className="tnum text-[0.875rem]">{zahl(preis.preisMWh, 4)} €/MWh</span>
                <span className="tnum text-[0.875rem]">{zahl(preis.preisM3, 4)} €/m³</span>
                {preis.notiz ? <span className="min-w-24 flex-1 text-[0.8125rem]" style={{ color: "#6b6862" }}>{preis.notiz}</span> : <span className="flex-1" />}
                <Textaktion onClick={() => preisBearbeiten(preis)}>{t("einstellungen.bearbeiten")}</Textaktion>
                <Textaktion gefahr onClick={() => preisLoeschen(preis.id)}>{t("einstellungen.loeschen")}</Textaktion>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h3 className="text-[1rem] font-semibold">{t("einstellungen.verteilung")}</h3>
        <Feld label={t("einstellungen.verteilSchluessel")}>
          <Auswahl
            value={einstellungen.verteilSchluessel}
            onChange={(event) => einstellungenAendern({ verteilSchluessel: event.target.value as VerteilSchluessel })}
          >
            <option value="warm">{t("einstellungen.schluesselWarm")}</option>
            <option value="warm+kalt">{t("einstellungen.schluesselWarmKalt")}</option>
            <option value="kalt">{t("einstellungen.schluesselKalt")}</option>
          </Auswahl>
        </Feld>
      </section>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h3 className="text-[1rem] font-semibold">{t("einstellungen.pdf")}</h3>
        <Feld label={t("einstellungen.objektName")}>
          <Eingabe value={pdfDaten.objektName} onChange={(e) => { setPdfDaten({ ...pdfDaten, objektName: e.target.value }); setPdfGespeichert(false); }} />
        </Feld>
        <Feld label={t("einstellungen.ansprechpartner")}>
          <Eingabe value={pdfDaten.ansprechpartner} onChange={(e) => { setPdfDaten({ ...pdfDaten, ansprechpartner: e.target.value }); setPdfGespeichert(false); }} />
        </Feld>
        <Feld label={t("einstellungen.pdfHinweis")}>
          <Textbereich rows={3} value={pdfDaten.pdfHinweis} onChange={(e) => { setPdfDaten({ ...pdfDaten, pdfHinweis: e.target.value }); setPdfGespeichert(false); }} />
        </Feld>
        <div className="flex flex-wrap items-center gap-3">
          <KnopfSekundaer
            onClick={async () => {
              setPdfGespeichert(await einstellungenAendern(pdfDaten));
            }}
          >
            {t("einstellungen.pdfSpeichern")}
          </KnopfSekundaer>
          {pdfGespeichert ? <p role="status" className="text-[0.8125rem]" style={{ color: "#1f6f3f" }}>{t("einstellungen.pdfGespeichert")}</p> : null}
        </div>
      </section>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h3 className="text-[1rem] font-semibold">{t("nav.konto")}</h3>
        <p className="max-w-[65ch] text-[0.8125rem] leading-relaxed" style={{ color: "#6b6862" }}>
          {t("cloud.hinweis")}
        </p>
        <Link
          className="button-secondary inline-flex min-h-11 items-center justify-center rounded-lg border border-[#c7cdc5] px-4 text-[0.9375rem] font-medium"
          to="/konto"
        >
          {t("einstellungen.kontoCloudOeffnen")}
        </Link>
      </section>
    </section>
  );
}

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{label}</span>
      {children}
    </label>
  );
}
