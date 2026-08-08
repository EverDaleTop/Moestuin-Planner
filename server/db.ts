import { promises as fs } from "node:fs";
import path from "node:path";
import type { Crop, Garden } from "../src/types.ts";
import { DEFAULT_CROP_CATALOG } from "../src/storage.ts";
import { randomToken } from "./auth.ts";
import type { Db, Session, StoredUser } from "./types.ts";

/**
 * Persistence seam. `JsonStore` implements this against a single JSON file;
 * a future database migration just needs a new implementation of the same
 * interface (e.g. `PostgresStore`).
 */
export interface DataStore {
  getUserByUsername(username: string): Promise<StoredUser | undefined>;
  getUserById(id: string): Promise<StoredUser | undefined>;
  addUser(user: StoredUser): Promise<void>;
  searchUsers(query: string, limit: number): Promise<StoredUser[]>;
  getSession(token: string): Promise<Session | undefined>;
  addSession(session: Session): Promise<void>;
  removeSession(token: string): Promise<void>;
  listGardensForUser(userId: string): Promise<Garden[]>;
  getGarden(id: string): Promise<Garden | undefined>;
  putGarden(garden: Garden): Promise<void>;
  deleteGarden(id: string): Promise<void>;
  getCropCatalog(): Promise<Crop[]>;
  setCropCatalog(crops: Crop[]): Promise<void>;
}

function emptyDb(): Db {
  return {
    users: [],
    sessions: [],
    cropCatalog: DEFAULT_CROP_CATALOG,
    gardens: [],
  };
}

/** Atomic write: write to a temp file, then rename over the target. */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, filePath);
}

export class JsonStore implements DataStore {
  private db: Db;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;

  private constructor(filePath: string, db: Db) {
    this.filePath = filePath;
    this.db = db;
  }

  static async open(filePath: string): Promise<JsonStore> {
    let db: Db;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Db>;
      const base = emptyDb();
      db = {
        users: parsed.users ?? base.users,
        sessions: parsed.sessions ?? base.sessions,
        cropCatalog: parsed.cropCatalog ?? base.cropCatalog,
        gardens: (parsed.gardens ?? []).map((g: any) => ({
          ...g,
          elements: g.elements ?? [],
          harvests: g.harvests ?? [],
          expenses: g.expenses ?? [],
          sharedWith: g.sharedWith ?? [],
          inviteToken: g.inviteToken ?? randomToken(),
        })),
      };
    } catch {
      db = emptyDb();
      await atomicWrite(filePath, JSON.stringify(db, null, 2));
    }
    return new JsonStore(filePath, db);
  }

  /** Debounced persist to avoid excessive disk writes during bursts. */
  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 100);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    await atomicWrite(this.filePath, JSON.stringify(this.db, null, 2));
  }

  async getUserByUsername(username: string): Promise<StoredUser | undefined> {
    return this.db.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    return this.db.users.find((u) => u.id === id);
  }

  async addUser(user: StoredUser): Promise<void> {
    this.db.users.push(user);
    this.scheduleFlush();
  }

  async searchUsers(query: string, limit = 8): Promise<StoredUser[]> {
    const q = query.toLowerCase();
    const out: StoredUser[] = [];
    for (const u of this.db.users) {
      if (u.username.toLowerCase().includes(q)) {
        out.push(u);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async getSession(token: string): Promise<Session | undefined> {
    return this.db.sessions.find((s) => s.token === token);
  }

  async addSession(session: Session): Promise<void> {
    this.db.sessions.push(session);
    this.scheduleFlush();
  }

  async removeSession(token: string): Promise<void> {
    const before = this.db.sessions.length;
    this.db.sessions = this.db.sessions.filter((s) => s.token !== token);
    if (this.db.sessions.length !== before) this.scheduleFlush();
  }

  async listGardensForUser(userId: string): Promise<Garden[]> {
    return this.db.gardens.filter(
      (g) => g.ownerId === userId || g.sharedWith.includes(userId)
    );
  }

  async getGarden(id: string): Promise<Garden | undefined> {
    return this.db.gardens.find((g) => g.id === id);
  }

  async putGarden(garden: Garden): Promise<void> {
    const idx = this.db.gardens.findIndex((g) => g.id === garden.id);
    if (idx >= 0) {
      this.db.gardens[idx] = garden;
    } else {
      this.db.gardens.push(garden);
    }
    this.scheduleFlush();
  }

  async deleteGarden(id: string): Promise<void> {
    const before = this.db.gardens.length;
    this.db.gardens = this.db.gardens.filter((g) => g.id !== id);
    if (this.db.gardens.length !== before) this.scheduleFlush();
  }

  async getCropCatalog(): Promise<Crop[]> {
    return this.db.cropCatalog;
  }

  async setCropCatalog(crops: Crop[]): Promise<void> {
    this.db.cropCatalog = crops;
    this.scheduleFlush();
  }
}
