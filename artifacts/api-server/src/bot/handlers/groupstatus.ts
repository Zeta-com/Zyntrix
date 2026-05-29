import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
} from "@whiskeysockets/baileys";
import crypto from "crypto";
import { PassThrough } from "stream";

const PURPLE_COLOR = "#9C27B0";

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

// ── React helper ──────────────────────────────────────────────────────────────
async function react(sock: WASocket, msg: WAMessage, emoji: string) {
  try {
    await sock.sendMessage(msg.key.remoteJid!, {
      react: { text: emoji, key: msg.key },
    } as any);
  } catch {}
}

// ── .setgc — save a group JID to post statuses to ────────────────────────────
export let statusGC: string = "";

export function setStatusGC(groupJid: string) {
  statusGC = groupJid;
}

export async function handleSetGC(
  sock: WASocket,
  msg: WAMessage,
  input: string
): Promise<void> {
  const from = jid(msg);

  if (!input.trim()) {
    await sock.sendMessage(from, {
      text:
        `📍 *Set Group for Status*\n\n` +
        `Usage: \`.setgc <group invite link or JID>\`\n` +
        `Example: \`.setgc https://chat.whatsapp.com/xxxxx\`\n\n` +
        `Current: ${statusGC || "_Not set_"}`,
    }, { quoted: msg });
    return;
  }

  try {
    let groupJid = input.trim();

    if (groupJid.includes("chat.whatsapp.com")) {
      const code = groupJid.split("/").pop()!;
      const info = await sock.groupGetInviteInfo(code);
      groupJid = info.id;
    }

    if (!groupJid.endsWith("@g.us")) {
      await sock.sendMessage(from, {
        text: "❌ Invalid group JID. Use a WhatsApp group invite link or a JID ending in @g.us",
      }, { quoted: msg });
      return;
    }

    setStatusGC(groupJid);
    await sock.sendMessage(from, {
      text: `✅ *Group saved for status posting!*\n\n🆔 JID: \`${groupJid}\``,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(from, {
      text: `❌ Failed to set group: ${err.message}`,
    }, { quoted: msg });
  }
}

// ── .groupstatus — post to group status (any member can use) ─────────────────
export async function handleGroupStatus(
  sock: WASocket,
  msg: WAMessage,
  caption: string
): Promise<void> {
  const from = jid(msg);

  if (!from.endsWith("@g.us")) {
    await sock.sendMessage(from, {
      text: "👥 *Group Status* can only be used inside a group!",
    }, { quoted: msg });
    return;
  }

  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
  const hasQuoted = !!ctxInfo?.quotedMessage;

  // ── TEXT STATUS ─────────────────────────────────────────────────────────────
  if (!hasQuoted) {
    if (!caption) {
      await sock.sendMessage(from, {
        text:
          `📝 *Group Status Usage*\n\n` +
          `• Text status:\n  \`.gs Your text here\`\n` +
          `• Reply to image/video/audio:\n  \`.gs [optional caption]\`\n\n` +
          `_Anyone in the group can post!_`,
      }, { quoted: msg });
      return;
    }

    await react(sock, msg, "⏳");
    try {
      await sendGroupStatus(sock, from, { text: caption, backgroundColor: PURPLE_COLOR });
      await react(sock, msg, "✅");
    } catch (e: any) {
      await react(sock, msg, "❌");
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // ── MEDIA STATUS ────────────────────────────────────────────────────────────
  const targetMsg = {
    key: {
      remoteJid: from,
      id: ctxInfo!.stanzaId!,
      participant: ctxInfo!.participant,
    },
    message: ctxInfo!.quotedMessage!,
  };

  const mtype = Object.keys(targetMsg.message)[0] ?? "";

  async function downloadBuf(type: "image" | "video" | "audio" | "sticker") {
    const qmsg = (targetMsg.message as any)[`${type}Message`] ?? targetMsg.message;
    const stream = await downloadContentFromMessage(qmsg, type);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  await react(sock, msg, "⏳");

  // IMAGE / STICKER
  if (/image|sticker/i.test(mtype)) {
    try {
      const buf = await downloadBuf(/sticker/i.test(mtype) ? "sticker" : "image");
      await sendGroupStatus(sock, from, { image: buf, caption });
      await react(sock, msg, "✅");
    } catch (e: any) {
      await react(sock, msg, "❌");
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // VIDEO
  if (/video/i.test(mtype)) {
    try {
      const buf = await downloadBuf("video");
      await sendGroupStatus(sock, from, { video: buf, caption });
      await react(sock, msg, "✅");
    } catch (e: any) {
      await react(sock, msg, "❌");
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // AUDIO
  if (/audio/i.test(mtype)) {
    try {
      const buf = await downloadBuf("audio");
      let vn: Buffer = buf as Buffer;
      try { vn = await toVoiceNote(buf) as Buffer; } catch {}
      let waveform: string | undefined;
      try { waveform = await generateWaveform(buf) ?? undefined; } catch {}
      await sendGroupStatus(sock, from, {
        audio: vn,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        waveform,
      });
      await react(sock, msg, "✅");
    } catch (e: any) {
      await react(sock, msg, "❌");
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  await react(sock, msg, "❌");
  await sock.sendMessage(from, {
    text: "❌ Unsupported type. Reply to an image, video, or audio.",
  }, { quoted: msg });
}

// ── Core group status sender ──────────────────────────────────────────────────
async function sendGroupStatus(sock: WASocket, targetJid: string, content: any) {
  const { backgroundColor } = content;
  const cleanContent = { ...content };
  delete cleanContent.backgroundColor;

  const inside = await generateWAMessageContent(cleanContent, {
    upload: (sock as any).waUploadToServer,
    backgroundColor: backgroundColor ?? PURPLE_COLOR,
  });

  const secret = crypto.randomBytes(32);

  const generatedMsg = generateWAMessageFromContent(
    targetJid,
    {
      messageContextInfo: { messageSecret: secret },
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: { messageSecret: secret },
        },
      },
    } as any,
    { userJid: sock.user?.id ?? "" }
  );

  await sock.relayMessage(targetJid, generatedMsg.message!, { messageId: generatedMsg.key.id! });
  return generatedMsg;
}

// ── Convert audio to voice note (ogg/opus) ───────────────────────────────────
function toVoiceNote(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    import("fluent-ffmpeg").then((ffmpegMod) => {
      const ffmpeg = ffmpegMod.default;
      const input = new PassThrough();
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      input.end(buffer);
      ffmpeg(input)
        .noVideo()
        .audioCodec("libopus")
        .format("ogg")
        .audioChannels(1)
        .audioFrequency(48000)
        .on("error", reject)
        .on("end", () => resolve(Buffer.concat(chunks)))
        .pipe(output as any);
      output.on("data", (c: Buffer) => chunks.push(c));
    }).catch(reject);
  });
}

// ── Generate waveform for audio status ───────────────────────────────────────
function generateWaveform(buffer: Buffer, bars = 64): Promise<string | null> {
  return new Promise((resolve) => {
    import("fluent-ffmpeg").then((ffmpegMod) => {
      const ffmpeg = ffmpegMod.default;
      const input = new PassThrough();
      input.end(buffer);
      const chunks: Buffer[] = [];

      ffmpeg(input)
        .audioChannels(1)
        .audioFrequency(16000)
        .format("s16le")
        .on("error", () => resolve(null))
        .on("end", () => {
          const raw = Buffer.concat(chunks);
          const samples = raw.length / 2;
          const amps: number[] = [];
          for (let i = 0; i < samples; i++) {
            amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
          }
          const size = Math.floor(amps.length / bars);
          if (size === 0) return resolve(null);
          const avg = Array.from({ length: bars }, (_, i) =>
            amps.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0) / size
          );
          const max = Math.max(...avg);
          if (max === 0) return resolve(null);
          resolve(
            Buffer.from(avg.map(v => Math.floor((v / max) * 100))).toString("base64")
          );
        })
        .pipe()
        .on("data", (c: Buffer) => chunks.push(c));
    }).catch(() => resolve(null));
  });
}
