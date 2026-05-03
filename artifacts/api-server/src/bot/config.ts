export const BOT_CONFIG = {
  prefix: ".",
  ownerNumber: process.env["OWNER_NUMBER"] ?? "",
  botName: process.env["BOT_NAME"] ?? "WhatsBot",
  sessionDir: "./session",
  channelUrl: "https://whatsapp.com/channel/0029VbCFEZv60eBdlqXqQz20",
};

export let isPublicMode = true;

// Auto-set when the bot connects — stores the bot's own JID as owner
export let botOwnerJid = "";

export function setPublicMode(mode: boolean) {
  isPublicMode = mode;
}

export function setBotOwnerJid(jid: string) {
  // Normalize: remove device suffix (e.g. 234xxx:12@s.whatsapp.net → 234xxx@s.whatsapp.net)
  botOwnerJid = jid.replace(/:\d+/, "");
  console.log(`[Bot] Owner auto-detected: ${botOwnerJid}`);
}

export function isOwnerJid(jid: string): boolean {
  if (!botOwnerJid && !BOT_CONFIG.ownerNumber) return true; // No owner set → treat all as owner
  const clean = jid.replace(/:\d+/, "");
  if (botOwnerJid && clean === botOwnerJid) return true;
  if (BOT_CONFIG.ownerNumber && clean.includes(BOT_CONFIG.ownerNumber)) return true;
  return false;
}
