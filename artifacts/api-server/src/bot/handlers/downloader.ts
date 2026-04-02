import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { logger } from "../../lib/logger.js";

function getJid(msg: WAMessage): string {
  return msg.key.remoteJid ?? "";
}

async function sendReply(
  sock: WASocket,
  msg: WAMessage,
  text: string
): Promise<void> {
  await sock.sendMessage(getJid(msg), { text }, { quoted: msg });
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.tiktok.com/",
    },
  });
  return Buffer.from(response.data);
}

export async function handleTikTokDownload(
  sock: WASocket,
  msg: WAMessage,
  url: string
): Promise<void> {
  const jid = getJid(msg);

  if (!url || !url.startsWith("http")) {
    await sendReply(
      sock,
      msg,
      `❓ *Usage:* .tiktok <url>\n\nExample:\n.tiktok https://www.tiktok.com/@user/video/123456`
    );
    return;
  }

  await sendReply(sock, msg, "⏳ Downloading TikTok video without watermark...");

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data || data.code !== 0 || !data.data) {
      await sendReply(
        sock,
        msg,
        "❌ Could not fetch the TikTok video. Make sure the URL is valid and the video is public."
      );
      return;
    }

    const video = data.data;
    const videoUrl: string = video.hdplay || video.play || video.wmplay;
    const title: string = video.title || "TikTok Video";
    const author: string = video.author?.nickname || "Unknown";
    const duration: number = video.duration || 0;

    if (!videoUrl) {
      await sendReply(sock, msg, "❌ No downloadable video found for this URL.");
      return;
    }

    const videoBuffer = await downloadBuffer(videoUrl);

    await sock.sendMessage(
      jid,
      {
        video: videoBuffer,
        caption:
          `🎵 *TikTok Download*\n\n` +
          `👤 *Author:* ${author}\n` +
          `📝 *Title:* ${title}\n` +
          `⏱️ *Duration:* ${duration}s\n` +
          `✅ No watermark`,
        mimetype: "video/mp4",
      },
      { quoted: msg }
    );
  } catch (err) {
    logger.error({ err }, "TikTok download error");
    await sendReply(
      sock,
      msg,
      "❌ Failed to download TikTok video. The video may be private or the URL is invalid."
    );
  }
}

