// Shared runtime state — avoids circular imports between index.ts and commands.ts
import fs from "fs";
import path from "path";

export let fakeTypeMode = false;
export let fakeRecordMode = false;

// ── Chatbot persistence ───────────────────────────────────────────────────────
const DATA_DIR = "./data";
const CHATBOT_FILE = path.join(DATA_DIR, "chatbot.json");

function loadChatbotState(): Set<string> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(CHATBOT_FILE)) {
      const raw = fs.readFileSync(CHATBOT_FILE, "utf-8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set<string>(arr);
    }
  } catch {}
  return new Set<string>();
}

function saveChatbotState(set: Set<string>) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CHATBOT_FILE, JSON.stringify([...set]), "utf-8");
  } catch {}
}

// chatbot: set of JIDs where auto-reply is active — persisted to disk
export const chatbotChats: Set<string> = loadChatbotState();

export function setFakeType(v: boolean) { fakeTypeMode = v; }
export function setFakeRecord(v: boolean) { fakeRecordMode = v; }

export function setChatbot(jid: string, on: boolean) {
  if (on) chatbotChats.add(jid);
  else chatbotChats.delete(jid);
  saveChatbotState(chatbotChats);
}
export function isChatbotOn(jid: string) { return chatbotChats.has(jid); }
