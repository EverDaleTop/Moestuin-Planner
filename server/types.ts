import type { Crop, Garden, User } from "../src/types.ts";

export interface StoredUser extends User {
  passwordHash: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
}

export interface Db {
  users: StoredUser[];
  sessions: Session[];
  cropCatalog: Crop[];
  gardens: Garden[];
}

export interface PublicUser extends User {}

export interface MeResponse {
  user: PublicUser;
  gardens: Garden[];
  cropCatalog: Crop[];
  /** username lookup for garden owners / shared members */
  userNames: Record<string, string>;
}

/** Transient preview shown on other editors' screens (a frame being drawn, a
 *  gaas line being dragged, …). Not persisted — replaced by the real commit. */
export type PreviewPayload =
  | { kind: "frame"; rect: { x: number; y: number; w: number; h: number } }
  | { kind: "gaas"; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: "clear" };

/** Room message broadcast over WebSocket. */
export type WsMessage =
  | { type: "joined"; gardenId: string }
  | { type: "garden"; garden: Garden }
  | { type: "move"; gardenId: string; updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number; crops?: { instanceId: string; cropId: string; rows: number; rowSpacing?: number; plantSpacing?: number; cols?: number; padding?: number; area?: { x: number; y: number; w: number; h: number } }[] }[] }
  | { type: "preview"; gardenId: string; preview: PreviewPayload }
  | { type: "presence"; gardenId: string; count: number }
  | { type: "error"; message: string };
