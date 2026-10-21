/**
 * Kleine Bausteine der Oberfläche.
 *
 * Bewusst zurückhaltend: Linien statt Kacheln, Text statt Icon-Sammlungen,
 * Schatten nur, wo sie eine echte Höhenangabe tragen (Offset **und** Weichzeichnung).
 */

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

/** Primäre Aktion (eine einzige pro Ansicht). */
export function KnopfPrimär({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] px-4 text-[0.9375rem] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={{ backgroundColor: "#1b1a17", color: "#faf8f4" }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Klassen der sekundären Aktion – auch für Links verwendbar. */
export const KNOPF_SEKUNDAER_KLASSE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] border px-4 text-[0.9375rem] font-medium transition-colors duration-150";

/** Stil der sekundären Aktion. */
export const KNOPF_SEKUNDAER_STIL: CSSProperties = {
  borderColor: "#c9c3b6",
  backgroundColor: "transparent",
  color: "#1b1a17",
};

/** Sekundäre Aktion – als Linie, nicht als Block. */
export function KnopfSekundaer({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${KNOPF_SEKUNDAER_KLASSE} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={KNOPF_SEKUNDAER_STIL}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Unaufgeregter Textlink (Aktion in Fließtext).
 *
 * Mindesthöhe 44 px: die Aktion ist ein Griff am Telefon, keine
 * Fußnote. `gefahr` trennt zerstörende Aktionen optisch von den
 * alltäglichen – Farbe und Wort zusammen, nie Farbe allein.
 */
export function Textaktion({
  children,
  className = "",
  gefahr = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { gefahr?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center rounded-[2px] px-2 text-[0.875rem] underline underline-offset-4 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={{
        color: gefahr ? "#b3261e" : "#1b1a17",
        textDecorationColor: gefahr ? "#e3b0ae" : "#c9c3b6",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Beschriftetes Eingabefeld als Formularlinie. */
export function Feld({
  label,
  hinweis,
  children,
  id,
}: {
  label: string;
  hinweis?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[0.75rem] font-medium tracking-[0.04em] uppercase"
        style={{ color: "#55524c" }}
      >
        {label}
      </label>
      {children}
      {hinweis ? (
        <p className="text-[0.75rem] leading-snug" style={{ color: "#6b6862" }}>
          {hinweis}
        </p>
      ) : null}
    </div>
  );
}

/** Textfeld mit Formularlinie. */
export function Eingabe(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field-line ${props.className ?? ""}`} />;
}

/** Auswahlfeld mit Formularlinie. */
export function Auswahl(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field-line ${props.className ?? ""}`} />;
}

/** Textbereich mit Formularlinie. */
export function Textbereich(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field-line ${props.className ?? ""}`} />;
}

/** Meldungszeile (Erfolg / Warnung / Fehler). */
export function Meldungszeile({
  art,
  text,
  onSchliessen,
}: {
  art: "info" | "warnung" | "fehler" | "erfolg";
  text: string;
  onSchliessen?: () => void;
}) {
  const { t } = useTranslation();
  const farbe =
    art === "fehler" ? "#b3261e" : art === "warnung" ? "#8a5a00" : art === "erfolg" ? "#1f6f3f" : "#55524c";
  return (
    <div
      role={art === "fehler" ? "alert" : "status"}
      className="flex items-start gap-3 py-2 text-[0.875rem]"
      style={{ color: farbe, borderBottom: "1px solid #e3ded4" }}
    >
      <span className="mt-[3px] leading-none" aria-hidden="true">
        {art === "fehler" ? "✕" : art === "warnung" ? "!" : art === "erfolg" ? "✓" : "i"}
      </span>
      <span className="flex-1 leading-snug">{text}</span>
      {onSchliessen ? (
        <button
          type="button"
          onClick={onSchliessen}
          aria-label={t("meldung.schliessen")}
          className="-my-1 -mr-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[2px]"
          style={{ color: farbe }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * Leere Zustandsanzeige.
 *
 * Benennt die Lage und nennt den nächsten Schritt – eine leere Liste ohne
 * Hinweis ist ein Loch in der Oberfläche. `aktion` bietet den Schritt
 * an, wenn es genau eine gibt.
 */
export function Leerzustand({
  text,
  hinweis,
  aktion,
}: {
  text: string;
  hinweis?: string;
  aktion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <p className="text-[0.9375rem] leading-relaxed" style={{ color: "#55524c" }}>
        {text}
      </p>
      {hinweis ? (
        <p className="max-w-[46ch] text-[0.875rem] leading-relaxed" style={{ color: "#6b6862" }}>
          {hinweis}
        </p>
      ) : null}
      {aktion}
    </div>
  );
}
