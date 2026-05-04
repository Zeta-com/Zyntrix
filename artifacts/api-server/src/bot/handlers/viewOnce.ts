import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { botOwnerJid, BOT_CONFIG } from "../config.js";
import { logger } from "../../lib/logger.js";

function resolveOwnerJid(): string | null {
  if (botOwnerJid) return botOwnerJid;
  if (BOT_CONFIG.ownerNumber) return `${BOT_CONFIG.ownerNumber}@s.whatsapp.net`;
  return null;
}

// ── React helper ─────────────────────────────────────────────────────────────
async function react(sock: WASocket, msg: WAMessage, emoji: string) {
  try {
    await sock.sendMessage(msg.key.remoteJid!, {
      react: { text: emoji, key: msg.key },
    } as any);
  } catch {}
}

// ── Auto-forward view-once to owner on detection ─────────────────────────────
export async function handleViewOnce(sock: WASocket, msg: WAMessage) {
  const ownerJid = resolveOwnerJid();
  if (!ownerJid) {
    logger.warn("No owner set — cannot forward view-once media");
    return;
  }

  const from = msg.key.remoteJid ?? "";
  const sender = msg.key.participant ?? msg.key.remoteJid ?? "";
  const senderName = sender.split("@")[0] ?? "Unknown";
  const isGroup = from.endsWith("@g.us");

  const header =
    `👁️ *View-Once Captured!*\n\n` +
    `👤 *Sender:* +${senderName}\n` +
    `📍 ${isGroup ? `Group: ${from.split("@")[0]}` : "Private Chat"}\n` +
    `⏰ ${new Date().toLocaleString()}`;

  const viewOnceMsg =
    msg.message?.viewOnceMessage?.message ??
    msg.message?.viewOnceMessageV2?.message ??
    msg.message?.viewOnceMessageV2Extension?.message;

  if (!viewOnceMsg) return;

  try {
    const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
    await sock.sendMessage(ownerJid, { text: header });

    if (viewOnceMsg.imageMessage) {
      await sock.sendMessage(ownerJid, {
        image: buffer,
        caption: `👁️ View-once image${viewOnceMsg.imageMessage.caption ? `\n"${viewOnceMsg.imageMessage.caption}"` : ""}`,
      });
    } else if (viewOnceMsg.videoMessage) {
      await sock.sendMessage(ownerJid, {
        video: buffer,
        caption: `👁️ View-once video${viewOnceMsg.videoMessage.caption ? `\n"${viewOnceMsg.videoMessage.caption}"` : ""}`,
      });
    } else if (viewOnceMsg.audioMessage) {
      await sock.sendMessage(ownerJid, {
        audio: buffer,
        mimetype: "audio/mp4",
        caption: `👁️ View-once audio`,
      } as any);
    } else {
      await sock.sendMessage(ownerJid, {
        text: header + "\n\n📎 View-once media (unsupported type).",
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to forward view-once");
    try {
      await sock.sendMessage(ownerJid, {
        text: header + "\n\n⚠️ Could not download the view-once media (encryption/expiry).",
      });
    } catch {}
  }
}

// ── .vv command: reply to a view-once to reveal it ───────────────────────────
export async function handleVVCommand(sock: WASocket, msg: WAMessage) {
  const chatJid = msg.key.remoteJid!;
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!ctxInfo?.quotedMessage) {
    await sock.sendMessage(chatJid, {
      text: "📎 *Reply to a view-once message* (image, video or audio) with *.vv* to reveal it.",
    }, { quoted: msg });
    return;
  }

  const quotedMessage = ctxInfo.quotedMessage;

  // Determine the real inner message (may be nested under viewOnce wrapper)
  const inner =
    quotedMessage.viewOnceMessage?.message ??
    quotedMessage.viewOnceMessageV2?.message ??
    quotedMessage.viewOnceMessageV2Extension?.message ??
    quotedMessage;

  const hasMedia =
    inner.imageMessage || inner.videoMessage || inner.audioMessage ||
    quotedMessage.imageMessage || quotedMessage.videoMessage || quotedMessage.audioMessage;

  if (!hasMedia) {
    await sock.sendMessage(chatJid, {
      text: "❌ That doesn't look like a view-once message. Reply *directly* to the view-once.",
    }, { quoted: msg });
    return;
  }

  // Build a fake WAMessage so downloadMediaMessage can work
  const fakeMsg: WAMessage = {
    key: {
      remoteJid: chatJid,
      fromMe: false,
      id: ctxInfo.stanzaId ?? "",
      participant: ctxInfo.participant,
    },
    message: quotedMessage,
    messageTimestamp: Date.now(),
  };

  try {
    const buffer = (await downloadMediaMessage(fakeMsg, "buffer", {})) as Buffer;
    const resolved = inner.imageMessage
      ? inner
      : inner.videoMessage
      ? inner
      : inner.audioMessage
      ? inner
      : quotedMessage;

    if (resolved.imageMessage || quotedMessage.imageMessage) {
      const caption = (resolved.imageMessage ?? (quotedMessage as any).imageMessage)?.caption ?? "";
      await sock.sendMessage(chatJid, {
        image: buffer,
        caption: `👁️ *View-Once Revealed!* 🔓${caption ? `\n_"${caption}"_` : ""}`,
      }, { quoted: msg });

    } else if (resolved.videoMessage || quotedMessage.videoMessage) {
      const caption = (resolved.videoMessage ?? (quotedMessage as any).videoMessage)?.caption ?? "";
      await sock.sendMessage(chatJid, {
        video: buffer,
        caption: `👁️ *View-Once Revealed!* 🔓${caption ? `\n_"${caption}"_` : ""}`,
      }, { quoted: msg });

    } else if (resolved.audioMessage || quotedMessage.audioMessage) {
      await sock.sendMessage(chatJid, {
        audio: buffer,
        mimetype: "audio/mp4",
      } as any, { quoted: msg });
    }

    // React ✅ on success
    await react(sock, msg, "✅");

  } catch (err) {
    logger.error({ err }, ".vv download failed");
    await react(sock, msg, "❌");
    await sock.sendMessage(chatJid, {
      text: "❌ Could not reveal the view-once — it may have already expired.",
    }, { quoted: msg });
  }
}
