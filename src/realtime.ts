import { getToken } from "./api";
import type { Garden } from "./types";

export interface LiveUpdate {
  id: string;
  x?: number;
  y?: number;
  widthM?: number;
  heightM?: number;
  crops?: { instanceId: string; cropId: string; rows: number; rowSpacing?: number; plantSpacing?: number; cols?: number; padding?: number; area?: { x: number; y: number; w: number; h: number } }[];
}

/** Transient ghost the other editors see while you are creating something. */
export type PreviewPayload =
  | { kind: "frame"; rect: { x: number; y: number; w: number; h: number } }
  | { kind: "gaas"; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: "clear" };

export type RealtimeMessage =
  | { type: "joined"; gardenId: string }
  | { type: "garden"; garden: Garden }
  | { type: "move"; gardenId: string; updates: LiveUpdate[] }
  | { type: "preview"; gardenId: string; preview: PreviewPayload }
  | { type: "presence"; gardenId: string; count: number }
  | { type: "error"; message: string };

type Handler = (msg: RealtimeMessage) => void;

/**
 * WebSocket client. Connects with the session token, joins a "room" for the
 * active garden, receives full-garden updates (commits) and transient move
 * updates (live drag), and forwards the client's own moves.
 */
class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private gardenId: string | null = null;
  private shouldRun = false;
  private reconnectDelay = 1000;

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  disconnect(): void {
    this.shouldRun = false;
    this.gardenId = null;
    this.ws?.close();
    this.ws = null;
  }

  /** Join (or leave) the live room for a garden. */
  setGarden(gardenId: string | null): void {
    this.gardenId = gardenId;
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (gardenId) this.send({ type: "join", gardenId });
      else this.send({ type: "leave" });
    }
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Transient drag update, relayed to the other editors of the garden. */
  sendMove(gardenId: string, updates: LiveUpdate[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({ type: "move", gardenId, updates });
  }

  /** Transient "in progress" ghost (frame/gaas being drawn), relayed live. */
  sendPreview(gardenId: string, preview: PreviewPayload): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({ type: "preview", gardenId, preview });
  }

  private open(): void {
    const token = getToken() ?? "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      if (this.gardenId) this.send({ type: "join", gardenId: this.gardenId });
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as RealtimeMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (!this.shouldRun) return;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      setTimeout(() => this.open(), this.reconnectDelay);
    };
  }

  private send(msg: unknown): void {
    this.ws?.send(JSON.stringify(msg));
  }
}

export const realtime = new RealtimeClient();
