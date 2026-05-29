import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { botOwnerJid, BOT_CONFIG } from "../config.js";
import { logger } from "../../lib/logger.js";

function resolveOwnerJid(): string | null {
  if (botOwnerJid) return botOwnerJid;
  if (BOT_CONFIG.ownerNumber) return `${BOT_CONFIG.ownerNumber}@s.whatsapp.net`;
  return null;
}

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
  const senderName = (msg as any).pushName
    ? `${(msg as any).pushName} (+${sender.split("@")[0]})`
    : `+${sender.split("@")[0]}`;
  const isGroup = from.endsWith("@g.us");

  let chatName = from;
  if (isGroup) {
    try { const m = await sock.groupMetadata(from); chatName = m.subject; } catch {}
  } else {
    chatName = `+${from.split("@")[0]}`;
  }

  const header =
    `👁️ *View-Once Captured!*\n\n` +
    `👤 *Sender:* ${senderName}\n` +
    `📍 ${isGroup ? `Group: ${chatName}` : `Private Chat`}\n` +
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
      } as any);
    } else {
      await sock.sendMessage(ownerJid, { text: header + "\n\n📎 View-once media (unsupported type)." });
    }
  } catch (err) {
    logger.error({ err }, "Failed to forward view-once");
    try {
      await sock.sendMessage(ownerJid, { text: header + "\n\n⚠️ Could not download the view-once media." });
    } catch {}
  }
}

// ── Shared logic for .vv / .vv2 ──────────────────────────────────────────────
async function revealViewOnce(
  sock: WASocket,
  msg: WAMessage,
  targetJid: string,
  label: string
) {
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!ctxInfo?.quotedMessage) {
    await sock.sendMessage(msg.key.remoteJid!, {
      text: `📎 *Reply to a view-once message* with *${label}* to reveal it.`,
    }, { quoted: msg });
    return;
  }

  const quotedMessage = ctxInfo.quotedMessage;
  const inner =
    quotedMessage.viewOnceMessage?.message ??
    quotedMessage.viewOnceMessageV2?.message ??
    quotedMessage.viewOnceMessageV2Extension?.message ??
    quotedMessage;

  const hasMedia =
    inner.imageMessage || inner.videoMessage || inner.audioMessage ||
    quotedMessage.imageMessage || quotedMessage.videoMessage || quotedMessage.audioMessage;

  if (!hasMedia) {
    await sock.sendMessage(msg.key.remoteJid!, {
      text: "❌ That doesn't look like a view-once message. Reply *directly* to the view-once.",
    }, { quoted: msg });
    return;
  }

  const fakeMsg: WAMessage = {
    key: {
      remoteJid: msg.key.remoteJid!,
      fromMe: false,
      id: ctxInfo.stanzaId ?? "",
      participant: ctxInfo.participant,
    },
    message: quotedMessage,
    messageTimestamp: Date.now(),
  };

  try {
    const buffer = (await downloadMediaMessage(fakeMsg, "buffer", {})) as Buffer;
    const resolved = inner;

    if (resolved.imageMessage || quotedMessage.imageMessage) {
      const caption = (resolved.imageMessage ?? (quotedMessage as any).imageMessage)?.caption ?? "";
      await sock.sendMessage(targetJid, {
        image: buffer,
        caption: `👁️ *View-Once Revealed!* 🔓${caption ? `\n_"${caption}"_` : ""}`,
      }, { quoted: label === ".vv" ? msg : undefined });

    } else if (resolved.videoMessage || quotedMessage.videoMessage) {
      const caption = (resolved.videoMessage ?? (quotedMessage as any).videoMessage)?.caption ?? "";
      await sock.sendMessage(targetJid, {
        video: buffer,
        caption: `👁️ *View-Once Revealed!* 🔓${caption ? `\n_"${caption}"_` : ""}`,
      }, { quoted: label === ".vv" ? msg : undefined });

    } else if (resolved.audioMessage || quotedMessage.audioMessage) {
      await sock.sendMessage(targetJid, {
        audio: buffer,
        mimetype: "audio/mp4",
      } as any, { quoted: label === ".vv" ? msg : undefined });
    }

    await react(sock, msg, "✅");

  } catch (err) {
    logger.error({ err }, `${label} download failed`);
    await react(sock, msg, "❌");
    await sock.sendMessage(msg.key.remoteJid!, {
      text: "❌ Could not reveal the view-once — it may have already expired.",
    }, { quoted: msg });
  }
}

// ── .vv — reveal in the current chat ─────────────────────────────────────────
export async function handleVVCommand(sock: WASocket, msg: WAMessage) {
  await revealViewOnce(sock, msg, msg.key.remoteJid!, ".vv");
}

// ── .vv2 — reveal and send to owner's DM ─────────────────────────────────────
export async function handleVV2Command(sock: WASocket, msg: WAMessage) {
  const ownerJid = resolveOwnerJid();
  if (!ownerJid) {
    await sock.sendMessage(msg.key.remoteJid!, {
      text: "❌ No owner set. Use `.setowner [number]` first.",
    }, { quoted: msg });
    return;
  }
  await revealViewOnce(sock, msg, ownerJid, ".vv2");
  if (ownerJid !== msg.key.remoteJid!) {
    await sock.sendMessage(msg.key.remoteJid!, {
      text: "✅ *View-once sent to your DM!*",
    }, { quoted: msg });
  }
}
