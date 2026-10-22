import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

// Basis-Pfad für GitHub Pages: Repo-Name (siehe docs/architecture.md §11).
const base = process.env.VITE_BASE_PATH ?? "/heizung/";

function offlinePrecachePlugin() {
  return {
    name: "heizung-offline-precache",
    apply: "build" as const,
    async closeBundle() {
      const outDir = resolve(process.cwd(), "dist");
      const assets = await dateienIn(outDir);
      const urls = assets
        .filter((path) => path !== resolve(outDir, "sw.js"))
        .map((path) => `${base}${relative(outDir, path).replace(/\\/g, "/")}`);
      const serviceWorkerPath = resolve(outDir, "sw.js");
      const serviceWorker = await readFile(serviceWorkerPath, "utf8");
      await writeFile(
        serviceWorkerPath,
        serviceWorker.replace("__PRECACHE_URLS__", JSON.stringify(urls)),
      );
    },
  };
}

async function dateienIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const verschachtelt = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? dateienIn(path) : [path];
    }),
  );
  return verschachtelt.flat();
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), offlinePrecachePlugin()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
