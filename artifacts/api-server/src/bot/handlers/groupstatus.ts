import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  proto,
} from "@whiskeysockets/baileys";
import crypto from "crypto";
import { PassThrough } from "stream";

const PURPLE_COLOR = "#9C27B0";

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

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

  // ── TEXT STATUS ──────────────────────────────────────────────────────────────
  if (!hasQuoted) {
    if (!caption) {
      await sock.sendMessage(from, {
        text:
          `📝 *Group Status Usage*\n\n` +
          `• Reply to image/video/audio:\n  \`.groupstatus [caption]\`\n` +
          `• Text status:\n  \`.groupstatus Your text here\``,
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(from, { text: "⏳ *Posting text group status...*" }, { quoted: msg });

    try {
      await sendGroupStatus(sock, from, { text: caption, backgroundColor: PURPLE_COLOR });
      await sock.sendMessage(from, { text: "✅ *Text group status posted!*" }, { quoted: msg });
    } catch (e: any) {
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // ── MEDIA STATUS ─────────────────────────────────────────────────────────────
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

  // IMAGE / STICKER
  if (/image|sticker/i.test(mtype)) {
    await sock.sendMessage(from, { text: "⏳ *Posting image group status...*" }, { quoted: msg });
    try {
      const buf = await downloadBuf(/sticker/i.test(mtype) ? "sticker" : "image");
      await sendGroupStatus(sock, from, { image: buf, caption });
      await sock.sendMessage(from, { text: "✅ *Image group status posted!*" }, { quoted: msg });
    } catch (e: any) {
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // VIDEO
  if (/video/i.test(mtype)) {
    await sock.sendMessage(from, { text: "⏳ *Posting video group status...*" }, { quoted: msg });
    try {
      const buf = await downloadBuf("video");
      await sendGroupStatus(sock, from, { video: buf, caption });
      await sock.sendMessage(from, { text: "✅ *Video group status posted!*" }, { quoted: msg });
    } catch (e: any) {
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  // AUDIO
  if (/audio/i.test(mtype)) {
    await sock.sendMessage(from, { text: "⏳ *Posting audio group status...*" }, { quoted: msg });
    try {
      const buf = await downloadBuf("audio");
      let vn = buf;
      try { vn = await toVoiceNote(buf); } catch {}
      let waveform: string | undefined;
      try { waveform = await generateWaveform(buf) ?? undefined; } catch {}
      await sendGroupStatus(sock, from, {
        audio: vn,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        waveform,
      });
      await sock.sendMessage(from, { text: "✅ *Audio group status posted!*" }, { quoted: msg });
    } catch (e: any) {
      await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: msg });
    }
    return;
  }

  await sock.sendMessage(from, {
    text: "❌ Unsupported type. Reply to an image, video, or audio.",
  }, { quoted: msg });
}

// ── Core group status sender ──────────────────────────────────────────────────
async function sendGroupStatus(sock: WASocket, jid: string, content: any) {
  const { backgroundColor } = content;
  const cleanContent = { ...content };
  delete cleanContent.backgroundColor;

  const inside = await generateWAMessageContent(cleanContent, {
    upload: (sock as any).waUploadToServer,
    backgroundColor: backgroundColor ?? PURPLE_COLOR,
  });

  const secret = crypto.randomBytes(32);

  const msg = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret: secret },
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: { messageSecret: secret },
        },
      },
    } as any,
    {}
  );

  await sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! });
  return msg;
}

// ── Convert audio to voice note (ogg/opus) ───────────────────────────────────
function toVoiceNote(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Dynamic import so fluent-ffmpeg doesn't crash at load time if ffmpeg is missing
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
    } catch (e) {
      reject(e);
    }
  });
}

// ── Generate waveform for audio status ───────────────────────────────────────
function generateWaveform(buffer: Buffer, bars = 64): Promise<string | null> {
  return new Promise((resolve) => {
    try {
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
    } catch {
      resolve(null);
    }
  });
}
