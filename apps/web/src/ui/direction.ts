/**
 * Richtungskontrakt der Oberflaeche.
 *
 * Der Text wird beim Start als HTML-Kommentar in das erzeugte Markup
 * geschrieben, damit die Gestaltungsrichtung im Produktionsbau nachvollziehbar
 * bleibt. `DESIGN.md` dokumentiert den gebauten Stand.
 */

export const RICHTUNG = `
THESIS
Eine klare mobile Arbeitsoberflaeche fuer zaehlbare Kosten: zuerst der
naechste Handgriff, dann die nachvollziehbare Zahl. Sie verweigert
Kennzahlen-Dashboards ohne Herleitung.

OWN-WORLD
Ein zeitgemaesses Verwaltungswerkzeug: ruhiger graugruener Grund, weisse
Funktionskarten, klare dunkle Schrift, kompakte Rundungen und dezente
Tiefenstaffelung. Rot, Blau und Bernstein bleiben ausschliesslich
fachlichen Zaehlerarten zugeordnet.

STORY
Eine Verwaltungsperson erfasst im Keller einhaendig Staende und prueft
spaeter am Schreibtisch Verbrauch, Abschlaege und Abrechnung. Jede Liste
bleibt lesbar und jede Zahl nachvollziehbar.

FIRST VIEWPORT
Eine feste Kopfzeile mit direktem Zugriff auf alle Ansichten, darunter
Dashboard-Titel und leicht erreichbare Primaeraktion. Verbrauch und offene
Abschlaege stehen in zwei kompakten Kennzahlenkarten, danach folgen
Bewohnerkosten. Konto und Cloud sind als Unterseite in den Einstellungen
erreichbar, nicht als eigener Hauptnavigationspunkt.

FORM
Mobile-first Karten und strukturierte Listen tragen alle Ansichten.
Formularfelder und Aktionen haben klare 44px-Trefferflaechen; Messwerte
nutzen Monospace. Fachfarben bleiben immer mit Glyphe und Wort gekoppelt.
Konzept-Seed uebersprungen; die Richtung entstand aus Anfrage und Produktkontext.
`.trim();
