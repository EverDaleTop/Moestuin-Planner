import type { Crop, Garden, User } from "./types";

const TOKEN_KEY = "mp_token";

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    unauthorizedHandler?.();
    throw new ApiError("Niet ingelogd.");
  }
  if (!res.ok) {
    let message = `Fout ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // no JSON body
    }
    throw new ApiError(message);
  }
  return res.json() as Promise<T>;
}

export interface MeResponse {
  user: User;
  gardens: Garden[];
  cropCatalog: Crop[];
  userNames: Record<string, string>;
}

export interface PublicUser {
  id: string;
  username: string;
}

export const api = {
  async register(username: string, password: string): Promise<{ user: User; token: string }> {
    return req("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    return req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<void> {
    try {
      await req("/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
    }
  },

  me(): Promise<MeResponse> {
    return req("/me");
  },

  putCatalog(cropCatalog: Crop[]): Promise<{ cropCatalog: Crop[] }> {
    return req("/catalog", {
      method: "PUT",
      body: JSON.stringify({ cropCatalog }),
    });
  },

  createGarden(name: string): Promise<Garden> {
    return req("/gardens", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  deleteGarden(gardenId: string): Promise<void> {
    return req(`/gardens/${encodeURIComponent(gardenId)}`, { method: "DELETE" });
  },

  getGarden(gardenId: string): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(gardenId)}`);
  },

  putGarden(garden: Garden): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(garden.id)}`, {
      method: "PUT",
      body: JSON.stringify(garden),
    });
  },

  share(gardenId: string, username: string): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(gardenId)}/share`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  },

  unshare(gardenId: string, userId: string): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(gardenId)}/share/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },

  /** Public preview for an invite link (name + owner). */
  getInvite(gardenId: string, token: string): Promise<{ garden: { id: string; name: string; ownerName: string } }> {
    return req(`/gardens/${encodeURIComponent(gardenId)}/invite?token=${encodeURIComponent(token)}`);
  },

  /** Join a shared garden through its invite link. */
  joinGarden(gardenId: string, token: string): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(gardenId)}/join`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  /** Generate a fresh invite link (owner only). */
  regenerateInvite(gardenId: string): Promise<Garden> {
    return req(`/gardens/${encodeURIComponent(gardenId)}/invite`, { method: "POST" });
  },
};

/** The copyable share URL for a garden. */
export function inviteUrl(garden: Garden): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, "");
  return `${base}/invite/${encodeURIComponent(garden.id)}/${encodeURIComponent(garden.inviteToken)}`;
}
