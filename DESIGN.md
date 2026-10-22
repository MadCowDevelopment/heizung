---
name: Heizungsabrechnung
description: A mobile-first utility console for transparent meter readings and shared costs.
colors:
  canvas: "#f3f5f2"
  surface: "#ffffff"
  surface-soft: "#edf0ec"
  ink: "#1b1a17"
  ink-secondary: "#55524c"
  ink-muted: "#6b6862"
  line: "#e1e5df"
  line-strong: "#c7cdc5"
  warm: "#c62828"
  warm-soft: "#fbeceb"
  cold: "#1565c0"
  cold-soft: "#eaf1fb"
  energy: "#ef6c00"
  energy-soft: "#fdf0e3"
  energy-ink: "#a34f00"
  success: "#1f6f3f"
  warning: "#8a5a00"
  danger: "#b3261e"
typography:
  body:
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
  control: "8px"
  card: "14px"
  chip: "3px"
spacing:
  tight: "0.5rem"
  base: "0.75rem"
  row: "1rem"
  section: "1.25rem"
  sheet: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1rem"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1rem"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "1rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
    height: "44px"
---

# Design System: Heizungsabrechnung

## Overview

**Creative North Star: "The Clear Utility Console"**

This is a focused tool for the person who moves between a basement meter room
and a desk where yearly costs are checked. The interface puts the next action
within reach, then keeps readings, payments, and resident allocations easy to
scan. Cards group related information without turning every row into a tile.

The visual language is contemporary and warm-neutral: a soft gray-green
canvas, white work surfaces, dark readable type, rounded controls, and quiet
depth. Meter colors remain reserved for their domain meaning—warm water, cold
water, and energy. Numbers stay precise and aligned so every amount can be
traced back to its source.

**Key Characteristics:**
- Mobile-first composition with a direct, accessible route to every screen.
- White cards and structured lists separate tasks without hiding relationships.
- Measured values use tabular monospace figures and retain their units.
- Warm, cold, and energy colors always appear with a glyph and text label.
- Touch controls are at least 44px high; device safe areas are respected.

## Colors

The neutral palette carries the interface; domain and state colors are used
only when they communicate meter type, warnings, errors, or success.

### Primary
- **Warm water** (`#c62828`): warm-water meter data and labels.
- **Cold water** (`#1565c0`): cold-water meter data and labels.
- **Energy ink** (`#a34f00`): readable energy text on light surfaces.

### Secondary
- **Energy** (`#ef6c00`): energy chip and surface accents; not used as small text.
- **Warm surface** (`#fbeceb`): supporting background for warm-water chips.
- **Cold surface** (`#eaf1fb`): supporting background for cold-water chips.
- **Energy surface** (`#fdf0e3`): supporting background for energy chips.

### Neutral
- **Canvas** (`#f3f5f2`): the page background.
- **Surface** (`#ffffff`): cards, controls, and the app header.
- **Soft surface** (`#edf0ec`): secondary panels and inset content.
- **Ink** (`#1b1a17`): headings, body text, and primary actions.
- **Secondary ink** (`#55524c`): labels and supporting content.
- **Muted ink** (`#6b6862`): secondary descriptions and inactive navigation.
- **Line** (`#e1e5df`) and **strong line** (`#c7cdc5`): card boundaries and separators.
- **State colors:** success `#1f6f3f`, warning `#8a5a00`, danger `#b3261e`.

### Named Rules
**The Fachfarbe Rule.** Red, blue, and amber indicate meter type only. Pair
each with its glyph and a visible text label; use `#a34f00` for energy text.

## Typography

**Display Font:** Segoe UI (with system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif)
**Body Font:** Segoe UI (same system stack)
**Label/Mono Font:** ui-monospace (with Cascadia Mono, SF Mono, Menlo, Consolas, monospace)

The interface uses one familiar sans-serif voice. Monospace is reserved for
measured values and amounts, where tabular figures make comparisons easier.

