import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./i18n";
import "./index.css";
import { App } from "./ui/App";

const wurzel = document.getElementById("root");
if (!wurzel) {
  throw new Error("Kein Element mit der ID 'root' gefunden.");
}

createRoot(wurzel).render(
  <StrictMode>
    {/* HashRouter: robuste Deep Links auf GitHub Pages ohne 404-Fallback
        (docs/architecture.md §11). */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch((error: unknown) => {
      console.error("Der Offline-App-Shell konnte nicht registriert werden.", error);
    });
}
