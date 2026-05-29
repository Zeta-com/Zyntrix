import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { logger } from "../../lib/logger.js";

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
