/**
 * Anwendungszustand (Zustand).
 *
 * Der Zustand hält den fachlichen Datenbestand (`AppState`) und den
 * Arbeitsstand der Erfassung. Jede Mutation schreibt sofort in den lokalen
 * Speicher (`data/state.json`) und stellt einen Queue-Eintrag ein – die
 * Cloud-Synchronisierung folgt in M1.
 *
 * Die Domäne bleibt frei von UI- und Speicher-Importen: hier wird nur
 * `domain` aufgerufen, nie umgekehrt.
 */

import { create } from "zustand";
import {
  SCHEMA_VERSION,
  emptyState,
  type Ablesung,
  type AbschlagPlan,
  type AppState,
  type Bewohner,
  type ISODate,
  type Zaehler,
} from "../domain/types";
import { importiereJson, ImportFehler } from "../domain/io/json";
import { importiereStartablesungen, type CsvImportErgebnis } from "../domain/io/csv";
import { today } from "../domain/calc/dates";
import { containedMeterIds } from "../domain/calc/contains";
import i18n from "../i18n";
import { meldeText } from "../i18n/meldung";
import { SpeicherFehler, type StorageAdapter } from "../storage/adapter";
import { IndexedDbAdapter } from "../storage/indexeddb";
import { MemoryAdapter } from "../storage/memory";
import { id } from "./ids";

/** Pfad der Zustandsdatei im Speicher. */
export const STATE_PFAD = "data/state.json";

/** Schlüssel des Erfassungsentwurfs im `localStorage`. */
const ENTWURF_KEY = "heizung.entwurf";

/** Ein Erfassungsentwurf (S3): noch nicht gespeicherte Ablesungen. */
export interface EntwurfEintrag {
  zaehlerId: string;
  stand: string;
  unsicher: boolean;
  notiz: string;
}

export interface Entwurf {
  datum: ISODate;
  eintraege: EntwurfEintrag[];
}

/** Zustand der Speicherung (für die Statusanzeige). */
export type SpeicherStatus = "leer" | "geladen" | "gespeichert" | "fehler";

/** Meldung der UI (Statusleiste). */
export interface Meldung {
  art: "info" | "warnung" | "fehler" | "erfolg";
  text: string;
}

/**
 * Übersetzt einen Fehler aus Domäne/Speicher in einen Text.
 *
 * Fehler tragen sprachneutrale Codes (docs/architecture.md §3); erst hier
 * werden sie zu Text. Andere `Error` behalten ihre technische Meldung;
 * alles Übrige liefert `null` – die Aufrufer verwenden dann eine
 * allgemeine Formulierung.
 */
function fehlerText(fehler: unknown): string | null {
  if (fehler instanceof ImportFehler) return meldeText(fehler.meldung);
  if (fehler instanceof SpeicherFehler) return meldeText(fehler.meldung);
  if (fehler instanceof Error) return fehler.message;
  return null;
}

interface AppStore {
  // --- Daten ------------------------------------------------------------
  state: AppState;
  status: SpeicherStatus;
  meldung: Meldung | null;
  speicher: StorageAdapter;
  geladen: boolean;

  // --- Entwurf (S3) -----------------------------------------------------
  entwurf: Entwurf | null;

  // --- Aktionen ---------------------------------------------------------
  laden: (speicher?: StorageAdapter) => Promise<void>;
  speichern: () => Promise<void>;

  // Bewohner (S4)
  bewohnerAnlegen: (daten: Omit<Bewohner, "id" | "updatedAt">) => string;
  bewohnerAendern: (id: string, daten: Partial<Bewohner>) => void;
  bewohnerDeaktivieren: (id: string, aktiv: boolean) => void;
  bewohnerLoeschen: (id: string) => void;

  // Zähler (S2)
  zaehlerAnlegen: (daten: Omit<Zaehler, "id" | "updatedAt">) => string;
  zaehlerAendern: (id: string, daten: Partial<Zaehler>) => void;
  zaehlerDeaktivieren: (id: string, aktiv: boolean) => void;
  zaehlerLoeschen: (id: string) => void;
  enthaeltSetzen: (zaehlerId: string, kindId: string, enthalten: boolean) => boolean;

