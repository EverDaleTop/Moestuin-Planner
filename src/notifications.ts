import type { Crop } from "./types";
import { upcomingSowStarts } from "./sowing";

export interface NotifyPrefs {
  /** browsermeldingen aan/uit */
  enabled: boolean;
  /** hoeveel dagen voor een zaaivenster waarschuwen */
  daysBefore: number;
}

const DEFAULTS: NotifyPrefs = { enabled: false, daysBefore: 7 };

function prefsKey(gardenId: string): string {
  return `mp_notify_${gardenId}`;
}

function sentKey(gardenId: string): string {
  return `mp_notified_${gardenId}`;
}

export function getNotifyPrefs(gardenId: string): NotifyPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(gardenId));
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<NotifyPrefs>;
    return {
      enabled: p.enabled === true,
      daysBefore:
        typeof p.daysBefore === "number" && p.daysBefore >= 0 && p.daysBefore <= 60
          ? Math.round(p.daysBefore)
          : DEFAULTS.daysBefore,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotifyPrefs(gardenId: string, prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(prefsKey(gardenId), JSON.stringify(prefs));
  } catch {
    // privaatmodus o.i.d.
  }
}

function readSent(gardenId: string): Record<string, true> {
  try {
    return (JSON.parse(localStorage.getItem(sentKey(gardenId)) ?? "{}") ?? {}) as Record<string, true>;
  } catch {
    return {};
  }
}

function markSent(gardenId: string, keys: string[]): void {
  try {
    const cur = readSent(gardenId);
    for (const k of keys) cur[k] = true;
    // hooguit een jaar historie bewaren
    const entries = Object.entries(cur).slice(-400);
    localStorage.setItem(sentKey(gardenId), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore
  }
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function sendNotification(title: string, body: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: `moestuin-${title}` });
  } catch {
    // ignore
  }
}

/**
 * Check reminders for one garden and push browser notifications for new ones.
 * Returns the upcoming reminders (also used for the in-app overview).
 * Safe to call often: every window notifies at most once (per garden+window).
 */
export function checkSowReminders(
  gardenId: string,
  catalog: Crop[],
  today: Date = new Date()
): { crop: Crop; date: Date; daysUntil: number; key: string }[] {
  const prefs = getNotifyPrefs(gardenId);
  const upcoming = upcomingSowStarts(catalog, today, prefs.daysBefore);
  if (!prefs.enabled || upcoming.length === 0) return upcoming;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return upcoming;
  }
  const sent = readSent(gardenId);
  const fresh = upcoming.filter((u) => !sent[u.key]);
  for (const u of fresh) {
    const when =
      u.daysUntil === 0
        ? "vanaf vandaag"
        : u.daysUntil === 1
          ? "vanaf morgen"
          : `over ${u.daysUntil} dagen`;
    sendNotification(
      `Zaaien: ${u.crop.name}`,
      `Het zaaivenster van ${u.crop.name} begint ${when}.`
    );
  }
  if (fresh.length > 0) markSent(gardenId, fresh.map((u) => u.key));
  return upcoming;
}
