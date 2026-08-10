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
});
