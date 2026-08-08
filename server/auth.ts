import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import type { DataStore } from "./db.ts";
import type { Session, StoredUser } from "./types.ts";

const SESSION_DAYS = 30;

function token(): string {
  return randomBytes(24).toString("hex");
}

export function randomToken(): string {
  return randomBytes(24).toString("hex");
}

export class AuthService {
  private store: DataStore;

  constructor(store: DataStore) {
    this.store = store;
  }

  async register(username: string, password: string): Promise<StoredUser> {
    const name = username.trim();
    if (name.length < 2) throw new Error("Gebruikersnaam moet minimaal 2 tekens zijn.");
    if (password.length < 4) throw new Error("Wachtwoord moet minimaal 4 tekens zijn.");
    if (/[^a-zA-Z0-9_\-.]/.test(name)) {
      throw new Error("Gebruikersnaam mag alleen letters, cijfers, _ - . bevatten.");
    }
    const existing = await this.store.getUserByUsername(name);
    if (existing) throw new Error("Deze gebruikersnaam is al in gebruik.");
    const user: StoredUser = {
      id: token().slice(0, 16),
      username: name,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: Date.now(),
    };
    await this.store.addUser(user);
    return user;
  }

  async login(username: string, password: string): Promise<{ user: StoredUser; session: Session }> {
    const user = await this.store.getUserByUsername(username.trim());
    if (!user) throw new Error("Gebruikersnaam of wachtwoord onjuist.");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error("Gebruikersnaam of wachtwoord onjuist.");
    const session: Session = {
      token: token(),
      userId: user.id,
      createdAt: Date.now(),
    };
    await this.store.addSession(session);
    return { user, session };
  }

  async logout(tokenToRemove: string): Promise<void> {
    await this.store.removeSession(tokenToRemove);
  }

  async resolveUser(tokenToResolve: string): Promise<StoredUser | undefined> {
    const session = await this.store.getSession(tokenToResolve);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > SESSION_DAYS * 24 * 60 * 60 * 1000) {
      await this.store.removeSession(session.token);
      return undefined;
    }
    return this.store.getUserById(session.userId);
  }

  /** Express middleware: requires `Authorization: Bearer <token>`. */
  requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
      res.status(401).json({ error: "Niet ingelogd." });
      return;
    }
    const user = await this.resolveUser(m[1]);
    if (!user) {
      res.status(401).json({ error: "Sessie verlopen. Log opnieuw in." });
      return;
    }
    (req as any).user = user;
    (req as any).token = m[1];
    next();
  };
}

export function publicUser(user: StoredUser) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}
