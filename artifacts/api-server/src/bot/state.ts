// Shared runtime state — avoids circular imports between index.ts and commands.ts
import fs from "fs";
import path from "path";

export let fakeTypeMode = false;
export let fakeRecordMode = false;

const DATA_DIR = "./data";
const CHATBOT_FILE    = path.join(DATA_DIR, "chatbot.json");
const ANTIDELETE_FILE = path.join(DATA_DIR, "antidelete.json");

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

// chatbot: per-JID auto-reply toggle — persisted to disk
export const chatbotChats: Set<string> = loadJsonSet(CHATBOT_FILE);

// antidelete: per-JID deleted-message spy toggle — persisted to disk
export const antideleteChats: Set<string> = loadJsonSet(ANTIDELETE_FILE);

export function setFakeType(v: boolean) { fakeTypeMode = v; }
export function setFakeRecord(v: boolean) { fakeRecordMode = v; }

export function setChatbot(jid: string, on: boolean) {
  if (on) chatbotChats.add(jid);
  else chatbotChats.delete(jid);
  saveJsonSet(CHATBOT_FILE, chatbotChats);
}
export function isChatbotOn(jid: string) { return chatbotChats.has(jid); }

export function setAntidelete(jid: string, on: boolean) {
  if (on) antideleteChats.add(jid);
  else antideleteChats.delete(jid);
  saveJsonSet(ANTIDELETE_FILE, antideleteChats);
}
export function isAntideleteOn(jid: string) { return antideleteChats.has(jid); }
