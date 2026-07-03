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

// ── Grab a target's latest cached WhatsApp status and DM it to the owner ─────
export async function handleGrabStatus(
  sock: WASocket,
  msg: WAMessage,
  target?: string
): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  const mentionedJid =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  let targetJid: string | undefined;
  if (target) {
    const cleaned = target.replace(/[^0-9]/g, "");
    if (cleaned) targetJid = `${cleaned}@s.whatsapp.net`;
  }
  if (!targetJid) targetJid = mentionedJid;

  if (!targetJid) {
    await sock.sendMessage(
      jid,
      {
        text:
          `👀 *Grab Status*\n\n*Usage:* \`.grabstatus @mention\` or \`.grabstatus [number]\`\n\n` +
          `_Sends that person's latest WhatsApp status update to your DM. The bot must have already seen the status pass through while it was online — it can't fetch old ones retroactively._`,
      },
      { quoted: msg }
    );
    return;
  }

  const ownerJid = resolveOwnerJid(sock);
  if (!ownerJid) {
    await sock.sendMessage(jid, { text: "❌ No owner configured — can't determine where to send it." }, { quoted: msg });
    return;
  }

  const statusMsg = getLatestStatus(targetJid);
  if (!statusMsg) {
    await sock.sendMessage(
      jid,
      {
        text: `❌ No cached status found for +${targetJid.split("@")[0]}.\n_The bot only captures statuses posted while it's online and connected._`,
      },
      { quoted: msg }
    );
    return;
  }

  try {
    const content = statusMsg.message;
    const label = `📸 *Status grabbed from* +${targetJid.split("@")[0]}`;

    if (content?.imageMessage) {
      const buf = (await downloadMediaMessage(statusMsg, "buffer", {})) as Buffer;
      const cap = content.imageMessage.caption;
      await sock.sendMessage(ownerJid, { image: buf, caption: cap ? `${label}\n\n${cap}` : label });
    } else if (content?.videoMessage) {
      const buf = (await downloadMediaMessage(statusMsg, "buffer", {})) as Buffer;
      const cap = content.videoMessage.caption;
      await sock.sendMessage(ownerJid, { video: buf, caption: cap ? `${label}\n\n${cap}` : label });
    } else {
      const text = content?.extendedTextMessage?.text ?? content?.conversation ?? "";
      if (!text) {
        await sock.sendMessage(jid, { text: "❌ Cached status has an unsupported/empty format." }, { quoted: msg });
        return;
      }
      await sock.sendMessage(ownerJid, { text: `${label}\n\n📝 ${text}` });
    }

    await sock.sendMessage(jid, { text: `✅ Status sent to owner DM!` }, { quoted: msg });
  } catch (err) {
    logger.error({ err }, "Error grabbing status");
    await sock.sendMessage(jid, { text: "❌ Failed to grab and forward that status." }, { quoted: msg });
  }
}

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
        await sock.sendMessage(
          jid,
          {
            text: `❓ How to use:\n*.status @mention* — Get info about a user\n*.status [phone number]* — Get info by phone number`,
          },
          { quoted: msg }
        );
        return;
      }
      targetJid = mentionedJid;
    }

    await sock.sendMessage(
      jid,
      { text: `⏳ Fetching status info for ${targetJid.split("@")[0]}...` },
      { quoted: msg }
    );

    let statusText = "No status set";
    try {
      const status = await sock.fetchStatus(targetJid);
      statusText = (status as any)?.status ?? "No status set";
    } catch {
      statusText = "Could not fetch status (user may have privacy settings enabled)";
    }

    let profilePicUrl = "";
    try {
      profilePicUrl = await sock.profilePictureUrl(targetJid, "image") ?? "";
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
      await sock.sendMessage(
        jid,
        {
          image: { url: profilePicUrl },
          caption: responseText,
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(jid, { text: responseText }, { quoted: msg });
    }
  } catch (err) {
    logger.error({ err }, "Error handling status grab");
    await sock.sendMessage(
      jid,
      { text: "❌ Failed to fetch user status. Please try again." },
      { quoted: msg }
    );
  }
}
