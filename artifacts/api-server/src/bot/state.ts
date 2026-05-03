// Shared runtime state — avoids circular imports between index.ts and commands.ts

export let fakeTypeMode = false;
export let fakeRecordMode = false;

// chatbot: set of JIDs where Meta AI auto-reply is active
export const chatbotChats = new Set<string>();

export function setFakeType(v: boolean) { fakeTypeMode = v; }
export function setFakeRecord(v: boolean) { fakeRecordMode = v; }

export function setChatbot(jid: string, on: boolean) {
  if (on) chatbotChats.add(jid);
  else chatbotChats.delete(jid);
}
export function isChatbotOn(jid: string) { return chatbotChats.has(jid); }
