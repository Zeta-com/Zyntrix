import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} from "@whiskeysockets/baileys";
import axios from "axios";
import fs from "fs";
import path from "path";
import { BOT_CONFIG } from "../config.js";

const MOVIE_API = "https://darkvibe314-silent-movies-api.hf.space/api";
const TEMP_DIR = "./movie_temp";
const movieSubCache = new Map<string, string>();

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ─── 1. MOVIE SEARCH — CAROUSEL CARDS ────────────────────────────────────────
export async function handleMovieSearch(
  sock: WASocket,
  msg: WAMessage,
  query: string
): Promise<void> {
  if (!query) {
    await sock.sendMessage(jid(msg), {
      text: `🎬 *Movie Search*\n\nUsage: *.movie <movie name>*\n\nExamples:\n• *.movie Batman*\n• *.movie Breaking Bad*`,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { react: { text: "🔎", key: msg.key } });
  await sock.sendMessage(jid(msg), {
    text: `🔎 *Searching:* "${query}"\n_Generating selection cards..._`,
  }, { quoted: msg });

  try {
    const { data } = await axios.get(`${MOVIE_API}/search`, {
      params: { query },
      timeout: 20000,
    });

    if (!data.results?.length) {
      await sock.sendMessage(jid(msg), {
        text: `❌ *No results found for:* "${query}"`,
      }, { quoted: msg });
      return;
    }

    const results = data.results.slice(0, 5);

    // Try carousel first, fall back to individual cards if it fails
    try {
      await sendMovieCarousel(sock, msg, results, query);
    } catch {
      await sendMovieCards(sock, msg, results);
    }

    await sock.sendMessage(jid(msg), { react: { text: "✅", key: msg.key } });
  } catch (e: any) {
    await sock.sendMessage(jid(msg), { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(jid(msg), {
      text: `❌ *Search Error:* ${e.message}`,
    }, { quoted: msg });
  }
}

// ── Carousel format ───────────────────────────────────────────────────────────
async function sendMovieCarousel(
  sock: WASocket,
  msg: WAMessage,
  results: any[],
  query: string
) {
  const from = jid(msg);
  const cards: proto.Message.InteractiveMessage.ICard[] = [];
  const FALLBACK_IMG = "https://i.ibb.co/mVvK7CFB/ad09bf786822.jpg";

  for (const movie of results) {
    const title = (movie.title ?? "Unknown").slice(0, 50);
    const isSeries = movie.subjectType === 2;
    const year = movie.releaseDate?.split("-")[0] ?? "Unknown";

    // Cache subtitles
    if (movie.subtitles) movieSubCache.set(String(movie.subjectId), movie.subtitles);
    const subText = movie.subtitles
      ? movie.subtitles.split(",").slice(0, 3).join(", ") + "..."
      : "None";

    const desc =
      `⭐ IMDb: ${movie.imdbRatingValue ?? "N/A"}\n` +
      `🎭 Genre: ${movie.genre ?? "N/A"}\n` +
      `📅 Year: ${year}\n` +
      `📌 Type: ${isSeries ? "Series 📺" : "Movie 🎬"}\n` +
      `💬 Subs: ${subText}`;

    const coverUrl: string = movie.cover?.url ?? FALLBACK_IMG;

    // Upload cover to WA servers
    let media: any;
    try {
      const imgBuf = await axios.get(coverUrl, { responseType: "arraybuffer", timeout: 8000 });
      media = await prepareWAMessageMedia(
        { image: Buffer.from(imgBuf.data) },
        { upload: (sock as any).waUploadToServer }
      );
    } catch {
      media = await prepareWAMessageMedia(
        { image: { url: FALLBACK_IMG } },
        { upload: (sock as any).waUploadToServer }
      );
    }

    const buttons = isSeries
      ? [
          { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "📺 Download S1E1", id: `.dlmovie ${movie.subjectId} 1 1` }) },
          { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "📝 Subtitles", id: `.smsubs ${movie.subjectId} 1 1` }) },
          { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "📋 Copy ID", id: "copy_id", copy_code: `.dlmovie ${movie.subjectId} <season> <ep> <Lang>` }) },
        ]
      : [
          { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "🎬 Download", id: `.dlmovie ${movie.subjectId} null null` }) },
          { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "📝 Subtitles", id: `.smsubs ${movie.subjectId} null null` }) },
        ];

    cards.push(
      proto.Message.InteractiveMessage.Card.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: desc }),
        header: proto.Message.InteractiveMessage.Header.create({
          title: `🎬 ${title}`,
          hasMediaAttachment: true,
          imageMessage: media.imageMessage,
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons,
        }),
      })
    );
  }

  const interactiveMsg = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: `🎥 *Results for:* ${query}\n\nSwipe to choose ➡️`,
    }),
    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
      cards,
      messageVersion: 1,
    }),
  });

  const generated = generateWAMessageFromContent(
    from,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: interactiveMsg,
        },
      },
    },
    { quoted: msg }
  );

  await sock.relayMessage(from, generated.message!, { messageId: generated.key.id! });
}

