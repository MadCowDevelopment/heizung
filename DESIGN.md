---
name: Werkbank Heizungsabrechnung
description: A lined working-paper surface for meter readings — warm paper, graphite rules, one moving line.
colors:
  bench: "#faf8f4"
  bench-raised: "#ffffff"
  bench-sunk: "#f2eee6"
  ink: "#1b1a17"
  ink-2: "#55524c"
  ink-3: "#6b6862"
  rule: "#e3ded4"
  rule-strong: "#c9c3b6"
  warm: "#c62828"
  warm-soft: "#fbeceb"
  kalt: "#1565c0"
  kalt-soft: "#eaf1fb"
  energie: "#ef6c00"
  energie-soft: "#fdf0e3"
  energie-ink: "#a34f00"
  ok: "#1f6f3f"
  warn: "#8a5a00"
  danger: "#b3261e"
typography:
  sans:
    fontFamily: "Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, SF Mono, Menlo, Consolas, Liberation Mono, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
rounded:
  none: "0px"
  hair: "1px"
  soft: "2px"
  chip: "3px"
spacing:
  hairline: "1px"
  tight: "0.25rem"
  snug: "0.5rem"
  base: "0.75rem"
  row: "1rem"
  band: "1.5rem"
  sheet: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bench}"
    typography: "{typography.sans}"
    rounded: "{rounded.chip}"
    padding: "0.75rem 1rem"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.sans}"
    rounded: "{rounded.chip}"
    padding: "0.75rem 1rem"
    height: "44px"
  text-action:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.sans}"
    rounded: "{rounded.soft}"
    padding: "0.5rem"
    height: "44px"
  field-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.sans}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0"
    height: "44px"
  meter-chip:
    backgroundColor: "{colors.energie-soft}"
    textColor: "{colors.energie-ink}"
    typography: "{typography.sans}"
    rounded: "{rounded.chip}"
    padding: "0.125rem 0.5rem"
  type-stripe:
    backgroundColor: "{colors.energie-ink}"
    rounded: "{rounded.hair}"
    width: "3px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    typography: "{typography.sans}"
    padding: "0.625rem 0.75rem"
    height: "44px"
  sheet-band:
    backgroundColor: "{colors.bench-sunk}"
    rounded: "{rounded.none}"
    padding: "1rem"
---

# Design System: Werkbank Heizungsabrechnung

## Overview

**Creative North Star: "Ein Keller in der Abendstunde"**

Die Oberfläche ist kein Dashboard, sondern eine Werkbank. Ein Verwaltungsobmann
liest im Keller Zähler ab, hält das Handy einhändig, hat schlechtes Licht und
eine Handvoll Papier. Was auf dem Bildschirm erscheint, ist der Beleg, auf dem
dieser Vorgang festgehalten wird: ein durchgehendes Blatt, durch feine
Haarlinien in Bänder geteilt, Werte als gesetzte Ziffern, Einheiten klein
dahinter. Es gibt keine Kacheln, keine Karten, keinen Glas-Look, kein Neon.
Die Raumfarbe ist gebrochenes Weiß.

Dichte entsteht nicht durch mehr Elemente, sondern durch weniger Linien pro
Bedeutung: eine Linie trennt, ein Streifen markiert, eine Zahl trägt den Wert.
Drei Farben sind gesetzt und tragen ausschliesslich Fachbedeutung — Warmwasser
rot, Kaltwasser blau, Energie Bernstein (docs/architecture.md §10). Farbe steht
nie allein, immer zusammen mit Glyphe und Wort. Es gibt genau eine Bewegung:
die Lauflinie, die beim Erfassen weiterläuft, solange noch etwas fehlt.

**Key Characteristics:**
- Liniert statt gekachelt: Trennung durch Haarlinien (`#e3ded4`), nie durch Rahmen.
- Eine Fläche, drei Ebenen: Papier (`#faf8f4`), Vertiefung (`#f2eee6`), Schrift (`#1b1a17`).
- Zahlen sind gesetzt: Monospace mit Tabellenziffern, rechtsbündig, Einheiten klein.
- Farbe ist Fachinformation, nie Dekoration — und nie allein.
- Genau eine Bewegung, und sie zeigt Arbeitsstand an.

