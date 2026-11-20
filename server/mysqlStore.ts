/**
 * MySQL/MariaDB-persistentie voor Oogstplan.
 *
 * Activeren met DATA_STORE=mysql en de DB_*-variabelen uit .env.example.
 * De tabellen worden bij de eerste start automatisch aangemaakt
 * (CREATE TABLE IF NOT EXISTS); daarna is het een no-op.
 */
import { createPool, type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import type { Crop, Garden } from "../src/types.ts";
import { DEFAULT_CROP_CATALOG, dedupeCatalog } from "../src/storage.ts";
import { normalizeGarden } from "../src/sync.ts";
import { randomToken } from "./auth.ts";
import type { DataStore } from "./db.ts";
import type { Session, StoredUser } from "./types.ts";

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    username_lower VARCHAR(64) NOT NULL,
    data JSON NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY users_username_lower (username_lower)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    data JSON NOT NULL,
    created_at BIGINT NOT NULL,
    KEY sessions_user_id (user_id),
    CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS gardens (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    owner_id VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    data JSON NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    KEY gardens_owner_id (owner_id),
    KEY gardens_updated_at (updated_at),
    CONSTRAINT gardens_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS garden_members (
    garden_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    PRIMARY KEY (garden_id, user_id),
    KEY garden_members_user_id (user_id),
    CONSTRAINT garden_members_garden_fk FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE,
    CONSTRAINT garden_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS app_state (
    state_key VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function normalizeStoredGarden(g: any): Garden {
  return normalizeGarden({
    ...g,
    // Oude documenten kunnen een lege of ontbrekende catalogus hebben.
    cropCatalog:
      Array.isArray(g.cropCatalog) && g.cropCatalog.length > 0
        ? dedupeCatalog(g.cropCatalog)
        : DEFAULT_CROP_CATALOG.map((c) => ({ ...c })),
    elements: g.elements ?? [],
    harvests: g.harvests ?? [],
    sowings: g.sowings ?? [],
    expenses: g.expenses ?? [],
    incomes: g.incomes ?? [],
    shopping: g.shopping ?? [],
    todos: g.todos ?? [],
    sharedWith: g.sharedWith ?? [],
    inviteToken: g.inviteToken ?? randomToken(),
  });
}

function parseJson<T>(raw: unknown): T {
  if (typeof raw === "string") return JSON.parse(raw) as T;
  return raw as T;
}

export class MysqlStore implements DataStore {
  private readonly pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  static isConfigured(): boolean {
    return Boolean(process.env.DB_NAME && process.env.DB_USER);
  }

  static async openFromEnv(): Promise<MysqlStore | null> {
    if (!this.isConfigured()) return null;

    const useSocket = Boolean(process.env.DB_SOCKET);
    const options: PoolOptions = {
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
      maxIdle: Number(process.env.DB_POOL_SIZE || 5),
      idleTimeout: 60_000,
      charset: "utf8mb4",
      ...(useSocket ? { socketPath: process.env.DB_SOCKET } : {}),
      ...(process.env.DB_SSL === "true" || process.env.DB_SSL === "1"
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    };

    const pool = createPool(options);
    const store = new MysqlStore(pool);
    try {
      await store.ensureSchema();
    } catch (err) {
      await pool.end().catch(() => {});
      throw err;
    }
    return store;
  }

  /**
   * Eenmalige bootstrap. Alle statements zijn idempotent, dus bij elke start
   * wordt dit veilig uitgevoerd en maken ze alleen de eerste keer tabellen aan.
   */
  async ensureSchema(): Promise<void> {
    for (const statement of SCHEMA) {
      await this.pool.query(statement);
    }

    const seed: [string, unknown][] = [
      ["cropCatalog", DEFAULT_CROP_CATALOG],
      ["catalogDeleted", {}],
    ];
    for (const [key, value] of seed) {
      await this.pool.query(
        "INSERT INTO app_state (state_key, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_key = state_key",
        [key, JSON.stringify(value)]
      );
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async readState<T>(key: string, fallback: T): Promise<T> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT data FROM app_state WHERE state_key = ? LIMIT 1",
      [key]
    );
    if (!rows.length) return fallback;
    try {
      return parseJson<T>(rows[0].data);
    } catch {
      return fallback;
    }
  }

  private async writeState(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_state (state_key, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [key, JSON.stringify(value)]
    );
  }

  async getUserByUsername(username: string): Promise<StoredUser | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT data FROM users WHERE username_lower = ? LIMIT 1",
      [username.trim().toLowerCase()]
    );
    return rows.length ? parseJson<StoredUser>(rows[0].data) : undefined;
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT data FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    return rows.length ? parseJson<StoredUser>(rows[0].data) : undefined;
  }

  async addUser(user: StoredUser): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, username_lower, data, created_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username_lower = VALUES(username_lower), data = VALUES(data)`,
      [user.id, user.username.trim().toLowerCase(), JSON.stringify(user), user.createdAt]
    );
  }

  async updateUser(user: StoredUser): Promise<void> {
    await this.addUser(user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.pool.query("DELETE FROM users WHERE id = ?", [id]);
  }

  async searchUsers(query: string, limit = 8): Promise<StoredUser[]> {
    // Gebruikersaantallen zijn klein; filteren in JS voorkomt database-specifieke
    // JSON-query's en houdt dit ook op MariaDB betrouwbaar.
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT data FROM users");
    const q = query.toLowerCase();
    const out: StoredUser[] = [];
    for (const row of rows) {
      const user = parseJson<StoredUser>(row.data);
      if (
        user.username.toLowerCase().includes(q) ||
        (user.email ?? "").toLowerCase().includes(q)
      ) {
        out.push(user);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT data FROM sessions WHERE token = ? LIMIT 1",
      [token]
    );
    return rows.length ? parseJson<Session>(rows[0].data) : undefined;
  }

  async addSession(session: Session): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (token, user_id, data, created_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [session.token, session.userId, JSON.stringify(session), session.createdAt]
    );
  }

  async removeSession(token: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE token = ?", [token]);
  }

  async removeSessionsForUser(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
  }

  async listGardensForUser(userId: string): Promise<Garden[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.data
         FROM gardens g
         LEFT JOIN garden_members m ON m.garden_id = g.id AND m.user_id = ?
        WHERE g.owner_id = ? OR m.user_id IS NOT NULL
        ORDER BY g.updated_at DESC`,
      [userId, userId]
    );
    return rows.map((row) => normalizeStoredGarden(parseJson<Garden>(row.data)));
  }

  async getGarden(id: string): Promise<Garden | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT data FROM gardens WHERE id = ? LIMIT 1",
      [id]
    );
    return rows.length ? normalizeStoredGarden(parseJson<Garden>(rows[0].data)) : undefined;
  }

  async putGarden(garden: Garden): Promise<void> {
    const data = normalizeStoredGarden(garden);
    const shared = [...new Set(data.sharedWith)].filter((id) => id !== data.ownerId);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO gardens (id, owner_id, name, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           owner_id = VALUES(owner_id),
           name = VALUES(name),
           data = VALUES(data),
           updated_at = VALUES(updated_at)`,
        [
          data.id,
          data.ownerId,
          data.name,
          JSON.stringify(data),
          data.createdAt,
          data.updatedAt ?? Date.now(),
        ]
      );
      await conn.query("DELETE FROM garden_members WHERE garden_id = ?", [data.id]);
      if (shared.length > 0) {
        await conn.query(
          "INSERT INTO garden_members (garden_id, user_id) VALUES ?",
          [shared.map((userId) => [data.id, userId])]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  async deleteGarden(id: string): Promise<void> {
    await this.pool.query("DELETE FROM gardens WHERE id = ?", [id]);
  }

  async getCropCatalog(): Promise<Crop[]> {
    return this.readState<Crop[]>("cropCatalog", DEFAULT_CROP_CATALOG);
  }

  async setCropCatalog(crops: Crop[]): Promise<void> {
    await this.writeState("cropCatalog", crops);
  }

  async getCatalogDeleted(): Promise<Record<string, number>> {
    return this.readState<Record<string, number>>("catalogDeleted", {});
  }

  async setCatalogDeleted(deleted: Record<string, number>): Promise<void> {
    await this.writeState("catalogDeleted", deleted);
  }
}