### Hierarchy
- **Screen title** (600, 1.25rem, 1.5): the current view heading.
- **Section title** (600, 1rem–1.0625rem, 1.5): card and content-group headings.
- **Body** (400, 1rem, 1.5): standard reading text.
- **Supporting text** (400, 0.8125rem–0.875rem, 1.5): descriptions and metadata.
- **Control text** (500, 0.9375rem, 1.5): buttons and navigation.
- **Field label** (500, 0.75rem, 1.5): uppercase labels with 0.04em tracking.
- **Measured value** (400, 0.875rem–1.125rem, 1.5): monospace with tabular figures.

### Named Rules
**The Measured Number Rule.** Use `.tnum` for comparable readings and costs;
keep the unit adjacent and visible.

## Layout

The app uses a centered `max-width: 56rem` workspace with 1rem horizontal
gutters. At 640px and wider, views are available as horizontal navigation
links; on narrower screens the links become a native selection control so all
top-level views remain reachable without a long horizontal menu. Account and
cloud configuration is a nested page reached from Settings, with a return
link to its parent. The shell and reading-entry toolbar respect device safe areas.

Screen content uses a 1rem vertical rhythm, with cards generally padded by
1rem and slightly more space on wider screens. Summary content uses two
columns where space allows, then collapses to one column. Wide data tables
remain horizontally scrollable on larger screens and become labeled,
stacked data cards on smaller screens. Typography does not shrink to fit.

## Elevation & Depth

Cards use a fine neutral border and a restrained 1px offset shadow
(`0 1px 3px rgb(27 26 23 / 5%)`) to distinguish them from the canvas without
making the app feel layered or glossy. Secondary surfaces use a subtle tonal
shift. Focus remains a crisp 2px outline with a 2px offset.

### Named Rules
**The Quiet Surface Rule.** Elevation is structural and subtle; avoid glow,
glass, and decorative shadow effects.

## Shapes

Cards use 14px corners. Buttons, fields, and other controls use 8px corners;
meter chips retain a compact 3px silhouette. Borders are thin and low-contrast
at rest, with the strong neutral reserved for controls that need a clearer
edge. Interactive controls maintain a minimum height of 44px.

## Components

### Buttons
- **Shape:** rounded 8px, minimum 44px high.
- **Primary:** graphite fill with white text; one clear next action per view.
- **Secondary:** white fill, neutral border, graphite text.
- **Hover / Focus:** quick color feedback; keyboard focus uses a 2px outline.
- **Disabled:** subdued and non-interactive, never visually confused with an active action.

### Chips
- **Style:** 3px corners with the appropriate pale domain surface and
  contrasting domain text.
- **Content:** include the type glyph and localized type label.

### Cards / Containers
- **Corner Style:** 14px for primary work surfaces.
- **Background:** white on the neutral canvas; soft neutral for secondary panels.
- **Shadow Strategy:** 1px offset, 3px blur at 5% black; use sparingly.
- **Border:** 1px neutral line.
- **Internal Padding:** 1rem, increasing slightly on wide layouts.

### Inputs / Fields
- **Style:** white fill, 1px strong-neutral border, 8px corners, 44px minimum height.
- **Focus:** 2px visible graphite outline and a stronger border.
- **Disabled:** soft neutral fill and muted text.

### Navigation
Desktop uses 44px text tabs, with a dark active underline. Mobile uses a
44px native select with the current top-level screen visible. Account and
cloud configuration sits beneath Settings and marks Settings as active in
the main navigation; its own page provides a return link. All navigation
controls preserve the route order and accessible label.

### Reading Entry
Each meter is a compact surface that keeps its type, last reading, entry field,
notes, and photo actions together. The sticky date and save toolbar stays near
the top while the list is being completed.

## Do's and Don'ts

### Do:
- **Do** keep primary actions obvious and full-width on narrow screens where useful.
- **Do** preserve 44px minimum hit targets and visible keyboard focus.
- **Do** use domain colors only for meter meaning and pair them with text.
- **Do** present dense data as stacked labeled values on narrow screens.
- **Do** keep key readings and currency amounts aligned and easy to compare.

### Don't:
- **Don't** use gradients or decorative color unrelated to domain meaning.
- **Don't** shrink controls or targets to fit a narrow layout.
- **Don't** use color alone to communicate meter type or state.
- **Don't** bury wide tables in the mobile layout; use the stacked data view.
