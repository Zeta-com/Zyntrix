// Shared runtime state — avoids circular imports between index.ts and commands.ts
import fs from "fs";
import path from "path";

export let fakeTypeMode = false;
export let fakeRecordMode = false;

const DATA_DIR = "./data";
const CHATBOT_FILE      = path.join(DATA_DIR, "chatbot.json");
const ANTIDELETE_FILE   = path.join(DATA_DIR, "antidelete.json");
const WARN_FILE         = path.join(DATA_DIR, "warns.json");
const GROUPGUARD_FILE   = path.join(DATA_DIR, "groupguard.json");
const AUTORESPOND_FILE  = path.join(DATA_DIR, "autorespond.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJsonSet(file: string): Set<string> {
  try {
    ensureDataDir();
    if (fs.existsSync(file)) {
      const arr = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (Array.isArray(arr)) return new Set<string>(arr);
    }
  } catch {}
  return new Set<string>();
}

function saveJsonSet(file: string, set: Set<string>) {
  try {
    ensureDataDir();
    fs.writeFileSync(file, JSON.stringify([...set]), "utf-8");
  } catch {}
}

function loadJsonMap<T>(file: string): Map<string, T> {
  try {
    ensureDataDir();
    if (fs.existsSync(file)) {
      const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
      return new Map(Object.entries(obj));
    }
  } catch {}
  return new Map();
}