// ── Fallback: individual image cards ─────────────────────────────────────────
async function sendMovieCards(sock: WASocket, msg: WAMessage, results: any[]) {
  for (let i = 0; i < results.length; i++) {
    const movie = results[i];
    const title = (movie.title ?? "Unknown Title").slice(0, 70);
    const isSeries = movie.subjectType === 2;
    if (movie.subtitles) movieSubCache.set(String(movie.subjectId), movie.subtitles);
    const subText = movie.subtitles ? movie.subtitles.split(",").slice(0, 4).join(", ") + "..." : "None";
    const year = movie.releaseDate?.split("-")[0] ?? "Unknown";
    const dlCmd = isSeries
      ? `.dlmovie ${movie.subjectId} <season> <episode>`
      : `.dlmovie ${movie.subjectId}`;

    const caption =
      `${i + 1}. 🎬 *${title}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⭐ ${movie.imdbRatingValue ?? "N/A"}  📅 ${year}  ${isSeries ? "📺 Series" : "🎬 Movie"}\n` +
      `🎭 Genre: ${movie.genre ?? "N/A"}\n` +
      `💬 Subs: ${subText}\n` +
      `🆔 \`${movie.subjectId}\`\n\n` +
      `📥 \`${dlCmd}\``;

    const coverUrl: string = movie.cover?.url ?? "";
    try {
      if (coverUrl) {
        const imgRes = await axios.get(coverUrl, { responseType: "arraybuffer", timeout: 10000 });
        await sock.sendMessage(jid(msg), { image: Buffer.from(imgRes.data), caption }, { quoted: msg });
      } else {
        await sock.sendMessage(jid(msg), { text: caption }, { quoted: msg });
      }
    } catch {
      await sock.sendMessage(jid(msg), { text: caption }, { quoted: msg });
    }

    if (i < results.length - 1) await new Promise(r => setTimeout(r, 700));
  }
}

// ─── 2. SUBTITLE SELECTOR ─────────────────────────────────────────────────────
export async function handleMovieSubs(
  sock: WASocket,
  msg: WAMessage,
  args: string
): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const movieId = parts[0];
  const season = parts[1] ?? "null";
  const episode = parts[2] ?? "null";

  if (!movieId) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.smsubs <movie_id> [season] [episode]*" }, { quoted: msg });
    return;
  }

  let subList: string[] = [];
  const cached = movieSubCache.get(movieId);
  if (cached && cached !== "None") {
    subList = cached.split(",").map(s => s.trim());
  } else {
    await sock.sendMessage(jid(msg), { text: "⏳ Fetching subtitle list..." }, { quoted: msg });
    try {
      const { data } = await axios.get(`${MOVIE_API}/search`, { params: { query: movieId }, timeout: 10000 });
      if (data.results?.[0]?.subtitles) {
        subList = data.results[0].subtitles.split(",").map((s: string) => s.trim());
        movieSubCache.set(movieId, data.results[0].subtitles);
      }
    } catch {}
  }

  if (!subList.length) {
    await sock.sendMessage(jid(msg), { text: "❌ No subtitles available." }, { quoted: msg });
    return;
  }

  let text = `🌐 *Available Subtitles*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  subList.forEach(sub => {
    text += `🌍 *${sub}*\n👉 \`.dlmovie ${movieId} ${season} ${episode} ${sub}\`\n\n`;
  });
  text += `_Copy and send the command for your language._`;
  await sock.sendMessage(jid(msg), { text }, { quoted: msg });
}

