/**
 * Group Guard: antilink, antispam, antibot, welcome, goodbye handlers.
 * All settings are persisted via state.ts.
 */
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { getGroupGuard, updateGroupGuard, trackSpam } from "../state.js";
import { isOwner, getSender } from "./commands.js";
import { BOT_CONFIG } from "../config.js";
import { logger } from "../../lib/logger.js";

const p = () => BOT_CONFIG.prefix;

// ── URL detection ─────────────────────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+/gi;

function containsLink(text: string): boolean {
  return URL_REGEX.test(text);
}

// ── Is the sender a group admin? ───────────────────────────────────────────────
async function isSenderAdmin(sock: WASocket, groupJid: string, senderJid: string): Promise<boolean> {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return meta.participants.some(
      (p) => p.id === senderJid && (p.admin === "admin" || p.admin === "superadmin")
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-LINK
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAntiLink(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!isOwner(msg)) {
    await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "⚠️ *Antilink only works in groups!*" }, { quoted: msg });
    return;
  }
  const on = sub.toLowerCase() === "on";
  const off = sub.toLowerCase() === "off";
  if (!on && !off) {
    const guard = getGroupGuard(jid);
    await sock.sendMessage(jid, {
      text: `🔗 *AntiLink:* ${guard.antilink ? "ON 🟢" : "OFF 🔴"}\n\nUsage: \`${p()}antilink on/off\``,
    }, { quoted: msg });
    return;
  }
  updateGroupGuard(jid, { antilink: on });
  await sock.sendMessage(jid, {
    text: on
      ? "🔗 *AntiLink ENABLED!*\nAny link shared in this group will be deleted and the sender warned."
      : "🔗 *AntiLink DISABLED.*\nLinks are now allowed.",
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-SPAM
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAntiSpam(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!isOwner(msg)) {
    await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "⚠️ *AntiSpam only works in groups!*" }, { quoted: msg });
    return;
  }
  const on = sub.toLowerCase() === "on";
  const off = sub.toLowerCase() === "off";
  if (!on && !off) {
    const guard = getGroupGuard(jid);
    await sock.sendMessage(jid, {
      text: `🚫 *AntiSpam:* ${guard.antispam ? "ON 🟢" : "OFF 🔴"}\n\nUsage: \`${p()}antispam on/off\`\n_Triggers after 5 messages in 5 seconds._`,
    }, { quoted: msg });
    return;
  }
  updateGroupGuard(jid, { antispam: on });
  await sock.sendMessage(jid, {
    text: on
      ? "🚫 *AntiSpam ENABLED!*\nMembers sending 5+ messages in 5 seconds will be warned."
      : "🚫 *AntiSpam DISABLED.*",
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-BOT
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAntiBot(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!isOwner(msg)) {
    await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "⚠️ *AntiBot only works in groups!*" }, { quoted: msg });
    return;
  }
  const on = sub.toLowerCase() === "on";
  const off = sub.toLowerCase() === "off";
  if (!on && !off) {
    const guard = getGroupGuard(jid);
    await sock.sendMessage(jid, {
      text: `🤖 *AntiBot:* ${guard.antibot ? "ON 🟢" : "OFF 🔴"}\n\nUsage: \`${p()}antibot on/off\`\n_Removes suspected automation accounts that join._`,
    }, { quoted: msg });
    return;
  }
  updateGroupGuard(jid, { antibot: on });
  await sock.sendMessage(jid, {
    text: on
      ? "🤖 *AntiBot ENABLED!*\nSuspected bot accounts will be removed on join."
      : "🤖 *AntiBot DISABLED.*",
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME
// ─────────────────────────────────────────────────────────────────────────────
export async function handleWelcome(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!isOwner(msg)) {
    await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "⚠️ *Welcome only works in groups!*" }, { quoted: msg });
    return;
  }

  const guard = getGroupGuard(jid);
  const lower = sub.toLowerCase();

  if (lower === "off") {
    updateGroupGuard(jid, { welcome: false });
    await sock.sendMessage(jid, { text: "👋 *Welcome messages DISABLED.*" }, { quoted: msg });
    return;
  }

  if (lower.startsWith("on")) {
    const customMsg = sub.slice(2).trim();
    updateGroupGuard(jid, {
      welcome: true,
      welcomeMsg: customMsg || guard.welcomeMsg,
    });
    await sock.sendMessage(jid, {
      text: `👋 *Welcome messages ENABLED!*\n\n*Message:* ${customMsg || guard.welcomeMsg}\n\n_Use {name} as a placeholder for the member's name._`,
    }, { quoted: msg });
    return;
  }

  // Show status
  await sock.sendMessage(jid, {
    text: `👋 *Welcome:* ${guard.welcome ? "ON 🟢" : "OFF 🔴"}\n*Message:* ${guard.welcomeMsg}\n\nUsage:\n\`${p()}welcome on [custom message]\`\n\`${p()}welcome off\`\n_Use {name} for the member's name_`,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// GOODBYE
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGoodbye(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!isOwner(msg)) {
    await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "⚠️ *Goodbye only works in groups!*" }, { quoted: msg });
    return;
  }

  const guard = getGroupGuard(jid);
  const lower = sub.toLowerCase();

  if (lower === "off") {
    updateGroupGuard(jid, { goodbye: false });
    await sock.sendMessage(jid, { text: "👋 *Goodbye messages DISABLED.*" }, { quoted: msg });
    return;
  }

  if (lower.startsWith("on")) {
    const customMsg = sub.slice(2).trim();
    updateGroupGuard(jid, {
      goodbye: true,
      goodbyeMsg: customMsg || guard.goodbyeMsg,
    });
    await sock.sendMessage(jid, {
      text: `👋 *Goodbye messages ENABLED!*\n\n*Message:* ${customMsg || guard.goodbyeMsg}\n\n_Use {name} as placeholder._`,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, {
    text: `👋 *Goodbye:* ${guard.goodbye ? "ON 🟢" : "OFF 🔴"}\n*Message:* ${guard.goodbyeMsg}\n\nUsage:\n\`${p()}goodbye on [custom message]\`\n\`${p()}goodbye off\``,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-driven: check incoming message against guard rules
// Called from setup.ts for every group message
// ─────────────────────────────────────────────────────────────────────────────
export async function runGroupGuardChecks(
  sock: WASocket,
  msg: WAMessage,
  text: string
): Promise<boolean> {
  const groupJid = msg.key.remoteJid ?? "";
  if (!groupJid.endsWith("@g.us")) return false;

  const senderJid = getSender(msg);
  const guard = getGroupGuard(groupJid);

  // ── Skip checks for admins ─────────────────────────────────────────────────
  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid);
  if (senderIsAdmin) return false;

  // ── AntiLink ──────────────────────────────────────────────────────────────
  if (guard.antilink && text && containsLink(text)) {
    try {
      await sock.sendMessage(groupJid, { delete: msg.key });
      await sock.sendMessage(groupJid, {
        text: `🔗 *AntiLink Alert!*\n@${senderJid.split("@")[0]} — links are not allowed here!\n⚠️ *Warning: your message was deleted.*`,
        mentions: [senderJid],
      });
      return true;
    } catch (err) {
      logger.error({ err }, "[GroupGuard] Failed to delete antilink message");
    }
  }

  // ── AntiSpam ──────────────────────────────────────────────────────────────
  if (guard.antispam) {
    const isSpamming = trackSpam(groupJid, senderJid);
    if (isSpamming) {
      try {
        await sock.sendMessage(groupJid, {
          text: `🚫 *AntiSpam Alert!*\n@${senderJid.split("@")[0]} — slow down! You're sending too many messages too fast.`,
          mentions: [senderJid],
        });
        return true;
      } catch (err) {
        logger.error({ err }, "[GroupGuard] AntiSpam warn failed");
      }
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-driven: participant join/leave — send welcome/goodbye
// Called from setup.ts group-participants.update
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGroupParticipantUpdate(
  sock: WASocket,
  groupJid: string,
  participants: string[],
  action: "add" | "remove" | "promote" | "demote" | string
): Promise<void> {
  const guard = getGroupGuard(groupJid);

  if (action === "add" && guard.welcome) {
    for (const participant of participants) {
      const displayName = participant.split("@")[0];

      // Antibot: basic heuristic — JID looks like a recently registered number
      if (guard.antibot) {
        // Simple check: if JID has very sequential digits, could be a bot
        // Real antibot would need more signals, but this is a basic guard
        try {
          const meta = await sock.groupMetadata(groupJid);
          const joined = meta.participants.find(p => p.id === participant);
          if (joined && !(joined as any).name && displayName.match(/^[0-9]+$/)) {
            await sock.groupParticipantsUpdate(groupJid, [participant], "remove");
            await sock.sendMessage(groupJid, {
              text: `🤖 *AntiBot:* Removed suspected bot account +${displayName}.`,
            });
            continue;
          }
        } catch (err) {
          logger.error({ err }, "[GroupGuard] AntiBot check failed");
        }
      }

      const welcomeText = guard.welcomeMsg.replace(/\{name\}/g, displayName);
      try {
        await sock.sendMessage(groupJid, {
          text: welcomeText,
          mentions: [participant],
        });
      } catch (err) {
        logger.error({ err }, "[GroupGuard] Welcome message failed");
      }
    }
  }

  if (action === "remove" && guard.goodbye) {
    for (const participant of participants) {
      const displayName = participant.split("@")[0];
      const goodbyeText = guard.goodbyeMsg.replace(/\{name\}/g, displayName);
      try {
        await sock.sendMessage(groupJid, { text: goodbyeText });
      } catch (err) {
        logger.error({ err }, "[GroupGuard] Goodbye message failed");
      }
    }
  }
}
