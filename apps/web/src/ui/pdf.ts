import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Abrechnung, AbrechnungsPosition, Einstellungen } from "../domain/types";
import { meldeText } from "../i18n/meldung";
import { datum } from "./format";

const SEITENBREITE = 595.28;
const SEITENHOEHE = 841.89;
const FARBE = {
  tinte: rgb(0.106, 0.102, 0.09),
  sekund: rgb(0.333, 0.322, 0.298),
  linie: rgb(0.788, 0.765, 0.714),
  warm: rgb(0.776, 0.157, 0.157),
  kalt: rgb(0.082, 0.396, 0.753),
  energie: rgb(0.639, 0.31, 0),
};

function geld(wert: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(wert);
}

function zahl(wert: number, stellen = 3): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(wert);
}

function text(
  page: PDFPage,
  font: PDFFont,
  inhalt: string,
  x: number,
  y: number,
  size = 10,
  color = FARBE.tinte,
): void {
  page.drawText(inhalt, { x, y, size, font, color });
}

function absatz(
  page: PDFPage,
  font: PDFFont,
  inhalt: string,
  x: number,
  y: number,
  breite: number,
  size = 9,
): number {
  const woerter = inhalt.split(/\s+/).filter(Boolean);
  let zeile = "";
  let zeilenY = y;
  for (const wort of woerter) {
    const kandidat = zeile ? `${zeile} ${wort}` : wort;
    if (font.widthOfTextAtSize(kandidat, size) > breite && zeile) {
      text(page, font, zeile, x, zeilenY, size, FARBE.sekund);
      zeilenY -= 13;
      zeile = wort;
    } else {
      zeile = kandidat;
    }
  }
  if (zeile) text(page, font, zeile, x, zeilenY, size, FARBE.sekund);
  return zeilenY - (zeile ? 13 : 0);
}

function zeile(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  label: string,
  wert: string,
  y: number,
  color = FARBE.tinte,
): void {
  text(page, regular, label, 48, y, 10, color);
  const size = 10;
  const x = SEITENBREITE - 48 - bold.widthOfTextAtSize(wert, size);
  text(page, bold, wert, x, y, size, color);
  page.drawLine({
    start: { x: 48, y: y - 7 },
    end: { x: SEITENBREITE - 48, y: y - 7 },
    thickness: 0.45,
    color: FARBE.linie,
  });
}

function abrechnungsSeite(
  pdf: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  abrechnung: Abrechnung,
  position: AbrechnungsPosition,
  einstellungen: Einstellungen,
  erstellt: string,
): void {
  const page = pdf.addPage([SEITENBREITE, SEITENHOEHE]);
  const objekt = einstellungen.objektName?.trim() || "Heizungsabrechnung";
  text(page, bold, objekt, 48, 786, 18);
  text(page, regular, "Jahresabrechnung", 48, 758, 13, FARBE.sekund);
  text(page, regular, `Zeitraum: ${datum(abrechnung.von)} bis ${datum(abrechnung.bis)}`, 48, 736);
  text(page, regular, `Bewohner/in: ${position.bewohnerName}`, 48, 718);
  text(page, regular, `Erstellt am: ${erstellt}`, 48, 700, 9, FARBE.sekund);

  page.drawLine({
    start: { x: 48, y: 682 },
    end: { x: SEITENBREITE - 48, y: 682 },
    thickness: 1,
    color: FARBE.linie,
  });
  text(page, bold, "Verbrauch und Verteilung", 48, 658, 12);
  zeile(page, regular, bold, "Warmwasser", `${zahl(position.wasserWarmM3)} m³`, 632, FARBE.warm);
  zeile(page, regular, bold, "Kaltwasser", `${zahl(position.wasserKaltM3)} m³`, 606, FARBE.kalt);
  zeile(page, regular, bold, "Energie", `${zahl(position.energieMWh)} MWh`, 580, FARBE.energie);
  zeile(page, regular, bold, "Anteil an den theoretischen Kosten", `${zahl(position.anteilProzent, 2)} %`, 554);
  zeile(page, regular, bold, "Theoretische Kosten", geld(position.kostenTheoretisch), 528);
  zeile(page, regular, bold, "Verteilter Betreiberbetrag", geld(position.rechnungsbetrag), 502);
  zeile(page, regular, bold, "Gezahlte Abschläge", geld(position.summeAbschlaege), 476);
  const saldofarbe = position.saldo > 0 ? FARBE.warm : position.saldo < 0 ? FARBE.kalt : FARBE.tinte;
  zeile(page, regular, bold, position.saldo > 0 ? "Nachzahlung" : "Guthaben / Saldo", geld(position.saldo), 450, saldofarbe);

  text(page, bold, "Erläuterung", 48, 405, 11);
  let y = absatz(
    page,
    regular,
    "Der Betreiberbetrag wird im Verhältnis der theoretischen Kosten verteilt. Die Beträge werden kaufmännisch gerundet; Rundungsreste werden so verteilt, dass die Summe exakt dem Betreiberbetrag entspricht.",
    48,
    384,
    SEITENBREITE - 96,
  );
  if (abrechnung.betreiberHinweis?.trim()) {
    y = absatz(page, regular, `Hinweis des Betreibers: ${abrechnung.betreiberHinweis.trim()}`, 48, y - 7, SEITENBREITE - 96);
  }
  if (position.hinweise.length) {
    y = absatz(
      page,
      regular,
      `Hinweise: ${position.hinweise.map((meldung) => meldeText(meldung)).join(" ")}`,
      48,
      y - 7,
      SEITENBREITE - 96,
    );
  }
  if (einstellungen.pdfHinweis?.trim()) {
    y = absatz(page, regular, einstellungen.pdfHinweis.trim(), 48, y - 7, SEITENBREITE - 96);
  }
  if (einstellungen.ansprechpartner?.trim()) {
    text(page, regular, `Ansprechpartner: ${einstellungen.ansprechpartner.trim()}`, 48, Math.max(70, y - 8), 9, FARBE.sekund);
  }
  text(page, regular, `Abrechnung ${abrechnung.jahr} · ${position.bewohnerName}`, 48, 42, 8, FARBE.sekund);
}

/** Erstellt eine PDF ausschließlich aus dem gespeicherten Stand der Abrechnung. */
export async function abrechnungAlsPdf(
  abrechnung: Abrechnung,
  einstellungen: Einstellungen,
  bewohnerId?: string,
): Promise<Uint8Array> {
  const positionen = bewohnerId
    ? abrechnung.positionen.filter((position) => position.bewohnerId === bewohnerId)
    : abrechnung.positionen;
  if (positionen.length === 0) throw new Error("Für diese Abrechnung gibt es keine Positionen.");

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Abrechnung ${abrechnung.jahr}`);
  pdf.setSubject("Eingefrorene Jahresabrechnung");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const erstellt = new Intl.DateTimeFormat("de-DE").format(new Date());
  for (const position of positionen) {
    abrechnungsSeite(pdf, regular, bold, abrechnung, position, einstellungen, erstellt);
  }
  return pdf.save();
}