// ─── 3. MOVIE DOWNLOADER ──────────────────────────────────────────────────────
export async function handleMovieDownload(
  sock: WASocket,
  msg: WAMessage,
  args: string
): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const movieId = parts[0];
  const season = parts[1] && parts[1] !== "null" ? parts[1] : null;
  const episode = parts[2] && parts[2] !== "null" ? parts[2] : null;
  const subLang = parts.slice(3).join(" ") || null;

  if (!movieId) {
    await sock.sendMessage(jid(msg), {
      text: `🎬 *Movie Downloader*\n\n*Movie:* \`.dlmovie <id>\`\n*Series:* \`.dlmovie <id> <season> <ep>\`\n*With subs:* \`.dlmovie <id> 1 1 English\`\n\nSearch first with *.movie <name>* to get the ID.`,
    }, { quoted: msg });
    return;
  }

  const subNote = subLang ? `\n🗣️ Subtitle: *${subLang}*` : "";
  await sock.sendMessage(jid(msg), { react: { text: "⏳", key: msg.key } });
  await sock.sendMessage(jid(msg), {
    text: `⏳ *Processing movie...*${subNote}\n_Fetching download link..._`,
  }, { quoted: msg });

  ensureTempDir();
  let tempVidPath: string | null = null;

  try {
    const params: Record<string, string> = { movie_id: movieId };
    if (season) params.season = season;
    if (episode) params.episode = episode;
    params.sub_lang = "English";

    const { data: dlData } = await axios.get(`${MOVIE_API}/download`, { params, timeout: 30000 });
    if (!dlData.download_url) throw new Error("API did not return a download URL.");

    const sizeMB = dlData.size_bytes
      ? parseFloat((parseInt(dlData.size_bytes) / (1024 * 1024)).toFixed(2))
      : 0;
    const label = season && episode ? `S${season}E${episode}` : `ID ${movieId}`;
    const fileName = season && episode
      ? `Movie_${movieId}_S${season}E${episode}.mp4`
      : `Movie_${movieId}.mp4`;

    await sock.sendMessage(jid(msg), {
      text: `☁️ *Downloading ${sizeMB > 0 ? `(${sizeMB} MB)` : ""}...*\n_Streaming to WhatsApp..._`,
    }, { quoted: msg });

    tempVidPath = path.join(TEMP_DIR, fileName);
    const writer = fs.createWriteStream(tempVidPath);
    const videoRes = await axios({ url: dlData.download_url, method: "GET", responseType: "stream", timeout: 0 });
    videoRes.data.pipe(writer);
    await new Promise<void>((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });

    await sock.sendMessage(jid(msg), {
      document: fs.readFileSync(tempVidPath),
      mimetype: "video/mp4",
      fileName,
      caption: `🎬 *${label}*\n📦 Size: ${sizeMB} MB\n\n_${BOT_CONFIG.botName}_`,
    }, { quoted: msg });

    if (tempVidPath && fs.existsSync(tempVidPath)) { fs.unlinkSync(tempVidPath); tempVidPath = null; }

    // Subtitles
    if (dlData.subtitle_url) {
      try {
        const subRes = await axios.get(dlData.subtitle_url, { responseType: "arraybuffer", timeout: 20000 });
        let srtBuffer = Buffer.from(subRes.data);
        let finalName = "Subtitles_English.srt";
        let finalCaption = "📝 *English Subtitles*";

        if (subLang && subLang.toLowerCase() !== "english") {
          try {
            const langCode = getLanguageCode(subLang);
            if (langCode && langCode !== "en") {
              const translated = await translateSRT(srtBuffer.toString("utf8"), langCode);
              srtBuffer = Buffer.from(translated, "utf8");
              finalName = `Subtitles_${subLang}.srt`;
              finalCaption = `📝 *${subLang} Subtitles*\n_Auto-translated by ${BOT_CONFIG.botName}_`;
            }
          } catch { finalCaption += "\n_(Translation failed, English sent instead)_"; }
        }

        await sock.sendMessage(jid(msg), {
          document: srtBuffer,
          mimetype: "application/x-subrip",
          fileName: finalName,
          caption: finalCaption,
        }, { quoted: msg });
      } catch {}
    }

    await sock.sendMessage(jid(msg), { react: { text: "✅", key: msg.key } });
    await sock.sendMessage(jid(msg), { text: `✅ *Done! Enjoy your movie!* 🍿` }, { quoted: msg });
  } catch (e: any) {
    if (tempVidPath && fs.existsSync(tempVidPath)) fs.unlinkSync(tempVidPath);
    await sock.sendMessage(jid(msg), { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(jid(msg), {
      text: `❌ *Download failed:* ${e.message}`,
    }, { quoted: msg });
  }
}

async function translateSRT(srtText: string, targetLang: string): Promise<string> {
  const { translate } = await import("@vitalets/google-translate-api");
  const blocks = srtText.replace(/\r\n/g, "\n").split("\n\n").filter(b => b.trim());
  let translated = "";
  for (let i = 0; i < blocks.length; i += 30) {
    const chunk = blocks.slice(i, i + 30);
    const lines = chunk.map(b => b.split("\n").slice(2).join("\n"));
    const combined = lines.join("\n\n===SPLIT===\n\n");
    try {
      const res = await translate(combined, { to: targetLang });
      const parts = res.text.split(/\n*===SPLIT===\n*/);
      for (let j = 0; j < chunk.length; j++) {
        const ln = chunk[j].split("\n");
        translated += `${ln[0]}\n${ln[1]}\n${(parts[j] ?? lines[j]).trim()}\n\n`;
      }
    } catch {
      for (const b of chunk) translated += `${b}\n\n`;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return translated;
}

function getLanguageCode(lang: string): string | null {
  const map: Record<string, string> = {
    english: "en", arabic: "ar", french: "fr", spanish: "es", portuguese: "pt",
    german: "de", italian: "it", russian: "ru", chinese: "zh", japanese: "ja",
    korean: "ko", hindi: "hi", turkish: "tr", dutch: "nl", polish: "pl",
    swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", greek: "el",
    hebrew: "iw", thai: "th", vietnamese: "vi", indonesian: "id", malay: "ms",
    urdu: "ur", persian: "fa", bengali: "bn", tamil: "ta", telugu: "te",
    hausa: "ha", yoruba: "yo", igbo: "ig", swahili: "sw", amharic: "am",
    somali: "so", zulu: "zu", afrikaans: "af", ukrainian: "uk", czech: "cs",
    hungarian: "hu", romanian: "ro", bulgarian: "bg", croatian: "hr",
  };
  return map[lang.toLowerCase()] ?? null;
}
