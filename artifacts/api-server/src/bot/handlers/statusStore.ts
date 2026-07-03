// In-memory cache of recent WhatsApp status updates seen by the bot,
// keyed by the poster's JID — used by `.grabstatus` to forward a status
// to the owner's DM on demand.
import type { WAMessage } from "@whiskeysockets/baileys";

const MAX_PER_USER = 5;
const statusCache = new Map<string, WAMessage[]>();

export function cacheStatusUpdate(msg: WAMessage): void {
  const poster = msg.key.participant ?? msg.key.remoteJid ?? "";
  if (!poster) return;
  const list = statusCache.get(poster) ?? [];
  list.unshift(msg);
  if (list.length > MAX_PER_USER) list.length = MAX_PER_USER;
  statusCache.set(poster, list);
}

export function getLatestStatus(jid: string): WAMessage | undefined {
  return statusCache.get(jid)?.[0];
}

export function getAllStatuses(jid: string): WAMessage[] {
  return statusCache.get(jid) ?? [];
}