function saveJsonMap<T>(file: string, map: Map<string, T>) {
  try {
    ensureDataDir();
    const obj: Record<string, T> = {};
    map.forEach((v, k) => { obj[k] = v; });
    fs.writeFileSync(file, JSON.stringify(obj), "utf-8");
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot: per-JID auto-reply toggle — persisted to disk
// ─────────────────────────────────────────────────────────────────────────────
export const chatbotChats: Set<string> = loadJsonSet(CHATBOT_FILE);

export function setFakeType(v: boolean) { fakeTypeMode = v; }
export function setFakeRecord(v: boolean) { fakeRecordMode = v; }

export function setChatbot(jid: string, on: boolean) {
  if (on) chatbotChats.add(jid);
  else chatbotChats.delete(jid);
  saveJsonSet(CHATBOT_FILE, chatbotChats);
}
export function isChatbotOn(jid: string) { return chatbotChats.has(jid); }

// ─────────────────────────────────────────────────────────────────────────────
// Antidelete: per-JID deleted-message spy toggle — persisted to disk
// ─────────────────────────────────────────────────────────────────────────────
export const antideleteChats: Set<string> = loadJsonSet(ANTIDELETE_FILE);

export function setAntidelete(jid: string, on: boolean) {
  if (on) antideleteChats.add(jid);
  else antideleteChats.delete(jid);
  saveJsonSet(ANTIDELETE_FILE, antideleteChats);
}
export function isAntideleteOn(jid: string) { return antideleteChats.has(jid); }

// ─────────────────────────────────────────────────────────────────────────────
// Warn system: per (group:user) warning count
// ─────────────────────────────────────────────────────────────────────────────
export const MAX_WARNS = 3;
const _warnCounts: Map<string, number> = loadJsonMap<number>(WARN_FILE);

function warnKey(groupJid: string, userJid: string) { return `${groupJid}:${userJid}`; }

export function addWarn(groupJid: string, userJid: string): number {
  const key = warnKey(groupJid, userJid);
  const count = (_warnCounts.get(key) ?? 0) + 1;
  _warnCounts.set(key, count);
  saveJsonMap(WARN_FILE, _warnCounts);
  return count;
}

export function getWarns(groupJid: string, userJid: string): number {
  return _warnCounts.get(warnKey(groupJid, userJid)) ?? 0;
}

export function clearWarns(groupJid: string, userJid: string): void {
  _warnCounts.delete(warnKey(groupJid, userJid));
  saveJsonMap(WARN_FILE, _warnCounts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Group guard: antilink, antispam, antibot, welcome, goodbye — per group
// ─────────────────────────────────────────────────────────────────────────────
export interface GroupGuard {
  antilink: boolean;
  antispam: boolean;
  antibot: boolean;
  welcome: boolean;
  welcomeMsg: string;
  goodbye: boolean;
  goodbyeMsg: string;
}

const DEFAULT_GUARD: GroupGuard = {
  antilink: false,
  antispam: false,
  antibot: false,
  welcome: false,
  welcomeMsg: "👋 Welcome to the group, {name}! 🎉",
  goodbye: false,
  goodbyeMsg: "👋 Goodbye {name}! We'll miss you.",
};

const _groupGuard: Map<string, GroupGuard> = (() => {
  const raw = loadJsonMap<GroupGuard>(GROUPGUARD_FILE);
  return raw;
})();

export function getGroupGuard(groupJid: string): GroupGuard {
  if (!_groupGuard.has(groupJid)) {
    _groupGuard.set(groupJid, { ...DEFAULT_GUARD });
  }
  return _groupGuard.get(groupJid)!;
}

export function updateGroupGuard(groupJid: string, patch: Partial<GroupGuard>): void {
  const current = getGroupGuard(groupJid);
  _groupGuard.set(groupJid, { ...current, ...patch });
  saveJsonMap(GROUPGUARD_FILE, _groupGuard);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message counts: for groupstats / topchatters — in-memory only (resets on restart)
// ─────────────────────────────────────────────────────────────────────────────
const _msgCounts = new Map<string, number>(); // `${groupJid}:${userJid}` → count
const _msgNames  = new Map<string, string>();  // `${groupJid}:${userJid}` → display name

export function recordMessage(groupJid: string, userJid: string, displayName: string): void {
  const key = `${groupJid}:${userJid}`;
  _msgCounts.set(key, (_msgCounts.get(key) ?? 0) + 1);
  _msgNames.set(key, displayName);
}

export interface ChatEntry { jid: string; name: string; count: number; }

export function getTopChatters(groupJid: string, top = 10): ChatEntry[] {
  const results: ChatEntry[] = [];
  _msgCounts.forEach((count, key) => {
    if (key.startsWith(groupJid + ":")) {
      const userJid = key.slice(groupJid.length + 1);
      results.push({ jid: userJid, name: _msgNames.get(key) ?? userJid.split("@")[0], count });
    }
  });
  return results.sort((a, b) => b.count - a.count).slice(0, top);
}

export function getGroupMsgCount(groupJid: string): number {
  let total = 0;
  _msgCounts.forEach((count, key) => {
    if (key.startsWith(groupJid + ":")) total += count;
  });
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spam tracking: per (group:user) — in-memory timestamps
// ─────────────────────────────────────────────────────────────────────────────
const SPAM_WINDOW_MS = 5000; // 5 seconds window
const SPAM_THRESHOLD  = 5;   // messages in window before flagged
const _spamTrack = new Map<string, number[]>();

export function trackSpam(groupJid: string, userJid: string): boolean {
  const key = `${groupJid}:${userJid}`;
  const now = Date.now();
  const timestamps = (_spamTrack.get(key) ?? []).filter(t => now - t < SPAM_WINDOW_MS);
  timestamps.push(now);
  _spamTrack.set(key, timestamps);
  return timestamps.length >= SPAM_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-respond: keyword → reply per group — persisted to disk
// ─────────────────────────────────────────────────────────────────────────────
const _autoRespond = new Map<string, Record<string, string>>();

// Load from disk
(() => {
  const raw = loadJsonMap<Record<string, string>>(AUTORESPOND_FILE);
  raw.forEach((v, k) => _autoRespond.set(k, v));
})();

export function getAutoRespondKeywords(groupJid: string): Record<string, string> {
  return _autoRespond.get(groupJid) ?? {};
}

export function setAutoRespond(groupJid: string, keyword: string, response: string): void {
  const current = _autoRespond.get(groupJid) ?? {};
  current[keyword.toLowerCase()] = response;
  _autoRespond.set(groupJid, current);
  saveJsonMap(AUTORESPOND_FILE, _autoRespond);
}

export function removeAutoRespond(groupJid: string, keyword: string): boolean {
  const current = _autoRespond.get(groupJid) ?? {};
  if (!(keyword.toLowerCase() in current)) return false;
  delete current[keyword.toLowerCase()];
  _autoRespond.set(groupJid, current);
  saveJsonMap(AUTORESPOND_FILE, _autoRespond);
  return true;
}

export function checkAutoRespond(groupJid: string, text: string): string | null {
  const keywords = _autoRespond.get(groupJid);
  if (!keywords) return null;
  const lower = text.toLowerCase();
  for (const [kw, reply] of Object.entries(keywords)) {
    if (lower.includes(kw)) return reply;
  }
  return null;
}