export async function handleInstagramDownload(
  sock: WASocket,
  msg: WAMessage,
  url: string
): Promise<void> {
  const jid = getJid(msg);

  if (!url || !url.startsWith("http")) {
    await sendReply(
      sock,
      msg,
      `❓ *Usage:* .instagram <url>\n\nExample:\n.instagram https://www.instagram.com/reel/ABC123/`
    );
    return;
  }

  await sendReply(sock, msg, "⏳ Downloading Instagram media...");

  try {
    const cleanUrl = url.split("?")[0]!.replace(/\/$/, "");

    const apiRes = await axios.get(
      `https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index`,
      {
        params: { url: cleanUrl },
        headers: {
          "x-rapidapi-host":
            "instagram-downloader-download-instagram-videos-stories.p.rapidapi.com",
        },
        timeout: 20000,
      }
    );

    const mediaUrl: string | undefined = apiRes.data?.media;

    if (!mediaUrl) {
      await tryInstagramFallback(sock, msg, jid, cleanUrl);
      return;
    }

    const mediaBuffer = await downloadBuffer(mediaUrl);
    const isVideo = mediaUrl.includes("video") || mediaUrl.includes(".mp4");

    if (isVideo) {
      await sock.sendMessage(
        jid,
        {
          video: mediaBuffer,
          caption: "📸 *Instagram Download*\n✅ Downloaded successfully",
          mimetype: "video/mp4",
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        jid,
        {
          image: mediaBuffer,
          caption: "📸 *Instagram Download*\n✅ Downloaded successfully",
        },
        { quoted: msg }
      );
    }
  } catch (_err) {
    await tryInstagramFallback(sock, msg, jid, url);
  }
}

async function tryInstagramFallback(
  sock: WASocket,
  msg: WAMessage,
  jid: string,
  url: string
): Promise<void> {
  try {
    const { data } = await axios.get(
      `https://snapinsta.app/api/ajaxSearch`,
      {
        method: "POST",
        data: `url=${encodeURIComponent(url)}&lang=en`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 20000,
      }
    );

    const videoMatch = (data?.data as string)?.match(
      /href="(https:\/\/[^"]+\.mp4[^"]*)"/
    );
    const imgMatch = (data?.data as string)?.match(
      /href="(https:\/\/[^"]+\.(jpg|jpeg|webp)[^"]*)"/
    );

    const mediaUrl = videoMatch?.[1] || imgMatch?.[1];

    if (!mediaUrl) {
      await sock.sendMessage(
        jid,
        {
          text:
            "❌ Could not download this Instagram post. It may be private, or try copying the direct post link.\n\n" +
            `💡 *Tip:* Use the direct reel/post URL:\nhttps://www.instagram.com/reel/ABC123/`,
        },
        { quoted: msg }
      );
      return;
    }

    const mediaBuffer = await downloadBuffer(mediaUrl);
    const isVideo = mediaUrl.includes(".mp4");

    if (isVideo) {
      await sock.sendMessage(
        jid,
        {
          video: mediaBuffer,
          caption: "📸 *Instagram Download*\n✅ Downloaded successfully",
          mimetype: "video/mp4",
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        jid,
        {
          image: mediaBuffer,
          caption: "📸 *Instagram Download*\n✅ Downloaded successfully",
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    logger.error({ err }, "Instagram fallback download error");
    await sock.sendMessage(
      jid,
      {
        text: "❌ Failed to download Instagram media. The post may be private or the URL is invalid.",
      },
      { quoted: msg }
    );
  }
}

export async function handleYouTubeDownload(
  sock: WASocket,
  msg: WAMessage,
  url: string,
  audioOnly = false
): Promise<void> {
  const jid = getJid(msg);

  if (!url || !url.startsWith("http")) {
    await sendReply(
      sock,
      msg,
      `❓ *Usage:*\n` +
        `.youtube <url> — Download video (best quality)\n` +
        `.ytaudio <url> — Download audio only (MP3)\n\n` +
        `Example:\n.youtube https://youtu.be/dQw4w9WgXcQ`
    );
    return;
  }

  await sendReply(
    sock,
    msg,
    audioOnly
      ? "⏳ Downloading YouTube audio (MP3)..."
      : "⏳ Downloading YouTube video..."
  );

  try {
    const { default: ytdl } = await import("ytdl-core");

    if (!ytdl.validateURL(url)) {
      await sendReply(sock, msg, "❌ Invalid YouTube URL. Please provide a valid YouTube link.");
      return;
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const author = info.videoDetails.author.name;
    const durationSecs = parseInt(info.videoDetails.lengthSeconds);
    const durationMin = Math.floor(durationSecs / 60);
    const durationSec = durationSecs % 60;

    if (!audioOnly && durationSecs > 600) {
      await sendReply(
        sock,
        msg,
        `⚠️ This video is ${durationMin}m ${durationSec}s long — too large to send via WhatsApp.\n\nTry *.ytaudio ${url}* to get just the audio instead.`
      );
      return;
    }

    const chunks: Buffer[] = [];

    if (audioOnly) {
      const stream = ytdl(url, {
        filter: "audioonly",
        quality: "highestaudio",
      });

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      const audioBuffer = Buffer.concat(chunks);

      await sock.sendMessage(
        jid,
        {
          audio: audioBuffer,
          mimetype: "audio/mp4",
          ptt: false,
        },
        { quoted: msg }
      );

      await sock.sendMessage(
        jid,
        {
          text:
            `🎵 *YouTube Audio Download*\n\n` +
            `📌 *Title:* ${title}\n` +
            `👤 *Channel:* ${author}\n` +
            `⏱️ *Duration:* ${durationMin}m ${durationSec}s`,
        },
        { quoted: msg }
      );
    } else {
      const format = ytdl.chooseFormat(info.formats, {
        quality: "highestvideo",
        filter: (fmt) => fmt.container === "mp4" && !!fmt.audioCodec,
      });

      const stream = ytdl(url, { format });

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      const videoBuffer = Buffer.concat(chunks);

      await sock.sendMessage(
        jid,
        {
          video: videoBuffer,
          caption:
            `🎬 *YouTube Download*\n\n` +
            `📌 *Title:* ${title}\n` +
            `👤 *Channel:* ${author}\n` +
            `⏱️ *Duration:* ${durationMin}m ${durationSec}s`,
          mimetype: "video/mp4",
        },
        { quoted: msg }
      );
    }
  } catch (err: any) {
    logger.error({ err }, "YouTube download error");
    const errMsg = err?.message ?? "";
    if (errMsg.includes("age-restricted") || errMsg.includes("private")) {
      await sendReply(sock, msg, "❌ This video is age-restricted or private and cannot be downloaded.");
    } else if (errMsg.includes("Too large") || errMsg.includes("maxBuffer")) {
      await sendReply(
        sock,
        msg,
        `❌ Video is too large to send via WhatsApp.\n\nTry *.ytaudio ${url}* to get just the audio instead.`
      );
    } else {
      await sendReply(
        sock,
        msg,
        "❌ Failed to download YouTube video. Make sure the URL is valid and the video is public."
      );
    }
  }
}