**Konzept-Seed:** Der Richtungskontrakt (`apps/web/src/ui/direction.ts`) führt im
Block FORM den Seed `aa27a2b2` (Modus `operate`, zugewiesener Index 3). Der Roll
wurde nicht übersprungen: `concept-seed.mjs --from aa27a2b2 --candidate-count 7`
gibt ihn reproduzierbar aus. Das Blatt kommt aus der eigenen geerdeten Liste; ein
Katalog-Challenger wurde nicht übernommen.

## Colors

Eine warme Papierpalette mit Graphit-Tinte und drei gesetzten Fachfarben; die
Kontraste sind auf `#faf8f4` gemessen: jede Textfarbe liegt über 4,5:1, Linien
und Flächen darunter.

### Neutral
- **Papier (bench)** (`#faf8f4`): die Grundfläche der gesamten App, gesetzt in diesem Design-System; die Fachfarben stehen in docs/architecture.md §10.
- **Papier gehoben (bench-raised)** (`#ffffff`): Reserve für Flächen, die über der Grundlage liegen.
- **Papier vertieft (bench-sunk)** (`#f2eee6`): eingesetzte Formularblätter und Bänder, die sich vom Beleg abheben.
- **Tinte (ink)** (`#1b1a17`): Fließtext und Überschriften, zugleich Grundfarbe des Primärknopfes.
- **Tinte gedämpft (ink-2)** (`#55524c`): Beschriftungen, Labels, Nebentexte in Meldungen.
- **Tinte schwach (ink-3)** (`#6b6862`): Hilfstexte, Platzhalter, inaktive Navigation (5,24:1 auf Papier).
- **Haarlinie (rule)** (`#e3ded4`): die Trennlinie des Belegs, untere Blattkante.
- **Linie kräftig (rule-strong)** (`#c9c3b6`): Unterkante von Eingabefeldern, aktiver Navigationsreiter, Oberkante des Belegs.

### Primary
- **Warmwasser (warm)** (`#c62828`): Zählerchip, Typstreifen und Kennzahlen warmen Wassers (5,30:1).
- **Warmwasser Fläche (warm-soft)** (`#fbeceb`): die helle Fläche hinter einem Warmwasser-Chip.
- **Kaltwasser (kalt)** (`#1565c0`): dasselbe für kaltes Wasser (5,42:1).
- **Kaltwasser Fläche (kalt-soft)** (`#eaf1fb`): die helle Fläche hinter einem Kaltwasser-Chip.

### Secondary
- **Energie (energie)** (`#ef6c00`): Flächenfarbe des Energiechips.
- **Energie Fläche (energie-soft)** (`#fdf0e3`): die helle Fläche hinter einem Energie-Chip.
- **Energie Tinte (energie-ink)** (`#a34f00`): Text- und Streifenfarbe des Energie-Typs (5,39:1) — der Bernstein selbst trägt als Text zu wenig Kontrast.

### Zustand
- **Bestätigt (ok)** (`#1f6f3f`): Erfolgsmeldung.
- **Warnung (warn)** (`#8a5a00`): Entwurfshinweis, Warnmeldung.
- **Gefahr (danger)** (`#b3261e`): Fehlermeldung und zerstörende Aktionen.

### Named Rules
**The Fachfarbe Rule.** Rot, Blau und Bernstein stehen nie für sich. Jede
Fachfarbe erscheint mit Glyphe und Wort, damit die Information auch ohne
Farbsehen vollständig ist. Für Texte auf Papier gilt die Tinte-Variante des
Fachbereichs (`energie-ink` statt `energie`).

**The Keine Dekoration Rule.** Farbe, die keine Fachbedeutung trägt, kommt nicht
vor. Es gibt keine Akzentfarbe für Buttons, keine Verlaufsflächen, keine
Farbflächen hinter Überschriften.

## Typography

**Display Font:** Segoe UI (with system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif)
**Body Font:** Segoe UI (with system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif)
**Mono Font:** ui-monospace (with "Cascadia Mono", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace)

