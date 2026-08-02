import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage, jidNormalizedUser } from "@whiskeysockets/baileys";
import { logger } from "../../lib/logger.js";
import { botOwnerJid, BOT_CONFIG } from "../config.js";
import { getLatestStatus } from "./statusStore.js";

function resolveOwnerJid(sock: WASocket): string | null {
  if (botOwnerJid) return botOwnerJid;
  if (BOT_CONFIG.ownerNumber) return `${BOT_CONFIG.ownerNumber}@s.whatsapp.net`;
  if (sock.user?.id) return jidNormalizedUser(sock.user.id);
  return null;
}

// ── Forward a status message (image, video, or text) to the owner DM ─────────
async function forwardStatusToOwner(
  sock: WASocket,
  statusMsg: any,
  label: string,
  ownerJid: string
): Promise<void> {
  const content = statusMsg.message;

  if (content?.imageMessage) {
    const buf = (await downloadMediaMessage(statusMsg, "buffer", {})) as Buffer;
    const cap = content.imageMessage.caption;
    await sock.sendMessage(ownerJid, {
      image: buf,
      caption: cap ? `${label}\n\n${cap}` : label,
    });
  } else if (content?.videoMessage) {
    const buf = (await downloadMediaMessage(statusMsg, "buffer", {})) as Buffer;
    const cap = content.videoMessage.caption;
    await sock.sendMessage(ownerJid, {
      video: buf,
      caption: cap ? `${label}\n\n${cap}` : label,
    });
  } else {
    const text =
      content?.extendedTextMessage?.text ??
      content?.conversation ??
      "";
    if (!text) throw new Error("Unsupported or empty status format");
    await sock.sendMessage(ownerJid, { text: `${label}\n\n📝 ${text}` });
  }
}

// ── Grab a target's latest cached WhatsApp status and DM it to the owner ─────
// V2: also handles "reply-to-status" mode — when you open someone's status
// and reply to it with .grabstatus, the bot grabs THAT specific status post.
export async function handleGrabStatus(
  sock: WASocket,
  msg: WAMessage,
  target?: string
): Promise<void> {
  const jid = msg.key.remoteJid ?? "";

  const ownerJid = resolveOwnerJid(sock);
  if (!ownerJid) {
    await sock.sendMessage(jid, {
      text: "❌ No owner configured — can't determine where to send it.",
    }, { quoted: msg });
    return;
  }

  // ── Mode 1: Reply-to-status ─────────────────────────────────────────────
  // When you open someone's status and reply, WhatsApp embeds the status
  // in contextInfo.quotedMessage with contextInfo.remoteJid = "status@broadcast"
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
  const isStatusReply = ctxInfo?.remoteJid === "status@broadcast" && !!ctxInfo?.quotedMessage;

  if (isStatusReply) {
    const posterJid = ctxInfo!.participant ?? ctxInfo!.remoteJid ?? "";
    const posterNumber = posterJid.split("@")[0];
    const label = `📸 *Status grabbed from* +${posterNumber}`;

    // Reconstruct the status message so we can download from it
    const fakeStatusMsg: any = {
      key: {
        remoteJid: "status@broadcast",
        id: ctxInfo!.stanzaId ?? "",
        participant: ctxInfo!.participant,
        fromMe: false,
      },
      message: ctxInfo!.quotedMessage,
    };

    try {
      await forwardStatusToOwner(sock, fakeStatusMsg, label, ownerJid);
      await sock.sendMessage(jid, {
        text: `✅ *Status grabbed and sent to owner DM!*\n_From: +${posterNumber}_`,
      }, { quoted: msg });
    } catch (err: any) {
      logger.error({ err }, "Error grabbing replied-to status");
      // Fall back to text if media download fails
      const fallbackText =
        ctxInfo!.quotedMessage?.extendedTextMessage?.text ??
        ctxInfo!.quotedMessage?.conversation ??
        "";
      if (fallbackText) {
        await sock.sendMessage(ownerJid, { text: `${label}\n\n📝 ${fallbackText}` });
        await sock.sendMessage(jid, { text: "✅ Status text sent to owner DM!" }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, {
          text: "❌ Could not download that status media. Try again.",
        }, { quoted: msg });
      }
    }
    return;
  }

  // ── Mode 2: Classic — fetch cached status by @mention or number ──────────
  const mentionedJid =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  let targetJid: string | undefined;
  if (target) {
    const cleaned = target.replace(/[^0-9]/g, "");
    if (cleaned) targetJid = `${cleaned}@s.whatsapp.net`;
  }
  if (!targetJid) targetJid = mentionedJid;

  if (!targetJid) {
    await sock.sendMessage(jid, {
      text:
        `👀 *Grab Status — 2 Ways to Use*\n\n` +
        `*Method 1 (Reply-to-status):*\nOpen someone's status → Reply with \`.grabstatus\`\n_The bot forwards that exact status to the owner DM._\n\n` +
        `*Method 2 (by number/mention):*\n\`.grabstatus @mention\` or \`.grabstatus [number]\`\n_Sends the latest cached status of that person._\n\n` +
        `_Note: The bot must have seen the status while online._`,
    }, { quoted: msg });
    return;
  }

  const statusMsg = getLatestStatus(targetJid);
  if (!statusMsg) {
    await sock.sendMessage(jid, {
      text: `❌ No cached status found for +${targetJid.split("@")[0]}.\n_The bot only captures statuses posted while it's online and connected._`,
    }, { quoted: msg });
    return;
  }

  const label = `📸 *Status grabbed from* +${targetJid.split("@")[0]}`;

  try {
    await forwardStatusToOwner(sock, statusMsg, label, ownerJid);
    await sock.sendMessage(jid, { text: `✅ Status sent to owner DM!` }, { quoted: msg });
  } catch (err: any) {
    logger.error({ err }, "Error grabbing status");
    await sock.sendMessage(jid, {
      text: "❌ Failed to grab and forward that status.",
    }, { quoted: msg });
  }
}