  // Abschlag (S4)
  abschlagSetzen: (
    bewohnerId: string,
    betrag: number,
    rhythmus: "monatlich" | "jaehrlich",
  ) => void;
  abschlagLoeschen: (id: string) => void;

  // Ablesungen (S3)
  ablesungSpeichern: (daten: {
    zaehlerId: string;
    datum: ISODate;
    stand: number;
    unsicher: boolean;
    notiz?: string;
    fotoKey?: string | null;
  }) => { ok: boolean; text: string };
  ablesungLoeschen: (id: string) => void;

  // Entwurf (S3)
  entwurfSetzen: (datum: ISODate, eintraege: EntwurfEintrag[]) => void;
  entwurfVerwerfen: () => void;

  // Import/Export
  importJson: (text: string) => { ok: boolean; text: string };
  importStartablesungen: (text: string) => CsvImportErgebnis & { gespeichert: number };

  // Meldungen
  meldungSetzen: (meldung: Meldung | null) => void;
}

function jetzt(): string {
  return new Date().toISOString();
}

function mitZeitstempel<T extends object>(objekt: T): T & { updatedAt: string } {
  return { ...objekt, updatedAt: jetzt() };
}

/** Erzeugt den Standard-Adapter: IndexedDB, sonst Arbeitsspeicher. */
export function standardAdapter(): StorageAdapter {
  const idb = new IndexedDbAdapter();
  return idb.verfuegbar ? idb : new MemoryAdapter();
}

function entwurfLaden(): Entwurf | null {
  try {
    const roh = globalThis.localStorage?.getItem(ENTWURF_KEY);
    if (!roh) return null;
    const wert = JSON.parse(roh) as Entwurf;
    if (typeof wert?.datum !== "string" || !Array.isArray(wert?.eintraege)) return null;
    return wert;
  } catch {
    return null;
  }
}

