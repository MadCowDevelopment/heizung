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

const NAVIGATION = [
  { pfad: "/zaehler", schluessel: "nav.zaehler" },
  { pfad: "/ablesung", schluessel: "nav.ablesung" },
  { pfad: "/bewohner", schluessel: "nav.bewohner" },
] as const;

export function App() {
  const { t } = useTranslation();
  const laden = useAppStore((s) => s.laden);
  const geladen = useAppStore((s) => s.geladen);
  const meldung = useAppStore((s) => s.meldung);
  const status = useAppStore((s) => s.status);
  const meldungSetzen = useAppStore((s) => s.meldungSetzen);

  useEffect(() => {
    void laden();
  }, [laden]);

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
            </p>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-4xl gap-1 px-2"
          style={{ borderTop: "1px solid #e3ded4" }}
        >
          {NAVIGATION.map((eintrag) => (
            <NavLink
              key={eintrag.pfad}
              to={eintrag.pfad}
              className="relative flex min-h-11 items-center px-3 py-2.5 text-[0.875rem] font-medium"
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
            <Route path="/" element={<ScreenZaehler />} />
            <Route path="/zaehler" element={<ScreenZaehler />} />
            <Route path="/ablesung" element={<ScreenAblesung />} />
            <Route path="/bewohner" element={<ScreenBewohner />} />
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
