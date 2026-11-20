import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore, type DataStore } from "./db.ts";
import { AuthService } from "./auth.ts";
import { createRouter } from "./routes.ts";
import { WsHub } from "./ws.ts";

const currentDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const DATA_FILE = process.env.DATA_FILE ?? path.join(currentDir, "..", "data", "db.json");

async function openStore(): Promise<{ store: DataStore; label: string }> {
  const mode = (process.env.DATA_STORE ?? "").trim().toLowerCase();
  const mysqlInfo = (await import("./mysqlStore.ts")).MysqlStore;

  const openMysql = async () => {
    const store = await mysqlInfo.openFromEnv();
    if (!store) {
      throw new Error(
        "MySQL is gekozen, maar DB_NAME en DB_USER ontbreken."
      );
    }
    return store;
  };

  const openSupabase = async () => {
    const { SupabaseStore } = await import("./supabaseStore.ts");
    return SupabaseStore.fromEnv();
  };

  // auto: lokaal Supabase, productie MySQL (NODE_ENV=production).
  if (mode === "auto") {
    if (process.env.NODE_ENV === "production") {
      return { store: await openMysql(), label: `MySQL (${process.env.DB_NAME})` };
    }
    const supabaseStore = await openSupabase();
    if (supabaseStore) return { store: supabaseStore, label: "Supabase" };
    return { store: await JsonStore.open(DATA_FILE), label: DATA_FILE };
  }

  if (mode === "mysql" || (!mode && mysqlInfo.isConfigured())) {
    return { store: await openMysql(), label: `MySQL (${process.env.DB_NAME})` };
  }

  if (mode === "json") {
    return { store: await JsonStore.open(DATA_FILE), label: DATA_FILE };
  }

  if (mode === "supabase" || !mode) {
    const supabaseStore = await openSupabase();
    if (supabaseStore) return { store: supabaseStore, label: "Supabase" };
    if (mode === "supabase") {
      throw new Error(
        "DATA_STORE=supabase is gezet, maar SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ontbreken."
      );
    }
  }

  if (mode && mode !== "supabase") {
    throw new Error(`Onbekende DATA_STORE: ${mode}. Gebruik auto, mysql, json of supabase.`);
  }

  return { store: await JsonStore.open(DATA_FILE), label: DATA_FILE };
}

async function main(): Promise<void> {
  // Data-opslag: expliciet via DATA_STORE, anders automatisch MySQL (als
  // DB-vars bestaan), Supabase, of de lokale JSON-file.
  const { store, label } = await openStore();
  console.log(`Data: ${label}`);
  const auth = new AuthService(store);

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const server = createServer(app);
  const ws = new WsHub(server, store, auth);

  app.use(createRouter(store, auth, ws));

  // In production the built frontend lives in dist/ next to the server.
  const distDir = path.join(currentDir, "..", "dist");
  const indexHtml = path.join(distDir, "index.html");
  // Gehashte assets (app-*.js/css) mogen lang gecachet worden; index.html
  // nooit, zodat een nieuwe build altijd wordt opgepikt na herladen.
  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), {
      maxAge: "1y",
      immutable: true,
    })
  );
  // Zelf-gehoste lettertypen: één maand cachen (bestandsnamen zijn stabiel).
  app.use(
    "/fonts",
    express.static(path.join(distDir, "fonts"), { maxAge: "30d" })
  );
  app.use(express.static(distDir, { index: false }));
  // SPA fallback (Express 5: use a middleware instead of a "*" route)
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }
    res.sendFile(
      indexHtml,
      { headers: { "Cache-Control": "no-store" } },
      (err) => err && next()
    );
  });

  server.listen(PORT, () => {
    console.log(
      APP_URL
        ? `Oogstplan server draait op ${APP_URL}`
        : `Oogstplan server draait op http://localhost:${PORT}`
    );
  });

  const shutdown = () => {
    // SupabaseStore heeft geen flush; JsonStore wel.
    const maybeFlush = (store as { flush?: () => Promise<void> }).flush;
    if (maybeFlush) void maybeFlush.call(store).finally(() => process.exit(0));
    else process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