**Character:** Eine schlichte Systemschrift für alles, was gelesen wird, und
eine Monospace ausschliesslich für Zahlen. Die Mischung ist nicht dekorativ:
Gesetzte Ziffern machen Stände und Beträge untereinander vergleichbar — das
ist der Kern der Herleitbarkeit. Die Schrift trägt das Werkzeug, nicht das
Produkt.

### Hierarchy
- **Anwendungstitel** (600, 1,0625rem, 1,5): Titelzeile der Kopfzeile, der das Gerät benennt.
- **Bildschirmtitel** (600, 1,25rem, 1,5): Überschrift einer Ansicht.
- **Abschnittstitel** (600, 1,0625rem, 1,5): Überschrift innerhalb einer Ansicht.
- **Fließtext** (400, 1rem, 1,5): Grundgröße, Seitenhöhe 16 px.
- **Nebentext** (400, 0,8125rem, 1,5): Erläuterungen unter Werten.
- **Zahl** (400, 1,125rem / 0,875rem, 1,5): Stände und Beträge, Monospace, tabellarische Ziffern, rechtsbündig.
- **Bedientext** (500, 0,9375rem, 1,5): Knöpfe und Leerzustände — die Elemente, die man anfasst.
- **Reitertext** (400/500, 0,875rem, 1,5): Navigation, Textaktionen und Meldungszeilen.
- **Label** (500, 0,75rem, 0,04em, versal): Feld- und Abschnittsbeschriftungen.

### Named Rules
**The Gesetzte Zahl Rule.** Jede Zahl, die verglichen oder nachgerechnet
werden muss, steht in Monospace mit Tabellenziffern (`font-variant-numeric:
tabular-nums`) und rechtsbündig. Einheiten stehen klein dahinter, nie in der
Zahl. Fließtextgrößen sind kein Ersatz für Ziffernbreite.

**The Versal-Label Rule.** Versalien tragen ausschließlich Bezeichnungen
(Felder, Abschnitte), nie Inhalte. Versal und Kleinbuchstaben mischen heißt:
Text wird kleiner, nicht lauter.

## Layout

Ein einspaltiges Blatt mit fester Breite: `max-width: 4xl` (56rem) mit 1rem
Rand, zentriert. Kein Raster, keine Spalten über die Breite, keine
Kartenstapel. Inhalte stehen untereinander; Verwandtes wird durch
Hairline-Bänder getrennt, Verwandtes in einer Zeile durch Abstand.

Der Rhythmus ist klein und gleichmäßig: 4px (Hairline), 8px, 12px, 16px,
24px, 40px. Innenabstände von Bändern 16px (12px mobil), Blattformulare 16px
oben/unten mit 16px Rand. Vertikale Abstände zwischen Blöcken 16px, vor
Abschnitten 24px.

Unter 640px (`sm`) wird die Schrift nicht skaliert, sondern es verschwinden
zwei Spalten: die Definition-Liste der Zähler-Metadaten von 7,5rem/9rem
Beschriftungsspalte auf eine Spalte, und die Werkzeugleiste stapelt. Die
Prinzipien: Kopfbereich und Navigation bleiben, alles Messbare bleibt, es
verschwindet nur, was nebensächlich ist.

Der Kopfbereich ist `sticky` (Höhe `--kopf-hoehe: 7.1rem`), die Werkzeugleiste
der Erfassung hängt sich mit `top: var(--kopf-hoehe)` darunter. Beide tragen
Papierfarbe, damit der Inhalt darunter durchläuft statt abgeschnitten zu werden.

## Elevation & Depth

**Dieses System benutzt keine Schatten.** Tiefe entsteht ausschliesslich
tonal: Papier (`#faf8f4`) als Grundlage, vertieftes Papier (`#f2eee6`) für
eingesetzte Formularblätter, gehobenes Weiß (`#ffffff`) als Reserve, und
Haarlinien (`#e3ded4` / `#c9c3b6`) als Kanten. Der Kopf- und Werkzeugbereich
sind `sticky` und liegen auf Papier, nicht auf Glas — nichts schwebt über
dem Beleg.

