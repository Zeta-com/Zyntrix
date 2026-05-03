import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import * as config from "../config.js";
import { getUptime } from "../store.js";
import { startTrivia, checkTriviaAnswer, skipTrivia } from "../games/trivia.js";
import { getTruth, getDare, getTruthOrDare } from "../games/truthordare.js";
import { playRPS } from "../games/rps.js";
import { startMath } from "../games/math.js";
import { logger } from "../../lib/logger.js";
import { setFakeType, setFakeRecord, setChatbot, isChatbotOn } from "../state.js";
import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleYouTubeDownload,
} from "./downloader.js";
import {
  handleSticker, handleStickerToImage, handleJoke, handle8Ball,
  handleShip, handleMock, handleReverse, handleVapor, handleEmojify,
  handleCoinFlip, handleDice, handleRate, handleChoose, handleQuote,
  handleRoast, handleCompliment, handleFact,
} from "./fun.js";
import {
  handleWiki, handleWeather, handleTranslate, handleCalc, handleQRGen,
  handlePassword, handleShorten, handleBase64, handleBinary, handleHash,
  handleTime, handleDefine, handlePingUrl, handleWordCount, handleScreenshot,
} from "./utility.js";
import {
  handleTagAll, handleGroupInfo, handleAdmins, handleProfilePic,
  handleKick, handleMuteGroup, handlePromote,
} from "./group.js";
import {
  handleMovieSearch, handleMovieSubs, handleMovieDownload,
} from "./movie.js";
import {
  handleMeme, handleCat, handleDog, handleGithub, handleCrypto,
  handleNews, handleFancy, handleFont, handleFormat, handleReact,
  handleSpam, handleCountry, handleNASA, handleIPLookup, handleRandom,
  handleDisappear, handleAnime,
} from "./extra.js";
import { handleAI, handleImageGen, handleAnimeImage } from "./ai.js";
import { handleGroupStatus } from "./groupstatus.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

export function isOwner(msg: WAMessage): boolean {
  const sender = getSender(msg);
  if (config.botOwnerJid) return config.isOwnerJid(sender) || config.isOwnerJid(msg.key.remoteJid ?? "");
  const owner = config.BOT_CONFIG.ownerNumber;
  if (!owner) return true;
  return sender.includes(owner) || (msg.key.remoteJid ?? "").includes(owner);
}

export function getJid(msg: WAMessage): string {
  return msg.key.remoteJid ?? "";
}

export function getMessageText(msg: WAMessage): string {
  return (
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    ""
  );
}

// ── Dynamic menu builder ──────────────────────────────────────────────────────
const MENU_IMAGE_URL = "https://i.postimg.cc/T1nBJN9L/f8a339cefd71e77ac0aacdb64ef1ed8e.jpg";

