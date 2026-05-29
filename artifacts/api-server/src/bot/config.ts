export const BOT_CONFIG = {
  prefix: ".",
  ownerNumber: process.env["OWNER_NUMBER"] ?? "",
  botName: process.env["BOT_NAME"] ?? "WhatsBot",
  sessionDir: "./session",
  // Newsletter channel JID: 120363424876568536@newsletter
  channelUrl: "https://whatsapp.com/channel/120363424876568536",
  channelJid: "120363424876568536@newsletter",
};

export let isPublicMode = true;

export let botOwnerJid = "";
export let botOwnerName = "Owner";

export function setPublicMode(mode: boolean) {
  isPublicMode = mode;
}

export function setBotOwnerJid(jid: string) {
  botOwnerJid = jid.replace(/:\d+/, "");
  console.log(`[Bot] Owner JID set: ${botOwnerJid}`);
}

export function setOwnerNumber(number: string, name?: string) {
  const clean = number.replace(/[^0-9]/g, "");
  botOwnerJid = `${clean}@s.whatsapp.net`;
  if (name) botOwnerName = name;
  console.log(`[Bot] Owner manually set: ${botOwnerJid}`);
}

export function isOwnerJid(jid: string): boolean {
  if (!botOwnerJid && !BOT_CONFIG.ownerNumber) return true;
  const clean = jid.replace(/:\d+/, "");
  if (botOwnerJid && clean === botOwnerJid) return true;
  if (BOT_CONFIG.ownerNumber && clean.includes(BOT_CONFIG.ownerNumber)) return true;
  return false;
}
