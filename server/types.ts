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

/** Room message broadcast over WebSocket. */
export type WsMessage =
  | { type: "joined"; gardenId: string }
  | { type: "garden"; garden: Garden }
  | { type: "move"; gardenId: string; updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number }[] }
  | { type: "presence"; gardenId: string; count: number }
  | { type: "error"; message: string };
