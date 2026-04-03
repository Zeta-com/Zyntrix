import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { botOwnerJid, BOT_CONFIG } from "../config.js";
import { logger } from "../../lib/logger.js";

function resolveOwnerJid(): string | null {
  if (botOwnerJid) return botOwnerJid;
  if (BOT_CONFIG.ownerNumber) return `${BOT_CONFIG.ownerNumber}@s.whatsapp.net`;
  return null;
}

// ── Auto-forward view-once to owner on detection ──────────────────────────────
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

// ── .vv command: reply to a view-once to unlock it ──────────────────────────
export async function handleVVCommand(sock: WASocket, msg: WAMessage) {
  const jid = msg.key.remoteJid!;
  const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!quotedInfo?.quotedMessage) {
    await sock.sendMessage(jid, {
      text: "📎 *Reply to a view-once message* with *.vv* to reveal the media.",
    }, { quoted: msg });
    return;
  }

  const quotedMsg = quotedInfo.quotedMessage;

  const viewOnceInner =
    quotedMsg.viewOnceMessage?.message ??
    quotedMsg.viewOnceMessageV2?.message ??
    quotedMsg.viewOnceMessageV2Extension?.message;

  const hasMedia = viewOnceInner?.imageMessage || viewOnceInner?.videoMessage ||
                   quotedMsg.imageMessage || quotedMsg.videoMessage;

  if (!hasMedia) {
    await sock.sendMessage(jid, {
      text: "❌ That doesn't look like a view-once message. Reply *directly* to the view-once.",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { text: "⏳ *Unlocking view-once...*" }, { quoted: msg });

  try {
    // Build a synthetic WAMessage to use downloadMediaMessage
    const fakeMsg: WAMessage = {
      key: {
        remoteJid: jid,
        fromMe: false,
        id: quotedInfo.stanzaId ?? "",
        participant: quotedInfo.participant,
      },
      message: quotedMsg,
      messageTimestamp: Date.now(),
    };

    const buffer = (await downloadMediaMessage(fakeMsg, "buffer", {})) as Buffer;

    const inner = viewOnceInner ?? quotedMsg;

    if (inner.imageMessage) {
      await sock.sendMessage(jid, {
        image: buffer,
        caption:
          `👁️ *View-Once Unlocked!* 🔓` +
          (inner.imageMessage.caption ? `\n_"${inner.imageMessage.caption}"_` : ""),
      }, { quoted: msg });
    } else if (inner.videoMessage) {
      await sock.sendMessage(jid, {
        video: buffer,
        caption:
          `👁️ *View-Once Unlocked!* 🔓` +
          (inner.videoMessage.caption ? `\n_"${inner.videoMessage.caption}"_` : ""),
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, {
        document: buffer,
        mimetype: "application/octet-stream",
        fileName: "view_once_media",
        caption: "👁️ *View-Once Unlocked!* 🔓",
      }, { quoted: msg });
    }
  } catch (err) {
    logger.error({ err }, ".vv download failed");
    await sock.sendMessage(jid, {
      text: "❌ Could not unlock the view-once — it may have already been viewed or expired.",
    }, { quoted: msg });
  }
}
