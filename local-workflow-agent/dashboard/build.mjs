import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const app = new URL("./", import.meta.url);
const cache = new URL("node_modules/.vite-dashboard/", app);
await build({
  root: fileURLToPath(app),
  configFile: false,
  esbuild: { jsx: "automatic" },
  build: {
    ssr: "src/render.jsx",
    outDir: fileURLToPath(cache),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "render.mjs" } },
  },
});
const client = await build({
  root: fileURLToPath(app),
  configFile: false,
  esbuild: { jsx: "automatic" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    write: false,
    lib: {
      entry: "src/scanner-client.jsx",
      name: "ScannerDashboard",
      formats: ["iife"],
    },
  },
});
const notices = await Promise.all(["react", "react-dom", "scheduler"].map(async name => {
  const license = await readFile(new URL(`node_modules/${name}/LICENSE`, app), "utf8");
  return `/* ${name}\n${license.trim()}\n*/`;
}));
await writeFile(new URL("scanner.js", app), [...notices, client[0].output[0].code].join("\n"));
const { renderDashboard } = await import(new URL("render.mjs", cache));
for (const [filename, html] of renderDashboard()) {
  await writeFile(new URL(filename, import.meta.url), html);
}
