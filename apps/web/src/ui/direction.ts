/**
 * Richtungskontrakt der Oberflaeche.
 *
 * Der Text wird beim Start als HTML-Kommentar in das erzeugte Markup
 * geschrieben, damit die Gestaltungsrichtung im Produktionsbau nachvollziehbar
 * bleibt. Er ist Richtlinie, nicht Dokumentation - `DESIGN.md` beschreibt
 * spaeter den gebauten Stand.
 */

export const RICHTUNG = `
THESIS
Werkbank statt Dashboard: die App ist ein Messwerkzeug, kein Verwaltungs-
spiel. Ein Verwalter liest Zaehler ab, und die Oberflaeche ist der Beleg,
auf dem dieser Vorgang festgehalten wird.

OWN-WORLD
Ein Keller in der Abendstunde. Eine Lampe ueber der Werkbank, Waelme, ein
Werkzeugbrett, Kabel. Warmweisses Papierlicht, Graphitlinien, Tinte. Keine
Glasflaechen, keine Neonfarben - die Raumfarbe ist gebrochenes Weiss.
Gearbeitet wird mit wenigen, praezisen Werkzeugen.

STORY
Ein Verwaltungsobmann sitzt mit dem Handy im Keller. Er erfasst eine
Wasserablesung, unterbricht, kommt spaeter zurueck und erfasst die
Energieablesung. Am Ende des Ablesetages steht eine saubere, pruefbare
Liste. Die App muss Unsicherheit aushalten, ohne sie zu verstecken.

FIRST VIEWPORT
Ein ruhiger Kopf mit dem Geraetekasten der Wohnung: flache Linien, keine
Kacheln, links der Haushalt, rechts die Zaehler als schmale Typstreifen
mit Farbe, Glyphe und Wort. Darunter das Werkzeug, das gerade gebraucht
wird: erfassen, pruefen, speichern.

FORM
Ein durchgehender, linierter Beleg. Zeilen trennen feine Haarlinien, Werte
stehen in Tabellenziffern rechtsbuendig, Einheiten klein dahinter. Farbe
traegt Bedeutung und nie allein - immer Glyphe und Wort dazu. Genau eine
bewusste Bewegung: die Linie, die beim Erfassen weiterlaeuft.
`.trim();
