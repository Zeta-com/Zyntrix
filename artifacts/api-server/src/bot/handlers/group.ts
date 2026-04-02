import type { WASocket, WAMessage } from "@whiskeysockets/baileys";

function jid(msg: WAMessage) {
  return msg.key.remoteJid!;
}

function isGroup(msg: WAMessage): boolean {
  return (msg.key.remoteJid ?? "").endsWith("@g.us");
}

// ── Tag all group members ─────────────────────────────────────────────────────
export async function handleTagAll(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  try {
    const metadata = await sock.groupMetadata(jid(msg));
    const participants = metadata.participants;
    const mentions = participants.map(p => p.id);
    const tagList = participants.map(p => `@${p.id.split("@")[0]}`).join(" ");
    await sock.sendMessage(jid(msg), {
      text: `📢 ${text || "Attention everyone!"}\n\n${tagList}`,
      mentions,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: "❌ Failed to fetch group members.",
    }, { quoted: msg });
  }
}

// ── Group info ────────────────────────────────────────────────────────────────
export async function handleGroupInfo(sock: WASocket, msg: WAMessage): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  try {
    const meta = await sock.groupMetadata(jid(msg));
    const admins = meta.participants.filter(p => p.admin).length;
    const created = new Date(meta.creation * 1000).toLocaleDateString();
    await sock.sendMessage(jid(msg), {
      text: `👥 *Group Info*\n\n📌 *Name:* ${meta.subject}\n👤 *Members:* ${meta.participants.length}\n🛡️ *Admins:* ${admins}\n📅 *Created:* ${created}\n🆔 *ID:* ${meta.id}\n${meta.desc ? `\n📝 *Description:*\n${meta.desc}` : ""}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to get group info." }, { quoted: msg });
  }
}

// ── List admins ───────────────────────────────────────────────────────────────
export async function handleAdmins(sock: WASocket, msg: WAMessage): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  try {
    const meta = await sock.groupMetadata(jid(msg));
    const admins = meta.participants.filter(p => p.admin);
    if (admins.length === 0) {
      await sock.sendMessage(jid(msg), { text: "🛡️ No admins found in this group." }, { quoted: msg });
      return;
    }
    const mentions = admins.map(a => a.id);
    const list = admins.map((a, i) => `${i + 1}. @${a.id.split("@")[0]} ${a.admin === "superadmin" ? "👑" : "🛡️"}`).join("\n");
    await sock.sendMessage(jid(msg), {
      text: `🛡️ *Group Admins* (${admins.length})\n\n${list}`,
      mentions,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to fetch admins." }, { quoted: msg });
  }
}

// ── Get profile picture ───────────────────────────────────────────────────────
export async function handleProfilePic(sock: WASocket, msg: WAMessage, target?: string): Promise<void> {
  let targetJid = target?.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  if (!target || target.trim() === "") {
    const sender = msg.key.participant ?? msg.key.remoteJid ?? "";
    targetJid = sender.includes("@") ? sender : sender + "@s.whatsapp.net";
  }

  try {
    const ppUrl = await sock.profilePictureUrl(targetJid, "image");
    const { default: axios } = await import("axios");
    const res = await axios.get(ppUrl, { responseType: "arraybuffer" });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(res.data),
      caption: `🖼️ Profile picture of @${targetJid.split("@")[0]}`,
      mentions: [targetJid],
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ No profile picture found or it's hidden!`,
    }, { quoted: msg });
  }
}

// ── Kick member (admin only) ──────────────────────────────────────────────────
export async function handleKick(sock: WASocket, msg: WAMessage): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (!quoted) {
    await sock.sendMessage(jid(msg), { text: "❌ Reply to someone's message to kick them." }, { quoted: msg });
    return;
  }
  try {
    await (sock as any).groupParticipantsUpdate(jid(msg), [quoted], "remove");
    await sock.sendMessage(jid(msg), {
      text: `✅ @${quoted.split("@")[0]} has been removed.`,
      mentions: [quoted],
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to kick. Make sure I'm an admin!" }, { quoted: msg });
  }
}

// ── Mute/unmute group (admin only) ────────────────────────────────────────────
export async function handleMuteGroup(sock: WASocket, msg: WAMessage, mute: boolean): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  try {
    await (sock as any).groupSettingUpdate(jid(msg), mute ? "announcement" : "not_announcement");
    await sock.sendMessage(jid(msg), {
      text: mute ? "🔇 Group has been *muted*. Only admins can send messages." : "🔊 Group has been *unmuted*. Everyone can send messages.",
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: `❌ Failed to ${mute ? "mute" : "unmute"} group. Make sure I'm an admin!` }, { quoted: msg });
  }
}

// ── Promote/demote (admin only) ───────────────────────────────────────────────
export async function handlePromote(sock: WASocket, msg: WAMessage, promote: boolean): Promise<void> {
  if (!isGroup(msg)) {
    await sock.sendMessage(jid(msg), { text: "❌ This command only works in groups!" }, { quoted: msg });
    return;
  }
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (!quoted) {
    await sock.sendMessage(jid(msg), {
      text: `❌ Reply to someone's message to ${promote ? "promote" : "demote"} them.`,
    }, { quoted: msg });
    return;
  }
  try {
    await (sock as any).groupParticipantsUpdate(jid(msg), [quoted], promote ? "promote" : "demote");
    await sock.sendMessage(jid(msg), {
      text: `${promote ? "✅ @" : "✅ @"}${quoted.split("@")[0]} has been ${promote ? "promoted to admin 🛡️" : "demoted from admin 👤"}`,
      mentions: [quoted],
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ Failed to ${promote ? "promote" : "demote"}. Make sure I'm a super admin!`,
    }, { quoted: msg });
  }
}
