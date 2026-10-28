import { Router } from "express";
import type { Garden } from "../src/types.ts";
import { id } from "../src/storage.ts";
import { mergeCatalog, mergeGarden, normalizeCrop, normalizeGarden } from "../src/sync.ts";
import type { DataStore } from "./db.ts";
import type { AuthService } from "./auth.ts";
import { publicUser, randomToken } from "./auth.ts";
import type { StoredUser } from "./types.ts";
import type { WsHub } from "./ws.ts";
import type { MeResponse } from "./types.ts";
import { scrapeProduct, clearCache, getCacheSize } from "./scraper.ts";
import { interpretSeedPage } from "../src/seedLookup.ts";

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

  /**
   * Login met Google (Google Identity Services ID-token).
   * Body: { idToken: string }
   * Verifieert het token bij Google en maakt/zoekt daarna een lokale user.
   */
  router.post("/api/auth/google", async (req, res) => {
    try {
      const idToken = String(req.body?.idToken ?? "").trim();
      if (!idToken) {
        res.status(400).json({ error: "Geen Google-token meegegeven." });
        return;
      }
      // Token verifiëren bij Google.
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (!verifyRes.ok) {
        res.status(401).json({ error: "Google-token ongeldig. Probeer opnieuw." });
        return;
      }
      const info = (await verifyRes.json()) as {
        email?: string;
        email_verified?: string;
        name?: string;
        picture?: string;
        sub?: string;
        aud?: string;
      };
      const expectedAud = process.env.GOOGLE_CLIENT_ID;
      if (expectedAud && info.aud !== expectedAud) {
        res.status(401).json({ error: "Google-token is voor een andere app." });
        return;
      }
      if (!info.email) {
        res.status(401).json({ error: "Geen e-mailadres van Google ontvangen." });
        return;
      }
      if (info.email_verified === "false") {
        res.status(401).json({ error: "Verifieer eerst je Google e-mailadres." });
        return;
      }
      const { user, session } = await auth.loginWithOAuth({
        email: info.email,
        name: info.name,
        avatarUrl: info.picture ?? null,
        providerId: info.sub ?? null,
        provider: "google",
      });
      res.json({ user: publicUser(user), token: session.token });
    } catch (err: any) {
      res.status(401).json({ error: err?.message ?? "Inloggen met Google mislukt." });
    }
  });

  /**
   * Login via Supabase Auth (Google OAuth of magic link via Supabase).
   * Body: { accessToken: string }
   * Verifieert het Supabase JWT bij het Supabase-project (als geconfigureerd),
   * met een gedecodeerde fallback voor lokale ontwikkeling.
   */
  router.post("/api/auth/supabase", async (req, res) => {
    try {
      const accessToken = String(req.body?.accessToken ?? "").trim();
      if (!accessToken) {
        res.status(400).json({ error: "Geen Supabase-token meegegeven." });
        return;
      }
      let email: string | undefined;
      let name: string | undefined;
      let avatar: string | null = null;
      let providerId: string | null = null;

      const url = process.env.SUPABASE_URL;
      // Nieuwe dashboard-naam (SUPABASE_PUBLISHABLE_KEY) én legacy-naam allebei ok.
      // Placeholder-waardes (VUL_HIER…) tellen niet als geconfigureerd.
      const anonRaw =
        process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
      const anon = anonRaw && !anonRaw.includes("VUL_HIER") ? anonRaw : undefined;
      if (url && anon) {
        const userRes = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
          headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
        });
        if (!userRes.ok) {
          res.status(401).json({ error: "Supabase-sessie ongeldig. Log opnieuw in." });
          return;
        }
        const su = (await userRes.json()) as {
          id?: string;
          email?: string;
          user_metadata?: { name?: string; full_name?: string; avatar_url?: string; picture?: string };
        };
        email = su.email;
        name = su.user_metadata?.full_name ?? su.user_metadata?.name;
        avatar = su.user_metadata?.avatar_url ?? su.user_metadata?.picture ?? null;
        providerId = su.id ?? null;
      } else {
        // Dev-fallback: decodeer de JWT-payload zonder handtekening-check.
        // Nooit gebruiken in productie zonder SUPABASE_URL te zetten!
        const parts = accessToken.split(".");
        if (parts.length < 2) throw new Error("Ongeldig token.");
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as {
          email?: string;
          user_metadata?: { name?: string; full_name?: string; avatar_url?: string };
          sub?: string;
        };
        email = payload.email;
        name = payload.user_metadata?.full_name ?? payload.user_metadata?.name;
        providerId = payload.sub ?? null;
      }

      if (!email) {
        res.status(401).json({ error: "Geen e-mailadres in Supabase-sessie gevonden." });
        return;
      }
      const { user, session } = await auth.loginWithOAuth({
        email,
        name,
        avatarUrl: avatar,
        providerId,
        provider: "supabase",
      });
      res.json({ user: publicUser(user), token: session.token });
    } catch (err: any) {
      res.status(401).json({ error: err?.message ?? "Inloggen via Supabase mislukt." });
    }
  });

  // ---------- account / catalog ----------
  router.get("/api/me", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const gardens = await store.listGardensForUser(me.id);
    const catalog = await store.getCropCatalog();
    const ids = new Set<string>([me.id]);
    for (const g of gardens) {
      ids.add(g.ownerId);
      for (const uid of g.sharedWith) ids.add(uid);
    }
    const found = await Promise.all(
      [...ids].map(async (id) => [id, await store.getUserById(id)] as const)
    );
    const userNames: Record<string, string> = {};
    for (const [id, u] of found) userNames[id] = u?.username ?? "?";
    userNames[me.id] = me.username;
    const payload: MeResponse = { user: publicUser(me), gardens, cropCatalog: catalog, userNames };
    res.json(payload);
  });

  router.patch("/api/me/username", auth.requireAuth, async (req, res) => {
    try {
      const { username } = req.body ?? {};
      if (typeof username !== "string") {
        res.status(400).json({ error: "Gebruikersnaam is verplicht." });
        return;
      }
      const updated = await auth.changeUsername(reqUser(req).id, username);
      res.json({ user: publicUser(updated) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Naam wijzigen mislukt." });
    }
  });

  router.patch("/api/me/password", auth.requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        res.status(400).json({ error: "Huidig en nieuw wachtwoord zijn verplicht." });
        return;
      }
      await auth.changePassword(reqUser(req).id, currentPassword, newPassword);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Wachtwoord wijzigen mislukt." });
    }
  });

  router.put("/api/catalog", auth.requireAuth, async (req, res) => {
    const catalog = req.body?.cropCatalog;
    if (!Array.isArray(catalog)) {
      res.status(400).json({ error: "cropCatalog moet een lijst zijn." });
      return;
    }
    if (catalog.length === 0) {
      res.status(400).json({ error: "cropCatalog mag niet leeg zijn." });
      return;
    }
    // Samenvoegen i.p.v. vervangen: met twee bewerkers tegelijk wint per gewas
    // de nieuwste bewerking en herrijzen verwijderde gewassen nooit.
    const incomingDeleted: Record<string, number> =
      req.body?.deletedCropIds && typeof req.body.deletedCropIds === "object"
        ? req.body.deletedCropIds
        : {};
    const stored = await store.getCropCatalog();
    const storedDeleted = await store.getCatalogDeleted();
    const { list, tomb } = mergeCatalog(
      stored.map(normalizeCrop),
      catalog.map(normalizeCrop),
      storedDeleted,
      incomingDeleted
    );
    await store.setCropCatalog(list);
    await store.setCatalogDeleted(tomb);
    res.json({ cropCatalog: list });
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
      sowings: [],
      expenses: [],
      incomes: [],
      shopping: [],
      todos: [],
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
    // Samenvoegen i.p.v. blind vervangen: bewerkingen van twee schermen aan
    // verschillende onderdelen overleven elkaar (per item wint nieuwer).
    const merged = mergeGarden(normalizeGarden(existing), normalizeGarden(incoming), "b");
    const safe: Garden = {
      ...merged,
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
    if (!garden || !token || !garden.inviteToken || garden.inviteToken !== token) {
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
    if (!garden || !token || !garden.inviteToken || garden.inviteToken !== token) {
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

  // Disable the invite link (owner only): existing links stop working.
  // POST /invite creates a fresh link again afterwards.
  router.delete("/api/gardens/:gardenId/invite", auth.requireAuth, async (req, res) => {
    const me = reqUser(req);
    const garden = await store.getGarden(String(req.params.gardenId));
    if (!garden || garden.ownerId !== me.id) {
      res.status(404).json({ error: "Tuin niet gevonden of geen toegang." });
      return;
    }
    garden.inviteToken = "";
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
    // haal de gebruiker ook live uit de tuin als hij nu meekijkt
    ws.kickUserFromGarden(garden.id, String(req.params.userId));
    res.json(garden);
  });

  // ---------- link preview (boodschappenlijst: plak link -> haal titel/prijs/afbeelding op) ----------
  router.get("/api/preview-link", auth.requireAuth, async (req, res) => {
    const raw = String(req.query.url ?? "").trim();
    if (!raw) {
      res.status(400).json({ error: "Geef een url mee." });
      return;
    }
    try {
      const data = await scrapeProduct(raw);
      res.json(data);
    } catch (err: any) {
      res.status(502).json({ error: err?.message ?? "Kon productinfo niet ophalen. Vul handmatig aan." });
    }
  });

  router.post("/api/preview-link/clear-cache", auth.requireAuth, async (_req, res) => {
    clearCache();
    res.json({ ok: true, cacheSize: getCacheSize() });
  });

  // ---------- zadenpagina -> gewasgegevens ----------
  router.get("/api/seed-lookup", auth.requireAuth, async (req, res) => {
    const raw = String(req.query.url ?? "").trim();
    if (!raw) {
      res.status(400).json({ error: "Geef een url mee." });
      return;
    }
    try {
      const page = await scrapeProduct(raw);
      res.json(interpretSeedPage(page));
    } catch (err: any) {
      res.status(502).json({
        error: err?.message ?? "Kon de zadenpagina niet lezen. Vul de velden zelf aan.",
      });
    }
  });

  return router;
}
