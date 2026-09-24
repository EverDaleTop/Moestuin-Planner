import { Router } from "express";
import type { Garden } from "../src/types.ts";
import { id } from "../src/storage.ts";
import type { DataStore } from "./db.ts";
import type { AuthService } from "./auth.ts";
import { publicUser, randomToken } from "./auth.ts";
import type { StoredUser } from "./types.ts";
import type { WsHub } from "./ws.ts";
import type { MeResponse } from "./types.ts";

export function createRouter(store: DataStore, auth: AuthService, ws: WsHub): Router {
  const router = Router();

  function reqUser(req: any): StoredUser {
    return req.user as StoredUser;
  }

  async function canEdit(userId: string, gardenId: string): Promise<Garden | null> {
    const garden = await store.getGarden(gardenId);
    if (!garden) return null;
    return garden.ownerId === userId || garden.sharedWith.includes(userId) ? garden : null;
  }

  // ---------- auth ----------
  router.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht." });
        return;
      }
      const user = await auth.register(username, password);
      const { session } = await auth.login(user.username, password);
      res.json({ user: publicUser(user), token: session.token });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Registratie mislukt." });
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht." });
        return;
      }
      const { user, session } = await auth.login(username, password);
      res.json({ user: publicUser(user), token: session.token });
    } catch (err: any) {
      res.status(401).json({ error: err.message ?? "Inloggen mislukt." });
    }
  });

  router.post("/api/auth/logout", auth.requireAuth, async (req, res) => {
    await auth.logout((req as any).token);
    res.json({ ok: true });
  });

  // ---------- account / catalog ----------
  router.get("/api/me", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const gardens = await store.listGardensForUser(me.id);
    const catalog = await store.getCropCatalog();
    const userNames: Record<string, string> = {};
    for (const g of gardens) {
      userNames[g.ownerId] = userNames[g.ownerId] ?? (await store.getUserById(g.ownerId))?.username ?? "?";
      for (const uid of g.sharedWith) {
        userNames[uid] = userNames[uid] ?? (await store.getUserById(uid))?.username ?? "?";
      }
    }
    userNames[me.id] = userNames[me.id] ?? me.username;
    const payload: MeResponse = { user: publicUser(me), gardens, cropCatalog: catalog, userNames };
    res.json(payload);
  });

  router.put("/api/catalog", auth.requireAuth, async (req, res) => {
    const catalog = req.body?.cropCatalog;
    if (!Array.isArray(catalog)) {
      res.status(400).json({ error: "cropCatalog moet een lijst zijn." });
      return;
    }
    await store.setCropCatalog(catalog);
    res.json({ cropCatalog: catalog });
  });

  router.get("/api/users", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json([]);
      return;
    }
    const found = await store.searchUsers(q, 8);
    res.json(found.filter((u) => u.id !== me.id).map((u) => ({ id: u.id, username: u.username })));
  });

  // ---------- gardens ----------
  router.post("/api/gardens", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Geef een naam voor de tuin." });
      return;
    }
    const garden: Garden = {
      id: id(),
      name,
      createdAt: Date.now(),
      elements: [],
      harvests: [],
      expenses: [],
      shopping: [],
      ownerId: me.id,
      sharedWith: [],
      inviteToken: randomToken(),
    };
    await store.putGarden(garden);
    res.json(garden);
  });

  router.get("/api/gardens/:gardenId", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await canEdit(me.id, String(req.params.gardenId));
    if (!garden) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    res.json(garden);
  });

  router.put("/api/gardens/:gardenId", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const existing = await canEdit(me.id, String(req.params.gardenId));
    if (!existing) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    const incoming = req.body as Garden;
    if (!incoming || incoming.id !== existing.id) {
      res.status(400).json({ error: "Ongeldige tuin-data." });
      return;
    }
    const safe: Garden = {
      ...incoming,
      ownerId: existing.ownerId,
      sharedWith: existing.sharedWith,
      createdAt: existing.createdAt,
      inviteToken: existing.inviteToken,
    };
    await store.putGarden(safe);
    ws.broadcastGarden(safe);
    res.json(safe);
  });

  router.delete("/api/gardens/:gardenId", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await store.getGarden(String(req.params.gardenId));
    if (!garden || garden.ownerId !== me.id) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    await store.deleteGarden(garden.id);
    res.json({ ok: true });
  });

  // ---------- sharing ----------
  // Public preview used by the invite screen before joining (the token is the key).
  router.get("/api/gardens/:gardenId/invite", async (req, res) => {
    const garden = await store.getGarden(String(req.params.gardenId));
    const token = String(req.query.token ?? "");
    if (!garden || garden.inviteToken !== token) {
      res.status(404).json({ error: "Uitnodiging niet gevonden of ongeldig." });
      return;
    }
    const owner = await store.getUserById(garden.ownerId);
    res.json({
      garden: {
        id: garden.id,
        name: garden.name,
        ownerName: owner?.username ?? "onbekend",
      },
    });
  });

  // Join a shared garden by invite link (any logged-in user).
  router.post("/api/gardens/:gardenId/join", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await store.getGarden(String(req.params.gardenId));
    const token = String(req.body?.token ?? "");
    if (!garden || garden.inviteToken !== token) {
      res.status(404).json({ error: "Uitnodiging niet gevonden of ongeldig." });
      return;
    }
    if (garden.ownerId === me.id || garden.sharedWith.includes(me.id)) {
      res.json(garden);
      return;
    }
    garden.sharedWith = [...garden.sharedWith, me.id];
    await store.putGarden(garden);
    ws.broadcastGarden(garden);
    res.json(garden);
  });

  // Regenerate the invite link (owner only), so a leaked link can be invalidated.
  router.post("/api/gardens/:gardenId/invite", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await store.getGarden(String(req.params.gardenId));
    if (!garden || garden.ownerId !== me.id) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    garden.inviteToken = randomToken();
    await store.putGarden(garden);
    ws.broadcastGarden(garden);
    res.json(garden);
  });

  router.delete("/api/gardens/:gardenId/share/:userId", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await store.getGarden(String(req.params.gardenId));
    if (!garden || garden.ownerId !== me.id) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    garden.sharedWith = garden.sharedWith.filter((uid) => uid !== String(req.params.userId));
    await store.putGarden(garden);
    ws.broadcastGarden(garden);
    res.json(garden);
  });

  return router;
}
