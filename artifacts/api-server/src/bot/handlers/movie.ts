import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import fs from "fs";
import path from "path";
import { BOT_CONFIG } from "../config.js";

const MOVIE_API = "https://darkvibe314-silent-movies-api.hf.space/api";
const TEMP_DIR = "./movie_temp";

// In-memory subtitle cache: movieId → "English,French,Arabic,..."
const movieSubCache = new Map<string, string>();

function jid(msg: WAMessage) {
  return msg.key.remoteJid!;
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ─── 1. MOVIE SEARCH ─────────────────────────────────────────────────────────
export async function handleMovieSearch(
  sock: WASocket,
  msg: WAMessage,
  query: string
): Promise<void> {
  if (!query) {
    await sock.sendMessage(jid(msg), {
      text: `🎬 *Movie Search*\n\nUsage: *.movie <movie name>*\n\nExamples:\n• *.movie Batman*\n• *.movie Breaking Bad*\n• *.movie Avengers Endgame*`,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), {
    text: `🔎 *Searching for:* "${query}"...\n_Fetching results, please wait..._`,
  }, { quoted: msg });

  try {
    const { data } = await axios.get(`${MOVIE_API}/search`, {
      params: { query },
      timeout: 20000,
    });

    if (!data.results || data.results.length === 0) {
      await sock.sendMessage(jid(msg), {
        text: `❌ *No results found for:* "${query}"\n\nTry a different name or check spelling.`,
      }, { quoted: msg });
      return;
    }

    const results = data.results.slice(0, 5);

    for (let i = 0; i < results.length; i++) {
      const movie = results[i];
      const title = (movie.title || "Unknown Title").slice(0, 70);
      const isSeries = movie.subjectType === 2;

      // Cache subtitles for later use
      if (movie.subtitles) {
        movieSubCache.set(String(movie.subjectId), movie.subtitles);
      }

      const subList = movie.subtitles?.split(",").map((s: string) => s.trim()) ?? [];
      const subText =
        subList.length > 0
          ? subList.slice(0, 4).join(", ") + (subList.length > 4 ? "..." : "")
          : "None";

      const year = movie.releaseDate?.split("-")[0] || "Unknown";
      const typeLabel = isSeries ? "📺 Series" : "🎬 Movie";
      const imdb = movie.imdbRatingValue ? `⭐ ${movie.imdbRatingValue}` : "⭐ N/A";

      const dlCmd = isSeries
        ? `.dlmovie ${movie.subjectId} <season> <episode>`
        : `.dlmovie ${movie.subjectId}`;

      const subsCmd = isSeries
        ? `.smsubs ${movie.subjectId} <season> <episode>`
        : `.smsubs ${movie.subjectId}`;

      const caption =
        `${i + 1}. 🎬 *${title}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `${imdb}   📅 ${year}   ${typeLabel}\n` +
        `🎭 *Genre:* ${movie.genre || "N/A"}\n` +
        `💬 *Subtitles:* ${subText}\n` +
        `🆔 *ID:* \`${movie.subjectId}\`\n\n` +
        `📥 *Download:*\n\`${dlCmd}\`\n` +
        `📝 *Subtitles List:*\n\`${subsCmd}\``;

      const coverUrl: string | null = movie.cover?.url ?? null;

      try {
        if (coverUrl) {
          const imgRes = await axios.get(coverUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });
          await sock.sendMessage(jid(msg), {
            image: Buffer.from(imgRes.data),
            caption,
          }, { quoted: msg });
        } else {
          await sock.sendMessage(jid(msg), { text: caption }, { quoted: msg });
        }
      } catch {
        // If image fetch fails, just send text
        await sock.sendMessage(jid(msg), { text: caption }, { quoted: msg });
      }

      // Small delay between cards so they arrive in order
      if (i < results.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    await sock.sendMessage(jid(msg), {
      text: `✅ *${results.length} result(s) shown!*\n\nCopy and send the *.dlmovie* command shown under your chosen movie to download it.`,
    }, { quoted: msg });

  } catch (e: any) {
    await sock.sendMessage(jid(msg), {
      text: `❌ *Search failed:* ${e.message}\n\nThe movie API might be down. Try again later.`,
    }, { quoted: msg });
  }
}

// ─── 2. SUBTITLE SELECTOR ────────────────────────────────────────────────────
export async function handleMovieSubs(
  sock: WASocket,
  msg: WAMessage,
  args: string
): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const movieId = parts[0];
  const season = parts[1] || "null";
  const episode = parts[2] || "null";

  if (!movieId) {
    await sock.sendMessage(jid(msg), {
      text: "Usage: *.smsubs <movie_id> [season] [episode]*",
    }, { quoted: msg });
    return;
  }

  let subList: string[] = [];

  // Try cache first
  const cached = movieSubCache.get(movieId);
  if (cached && cached !== "None") {
    subList = cached.split(",").map((s: string) => s.trim());
  } else {
    // Re-query the API
    await sock.sendMessage(jid(msg), { text: "⏳ Fetching subtitle list..." }, { quoted: msg });
    try {
      const { data } = await axios.get(`${MOVIE_API}/search`, {
        params: { query: movieId },
        timeout: 10000,
      });
      if (data.results?.[0]?.subtitles) {
        subList = data.results[0].subtitles.split(",").map((s: string) => s.trim());
        movieSubCache.set(movieId, data.results[0].subtitles);
      }
    } catch {}
  }

  if (subList.length === 0) {
    await sock.sendMessage(jid(msg), {
      text: "❌ No subtitles available for this title.",
    }, { quoted: msg });
    return;
  }

  let text = `📝 *Available Subtitles*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  subList.forEach(sub => {
    text += `🌐 *${sub}*\n👉 \`.dlmovie ${movieId} ${season} ${episode} ${sub}\`\n\n`;
  });
  text += `_Copy and send the command for your preferred language._`;

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
      text:
        `🎬 *Movie Downloader*\n\n` +
        `*Movie:* \`.dlmovie <id>\`\n` +
        `*Series:* \`.dlmovie <id> <season> <episode>\`\n` +
        `*With subs:* \`.dlmovie <id> 1 1 English\`\n\n` +
        `First search with *.movie <name>* to get the ID.`,
    }, { quoted: msg });
    return;
  }

  const subNote = subLang ? `\n🗣️ Subtitle: *${subLang}*` : "";
  await sock.sendMessage(jid(msg), {
    text: `⏳ *Processing movie...*${subNote}\n_Fetching download link..._`,
  }, { quoted: msg });

  ensureTempDir();
  let tempVidPath: string | null = null;

  try {
    const params: Record<string, string> = { movie_id: movieId };
    if (season) params.season = season;
    if (episode) params.episode = episode;
    // Always request English for the best subtitle base
    params.sub_lang = "English";

    const { data: dlData } = await axios.get(`${MOVIE_API}/download`, {
      params,
      timeout: 30000,
    });

    if (!dlData.download_url) throw new Error("API did not return a download URL.");

    const sizeMB = dlData.size_bytes
      ? parseFloat((parseInt(dlData.size_bytes) / (1024 * 1024)).toFixed(2))
      : 0;

    const label = season && episode ? `S${season}E${episode}` : `ID ${movieId}`;
    const fileName = season && episode
      ? `Movie_${movieId}_S${season}E${episode}.mp4`
      : `Movie_${movieId}.mp4`;

    if (sizeMB > 0) {
      await sock.sendMessage(jid(msg), {
        text: `📥 *Downloading...* (${sizeMB} MB)\n_Streaming to WhatsApp, please wait..._`,
      }, { quoted: msg });
    }

    // Download video to temp file (needed for WhatsApp upload)
    tempVidPath = path.join(TEMP_DIR, fileName);
    const writer = fs.createWriteStream(tempVidPath);

    const videoRes = await axios({
      url: dlData.download_url,
      method: "GET",
      responseType: "stream",
      timeout: 0,
    });

    videoRes.data.pipe(writer);
    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Send the video as a document (documents bypass WhatsApp's video size limit)
    await sock.sendMessage(jid(msg), {
      document: fs.readFileSync(tempVidPath),
      mimetype: "video/mp4",
      fileName,
      caption:
        `🎬 *${label}*\n` +
        `📦 Size: ${sizeMB} MB\n\n` +
        `_Powered by ${BOT_CONFIG.botName}_`,
    }, { quoted: msg });

    // Cleanup temp file
    if (tempVidPath && fs.existsSync(tempVidPath)) fs.unlinkSync(tempVidPath);
    tempVidPath = null;

    // ── Subtitle handling ──────────────────────────────────────────────────
    if (dlData.subtitle_url) {
      try {
        await sock.sendMessage(jid(msg), {
          text: `📝 *Fetching subtitles...*${subLang && subLang.toLowerCase() !== "english" ? `\n🔄 Translating to ${subLang}...` : ""}`,
        }, { quoted: msg });

        const subRes = await axios.get(dlData.subtitle_url, {
          responseType: "arraybuffer",
          timeout: 20000,
        });
        let srtBuffer = Buffer.from(subRes.data);
        let finalName = `Subtitles_English.srt`;
        let finalCaption = `📝 *English Subtitles*`;

        // Translate if a non-English language was requested
        if (subLang && subLang.toLowerCase() !== "english") {
          try {
            const langCode = getLanguageCode(subLang);
            if (langCode && langCode !== "en") {
              const translated = await translateSRT(srtBuffer.toString("utf8"), langCode);
              srtBuffer = Buffer.from(translated, "utf8");
              finalName = `Subtitles_${subLang}.srt`;
              finalCaption = `📝 *${subLang} Subtitles*\n_Auto-translated by ${BOT_CONFIG.botName}_`;
            }
          } catch (transErr) {
            // If translation fails, just send English
            finalCaption = `📝 *English Subtitles*\n_Translation failed, sending English instead_`;
          }
        }

        await sock.sendMessage(jid(msg), {
          document: srtBuffer,
          mimetype: "application/x-subrip",
          fileName: finalName,
          caption: finalCaption,
        }, { quoted: msg });
      } catch {
        // Subtitle fetch failed silently — don't error out the whole command
      }
    }

    await sock.sendMessage(jid(msg), {
      text: `✅ *Done! Enjoy your movie!* 🍿`,
    }, { quoted: msg });

  } catch (e: any) {
    if (tempVidPath && fs.existsSync(tempVidPath)) fs.unlinkSync(tempVidPath);
    await sock.sendMessage(jid(msg), {
      text: `❌ *Download failed:* ${e.message}\n\nCheck the movie ID is correct or try again later.`,
    }, { quoted: msg });
  }
}