// ── .status @mention or .status [number] — fetch WA profile info ─────────────
export async function handleStatusGrab(
  sock: WASocket,
  msg: WAMessage,
  targetNumber?: string
) {
  const jid = msg.key.remoteJid ?? "";

  try {
    let targetJid: string;

    if (targetNumber) {
      const cleaned = targetNumber.replace(/[^0-9]/g, "");
      targetJid = `${cleaned}@s.whatsapp.net`;
    } else {
      const mentionedJid =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentionedJid) {
        await sock.sendMessage(jid, {
          text: `❓ *How to use:*\n\`.status @mention\` — Get info about a user\n\`.status [phone number]\` — Get info by phone number`,
        }, { quoted: msg });
        return;
      }
      targetJid = mentionedJid;
    }

    await sock.sendMessage(jid, {
      text: `⏳ Fetching status info for ${targetJid.split("@")[0]}...`,
    }, { quoted: msg });

    let statusText = "No status set";
    try {
      const status = await sock.fetchStatus(targetJid);
      statusText = (status as any)?.status ?? "No status set";
    } catch {
      statusText = "Could not fetch status (user may have privacy settings enabled)";
    }

    let profilePicUrl = "";
    try {
      profilePicUrl = (await sock.profilePictureUrl(targetJid, "image")) ?? "";
    } catch {
      profilePicUrl = "";
    }

    const phoneNumber = targetJid.split("@")[0];
    const responseText =
      `👤 *User Info*\n\n` +
      `📱 *Number:* +${phoneNumber}\n` +
      `💬 *Status:* ${statusText}\n` +
      `🖼️ *Profile Pic:* ${profilePicUrl ? "Available" : "Not available / Private"}\n` +
      `🔗 *WhatsApp Link:* https://wa.me/${phoneNumber}`;

    if (profilePicUrl) {
      await sock.sendMessage(jid, {
        image: { url: profilePicUrl },
        caption: responseText,
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: responseText }, { quoted: msg });
    }
  } catch (err) {
    logger.error({ err }, "Error handling status grab");
    await sock.sendMessage(jid, {
      text: "❌ Failed to fetch user status. Please try again.",
    }, { quoted: msg });
  }
}