### Named Rules
**The Flach Rule.** Flächen sind in Ruhe flach. Es gibt keine Schlagschatten,
keine Glows, keine Glasebenen. Eine Ebene entsteht nur durch Tonwert oder
Linie. Wer einen Schatten einführen will, muss zuerst die Linie entfernen, die
dieselbe Aussage trägt.

## Shapes

Der Radius ist klein und spröde: 0px an Eingabefeldern (eine Feldlinie hat
keine Ecken), 1px am Typstreifen, 2px an Textaktionen und am Fokusrahmen,
3px an Knöpfen und Chips. Runde Ecken würden die Form weichzeichnen; die
3px sind die Grenze, ab der etwas noch als geschnitten, nicht als gezeichnet
gelesen wird.

Konturen sind durchgehend Haarlinien (1px) — kräftige Rahmen um Karten, Kästen
um Eingabefelder oder um Buttons gibt es nicht (außer dem sekundären Knopf,
der eine 1px-Kante in `#c9c3b6` trägt, weil er sonst im Blatt verschwinden
würde). Die Checkbox ist ein 20×20px-Kasten mit 2px Radius, gezeichnet als
Inline-SVG, in einer 44×44px-Taste.

## Components

### Buttons
- **Form:** fast rechteckig (3px Radius), 44px Mindesthöhe, 16px seitlicher Innenabstand.
- **Primär:** gefüllte Tinte (`#1b1a17`) auf Papier (`#faf8f4`), 0,9375rem, 500, eine pro Ansicht — er steht für den nächsten Schritt, nicht für alle.
- **Sekundär:** transparent mit 1px-Kante `#c9c3b6`, Tinte als Text — er steht für die Alternative, nicht für den zweiten Hauptschritt.
- **Hover / Fokus:** Farbwechsel in 150ms (`transition-colors`); Fokus ist ein 2px-Rahmen in Tinte mit 2px Abstand, nie ein Schatten. Deaktiviert: 45% Deckkraft, kein Zeiger.

### Chips
- **Form:** 3px Radius, 2px/8px Innenabstand (in Listen 1px/6px), 0,75rem (in Listen 0,6875rem), 500.
- **Farbe:** Fläche und Text kommen aus dem Typpaar des Chips — z. B. Energie `#fdf0e3` auf `#a34f00`, Warmwasser `#fbeceb` auf `#c62828`, Kaltwasser `#eaf1fb` auf `#1565c0`. Kein Chip ist neutral, und keiner trägt nur Farbe.
- **Inhalt:** Glyphe (`◈` Energie, `▲` warm, `▼` kalt) plus Wort, in dieser Reihenfolge.

### Type Stripe
Ein 3px breiter, 1px gerundeter Farbstreifen am linken Rand einer Zählerzeile
(28px hoch in Listen, 40px hoch im Erfassungsblatt). Er ist rein funktional:
er zeigt auf einen Blick den Typ, ohne Text zu wiederholen, und er ist der
einzige farbige Bereich, der ohne Begleittext auskommt, weil die Zeile
selbst Chip und Bezeichnung trägt.

### Cards / Containers
- **Ecken:** 0px.
- **Hintergrund:** vertieftes Papier `#f2eee6` für eingesetzte Formularblätter, an der Oberkante mit 1px `#c9c3b6` abgesetzt.
- **Schatten:** keine.
- **Rahmen:** nur die Trennlinie, kein Rahmen ringsum.
- **Innenabstand:** 16px (12px mobil).

### Inputs / Fields
- **Form:** keine Box, nur eine Unterlinie (`border-bottom: 1px solid #c9c3b6`), transparenter Grund, kein Radius, 44px Mindesthöhe.
- **Label:** versal, 0,75rem, 0,04em Sperrung, `#55524c`, über der Linie.
- **Fokus:** die Linie wird kräftiger (`#1b1a17`) — die Höhe bleibt stabil, damit sich nichts springt.
- **Platzhalter:** `#6b6862`. **Deaktiviert:** gepunktete Unterlinie, Text in `#6b6862`.
- **Zahlenfeld:** `inputmode="decimal"`, rechtsbündig, Monospace, feste Breite (`w-32`), Einheit als eigener, nicht editierbarer Bereich rechts daneben — die Einheit wird nie getippt.

