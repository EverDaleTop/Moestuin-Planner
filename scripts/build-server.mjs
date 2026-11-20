import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "build/server.cjs",
  sourcemap: true,
  logLevel: "info",
  // Laat npm-packages uit node_modules: die worden op de host gewoon
  // geïnstalleerd. Alleen onze eigen servercode wordt gebundeld.
  packages: "external",
});