function buildMenu(senderName: string, chatJid: string): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const p = config.BOT_CONFIG.prefix;
  const chatOn = isChatbotOn(chatJid);

  return `┏❐ *◈ ${config.BOT_CONFIG.botName} ◈*
┃
┃├◆ 👤 User: ⟦ ${senderName} ⟧
┃├◆ 📅 Date: ${date}
┃├◆ ⏰ Time: ${time}
┃├◆ ⚡ Commands: 100+
┃├◆ 🤖 Chatbot: ${chatOn ? "ON 🟢" : "OFF 🔴"}
┃├◆ 🔑 Mode: ${config.isPublicMode ? "Public 🌍" : "Private 🔒"}
┗❐

┏❐ 《 *OWNER MENU* 》 ❐
┃├◆ ${p}public / ${p}private
┃├◆ ${p}faketype on/off
┃├◆ ${p}fakerecord on/off
┃├◆ ${p}tojid [channel link]
┃├◆ ${p}alive
┗❐

┏❐ 《 *AI MENU* 》 ❐
┃├◆ ${p}ai / ${p}gpt [question]
┃├◆ ${p}img [image prompt]
┃├◆ ${p}animage [anime prompt]
┃├◆ ${p}chatbot on/off
┃├◆ ${p}anime [name]
┗❐

┏❐ 《 *MOVIE MENU* 》 ❐
┃├◆ ${p}movie / ${p}sm [title]
┃├◆ ${p}dlmovie [id] [season] [ep]
┃├◆ ${p}smsubs [id] [season] [ep]
┗❐

┏❐ 《 *GROUP MENU* 》 ❐
┃├◆ ${p}tagall
┃├◆ ${p}admins
┃├◆ ${p}kick [@user]
┃├◆ ${p}promote [@user]
┃├◆ ${p}mute / ${p}unmute
┃├◆ ${p}groupinfo
┃├◆ ${p}groupstatus / ${p}gs
┃├◆ ${p}getpp [@user]
┗❐

┏❐ 《 *FUN MENU* 》 ❐
┃├◆ ${p}joke / ${p}meme / ${p}fact
┃├◆ ${p}truth / ${p}dare / ${p}tod
┃├◆ ${p}8ball [question]
┃├◆ ${p}dice / ${p}coinflip / ${p}slots
┃├◆ ${p}rps [r/p/s]
┃├◆ ${p}ship / ${p}rate / ${p}choose
┃├◆ ${p}quote / ${p}roast / ${p}compliment
┃├◆ ${p}mock / ${p}reverse / ${p}emojify
┃├◆ ${p}trivia / ${p}math
┃├◆ ${p}cat / ${p}dog / ${p}random
┗❐

┏❐ 《 *DOWNLOAD MENU* 》 ❐
┃├◆ ${p}ytmp3 / ${p}song [search/url]
┃├◆ ${p}ytmp4 / ${p}ytvid [search/url]
┃├◆ ${p}ttdl [tiktok url]
┃├◆ ${p}igdl [instagram url]
┗❐

┏❐ 《 *TOOLS MENU* 》 ❐
┃├◆ ${p}wiki [topic]
┃├◆ ${p}weather [city]
┃├◆ ${p}translate [lang] [text]
┃├◆ ${p}calc [expression]
┃├◆ ${p}qr [text]
┃├◆ ${p}password [length]
┃├◆ ${p}shorten [url]
┃├◆ ${p}base64 encode/decode [text]
┃├◆ ${p}binary / ${p}hash [text]
┃├◆ ${p}define [word]
┃├◆ ${p}ping [url?] / ${p}uptime
┃├◆ ${p}screenshot [url]
┃├◆ ${p}sticker / ${p}toimage
┃├◆ ${p}fancy / ${p}vapor / ${p}emojify [text]
┃├◆ ${p}crypto [coin]
┃├◆ ${p}news / ${p}nasa
┃├◆ ${p}ip [address]
┃├◆ ${p}country [name]
┃├◆ ${p}github [user]
┃├◆ ${p}disappear on/off
┗❐

_Powered by ${config.BOT_CONFIG.botName} © ${now.getFullYear()}_`;
}