### Navigation
Drei gleichwertige Reiter unter der Kopfzeile, kein Textlinks im Fließtext.
Höhe 44px, 0,875rem, 500. Inaktiv in `#6b6862`, aktiv in `#1b1a17` mit 2px
Unterkante in Tinte (mit −1px Versatz, damit die Linie die Haarlinie der
Kopfzeile überdeckt statt eine zweite zu bilden). Es gibt keinen
Pill-Hintergrund, keine Icons, keinen Schatten.

### Message Row
Ein Satz unter der Kopfzeile: Glyphe (`✕` / `!` / `✓` / `i`) in der
Zustandsfarbe, Text in derselben Farbe, darunter eine Hairline. Fehler sind
`role="alert"`, der Rest `role="status"`. Das Schließen ist ein 44×44px-Knopf
mit 2px Radius und `aria-label`.

### Empty State
Kein Zentrieren, keine Illustration, kein Platzhalter-Symbol. Der Leerzustand
benennt die Lage (`#55524c`, 0,9375rem), nennt den nächsten Schritt
(`#6b6862`, 0,875rem, höchstens 46 Zeichen Breite) und bietet die eine Aktion
an, wenn es genau eine gibt.

### The Running Line
Ein 3px hoher Streifen über dem Erfassungsblatt, gefüllt in `#e3ded4`. Solange
noch nicht alle Zähler erfasst sind, läuft ein 45% breites Segment in Tinte
von links nach rechts (`1400ms`, `cubic-bezier(0.16, 1, 0.3, 1)`, unendlich).
Ist alles erfasst, steht die Linie still. Das ist die einzige Bewegung der
Oberfläche und sie zeigt Arbeitsstand, nicht Dekoration. Bei
`prefers-reduced-motion: reduce` entfällt die Animation (0,01ms, eine Runde).

## Do's and Don'ts

### Do:
- **Do** trenne Inhalte mit 1px-Haarlinien (`#e3ded4`) statt mit Rahmen, Schatten oder Kacheln.
- **Do** setze jeden messbaren Wert in Monospace mit Tabellenziffern, rechtsbündig, mit der Einheit klein dahinter.
- **Do** zeige Fachfarbe immer zusammen mit Glyphe und Wort.
- **Do** halte jede interaktive Fläche bei mindestens 44×44px — auch Textaktionen und Checkboxen.
- **Do** benutze genau eine Primäraktion pro Ansicht und lasse alles andere sekundär oder textlich.
- **Do** führe genau eine Bewegung: die Lauflinie, solange Erfassung fehlt.
- **Do** bleib bei ≥ 4,5:1 Kontrast auf Papier — für Bernstein die Tinte-Variante `#a34f00`.
- **Do** respektiere `prefers-reduced-motion` und reduziere auf Statik.
- **Do** löse Meldungscodes an der UI-Seite auf; die Domäne gibt nie Text aus — Zahlen, Beträge und Daten formatiert nur `format.ts`.

### Don't:
- **Don't** erfinde Farben, die keine Fachbedeutung tragen, und setze keine Verläufe.
- **Don't** baue Kachelraster, Kartenstapel oder Rounded-Container — der Beleg ist ein durchgehendes Blatt.
- **Don't** setze Schatten oder Glasflächen; Tiefe kommt aus Tonwert und Linie.
- **Don't** verkleinere Tap-Flächen unter 44px, auch nicht für Textaktionen oder das Schließen einer Meldung.
- **Don't** färbe Text mit dem reinen Bernstein `#ef6c00` — er ist Flächenfarbe, nicht Textfarbe.
- **Don't** lasse Farbe Information tragen, die nicht auch als Wort dasteht.
- **Don't** animiere etwas anderes als die Lauflinie; Bewegung ist hier ein Zustandsanzeiger, kein Effekt.
