/**
 * Supabase-persistentie voor Pluktuintje.
 *
 * Gebruik: zet SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY als env-vars en de
 * server gebruikt deze store i.p.v. de lokale JSON-file. Zonder die vars valt
 * server/index.ts automatisch terug op JsonStore.
 *
 * Verwachte tabellen (zie supabase/schema.sql):
 *   app_users    (id text pk, data jsonb)
 *   app_sessions (token text pk, data jsonb)
 *   app_gardens  (id text pk, data jsonb)
 *   app_state    (key text pk, data jsonb)  -- voor de cropCatalog
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Crop, Garden } from "../src/types.ts";
import { DEFAULT_CROP_CATALOG } from "../src/storage.ts";
import { randomToken } from "./auth.ts";
import type { DataStore } from "./db.ts";
import type { Session, StoredUser } from "./types.ts";

function normalizeGarden(g: any): Garden {
  return {
    ...g,
    elements: g.elements ?? [],
    harvests: g.harvests ?? [],
    sowings: g.sowings ?? [],
    expenses: g.expenses ?? [],
    incomes: g.incomes ?? [],
    shopping: g.shopping ?? [],
    sharedWith: g.sharedWith ?? [],
    inviteToken: g.inviteToken ?? randomToken(),
  };
}

export class SupabaseStore implements DataStore {
  private sb: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  static fromEnv(): SupabaseStore | null {
    const url = process.env.SUPABASE_URL;
    // Nieuwe dashboard-namen (SUPABASE_SECRET_KEY) én legacy-namen worden allebei geaccepteerd.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!url || !key || key.includes("VUL_HIER")) return null;
    return new SupabaseStore(url, key);
  }

  async getUserByUsername(username: string): Promise<StoredUser | undefined> {
    // gebruikers zijn klein in aantal: haal ze op en match case-insensitive
    const { data, error } = await this.sb.from("app_users").select("data");
    if (error) throw new Error(`Supabase app_users lezen mislukt: ${error.message}`);
    const q = username.toLowerCase();
    for (const row of data ?? []) {
      const u = row.data as StoredUser;
      if (u.username.toLowerCase() === q) return u;
    }
    return undefined;
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    const { data, error } = await this.sb.from("app_users").select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase user ophalen mislukt: ${error.message}`);
    return data ? (data.data as StoredUser) : undefined;
  }

  async addUser(user: StoredUser): Promise<void> {
    const { error } = await this.sb.from("app_users").upsert({ id: user.id, data: user }, { onConflict: "id" });
    if (error) throw new Error(`Supabase user opslaan mislukt: ${error.message}`);
  }

  async updateUser(user: StoredUser): Promise<void> {
    const { error } = await this.sb.from("app_users").upsert({ id: user.id, data: user }, { onConflict: "id" });
    if (error) throw new Error(`Supabase user bijwerken mislukt: ${error.message}`);
  }

  async searchUsers(query: string, limit = 8): Promise<StoredUser[]> {
    const { data, error } = await this.sb.from("app_users").select("data");
    if (error) throw new Error(`Supabase zoeken mislukt: ${error.message}`);
    const q = query.toLowerCase();
    const out: StoredUser[] = [];
    for (const row of data ?? []) {
      const u = row.data as StoredUser;
      if (u.username.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)) {
        out.push(u);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const { data, error } = await this.sb.from("app_sessions").select("data").eq("token", token).maybeSingle();
    if (error) throw new Error(`Supabase sessie ophalen mislukt: ${error.message}`);
    return data ? (data.data as Session) : undefined;
  }

  async addSession(session: Session): Promise<void> {
    const { error } = await this.sb.from("app_sessions").upsert({ token: session.token, data: session }, { onConflict: "token" });
    if (error) throw new Error(`Supabase sessie opslaan mislukt: ${error.message}`);
  }

  async removeSession(token: string): Promise<void> {
    const { error } = await this.sb.from("app_sessions").delete().eq("token", token);
    if (error) throw new Error(`Supabase sessie verwijderen mislukt: ${error.message}`);
  }

  async listGardensForUser(userId: string): Promise<Garden[]> {
    const { data, error } = await this.sb.from("app_gardens").select("data");
    if (error) throw new Error(`Supabase tuinen lezen mislukt: ${error.message}`);
    return (data ?? [])
      .map((r) => normalizeGarden(r.data))
      .filter((g) => g.ownerId === userId || g.sharedWith.includes(userId));
  }

  async getGarden(id: string): Promise<Garden | undefined> {
    const { data, error } = await this.sb.from("app_gardens").select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase tuin ophalen mislukt: ${error.message}`);
    return data ? normalizeGarden(data.data) : undefined;
  }

  async putGarden(garden: Garden): Promise<void> {
    const { error } = await this.sb.from("app_gardens").upsert({ id: garden.id, data: garden }, { onConflict: "id" });
    if (error) throw new Error(`Supabase tuin opslaan mislukt: ${error.message}`);
  }

  async deleteGarden(id: string): Promise<void> {
    const { error } = await this.sb.from("app_gardens").delete().eq("id", id);
    if (error) throw new Error(`Supabase tuin verwijderen mislukt: ${error.message}`);
  }

  async getCropCatalog(): Promise<Crop[]> {
    const { data, error } = await this.sb.from("app_state").select("data").eq("key", "cropCatalog").maybeSingle();
    if (error) throw new Error(`Supabase catalogus lezen mislukt: ${error.message}`);
    const catalog = (data?.data as Crop[] | undefined) ?? [];
    return catalog.length > 0 ? catalog : DEFAULT_CROP_CATALOG;
  }

  async setCropCatalog(crops: Crop[]): Promise<void> {
    const { error } = await this.sb.from("app_state").upsert({ key: "cropCatalog", data: crops }, { onConflict: "key" });
    if (error) throw new Error(`Supabase catalogus opslaan mislukt: ${error.message}`);
  }

  async getCatalogDeleted(): Promise<Record<string, number>> {
    const { data, error } = await this.sb.from("app_state").select("data").eq("key", "cropCatalogDeleted").maybeSingle();
    if (error) throw new Error(`Supabase catalogus-tombstones lezen mislukt: ${error.message}`);
    return (data?.data as Record<string, number> | undefined) ?? {};
  }

  async setCatalogDeleted(deleted: Record<string, number>): Promise<void> {
    const { error } = await this.sb.from("app_state").upsert({ key: "cropCatalogDeleted", data: deleted }, { onConflict: "key" });
    if (error) throw new Error(`Supabase catalogus-tombstones opslaan mislukt: ${error.message}`);
  }
}
