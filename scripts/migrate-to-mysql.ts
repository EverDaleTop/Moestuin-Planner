/**
 * Eenmalige migratie naar MySQL.
 *
 * JSON:      SOURCE_STORE=json DATA_FILE=./data/db.json npm run db:migrate
 * Supabase:  SOURCE_STORE=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run db:migrate
 *
 * De MySQL-bestemming komt uit DB_NAME/DB_USER/DB_PASSWORD (en DATA_STORE=mysql).
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MysqlStore } from "../server/mysqlStore.ts";
import { DEFAULT_CROP_CATALOG, dedupeCatalog, seedCatalog } from "../src/storage.ts";
import { randomToken } from "../server/auth.ts";
import type { Crop, Garden } from "../src/types.ts";
import type { Db } from "../server/types.ts";
import type { StoredUser } from "../server/types.ts";

const target = await MysqlStore.openFromEnv();
if (!target) {
  console.error(
    "MySQL-bestemming ontbreekt. Zet DATA_STORE=mysql en DB_HOST/DB_NAME/DB_USER/DB_PASSWORD."
  );
  process.exit(1);
}

const source =
  (process.env.SOURCE_STORE ?? "").toLowerCase() ||
  (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "json");

function normalizeGarden(g: any, globalCatalog: Crop[]): Garden {
  const tomb = g?.deleted ?? {};
  return {
    ...g,
    cropCatalog: dedupeCatalog(
      seedCatalog(
        Array.isArray(g?.cropCatalog) ? g.cropCatalog : [],
        globalCatalog,
        tomb.catalog
      )
    ),
    elements: g?.elements ?? [],
    harvests: g?.harvests ?? [],
    sowings: g?.sowings ?? [],
    expenses: g?.expenses ?? [],
    incomes: g?.incomes ?? [],
    shopping: g?.shopping ?? [],
    todos: g?.todos ?? [],
    sharedWith: g?.sharedWith ?? [],
    inviteToken: g?.inviteToken ?? randomToken(),
    deleted: tomb,
  } as Garden;
}

async function readJsonSource(): Promise<Db> {
  const file =
    process.env.DATA_FILE ?? path.join(process.cwd(), "data", "db.json");
  const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<Db>;
  return {
    users: parsed.users ?? [],
    sessions: parsed.sessions ?? [],
    cropCatalog:
      parsed.cropCatalog && parsed.cropCatalog.length > 0
        ? dedupeCatalog(parsed.cropCatalog)
        : DEFAULT_CROP_CATALOG,
    catalogDeleted: parsed.catalogDeleted ?? {},
    gardens: parsed.gardens ?? [],
  };
}

async function readSupabaseSource(): Promise<Db> {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase-bron ontbreekt: zet SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const [users, sessions, gardens, state] = await Promise.all([
    sb.from("app_users").select("data"),
    sb.from("app_sessions").select("data"),
    sb.from("app_gardens").select("data"),
    sb.from("app_state").select("key,data"),
  ]);
  for (const [name, result] of Object.entries({ users, sessions, gardens, state })) {
    if (result.error) {
      throw new Error(`Supabase ${name} lezen mislukt: ${result.error.message}`);
    }
  }
  const stateMap = new Map<string, any>(
    (state.data ?? []).map((row: any) => [row.key, row.data])
  );
  return {
    users: (users.data ?? []).map((row: any) => row.data as StoredUser),
    sessions: (sessions.data ?? []).map((row: any) => row.data),
    gardens: (gardens.data ?? []).map((row: any) => row.data),
    cropCatalog:
      (stateMap.get("cropCatalog") as Crop[])?.length
        ? (stateMap.get("cropCatalog") as Crop[])
        : DEFAULT_CROP_CATALOG,
    catalogDeleted: (stateMap.get("catalogDeleted") as Record<string, number>) ?? {},
  };
}

const db =
  source === "supabase"
    ? await readSupabaseSource()
    : source === "json"
      ? await readJsonSource()
      : null;

if (!db) {
  console.error(`Onbekende SOURCE_STORE: ${source}. Gebruik json of supabase.`);
  process.exit(1);
}

for (const user of db.users) await target.addUser(user);
for (const session of db.sessions) await target.addSession(session);
for (const garden of db.gardens) {
  await target.putGarden(normalizeGarden(garden, db.cropCatalog));
}
await target.setCropCatalog(db.cropCatalog);
await target.setCatalogDeleted(db.catalogDeleted);
await target.close();

console.log(
  `Migratie klaar: ${db.users.length} gebruikers, ${db.sessions.length} sessies, ${db.gardens.length} tuinen.`
);
