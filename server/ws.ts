import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import type { Garden } from "../src/types.ts";
import type { DataStore } from "./db.ts";
import type { AuthService } from "./auth.ts";
import type { WsMessage } from "./types.ts";

interface SocketState {
  userId: string;
  gardenId: string | null;
}

/** WebSocket hub: routes live updates between users editing the same garden. */
export class WsHub {
  private wss: WebSocketServer;
  private sockets = new Map<WebSocket, SocketState>();
  private rooms = new Map<string, Set<WebSocket>>();
  private store: DataStore;
  private auth: AuthService;

  constructor(server: HttpServer, store: DataStore, auth: AuthService) {
    this.store = store;
    this.auth = auth;
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket, req) => this.onConnection(socket, req));
  }

  private async onConnection(socket: WebSocket, req: import("node:http").IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const user = await this.auth.resolveUser(token);
    if (!user) {
      socket.close(4001, "unauthorized");
      return;
    }
    this.sockets.set(socket, { userId: user.id, gardenId: null });

    socket.on("message", (raw) => {
      void this.onMessage(socket, raw.toString());
    });
    socket.on("close", () => {
      this.leaveRoom(socket);
      this.sockets.delete(socket);
    });
  }

  private async onMessage(socket: WebSocket, raw: string): Promise<void> {
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

    if (msg.type === "garden") {
      const garden = msg.garden as Garden;
      if (!garden || !garden.id || state.gardenId !== garden.id) return;
      const existing = await this.store.getGarden(garden.id);
      if (!existing || !this.canAccess(state.userId, existing)) return;
      // never let a client change ownership or sharing
      const safe: Garden = {
        ...garden,
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
    const count = this.rooms.get(gardenId)?.size ?? 0;
    this.broadcast(gardenId, { type: "presence", gardenId, count });
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
