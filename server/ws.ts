import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import type { Garden } from "../src/types.ts";
import { mergeGarden, normalizeGarden } from "../src/sync.ts";
import type { DataStore } from "./db.ts";
import type { AuthService } from "./auth.ts";
import type { PresenceMember, WsMessage } from "./types.ts";

interface SocketState {
  userId: string;
  username: string;
  gardenId: string | null;
  lastPong: number;
}

/** WebSocket hub: routes live updates between users editing the same garden. */
export class WsHub {
  private wss: WebSocketServer;
  private sockets = new Map<WebSocket, SocketState>();
  private rooms = new Map<string, Set<WebSocket>>();
  /**
   * Per socket de authenticatie-belofte. Een client stuurt zijn "join" meteen
   * bij het openen; zonder dit te respecteren komt dat bericht soms binnen
   * vóórdat de socket geregistreerd is en wordt het stilzwijgend genegeerd -
   * de socket zit dan nooit in de kamer en live updates werken niet.
   */
  private ready = new Map<WebSocket, Promise<void>>();
  /** hartbeat-timer: stuurt elke 10s een ping naar alle verbonden sockets */
  private heartbeat: ReturnType<typeof setInterval>;
  private store: DataStore;
  private auth: AuthService;

  constructor(server: HttpServer, store: DataStore, auth: AuthService) {
    this.store = store;
    this.auth = auth;
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket, req) => void this.onConnection(socket, req));

    // Hartbeat: een mobiele browser kan een socket "bevriezen" zonder hem te
    // sluiten. De client ziet dan een open verbinding die niets doorgeeft. Met
    // deze ping weet hij dat er iets (niet) binnenkomt en herstelt hij zichzelf.
    this.heartbeat = setInterval(() => this.pingAll(), 10000);
    this.heartbeat.unref?.();
  }

  private pingAll(): void {
    const now = Date.now();
    for (const socket of [...this.sockets.keys()]) {
      const state = this.sockets.get(socket);
      if (!state) continue;
      // Dode/bevroren sockets (geen pong binnen 25s) opruimen, zodat
      // presence alleen actuele apparaten toont.
      if (now - state.lastPong > 25000) {
        try {
          socket.terminate();
        } catch {
          /* al weg */
        }
        continue;
      }
      if (state.gardenId && socket.readyState === socket.OPEN) {
        try {
          socket.ping();
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* de socket sluit zichzelf wel */
        }
      }
    }
  }

  private async onConnection(socket: WebSocket, req: import("node:http").IncomingMessage): Promise<void> {
    const promise = (async () => {
      const url = new URL(req.url ?? "", "http://localhost");
      const token = url.searchParams.get("token") ?? "";
      const user = await this.auth.resolveUser(token);
      if (!user) throw new Error("unauthorized");
      this.sockets.set(socket, { userId: user.id, username: user.username, gardenId: null, lastPong: Date.now() });
    })();
    this.ready.set(socket, promise);

    socket.on("message", (raw) => {
      void this.onMessage(socket, raw.toString());
    });
    socket.on("pong", () => {
      const state = this.sockets.get(socket);
      if (state) state.lastPong = Date.now();
    });
    socket.on("close", () => {
      this.ready.delete(socket);
      this.leaveRoom(socket);
      this.sockets.delete(socket);
    });

    try {
      await promise;
    } catch {
      this.ready.delete(socket);
      socket.close(4001, "unauthorized");
    }
  }

  private async onMessage(socket: WebSocket, raw: string): Promise<void> {
    // Wachten tot de socket geauthenticeerd en geregistreerd is, anders gaat
    // het allereerste bericht (de join) verloren.
    const ready = this.ready.get(socket);
    if (ready) {
      try {
        await ready;
      } catch {
        return;
      }
    }
    const state = this.sockets.get(socket);
    if (!state) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.send(socket, { type: "error", message: "Ongeldig bericht." });
      return;
    }

    if (msg.type === "join") {
      const gardenId = String(msg.gardenId ?? "");
      const garden = await this.store.getGarden(gardenId);
      if (!garden || !this.canAccess(state.userId, garden)) {
        this.send(socket, { type: "error", message: "Geen toegang tot deze tuin." });
        return;
      }
      this.leaveRoom(socket);
      state.gardenId = gardenId;
      let room = this.rooms.get(gardenId);
      if (!room) {
        room = new Set();
        this.rooms.set(gardenId, room);
      }
      room.add(socket);
      this.send(socket, { type: "joined", gardenId });
      this.broadcastPresence(gardenId);
      return;
    }

    if (msg.type === "leave") {
      this.leaveRoom(socket);
      return;
    }

    if (msg.type === "ping") {
      // Houdt de verbinding wakker en bevestigt dat de server nog leeft.
      this.send(socket, { type: "ping" } as unknown as WsMessage);
      return;
    }

    if (msg.type === "move") {
      const gardenId = String(msg.gardenId ?? "");
      if (state.gardenId !== gardenId) return;
      const garden = await this.store.getGarden(gardenId);
      if (!garden || !this.canAccess(state.userId, garden)) return;
      const updates = Array.isArray(msg.updates) ? msg.updates : [];
      this.broadcast(
        gardenId,
        { type: "move", gardenId, updates },
        socket
      );
      return;
    }

    if (msg.type === "preview") {
      const gardenId = String(msg.gardenId ?? "");
      if (state.gardenId !== gardenId) return;
      const garden = await this.store.getGarden(gardenId);
      if (!garden || !this.canAccess(state.userId, garden)) return;
      this.broadcast(
        gardenId,
        { type: "preview", gardenId, preview: msg.preview },
        socket
      );
      return;
    }

    if (msg.type === "cursor") {
      const gardenId = String(msg.gardenId ?? "");
      if (state.gardenId !== gardenId) return;
      const garden = await this.store.getGarden(gardenId);
      if (!garden || !this.canAccess(state.userId, garden)) return;
      const c = msg.cursor as { x?: unknown; y?: unknown } | null;
      const cursor =
        c && typeof c.x === "number" && typeof c.y === "number"
          ? { x: Math.round(c.x), y: Math.round(c.y) }
          : null;
      const selection = Array.isArray(msg.selection)
        ? (msg.selection as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 100)
        : [];
      this.broadcast(
        gardenId,
        { type: "cursor", gardenId, userId: state.userId, username: state.username, cursor, selection },
        socket
      );
      return;
    }

    if (msg.type === "garden") {
      const garden = msg.garden as Garden;
      if (!garden || !garden.id || state.gardenId !== garden.id) return;
      const existing = await this.store.getGarden(garden.id);
      if (!existing || !this.canAccess(state.userId, existing)) return;
      // Samenvoegen i.p.v. vervangen (zie routes.ts): gelijktijdige
      // bewerkingen aan verschillende onderdelen overleven elkaar.
      const merged = mergeGarden(normalizeGarden(existing), normalizeGarden(garden), "b");
      // never let a client change ownership or sharing
      const safe: Garden = {
        ...merged,
        ownerId: existing.ownerId,
        sharedWith: existing.sharedWith,
        inviteToken: existing.inviteToken,
      };
      await this.store.putGarden(safe);
      this.broadcast(safe.id, { type: "garden", garden: safe }, socket);
      return;
    }
  }

  private canAccess(userId: string, garden: Garden): boolean {
    return garden.ownerId === userId || garden.sharedWith.includes(userId);
  }

  private leaveRoom(socket: WebSocket): void {
    const state = this.sockets.get(socket);
    if (!state?.gardenId) return;
    const room = this.rooms.get(state.gardenId);
    if (room) {
      room.delete(socket);
      if (room.size === 0) this.rooms.delete(state.gardenId);
      this.broadcastPresence(state.gardenId);
    }
    state.gardenId = null;
  }

  private broadcastPresence(gardenId: string): void {
    const room = this.rooms.get(gardenId);
    const seen = new Set<string>();
    const members: PresenceMember[] = [];
    for (const socket of room ?? []) {
      const state = this.sockets.get(socket);
      if (!state || seen.has(state.userId)) continue;
      seen.add(state.userId);
      members.push({ userId: state.userId, username: state.username });
    }
    members.sort((a, b) => a.username.localeCompare(b.username));
    // count = aantal verbonden apparaten (sockets), niet unieke gebruikers:
    // twee schermen op hetzelfde account zijn nu eenmaal zichtbaar als 2, en
    // dat is meteen ook de levensbalk voor "werkt live sync hier".
    this.broadcast(gardenId, {
      type: "presence",
      gardenId,
      count: room?.size ?? 0,
      members,
    });
  }

  /**
   * Verwijder iemand live uit een tuin (na unshare): stuur eerst een
   * "kicked"-bericht zodat de client netjes teruggaat naar de lijst, en
   * verbreek daarna de socket zodat presence meteen klopt en er geen
   * updates meer binnenkomen.
   */
  kickUserFromGarden(gardenId: string, userId: string): void {
    const room = this.rooms.get(gardenId);
    if (!room) return;
    for (const socket of room) {
      if (this.sockets.get(socket)?.userId !== userId) continue;
      this.send(socket, { type: "kicked", gardenId });
      // even de tijd geven om het bericht te verwerken voor de socket sluit
      setTimeout(() => {
        try {
          socket.close(4002, "kicked");
        } catch {
          // al weg
        }
      }, 250);
    }
  }

  private send(socket: WebSocket, msg: WsMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  }

  private broadcast(gardenId: string, msg: WsMessage, except?: WebSocket): void {
    const room = this.rooms.get(gardenId);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const socket of room) {
      if (socket === except) continue;
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }

  /** REST routes call this after persisting a garden so editors stay in sync. */
  broadcastGarden(garden: Garden): void {
    this.broadcast(garden.id, { type: "garden", garden });
  }
}
