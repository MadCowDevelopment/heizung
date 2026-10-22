/**
 * Typ-Chip für Zähler.
 *
 * Farbe trägt Bedeutung, nie allein: der Chip zeigt immer die Farbe des
 * Zählertyps **und** die Glyphe **und** das Wort (docs/architecture.md §10).
 */

import { useTranslation } from "react-i18next";
import type { MeterType } from "../../domain/types";
import { TYP_FLAECHE, TYP_GLYPHE, TYP_TEXTFARBE } from "../../theme/tokens";

export interface MeterChipProps {
  typ: MeterType;
  /** `true` = ruhige Darstellung (für Listen). */
  klein?: boolean;
}

export function MeterChip({ typ, klein = false }: MeterChipProps) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] font-medium"
      style={{
        backgroundColor: TYP_FLAECHE[typ],
        color: TYP_TEXTFARBE[typ],
        fontSize: klein ? "0.6875rem" : "0.75rem",
        padding: klein ? "1px 6px" : "2px 8px",
        letterSpacing: "0.01em",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "0.6em", lineHeight: 1 }}>
        {TYP_GLYPHE[typ]}
      </span>
      {t(`typ.${typ}`)}
    </span>
  );
}

/**
 * Schmaler Farbstreifen als Zeilenmarke. Rein funktional: er zeigt auf einen
 * Blick, zu welchem Typ die Zeile gehört, ohne Text zu wiederholen.
 */
export function Typstreifen({ typ, hoehe = "1.75rem" }: { typ: MeterType; hoehe?: string }) {
  return (
    <span
      aria-hidden="true"
      className="block w-[3px] shrink-0 rounded-[1px]"
      style={{ backgroundColor: TYP_TEXTFARBE[typ], height: hoehe }}
    />
  );
}