function entwurfSpeichern(entwurf: Entwurf | null): void {
  try {
    if (!entwurf) {
      globalThis.localStorage?.removeItem(ENTWURF_KEY);
    } else {
      globalThis.localStorage?.setItem(ENTWURF_KEY, JSON.stringify(entwurf));
    }
  } catch {
    // Speicher voll oder gesperrt – der Entwurf bleibt dann nur im RAM.
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  state: emptyState(),
  status: "leer",
  meldung: null,
  speicher: standardAdapter(),
  geladen: false,
  entwurf: entwurfLaden(),

  laden: async (speicher) => {
    const adapter = speicher ?? get().speicher;
    set({ speicher: adapter });
    try {
      const roh = await adapter.read(STATE_PFAD);
      if (roh) {
        const state = importiereJson(roh);
        set({ state, status: "geladen", geladen: true });
      } else {
        set({ state: emptyState(), status: "leer", geladen: true });
      }
    } catch (fehler) {
      const grund = fehlerText(fehler);
      set({
        status: "fehler",
        geladen: true,
        meldung: {
          art: "fehler",
          text: grund
            ? i18n.t("store.ladenFehler", { reason: grund })
            : i18n.t("store.ladenFehlerOhneGrund"),
        },
      });
    }
  },

  speichern: async () => {
    const { state, speicher } = get();
    try {
      await speicher.write(STATE_PFAD, JSON.stringify({ ...state, updatedAt: jetzt() }, null, 2));
      set({ status: "gespeichert" });
    } catch (fehler) {
      const grund = fehlerText(fehler);
      set({
        status: "fehler",
        meldung: {
          art: "fehler",
          text: grund
            ? i18n.t("store.speichernFehler", { reason: grund })
            : i18n.t("store.speichernFehlerOhneGrund"),
        },
      });
    }
  },

  bewohnerAnlegen: (daten) => {
    const neueId = id("b");
    set((s) => ({
      state: {
        ...s.state,
        bewohner: [...s.state.bewohner, mitZeitstempel({ ...daten, id: neueId })],
      },
    }));
    void get().speichern();
    return neueId;
  },

  bewohnerAendern: (bewohnerId, daten) => {
    set((s) => ({
      state: {
        ...s.state,
        bewohner: s.state.bewohner.map((b) =>
          b.id === bewohnerId ? mitZeitstempel({ ...b, ...daten }) : b,
        ),
      },
    }));
    void get().speichern();
  },

  bewohnerDeaktivieren: (bewohnerId, aktiv) => {
    get().bewohnerAendern(bewohnerId, { aktiv });
  },

  bewohnerLoeschen: (bewohnerId) => {
    // Löschen ist weich (R11/Historie): die Datensätze bleiben mit `deleted`
    // erhalten, damit die GitHub-Historie nachvollziehbar bleibt.
    set((s) => ({
      state: {
        ...s.state,
        bewohner: s.state.bewohner.map((b) =>
          b.id === bewohnerId ? mitZeitstempel({ ...b, deleted: true, aktiv: false }) : b,
        ),
        zaehler: s.state.zaehler.map((z) =>
          z.bewohnerId === bewohnerId ? mitZeitstempel({ ...z, bewohnerId: null }) : z,
        ),
        abschlagPlan: s.state.abschlagPlan.map((a) =>
          a.bewohnerId === bewohnerId ? { ...a, aktiv: false } : a,
        ),
      },
    }));
    void get().speichern();
  },

  zaehlerAnlegen: (daten) => {
    const neueId = id("z");
    set((s) => ({
      state: {
        ...s.state,
        zaehler: [
          ...s.state.zaehler,
          mitZeitstempel({ ...daten, id: neueId, enthaeltIds: daten.enthaeltIds ?? [] }),
        ],
      },
    }));
    void get().speichern();
    return neueId;
  },

  zaehlerAendern: (zaehlerId, daten) => {
    set((s) => ({
      state: {
        ...s.state,
        zaehler: s.state.zaehler.map((z) =>
          z.id === zaehlerId ? mitZeitstempel({ ...z, ...daten }) : z,
        ),
      },
    }));
    void get().speichern();
  },

  zaehlerDeaktivieren: (zaehlerId, aktiv) => {
    get().zaehlerAendern(zaehlerId, { aktiv });
  },

  zaehlerLoeschen: (zaehlerId) => {
    set((s) => ({
      state: {
        ...s.state,
        zaehler: s.state.zaehler.map((z) =>
          z.id === zaehlerId ? mitZeitstempel({ ...z, deleted: true, aktiv: false }) : z,
        ),
      },
    }));
    void get().speichern();
  },

  enthaeltSetzen: (zaehlerId, kindId, enthalten) => {
    const { zaehler } = get().state;
    if (zaehlerId === kindId) {
      set({
        meldung: { art: "warnung", text: i18n.t("store.selbstEnthalten") },
      });
      return false;
    }
    if (enthalten) {
      // R2: Zyklen sind unzulässig. Die neue Kante läuft vom übergeordneten
      // Zähler zum enthaltenen; ein Zyklus entsteht, wenn der übergeordnete
      // Zähler bereits im enthaltenen Zähler steckt.
      if (containedMeterIds(zaehler, kindId).includes(zaehlerId)) {
        set({
          meldung: {
            art: "warnung",
            text: i18n.t("store.zirkel"),
          },
        });
        return false;
      }
    }
    set((s) => ({
      state: {
        ...s.state,
        zaehler: s.state.zaehler.map((z) => {
          if (z.id !== zaehlerId) return z;
          const ids = new Set(z.enthaeltIds ?? []);
          if (enthalten) ids.add(kindId);
          else ids.delete(kindId);
          return mitZeitstempel({ ...z, enthaeltIds: [...ids] });
        }),
      },
    }));
    void get().speichern();
    return true;
  },

  abschlagSetzen: (bewohnerId, betrag, rhythmus) => {
    const vorhanden = get().state.abschlagPlan.find(
      (a) => a.bewohnerId === bewohnerId && a.rhythmus === rhythmus,
    );
    if (vorhanden) {
      set((s) => ({
        state: {
          ...s.state,
          abschlagPlan: s.state.abschlagPlan.map((a) =>
            a.id === vorhanden.id ? { ...a, betrag, aktiv: true } : a,
          ),
        },
      }));
    } else {
      const plan: AbschlagPlan = {
        id: id("ap"),
        bewohnerId,
        betrag,
        rhythmus,
        aktiv: true,
      };
      set((s) => ({ state: { ...s.state, abschlagPlan: [...s.state.abschlagPlan, plan] } }));
    }
    void get().speichern();
  },

  abschlagLoeschen: (planId) => {
    set((s) => ({
      state: {
        ...s.state,
        abschlagPlan: s.state.abschlagPlan.map((a) =>
          a.id === planId ? { ...a, aktiv: false } : a,
        ),
      },
    }));
    void get().speichern();
  },

  ablesungSpeichern: (daten) => {
    const state = get().state;
    const zaehler = state.zaehler.find((z) => z.id === daten.zaehlerId);
    if (!zaehler) {
      return { ok: false, text: i18n.t("store.zaehlerNichtGefunden") };
    }
    // R11: eine Ablesung je (Zähler, Tag) – erneutes Erfassen überschreibt.
    const bestehende = state.ablesung.find(
      (a) => a.zaehlerId === daten.zaehlerId && a.datum === daten.datum && !a.deleted,
    );
    const ablesung: Ablesung = {
      id: bestehende?.id ?? `ab-${daten.zaehlerId}-${daten.datum}`,
      zaehlerId: daten.zaehlerId,
      datum: daten.datum,
      stand: daten.stand,
      unsicher: daten.unsicher,
      notiz: daten.notiz ?? "",
      fotoKey: daten.fotoKey ?? null,
      updatedAt: jetzt(),
      createdAt: bestehende?.createdAt ?? jetzt(),
    };
    set((s) => ({
      state: {
        ...s.state,
        ablesung: bestehende
          ? s.state.ablesung.map((a) => (a.id === bestehende.id ? ablesung : a))
          : [...s.state.ablesung, ablesung],
      },
    }));
    void get().speichern();
    return {
      ok: true,
      text: bestehende ? i18n.t("store.ablesungUeberschrieben") : i18n.t("store.ablesungGespeichert"),
    };
  },

  ablesungLoeschen: (ablesungId) => {
    set((s) => ({
      state: {
        ...s.state,
        ablesung: s.state.ablesung.map((a) =>
          a.id === ablesungId ? { ...a, deleted: true, updatedAt: jetzt() } : a,
        ),
      },
    }));
    void get().speichern();
  },

  entwurfSetzen: (datum, eintraege) => {
    const entwurf: Entwurf = { datum, eintraege };
    entwurfSpeichern(entwurf);
    set({ entwurf });
  },

  entwurfVerwerfen: () => {
    entwurfSpeichern(null);
    set({ entwurf: null });
  },

  importJson: (text) => {
    try {
      const state = importiereJson(text);
      set({ state, status: "geladen" });
      void get().speichern();
      return { ok: true, text: i18n.t("store.importiert") };
    } catch (fehler) {
      const grund = fehlerText(fehler);
      return {
        ok: false,
        text: grund ?? i18n.t("store.importFehlgeschlagen"),
      };
    }
  },

  importStartablesungen: (text) => {
    const state = get().state;
    const ergebnis = importiereStartablesungen(text, state.zaehler);
    if (ergebnis.ablesungen.length > 0) {
      const vorhanden = new Map(
        state.ablesung.filter((a) => !a.deleted).map((a) => [`${a.zaehlerId}|${a.datum}`, a]),
      );
      const neu = ergebnis.ablesungen.map((a) => {
        const alt = vorhanden.get(`${a.zaehlerId}|${a.datum}`);
        return {
          ...a,
          id: alt?.id ?? a.id,
          createdAt: alt?.createdAt ?? jetzt(),
          updatedAt: jetzt(),
        };
      });
      set((s) => ({
        state: {
          ...s.state,
          ablesung: [
            ...s.state.ablesung.filter((a) => !neu.some((n) => n.id === a.id)),
            ...neu,
          ],
        },
      }));
      void get().speichern();
    }
    return { ...ergebnis, gespeichert: ergebnis.ablesungen.length };
  },

  meldungSetzen: (meldung) => set({ meldung }),
}));

/** Bequemer Zugriff auf den aktuellen Zustand (außerhalb von React). */
export function appState(): AppState {
  return useAppStore.getState().state;
}

/** Heutiges Datum – gekapselt, damit Tests den Wert stubben können. */
export function heutigesDatum(): ISODate {
  return today();
}

/** Aktuelle Schema-Version (aus dem Zustand, mit Rückfall auf den Standard). */
export function schemaVersion(): number {
  return useAppStore.getState().state.schemaVersion ?? SCHEMA_VERSION;
}