// ─── Subtitle translator ─────────────────────────────────────────────────────
async function translateSRT(srtText: string, targetLang: string): Promise<string> {
  const { translate } = await import("@vitalets/google-translate-api");

  const blocks = srtText.replace(/\r\n/g, "\n").split("\n\n").filter(b => b.trim());
  let translatedSRT = "";

  // Process in chunks of 30 blocks to avoid rate limits
  for (let i = 0; i < blocks.length; i += 30) {
    const chunk = blocks.slice(i, i + 30);
    const textLines = chunk.map(b => b.split("\n").slice(2).join("\n"));
    const combined = textLines.join("\n\n===SPLIT===\n\n");

    try {
      const res = await translate(combined, { to: targetLang });
      const translatedParts = res.text.split(/\n*===SPLIT===\n*/);

      for (let j = 0; j < chunk.length; j++) {
        const lines = chunk[j].split("\n");
        const translatedLine = translatedParts[j] ?? textLines[j];
        translatedSRT += `${lines[0]}\n${lines[1]}\n${translatedLine.trim()}\n\n`;
      }
    } catch {
      // If translation of chunk fails, keep original
      for (const block of chunk) {
        translatedSRT += `${block}\n\n`;
      }
    }

    await new Promise(r => setTimeout(r, 400));
  }

  return translatedSRT;
}

// ─── Language code map ────────────────────────────────────────────────────────
function getLanguageCode(lang: string): string | null {
  const map: Record<string, string> = {
    english: "en", arabic: "ar", french: "fr", spanish: "es",
    portuguese: "pt", german: "de", italian: "it", russian: "ru",
    chinese: "zh", japanese: "ja", korean: "ko", hindi: "hi",
    turkish: "tr", dutch: "nl", polish: "pl", swedish: "sv",
    norwegian: "no", danish: "da", finnish: "fi", greek: "el",
    hebrew: "iw", thai: "th", vietnamese: "vi", indonesian: "id",
    malay: "ms", urdu: "ur", persian: "fa", bengali: "bn",
    tamil: "ta", telugu: "te", hausa: "ha", yoruba: "yo", igbo: "ig",
    swahili: "sw", amharic: "am", somali: "so", zulu: "zu",
    afrikaans: "af", ukrainian: "uk", czech: "cs", hungarian: "hu",
    romanian: "ro", bulgarian: "bg", croatian: "hr", serbian: "sr",
    slovak: "sk", slovenian: "sl", latvian: "lv", lithuanian: "lt",
    estonian: "et", catalan: "ca",
  };
  return map[lang.toLowerCase()] ?? null;
}