// ── Main command handler ──────────────────────────────────────────────────────
export async function handleCommand(
  sock: WASocket,
  msg: WAMessage,
  text: string
): Promise<void> {
  const jid = getJid(msg);
  const args = text.trim().split(/\s+/);
  const command = (args[0] ?? "").toLowerCase();
  const rest = args.slice(1).join(" ");
  const senderName = (msg as any).pushName ?? getSender(msg).split("@")[0];

  if (!config.isPublicMode && !isOwner(msg)) {
    await sock.sendMessage(jid, {
      text: `🔒 *Private Mode*\nThis bot is currently owner-only.\n\nContact the owner to get access.`,
    }, { quoted: msg });
    return;
  }

  try {
    switch (command) {

      // ── MENU ──────────────────────────────────────────────────────────────
      case "menu":
      case "help":
      case "start":
        await sock.sendMessage(jid, {
          image: { url: MENU_IMAGE_URL },
          caption: buildMenu(senderName, jid),
        } as any, { quoted: msg });
        break;

      // ── STATUS ─────────────────────────────────────────────────────────────
      case "alive": {
        const start = Date.now();
        await sock.sendMessage(jid, { text: "🏓 *Checking status...*" }, { quoted: msg });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, {
          text: `✅ *${config.BOT_CONFIG.botName} is ONLINE!*\n\n` +
            `🟢 Status: Active\n` +
            `⏱️ Uptime: ${getUptime()}\n` +
            `⚡ Latency: ${latency}ms\n` +
            `🔑 Mode: ${config.isPublicMode ? "Public 🌍" : "Private 🔒"}\n` +
            `🤖 Chatbot: ${isChatbotOn(jid) ? "ON 🟢" : "OFF 🔴"}\n` +
            `📅 ${new Date().toLocaleString()}`,
        }, { quoted: msg });
        break;
      }

      case "uptime":
        await sock.sendMessage(jid, {
          text: `⏱️ *Uptime:* ${getUptime()}\n_${config.BOT_CONFIG.botName} has been running non-stop!_`,
        }, { quoted: msg });
        break;

      // ── OWNER MODE ─────────────────────────────────────────────────────────
      case "public":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        config.setPublicMode(true);
        await sock.sendMessage(jid, { text: "✅ *Public Mode ON*\nEveryone can now use bot commands." }, { quoted: msg });
        break;

      case "private":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        config.setPublicMode(false);
        await sock.sendMessage(jid, { text: "🔒 *Private Mode ON*\nOnly the owner can use commands." }, { quoted: msg });
        break;

      case "faketype": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const on = rest.toLowerCase() === "on";
        setFakeType(on);
        await sock.sendMessage(jid, { text: on ? "⌨️ *Fake Typing ON!*" : "⌨️ *Fake Typing OFF.*" }, { quoted: msg });
        break;
      }

      case "fakerecord": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const on = rest.toLowerCase() === "on";
        setFakeRecord(on);
        await sock.sendMessage(jid, { text: on ? "🎙️ *Fake Recording ON!*" : "🎙️ *Fake Recording OFF.*" }, { quoted: msg });
        break;
      }

      // ── TOJID ──────────────────────────────────────────────────────────────
      case "tojid": {
        if (!rest) { await sock.sendMessage(jid, { text: `Usage: \`.tojid <channel_link>\`` }, { quoted: msg }); break; }
        const match = rest.match(/channel\/([A-Za-z0-9_-]+)/);
        if (match) {
          await sock.sendMessage(jid, { text: `📡 *Channel JID:*\n\`${match[1]}@newsletter\`` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: `❌ Could not extract JID from: ${rest}` }, { quoted: msg });
        }
        break;
      }

      // ── AI ─────────────────────────────────────────────────────────────────
      case "ai":
      case "gpt":
      case "chatgpt":
      case "ask":
        await handleAI(sock, msg, rest);
        break;

      case "img":
      case "imagine":
      case "genimage":
        await handleImageGen(sock, msg, rest);
        break;

      case "animage":
        await handleAnimeImage(sock, msg, rest);
        break;

      // ── CHATBOT ON/OFF ─────────────────────────────────────────────────────
      case "chatbot": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const toggle = rest.toLowerCase();
        if (toggle === "on") {
          setChatbot(jid, true);
          await sock.sendMessage(jid, {
            text: `🤖 *Chatbot ON!*\n\nMeta AI will now auto-reply to *all messages* in this chat.\n_Disable with .chatbot off_`,
          }, { quoted: msg });
        } else if (toggle === "off") {
          setChatbot(jid, false);
          await sock.sendMessage(jid, { text: "🔴 *Chatbot OFF.*\nAuto-replies disabled." }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, {
            text: `🤖 *Chatbot:* ${isChatbotOn(jid) ? "ON 🟢" : "OFF 🔴"}\n\n• \`.chatbot on\` — Enable Meta AI\n• \`.chatbot off\` — Disable`,
          }, { quoted: msg });
        }
        break;
      }

      // ── GROUP STATUS ───────────────────────────────────────────────────────
      case "groupstatus":
      case "gs":
      case "gstatus":
      case "togstatus":
      case "swgc":
        await handleGroupStatus(sock, msg, rest);
        break;

      // ── MOVIE ──────────────────────────────────────────────────────────────
      case "movie":
      case "sm":
      case "cineverse":
        await handleMovieSearch(sock, msg, rest);
        break;

      case "dlmovie":
      case "downloadmovie":
        await handleMovieDownload(sock, msg, rest);
        break;

      case "smsubs":
        await handleMovieSubs(sock, msg, rest);
        break;

      // ── GROUP ──────────────────────────────────────────────────────────────
      case "tagall":
      case "tag":
        await handleTagAll(sock, msg, rest);
        break;

      case "admins":
        await handleAdmins(sock, msg);
        break;

      case "groupinfo":
        await handleGroupInfo(sock, msg);
        break;

      case "getpp":
        await handleProfilePic(sock, msg, rest);
        break;

      case "kick":
        await handleKick(sock, msg, rest);
        break;

      case "mute":
        await handleMuteGroup(sock, msg, true);
        break;

      case "unmute":
        await handleMuteGroup(sock, msg, false);
        break;

      case "promote":
        await handlePromote(sock, msg, rest);
        break;

      // ── FUN ────────────────────────────────────────────────────────────────
      case "joke":      await handleJoke(sock, msg); break;
      case "meme":      await handleMeme(sock, msg); break;
      case "fact":      await handleFact(sock, msg); break;
      case "8ball":     await handle8Ball(sock, msg, rest); break;
      case "coinflip":
      case "flip":      await handleCoinFlip(sock, msg); break;
      case "dice":      await handleDice(sock, msg); break;
      case "rps":       await playRPS(sock, msg, rest); break;
      case "ship":      await handleShip(sock, msg, rest); break;
      case "rate":      await handleRate(sock, msg, rest); break;
      case "choose":    await handleChoose(sock, msg, rest); break;
      case "quote":     await handleQuote(sock, msg); break;
      case "roast":     await handleRoast(sock, msg, rest); break;
      case "compliment": await handleCompliment(sock, msg); break;
      case "mock":      await handleMock(sock, msg, rest); break;
      case "reverse":   await handleReverse(sock, msg, rest); break;
      case "emojify":   await handleEmojify(sock, msg, rest); break;
      case "vapor":     await handleVapor(sock, msg, rest); break;
      case "cat":       await handleCat(sock, msg); break;
      case "dog":       await handleDog(sock, msg); break;
      case "random":    await handleRandom(sock, msg); break;

      case "truth":
        await sock.sendMessage(jid, { text: `🔴 *Truth:* ${getTruth()}` }, { quoted: msg });
        break;

      case "dare":
        await sock.sendMessage(jid, { text: `🟡 *Dare:* ${getDare()}` }, { quoted: msg });
        break;

      case "tod":
        await sock.sendMessage(jid, { text: getTruthOrDare() }, { quoted: msg });
        break;

      case "slots": {
        const emojis = ["🍒", "🍋", "🔔", "💎", "7️⃣", "🍉"];
        const r = () => emojis[Math.floor(Math.random() * emojis.length)];
        const s1 = r(), s2 = r(), s3 = r();
        const won = s1 === s2 && s2 === s3;
        await sock.sendMessage(jid, {
          text: `🎰 *Slot Machine*\n\n[ ${s1} | ${s2} | ${s3} ]\n\n${won ? "🎉 *JACKPOT! You won!*" : "😔 No luck this time. Try again!"}`,
        }, { quoted: msg });
        break;
      }

      case "trivia":    await startTrivia(sock, msg); break;
      case "skip":      await skipTrivia(sock, msg); break;
      case "math":      await startMath(sock, msg); break;

      // ── TOOLS ──────────────────────────────────────────────────────────────
      case "wiki":
      case "wikipedia": await handleWiki(sock, msg, rest); break;
      case "weather":   await handleWeather(sock, msg, rest); break;

      case "translate":
      case "tr": {
        const tArgs = rest.split(" ");
        await handleTranslate(sock, msg, tArgs[0] ?? "", tArgs.slice(1).join(" "));
        break;
      }

      case "calc":
      case "calculate": await handleCalc(sock, msg, rest); break;

      case "qr":
      case "qrcode":    await handleQRGen(sock, msg, rest); break;

      case "password":
      case "pass":      await handlePassword(sock, msg, parseInt(rest) || 16); break;

      case "shorten":
      case "urlshort":  await handleShorten(sock, msg, rest); break;

      case "base64": {
        const b = rest.split(" ");
        await handleBase64(sock, msg, b[0] as "encode" | "decode", b.slice(1).join(" "));
        break;
      }

      case "binary":    await handleBinary(sock, msg, rest); break;
      case "hash":      await handleHash(sock, msg, rest); break;
      case "time":      await handleTime(sock, msg, rest); break;
      case "define":
      case "dict":      await handleDefine(sock, msg, rest); break;

      case "ping": {
        if (rest.startsWith("http")) {
          await handlePingUrl(sock, msg, rest);
        } else {
          const t = Date.now();
          await sock.sendMessage(jid, { text: "🏓 *Pong!*" }, { quoted: msg });
          await sock.sendMessage(jid, { text: `🏓 *Pong!* ⚡ ${Date.now() - t}ms` }, { quoted: msg });
        }
        break;
      }

      case "wc":
      case "wordcount": await handleWordCount(sock, msg, rest); break;
      case "screenshot":
      case "ss":        await handleScreenshot(sock, msg, rest); break;
      case "sticker":
      case "s":         await handleSticker(sock, msg); break;
      case "toimage":   await handleStickerToImage(sock, msg); break;
      case "fancy":     await handleFancy(sock, msg, rest); break;
      case "font":      await handleFont(sock, msg, rest); break;
      case "format":    await handleFormat(sock, msg, rest); break;
      case "react":     await handleReact(sock, msg, rest); break;
      case "disappear": await handleDisappear(sock, msg, rest.toLowerCase() === "on"); break;
      case "anime":     await handleAnime(sock, msg, rest); break;
      case "crypto":    await handleCrypto(sock, msg, rest); break;
      case "news":      await handleNews(sock, msg); break;
      case "nasa":      await handleNASA(sock, msg); break;
      case "ip":
      case "iptrack":   await handleIPLookup(sock, msg, rest); break;
      case "country":   await handleCountry(sock, msg, rest); break;
      case "github":
      case "git":       await handleGithub(sock, msg, rest); break;

      case "spam":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleSpam(sock, msg, rest);
        break;

      // ── DOWNLOADER ─────────────────────────────────────────────────────────
      case "ytmp3":
      case "song":
      case "play":      await handleYouTubeDownload(sock, msg, rest, "audio"); break;
      case "ytmp4":
      case "ytvid":     await handleYouTubeDownload(sock, msg, rest, "video"); break;
      case "ttdl":
      case "tiktok":    await handleTikTokDownload(sock, msg, rest); break;
      case "igdl":
      case "instagram": await handleInstagramDownload(sock, msg, rest); break;

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    await sock.sendMessage(jid, {
      text: `❌ Something went wrong with *.${command}*\nTry again or use *.menu*`,
    }, { quoted: msg });
  }
}

export { checkTriviaAnswer };
