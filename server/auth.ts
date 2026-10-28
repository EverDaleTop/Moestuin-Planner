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
    if (!user || !user.passwordHash) throw new Error("Gebruikersnaam of wachtwoord onjuist.");
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

  /**
   * Login of registratie via Google / Supabase OAuth.
   * Wordt aangeroepen nadat de ID/access-token al geverifieerd is in routes.ts.
   */
  async loginWithOAuth(profile: {
    email: string;
    name?: string;
    avatarUrl?: string | null;
    providerId?: string | null;
    provider?: "google" | "supabase";
  }): Promise<{ user: StoredUser; session: Session }> {
    const email = profile.email.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Geen geldig e-mailadres van Google ontvangen.");

    // 1) Bestaande gebruiker via provider-id of e-mail zoeken.
    //    DataStore kent alleen username-lookup, dus we zoeken breed.
    //    searchUsers(match op email) werkt omdat we email ook als username-deel opslaan.
    const candidates = await this.store.searchUsers(email, 8);
    let user =
      (profile.providerId &&
        candidates.find((u) => u.providerId === profile.providerId)) ||
      candidates.find((u) => u.email?.toLowerCase() === email);

    // Val terug op exacte username-match (oudere accounts zonder email-veld).
    if (!user) {
      const base = email.split("@")[0].replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 24) || "tuinder";
      const byName = await this.store.getUserByUsername(base);
      if (byName && byName.email?.toLowerCase() === email) user = byName;
    }

    if (!user) {
      // 2) Nieuw account: unieke gebruikersnaam afleiden van e-mail.
      const base = email.split("@")[0].replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 24) || "tuinder";
      let username = base;
      let suffix = 0;
      while (await this.store.getUserByUsername(username)) {
        suffix += 1;
        username = `${base}${suffix}`;
      }
      user = {
        id: token().slice(0, 16),
        username: profile.name?.trim().slice(0, 40) || username,
        passwordHash: null,
        email,
        avatarUrl: profile.avatarUrl ?? null,
        provider: profile.provider ?? "google",
        providerId: profile.providerId ?? null,
        createdAt: Date.now(),
      };
      // Zorg dat de username echt uniek is (naam kan botsen).
      let n = 0;
      let candidateName = user.username;
      while (await this.store.getUserByUsername(candidateName)) {
        n += 1;
        candidateName = `${user.username}${n}`;
      }
      user.username = candidateName;
      await this.store.addUser(user);
    } else {
      // Bestaande gebruiker verrijken met OAuth-gegevens (geen overschrijving van username).
      const enriched: StoredUser = {
        ...user,
        email: profile.email ?? user.email ?? null,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl ?? null,
        provider: profile.provider ?? user.provider,
        providerId: profile.providerId ?? user.providerId ?? null,
      };
      await this.store.updateUser(enriched);
      return { user: enriched, session: await this.createSession(enriched.id) };
    }

    const session: Session = { token: token(), userId: user.id, createdAt: Date.now() };
    await this.store.addSession(session);
    return { user, session };
  }

  /** Maak direct een sessie voor een al bekende user (na externe verificatie). */
  async createSession(userId: string): Promise<Session> {
    const session: Session = { token: token(), userId, createdAt: Date.now() };
    await this.store.addSession(session);
    return session;
  }

  async logout(tokenToRemove: string): Promise<void> {
    await this.store.removeSession(tokenToRemove);
  }

  /** Profielnaam wijzigen: zelfde regels als bij registratie. */
  async changeUsername(userId: string, username: string): Promise<StoredUser> {
    const user = await this.store.getUserById(userId);
    if (!user) throw new Error("Gebruiker niet gevonden.");
    const name = username.trim();
    if (name.length < 2) throw new Error("Gebruikersnaam moet minimaal 2 tekens zijn.");
    if (/[^a-zA-Z0-9_\-.]/.test(name)) {
      throw new Error("Gebruikersnaam mag alleen letters, cijfers, _ - . bevatten.");
    }
    const existing = await this.store.getUserByUsername(name);
    if (existing && existing.id !== user.id) throw new Error("Deze gebruikersnaam is al in gebruik.");
    const updated: StoredUser = { ...user, username: name };
    await this.store.updateUser(updated);
    return updated;
  }

  /** Wachtwoord wijzigen: huidig wachtwoord ter controle, nieuw minimaal 4 tekens. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<StoredUser> {
    const user = await this.store.getUserById(userId);
    if (!user) throw new Error("Gebruiker niet gevonden.");
    if (!user.passwordHash) {
      throw new Error("Dit account logt in via Google; er is geen wachtwoord om te wijzigen.");
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new Error("Huidig wachtwoord klopt niet.");
    if (newPassword.length < 4) throw new Error("Nieuw wachtwoord moet minimaal 4 tekens zijn.");
    if (newPassword === currentPassword) throw new Error("Nieuw wachtwoord moet anders zijn dan het huidige.");
    const updated: StoredUser = { ...user, passwordHash: await bcrypt.hash(newPassword, 10) };
    await this.store.updateUser(updated);
    return updated;
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
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    hasPassword: user.passwordHash !== null,
  };
}
