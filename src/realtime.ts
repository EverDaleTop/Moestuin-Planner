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

export interface PresenceMember {
  userId: string;
  username: string;
}

/** Live muispositie + selectie van een andere editor (transient, nooit opgeslagen). */
export interface LiveCursor {
  userId: string;
  username: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  /** ontvangen op (ms), voor het opruimen van stilgevallen cursors */
  at: number;
}

/** Vaste kleur per gebruiker, zodat je ziet wie wie is op het canvas. */
export function userColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 72% 42%)`;
}

/** Verbindingsstand van de live-koppeling, voor het statusbolletje. */
export type LiveStatus = "offline" | "connecting" | "joined";

export type RealtimeMessage =
  | { type: "ping" }
  | { type: "joined"; gardenId: string }
  | { type: "garden"; garden: Garden }
  | { type: "move"; gardenId: string; updates: LiveUpdate[] }
  | { type: "preview"; gardenId: string; preview: PreviewPayload }
  | { type: "cursor"; gardenId: string; userId: string; username: string; cursor: { x: number; y: number } | null; selection: string[] }
  | { type: "presence"; gardenId: string; count: number; members: PresenceMember[] }
  | { type: "kicked"; gardenId: string }
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
  /** tuin waarvoor we een "joined" bevestiging hebben gezien */
  private joined: string | null = null;
  private shouldRun = false;
  private reconnectDelay = 1000;
  private joinRetry = 0;
  /** timer van een geplande herverbinding, zodat we die kunnen annuleren */
  private reconnectTimer = 0;
  /** laatste bericht dat binnenkwam: de server pingt elke 10s */
  private lastInbound = Date.now();
  /** laatste fout/reden waarom de socket sloot (voor de diagnose) */
  private lastError = "";
  /** watchdog die een bevroren (maar ogenschijnend open) socket herstelt */
  private watchdog = 0;
  /** verbindingsstand + luisteraars voor het statusbolletje in de kopbalk */
  private status: LiveStatus = "offline";
  private statusHandlers = new Set<(s: LiveStatus) => void>();

  getStatus(): LiveStatus {
    return this.status;
  }

  onStatus(handler: (s: LiveStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(next: LiveStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const h of [...this.statusHandlers]) h(next);
  }

  /**
   * Een mobiele browser kan een socket bevriezen zonder hem te sluiten: de
   * client ziet dan een open verbinding waar niets meer doorheen komt, en
   * live updates werken tot je de server herstart. Daarom: als er te lang
   * niets binnenkomt, sluiten we 'm gewoon - dan reconnectt de normale
   * onclose-handler en we're weer goed.
   */
  private startWatchdog(): void {
    window.clearInterval(this.watchdog);
    this.lastInbound = Date.now();
    this.watchdog = window.setInterval(() => {
      if (!this.shouldRun) return;
      const silence = Date.now() - this.lastInbound;
      // Helemaal geen socket (bv. verbinden mislukte): opnieuw proberen.
      if (!this.ws) {
        if (this.gardenId && silence > 12000) this.open();
        return;
      }
      // Socket open maar nog niet in de kamer: forceren en opnieuw.
      if (this.gardenId && this.joined !== this.gardenId && silence > 8000) {
        this.closeSocket();
        return;
      }
      // Te lang niets gehoord (bevroren verbinding): sluiten, dan reconnect
      // de gewone onclose-handler.
      if (silence > 30000) this.closeSocket();
    }, 4000);
  }

  connect(): void {
    this.shouldRun = true;

    // Idempotent: een socket die al open is of nog aan het verbinden is niet
    // weggooien. Op mobiel vuurt visibilitychange vaak (ook tijdens het laden);
    // als we dan de half-open socket opnieuw opstarten komt de verbinding nooit
    // af en blijft het bolletje eeuwig oranje.
    const ready = this.ws?.readyState;
    if (ready === WebSocket.OPEN) {
      if (this.gardenId && this.joined !== this.gardenId) this.sendJoin(this.gardenId);
      this.startWatchdog();
      return;
    }
    if (ready === WebSocket.CONNECTING) {
      this.startWatchdog();
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.joinRetry);
    this.joined = null;
    this.open();
    this.startWatchdog();
  }

  disconnect(): void {
    this.shouldRun = false;
    this.gardenId = null;
    this.joined = null;
    window.clearTimeout(this.joinRetry);
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.watchdog);
    this.ws?.close();
    this.ws = null;
  }

  /** Join (or leave) the live room for a garden. */
  setGarden(gardenId: string | null): void {
    this.gardenId = gardenId;
    this.joined = null;
    if (!gardenId) {
      // Geen tuin = niets om in te joinen: dan is "verbinden" misleidend.
      this.setStatus("offline");
      window.clearTimeout(this.joinRetry);
      if (this.ws?.readyState === WebSocket.OPEN) this.send({ type: "leave" });
      return;
    }
    this.setStatus(this.ws?.readyState === WebSocket.OPEN ? "connecting" : "connecting");
    if (this.ws?.readyState === WebSocket.OPEN) this.sendJoin(gardenId);
  }

  /** Stuur een join; als er (door een race of netwerkverlies) geen "joined"
   *  terugkomt, proberen we het nog eens - anders blijft de socket buiten de
   *  kamer en werken live updates niet. De retry wordt eerst gepland, zodat
   *  een mislukte send nooit de laatste poging is. */
  private sendJoin(gardenId: string): void {
    window.clearTimeout(this.joinRetry);
    this.joinRetry = window.setTimeout(() => {
      if (this.gardenId === gardenId && this.joined !== gardenId) this.sendJoin(gardenId);
    }, 1500);
    if (this.gardenId !== gardenId) return;
    this.send({ type: "join", gardenId });
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Diagnose: typ __mpLive() in de console en je ziet waar het op staat. */
  debug(): Record<string, unknown> {
    return {
      status: this.status,
      shouldRun: this.shouldRun,
      socket: this.ws ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][this.ws.readyState] ?? this.ws.readyState : "geen",
      url: this.ws?.url ?? null,
      gardenId: this.gardenId,
      joined: this.joined,
      secSindsLaatsteBericht: Math.round((Date.now() - this.lastInbound) / 1000),
      laatsteFout: this.lastError,
      handlers: this.handlers.size,
    };
  }

  /** Sluit de huidige socket; de onclose-handler plant de herverbinding. */
  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      /* al dicht */
    }
  }

  /** Mobiel: een tab op de achtergrond mag de socket bevriezen. Zodra de tab
   *  weer zichtbaar is controleren we de verbinding en herstellen zo nodig. */
  watchVisibility(): () => void {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!this.shouldRun) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Nog een keer joinen: de bevestiging daarvan bewijst meteen dat deze
        // verbinding nog leeft (en anders pakt de watchdog het op).
        if (this.gardenId) {
          this.joined = null;
          this.sendJoin(this.gardenId);
        }
        return;
      }
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
      this.connect();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onVis);
    };
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

  /** Live muispositie + selectie, relayed live (transient, nooit opgeslagen). */
  sendCursor(gardenId: string, cursor: { x: number; y: number } | null, selection: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({ type: "cursor", gardenId, cursor, selection });
  }

  private open(): void {
    const token = getToken() ?? "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    // Nooit twee sockets tegelijk: de oude zou op de server blijven hangen
    // en als extra "apparaat" meegeteld worden.
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    this.setStatus("connecting");

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.lastInbound = Date.now();
      this.lastError = "";
      if (this.gardenId) this.sendJoin(this.gardenId);
    };
    ws.onerror = () => {
      this.lastError = "verbindingsfout (socket error)";
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as RealtimeMessage;
        // Berichten van een verouderde socket negeren: anders werken
        // binnenkomende wijzigingen dubbel.
        if (this.ws !== ws) return;
        this.lastInbound = Date.now();
        if (msg.type === "joined") {
          this.joined = msg.gardenId;
          this.setStatus("joined");
        }
        if (msg.type === "error" && msg.message.includes("toegang")) this.joined = null;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.ws = null;
      this.joined = null;
      this.lastError = `gesloten code ${ev.code}${ev.reason ? ` (${ev.reason})` : ""}`;
      this.setStatus(this.shouldRun ? "connecting" : "offline");
      if (!this.shouldRun) return;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => this.open(), this.reconnectDelay);
    };
  }

  /** Opnieuw verbinden (bv. vanaf het statusbolletje). Alleen connect():
      de socket is dan nog niet open en direct een join sturen gooit een
      fout op een CONNECTING socket - onopen stuurt de join al. */
  reconnect(): void {
    this.joined = null;
    this.setStatus("connecting");
    this.connect();
  }

  private send(msg: unknown): void {
    // send() op een CONNECTING socket gooit - nooit laten crashen, de
    // watchdog en join-retry herstellen het vanzelf.
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    } catch {
      /* socket weg: herstel volgt via watchdog/reconnect */
    }
  }
}

export const realtime = new RealtimeClient();
