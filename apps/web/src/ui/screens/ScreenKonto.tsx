import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatLocale } from "../format";
import { useAppStore } from "../../state/store";
import { GitHubStorageAdapter, gueltigesRepo, pruefeGitHubToken, tokenLesen, tokenSpeichern } from "../../storage/github";
import { Auswahl, Eingabe, KnopfPrimär, KnopfSekundaer } from "../components/Primitives";

const USER_KEY = "heizung.githubUser";

export function ScreenKonto() {
  const { t } = useTranslation();
  const repoDefault = useAppStore((s) => s.state.einstellungen.datenRepo ?? "");
  const syncIntervall = useAppStore((s) => s.state.einstellungen.syncIntervallSekunden ?? 30);
  const einstellungenAendern = useAppStore((s) => s.einstellungenAendern);
  const synchronisieren = useAppStore((s) => s.synchronisieren);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const syncZuletzt = useAppStore((s) => s.syncZuletzt);
  const [token, setToken] = useState(tokenLesen());
  const [repo, setRepo] = useState(repoDefault);
  const [user, setUser] = useState(() => globalThis.localStorage?.getItem(USER_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");

  const verbinden = async () => {
    setBusy(true);
    setFehler("");
    setMeldung("");
    try {
      if (!gueltigesRepo(repo.trim())) throw new Error(t("cloud.repoUngueltig"));
      const login = await pruefeGitHubToken(token);
      const adapter = new GitHubStorageAdapter(token, repo.trim());
      const [owner, name] = repo.trim().split("/");
      const access = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!access.ok) throw new Error(access.status === 404 ? t("cloud.repoNichtGefunden") : t("cloud.zugriffFehlgeschlagen", { status: access.status }));
      await adapter.readFile("data/state.json");
      const gespeichert = await einstellungenAendern({ datenRepo: repo.trim() });
      if (!gespeichert) throw new Error(t("store.speichernFehlerOhneGrund"));
      tokenSpeichern(token);
      globalThis.localStorage?.setItem(USER_KEY, login);
      setUser(login);
      setMeldung(t("cloud.verbundenAls", { name: login }));
      await synchronisieren();
    } catch (error) {
      setFehler(error instanceof Error ? error.message : t("cloud.unbekannterFehler"));
    } finally {
      setBusy(false);
    }
  };

  const abmelden = () => {
    tokenSpeichern("");
    globalThis.localStorage?.removeItem(USER_KEY);
    setToken("");
    setUser("");
    setMeldung(t("cloud.tokenEntfernt"));
    void synchronisieren();
  };

  return (
    <section className="screen-stack">
      <div className="page-heading">
        <div>
          <Link
            className="mb-1 inline-flex min-h-11 items-center text-[0.8125rem] underline underline-offset-4"
            style={{ color: "#55524c" }}
            to="/einstellungen"
          >
            {t("einstellungen.zurueck")}
          </Link>
          <h2 className="text-[1.25rem] font-semibold" style={{ color: "#1b1a17" }}>{t("cloud.titel")}</h2>
        </div>
      </div>
      <div className="surface-card flex max-w-xl flex-col gap-4 p-4 sm:p-5">
        <p className="max-w-[65ch] text-[0.875rem] leading-relaxed" style={{ color: "#6b6862" }}>{t("cloud.hinweis")}</p>
        <label className="flex flex-col gap-1">
          <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("cloud.repo")}</span>
          <Eingabe value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/repo" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("cloud.token")}</span>
          <Eingabe type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="new-password" />
          <span className="text-[0.75rem]" style={{ color: "#6b6862" }}>{t("cloud.tokenHinweis")}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <KnopfPrimär disabled={busy || !token.trim()} onClick={() => void verbinden()}>{busy ? t("cloud.pruefen") : t("cloud.verbinden")}</KnopfPrimär>
          {user ? <KnopfSekundaer onClick={abmelden}>{t("cloud.abmelden")}</KnopfSekundaer> : null}
          <KnopfSekundaer disabled={busy || !user} onClick={() => void synchronisieren()}>{t("cloud.jetztSync")}</KnopfSekundaer>
        </div>
        {user ? <p className="text-[0.8125rem]" style={{ color: "#1f6f3f" }}>{t("cloud.verbundenAls", { name: user })}</p> : null}
        {meldung ? <p role="status" className="text-[0.8125rem]" style={{ color: "#1f6f3f" }}>{meldung}</p> : null}
        {fehler ? <p role="alert" className="text-[0.8125rem]" style={{ color: "#b3261e" }}>{fehler}</p> : null}
        <div className="border-t pt-3 text-[0.8125rem]" style={{ borderColor: "#e1e5df", color: "#55524c" }}>
          <p>{t("cloud.status")}: {t(`cloud.syncStatus.${syncStatus}`)}</p>
          {syncZuletzt ? <p>{t("cloud.zuletzt")}: {new Date(syncZuletzt).toLocaleString(formatLocale())}</p> : null}
          {user ? <p className="mt-2">{t("cloud.widerrufHinweis")}</p> : null}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[0.75rem] font-medium uppercase tracking-[0.04em]" style={{ color: "#55524c" }}>{t("cloud.syncIntervall")}</span>
          <Auswahl
            value={String(syncIntervall)}
            onChange={(event) => einstellungenAendern({ syncIntervallSekunden: Number(event.target.value) })}
          >
            <option value="15">15 {t("cloud.sekunden")}</option>
            <option value="30">30 {t("cloud.sekunden")}</option>
            <option value="60">60 {t("cloud.sekunden")}</option>
            <option value="300">300 {t("cloud.sekunden")}</option>
          </Auswahl>
        </label>
      </div>
    </section>
  );
}
