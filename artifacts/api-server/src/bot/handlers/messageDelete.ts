import type { WASocket, WAMessage, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { addDeletedMessage } from "../store.js";
import { BOT_CONFIG } from "../config.js";
import { isAntideleteOn } from "../state.js";
import { logger } from "../../lib/logger.js";

const messageCache = new Map<string, WAMessage>();

export function cacheMessage(msg: WAMessage) {
  const id = msg.key.id;
  if (!id) return;
  messageCache.set(id, msg);
  // Keep last 1000 messages in memory
  if (messageCache.size > 1000) {
    const firstKey = messageCache.keys().next().value;
    if (firstKey) messageCache.delete(firstKey);
  }
}

export async function handleDeletedMessage(
  sock: WASocket,
  update: { keys: proto.IMessageKey[] }
) {
  for (const key of update.keys) {
    const cached = key.id ? messageCache.get(key.id) : null;
    if (!cached) continue;

    const chatJid  = cached.key.remoteJid ?? "";
    const sender   = cached.key.participant ?? cached.key.remoteJid ?? "";
    const senderNum = sender.split("@")[0] ?? "Unknown";

    // Pull display name from push-name if available
    const senderName = (cached as any).pushName
      ? `${(cached as any).pushName} (+${senderNum})`
      : `+${senderNum}`;

    const isGroup = chatJid.endsWith("@g.us");

    // Resolve group name if possible
    let chatName = chatJid;
    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(chatJid);
        chatName = meta.subject ?? chatJid;
      } catch {}
    } else {
      chatName = `+${chatJid.split("@")[0]}`;
    }

    // Extract message content
    const text =
      cached.message?.conversation ??
      cached.message?.extendedTextMessage?.text ??
      cached.message?.imageMessage?.caption ??
      cached.message?.videoMessage?.caption ??
      "";

    let mediaType: string | undefined;
    if (cached.message?.imageMessage)    mediaType = "image";
    else if (cached.message?.videoMessage)   mediaType = "video";
    else if (cached.message?.audioMessage)   mediaType = "audio";
    else if (cached.message?.documentMessage) mediaType = "document";
    else if (cached.message?.stickerMessage) mediaType = "sticker";

    addDeletedMessage({ from: chatJid, sender: senderName, text, timestamp: Date.now(), mediaType });

    const timeStr = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    const locationLine = isGroup
      ? `📍 *Group:* ${chatName}`
      : `📍 *Chat:* ${chatName}`;

    let body = `🗑️ *AntiDelete Alert!*\n\n` +
      `👤 *From:* ${senderName}\n` +
      `${locationLine}\n` +
      `⏰ *Time:* ${timeStr}\n\n`;

    if (text) {
      body += `💬 *Deleted message:*\n"${text}"`;
    } else if (mediaType) {
      body += `📎 *Deleted content:* ${mediaType}`;
    } else {
      body += `📎 *Deleted content:* (unknown type)`;
    }

    // ── Post to the chat where deletion happened (if antidelete is on) ─────
    if (isAntideleteOn(chatJid)) {
      try {
        // Try to resend media if available
        if (mediaType && (cached.message?.imageMessage || cached.message?.videoMessage || cached.message?.audioMessage)) {
          try {
            const buf = (await downloadMediaMessage(cached, "buffer", {})) as Buffer;
            if (cached.message?.imageMessage) {
              await sock.sendMessage(chatJid, { image: buf, caption: body } as any);
            } else if (cached.message?.videoMessage) {
              await sock.sendMessage(chatJid, { video: buf, caption: body } as any);
            } else if (cached.message?.audioMessage) {
              await sock.sendMessage(chatJid, { text: body });
              await sock.sendMessage(chatJid, { audio: buf, mimetype: "audio/mp4" } as any);
            }
          } catch {
            await sock.sendMessage(chatJid, { text: body });
          }
        } else {
          await sock.sendMessage(chatJid, { text: body });
        }
      } catch (err) {
        logger.error({ err }, "Failed to post antidelete notification to chat");
      }
    }

    // ── Always DM the owner (if set) ──────────────────────────────────────
    const ownerJid = BOT_CONFIG.ownerNumber
      ? `${BOT_CONFIG.ownerNumber}@s.whatsapp.net`
      : null;

    if (ownerJid && ownerJid !== chatJid) {
      try {
        if (mediaType && (cached.message?.imageMessage || cached.message?.videoMessage || cached.message?.audioMessage)) {
          try {
            const buf = (await downloadMediaMessage(cached, "buffer", {})) as Buffer;
            if (cached.message?.imageMessage) {
              await sock.sendMessage(ownerJid, { image: buf, caption: body } as any);
            } else if (cached.message?.videoMessage) {
              await sock.sendMessage(ownerJid, { video: buf, caption: body } as any);
            } else if (cached.message?.audioMessage) {
              await sock.sendMessage(ownerJid, { text: body });
              await sock.sendMessage(ownerJid, { audio: buf, mimetype: "audio/mp4" } as any);
            }
          } catch {
            await sock.sendMessage(ownerJid, { text: body });
          }
        } else {
          await sock.sendMessage(ownerJid, { text: body });
        }
      } catch (err) {
        logger.error({ err }, "Failed to DM owner deleted message");
      }
    }
  }
}
