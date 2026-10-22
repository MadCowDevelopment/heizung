/**
 * Rahmen der Anwendung: Kopfzeile, Navigation, Meldungsband, Bildschirm.
 *
 * Die Kopfzeile ist die Werkbank-Kante: links das Gerät, rechts der
 * Speicherzustand. Die Navigation sitzt darunter als ruhige Reiter, weil sie
 * drei gleichwertige Werkzeuge benennt.
 */

import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../state/store";
import { RICHTUNG } from "./direction";
import { Meldungszeile } from "./components/Primitives";
import { ScreenZaehler } from "./screens/ScreenZaehler";
import { ScreenAblesung } from "./screens/ScreenAblesung";
import { ScreenBewohner } from "./screens/ScreenBewohner";
import { ScreenVerbrauch } from "./screens/ScreenVerbrauch";
import { ScreenAbschlaege } from "./screens/ScreenAbschlaege";
import { ScreenKonto } from "./screens/ScreenKonto";
import { ScreenDashboard } from "./screens/ScreenDashboard";
import { ScreenAbrechnung } from "./screens/ScreenAbrechnung";
import { tokenLesen } from "../storage/github";

const NAVIGATION = [
  { pfad: "/", schluessel: "nav.dashboard" },
  { pfad: "/zaehler", schluessel: "nav.zaehler" },
  { pfad: "/ablesung", schluessel: "nav.ablesung" },
  { pfad: "/bewohner", schluessel: "nav.bewohner" },
  { pfad: "/verbrauch", schluessel: "nav.verbrauch" },
  { pfad: "/abschlaege", schluessel: "nav.abschlaege" },
  { pfad: "/abrechnung", schluessel: "nav.abrechnung" },
  { pfad: "/konto", schluessel: "nav.konto" },
] as const;

export function App() {
  const { t } = useTranslation();
  const laden = useAppStore((s) => s.laden);
  const geladen = useAppStore((s) => s.geladen);
  const meldung = useAppStore((s) => s.meldung);
  const status = useAppStore((s) => s.status);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);
  const synchronisieren = useAppStore((s) => s.synchronisieren);
  const syncIntervall = useAppStore((s) => s.state.einstellungen.syncIntervallSekunden ?? 30);
  const syncStatus = useAppStore((s) => s.syncStatus);

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    const online = () => void synchronisieren();
    globalThis.addEventListener?.("online", online);
    return () => globalThis.removeEventListener?.("online", online);
  }, [synchronisieren]);

  useEffect(() => {
    if (!geladen) return;
    const timer = globalThis.setInterval(() => {
      if (tokenLesen()) void synchronisieren();
    }, Math.max(15, syncIntervall) * 1000);
    return () => globalThis.clearInterval(timer);
  }, [geladen, syncIntervall, synchronisieren]);

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "#faf8f4" }}>
      {/* Der Richtungskontrakt überlebt den Produktionsbau. */}
      <div
        style={{ display: "none" }}
        dangerouslySetInnerHTML={{ __html: `<!--${RICHTUNG}-->` }}
      />

      <header
        className="sticky top-0 z-20"
        style={{
          backgroundColor: "#faf8f4",
          borderBottom: "1px solid #e3ded4",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-[1.0625rem] font-semibold" style={{ color: "#1b1a17" }}>
              {t("app.titel")}
            </h1>
            <p className="truncate text-[0.75rem]" style={{ color: "#6b6862" }}>
              {statusText(status, t)}
              {syncStatus !== "bereit" ? ` · ${t(`cloud.syncStatus.${syncStatus}`)}` : ""}
            </p>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-4xl gap-1 overflow-x-auto overflow-y-hidden px-2"
          style={{ borderTop: "1px solid #e3ded4" }}
          aria-label={t("nav.hauptnavigation")}
        >
          {NAVIGATION.map((eintrag) => (
            <NavLink
              key={eintrag.pfad}
              to={eintrag.pfad}
              end={eintrag.pfad === "/"}
              className="relative flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 py-2.5 text-[0.875rem] font-medium"
              style={({ isActive }) => ({
                color: isActive ? "#1b1a17" : "#6b6862",
                borderBottom: isActive ? "2px solid #1b1a17" : "2px solid transparent",
                marginBottom: "-1px",
              })}
            >
              {t(eintrag.schluessel)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {meldung ? (
          <Meldungszeile
            art={meldung.art}
            text={meldung.text}
            onSchliessen={() => meldungSetzen(null)}
          />
        ) : null}

        {!geladen ? (
          <p className="py-10 text-center text-[0.9375rem]" style={{ color: "#6b6862" }}>
            {t("app.laden")}
          </p>
        ) : (
          <Routes>
            <Route path="/" element={<ScreenDashboard />} />
            <Route path="/dashboard" element={<ScreenDashboard />} />
            <Route path="/zaehler" element={<ScreenZaehler />} />
            <Route path="/ablesung" element={<ScreenAblesung />} />
            <Route path="/bewohner" element={<ScreenBewohner />} />
            <Route path="/verbrauch" element={<ScreenVerbrauch />} />
            <Route path="/abschlaege" element={<ScreenAbschlaege />} />
            <Route path="/abrechnung" element={<ScreenAbrechnung />} />
            <Route path="/konto" element={<ScreenKonto />} />
            <Route path="*" element={<ScreenZaehler />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

function statusText(
  status: "leer" | "geladen" | "gespeichert" | "fehler",
  t: (key: string) => string,
): string {
  if (status === "fehler") return t("status.fehler");
  if (status === "gespeichert") return t("status.lokal");
  if (status === "geladen") return t("status.geladen");
  return t("status.leer");
}
