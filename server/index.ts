import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./db.ts";
import { AuthService } from "./auth.ts";
import { createRouter } from "./routes.ts";
import { WsHub } from "./ws.ts";

const currentDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? path.join(currentDir, "..", "data", "db.json");

async function main(): Promise<void> {
  const store = await JsonStore.open(DATA_FILE);
  const auth = new AuthService(store);

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const server = createServer(app);
  const ws = new WsHub(server, store, auth);

  app.use(createRouter(store, auth, ws));

  // In production the built frontend lives in dist/ next to the server.
  const distDir = path.join(currentDir, "..", "dist");
  const indexHtml = path.join(distDir, "index.html");
  app.use(express.static(distDir));
  // SPA fallback (Express 5: use a middleware instead of a "*" route)
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }
    res.sendFile(indexHtml, (err) => err && next());
  });

  server.listen(PORT, () => {
    console.log(`Moestuin Planner server draait op http://localhost:${PORT}`);
    console.log(`Data: ${DATA_FILE}`);
  });

  const shutdown = () => {
    void store.flush().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
