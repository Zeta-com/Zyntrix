import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import * as config from "../config.js";
import { setOwnerNumber } from "../config.js";
import { getUptime } from "../store.js";
import { startTrivia, checkTriviaAnswer, skipTrivia } from "../games/trivia.js";
import { getTruth, getDare, getTruthOrDare } from "../games/truthordare.js";
import { playRPS } from "../games/rps.js";
import { startMath } from "../games/math.js";
import { logger } from "../../lib/logger.js";
import { setFakeType, setFakeRecord, setChatbot, isChatbotOn, setAntidelete, isAntideleteOn } from "../state.js";
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
  handleGroupInviteLink, handleJoinGroup, handleLeaveGroup,
  handleGroupMetadata, handleRevokeInvite,
} from "./group.js";
import {
  handleMovieSearch, handleMovieSubs, handleMovieDownload,
} from "./movie.js";
import {
  handleMeme, handleCat, handleDog, handleGithub, handleCrypto,
  handleNews, handleFancy, handleFont, handleFormat, handleReact,
  handleSpam, handleCountry, handleNASA, handleIPLookup, handleRandom,
  handleDisappear, handleAnime,
  handleGetNewsletter, handleGetJid, handleMention, handleBroadcast,
} from "./extra.js";
import { handleAI, handleImageGen, handleAnimeImage, handleNbCommand } from "./ai.js";
import { handleGroupStatus, handleSetGC } from "./groupstatus.js";
import { handleGrabStatus } from "./status.js";
import { sendCarouselMenu, type MenuCard } from "../helpers/carouselMenu.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

export function isOwner(msg: WAMessage): boolean {
  // If the message came FROM the connected device, it's always the owner
  if (msg.key.fromMe === true) return true;

  const sender = getSender(msg);

  // Explicit owner set via .setowner or auto-detected on connect
  if (config.botOwnerJid) {
    return config.isOwnerJid(sender) || config.isOwnerJid(msg.key.remoteJid ?? "");
  }

  // Fallback to OWNER_NUMBER env var
  const owner = config.BOT_CONFIG.ownerNumber;
  if (owner) {
    return sender.includes(owner) || (msg.key.remoteJid ?? "").includes(owner);
  }

  // No owner configured at all — nobody is owner except fromMe (handled above)
  return false;
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
┃├◆ ${p}setowner [number] [name?]
┃├◆ ${p}owner
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
┃├◆ ${p}nb — cinematic transform (reply to image)
┃├◆ ${p}chatbot on/off
┃├◆ ${p}anime [name]
┗❐

┏❐ 《 *MOVIE MENU* 》 ❐
┃├◆ ${p}movie / ${p}sm [title]
┃├◆ ${p}dlmovie [id] [season] [ep]
┃├◆ ${p}smsubs [id] [season] [ep]
┗❐

┏❐ 《 *GROUP MENU* 》 ❐
┃├◆ ${p}tagall / ${p}admins
┃├◆ ${p}kick / ${p}promote / ${p}mute / ${p}unmute
┃├◆ ${p}groupinfo / ${p}groupmeta
┃├◆ ${p}groupinvite / ${p}gclink
┃├◆ ${p}joingroup [link]
┃├◆ ${p}leavegroup
┃├◆ ${p}revokeinvite
┃├◆ ${p}gs / ${p}gcstatus / ${p}swgc [caption]
┃├◆ ${p}setgc [invite link or JID]
┃├◆ ${p}getpp [@user]
┗❐

┏❐ 《 *ANTIDELETE MENU* 》 ❐
┃├◆ ${p}antidelete on — enable for this chat
┃├◆ ${p}antidelete off — disable for this chat
┃├◆ ${p}antidelete — check current status
┃├◆ ${p}vv — reveal view-once here
┃├◆ ${p}vv2 — reveal view-once → owner DM
┃├◆ ${p}grabstatus [@user/number] — send status to your DM (owner)
┗❐

┏❐ 《 *UTILITY+ MENU* 》 ❐
┃├◆ ${p}getnewsletter [channel link]
┃├◆ ${p}getjid [phone number]
┃├◆ ${p}mention [number] [text]
┃├◆ ${p}broadcast [message] (owner)
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
      case "start": {
        // Text+image menu is the reliable default — two different native
        // interactive/carousel message shapes were tested on a real device
        // and both failed (one with a visible "not supported" error, one
        // with a silent drop and zero rendering). That's WhatsApp actively
        // rejecting/discarding unofficial interactive payloads from Baileys
        // clients, not a payload bug we can patch our way out of. Set
        // MENU_STYLE=interactive to opt back into the experimental list-flow
        // menu if you want to keep testing it on newer WhatsApp builds.
        if (process.env.MENU_STYLE === "interactive") {
          const p = config.BOT_CONFIG.prefix;
          const sender = getSender(msg);
          const cards: MenuCard[] = [
            { title: "🎵 MEDIA TOOLS", description: "Download YouTube, TikTok, Instagram & movies.", buttonText: "📂 Media Cmds", command: `${p}listmedia` },
            { title: "🧠 AI FEATURES", description: "Chat, image generation & cinematic transforms.", buttonText: "🤖 AI Cmds", command: `${p}listai` },
            { title: "🎮 FUN & GAMES", description: "Trivia, truth or dare, RPS, math & more.", buttonText: "🎲 Fun Cmds", command: `${p}listfun` },
            { title: "🛠️ UTILITIES", description: "Weather, translate, QR codes, calculators & more.", buttonText: "⚙️ Tools Cmds", command: `${p}listtools` },
            { title: "👥 GROUP & ADMIN", description: "Tag all, admins, invite links & moderation.", buttonText: "🛡️ Group Cmds", command: `${p}listgroup` },
            { title: "⚙️ SYSTEM & OWNER", description: "Bot status, owner tools & configuration.", buttonText: "👑 System Cmds", command: `${p}listsystem` },
            { title: "🏓 BOT PING", description: "Check the bot's response speed and latency.", buttonText: "⚡ Check Ping", command: `${p}ping` },
            { title: "⏱️ BOT UPTIME", description: "See how long the bot has been running.", buttonText: "⏳ Check Uptime", command: `${p}uptime` },
          ];

          const sent = await sendCarouselMenu(sock, jid, {
            bodyText: `> © ${config.BOT_CONFIG.botName}\n┏ ◆ MOOD: 🧪\n┗ ◆ ${config.BOT_CONFIG.botName} Bot\n\n👋 Hey *@${sender.split("@")[0]}*\nTap below to browse all command categories! 📚`,
            cards,
            sender,
            quoted: msg,
            listButtonText: "📚 View Categories",
            listTitle: `${config.BOT_CONFIG.botName} Commands`,
          });

          if (sent) break;
          // fall through to the text+image menu below if the send failed
        }

        await sock.sendMessage(jid, {
          image: { url: MENU_IMAGE_URL },
          caption: buildMenu(senderName, jid),
        } as any, { quoted: msg });
        break;
      }

      // ── MENU CATEGORY LISTS (buttons from the carousel land here) ──────────
      case "listmedia": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *MEDIA TOOLS* ⌟ ◆\n┣ ◆ ${p}song / ${p}ytmp3 [search/url]\n┣ ◆ ${p}ytvid / ${p}ytmp4 [search/url]\n┣ ◆ ${p}ttdl [tiktok url]\n┣ ◆ ${p}igdl [instagram url]\n┣ ◆ ${p}movie / ${p}sm [title]\n┣ ◆ ${p}dlmovie [id] [season] [ep]\n┗ ◆ ${p}smsubs [id] [season] [ep]`,
        }, { quoted: msg });
        break;
      }
      case "listai": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *AI FEATURES* ⌟ ◆\n┣ ◆ ${p}ai / ${p}gpt [question]\n┣ ◆ ${p}img / ${p}imagine [prompt]\n┣ ◆ ${p}animage [anime prompt]\n┣ ◆ ${p}nb — cinematic transform (reply to image)\n┣ ◆ ${p}chatbot on/off\n┗ ◆ ${p}anime [name]`,
        }, { quoted: msg });
        break;
      }
      case "listfun": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *FUN & GAMES* ⌟ ◆\n┣ ◆ ${p}joke / ${p}meme / ${p}fact\n┣ ◆ ${p}truth / ${p}dare / ${p}tod\n┣ ◆ ${p}8ball [question]\n┣ ◆ ${p}dice / ${p}coinflip / ${p}slots\n┣ ◆ ${p}rps [r/p/s]\n┣ ◆ ${p}ship / ${p}rate / ${p}choose\n┣ ◆ ${p}quote / ${p}roast / ${p}compliment\n┣ ◆ ${p}mock / ${p}reverse / ${p}emojify\n┣ ◆ ${p}trivia / ${p}math\n┗ ◆ ${p}cat / ${p}dog / ${p}random`,
        }, { quoted: msg });
        break;
      }
      case "listtools": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *UTILITIES* ⌟ ◆\n┣ ◆ ${p}wiki [topic]\n┣ ◆ ${p}weather [city]\n┣ ◆ ${p}translate [lang] [text]\n┣ ◆ ${p}calc [expression]\n┣ ◆ ${p}qr [text]\n┣ ◆ ${p}password [length]\n┣ ◆ ${p}shorten [url]\n┣ ◆ ${p}base64 encode/decode [text]\n┣ ◆ ${p}binary / ${p}hash [text]\n┣ ◆ ${p}define [word]\n┣ ◆ ${p}screenshot [url]\n┣ ◆ ${p}sticker / ${p}toimage\n┣ ◆ ${p}fancy / ${p}vapor / ${p}emojify [text]\n┣ ◆ ${p}crypto [coin]\n┣ ◆ ${p}news / ${p}nasa\n┣ ◆ ${p}ip [address] / ${p}country [name]\n┣ ◆ ${p}github [user]\n┗ ◆ ${p}disappear on/off`,
        }, { quoted: msg });
        break;
      }
      case "listgroup": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *GROUP & ADMIN* ⌟ ◆\n┣ ◆ ${p}tagall / ${p}admins\n┣ ◆ ${p}kick / ${p}promote / ${p}mute / ${p}unmute\n┣ ◆ ${p}groupinfo / ${p}groupmeta\n┣ ◆ ${p}groupinvite / ${p}gclink\n┣ ◆ ${p}joingroup [link] / ${p}leavegroup\n┣ ◆ ${p}revokeinvite\n┣ ◆ ${p}gs / ${p}gcstatus / ${p}swgc [caption]\n┣ ◆ ${p}setgc [invite link or JID]\n┗ ◆ ${p}getpp [@user]`,
        }, { quoted: msg });
        break;
      }
      case "listsystem": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *SYSTEM & OWNER* ⌟ ◆\n┣ ◆ ${p}ping / ${p}uptime / ${p}alive\n┣ ◆ ${p}owner / ${p}setowner [number] [name?]\n┣ ◆ ${p}public / ${p}private\n┣ ◆ ${p}antidelete on/off\n┣ ◆ ${p}grabstatus [@user/number]\n┣ ◆ ${p}faketype on/off / ${p}fakerecord on/off\n┣ ◆ ${p}broadcast [message] (owner)\n┗ ◆ ${p}getnewsletter [channel link]`,
        }, { quoted: msg });
        break;
      }

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

      // ── OWNER MANAGEMENT ───────────────────────────────────────────────────
      case "setowner": {
        if (!rest) {
          await sock.sendMessage(jid, {
            text: `👑 *Set Owner*\n\nUsage: \`.setowner <number> [name]\`\nExample: \`.setowner 2349031646071 David\`\n\n_Number must include country code, no + sign._`,
          }, { quoted: msg });
          break;
        }
        const soArgs = rest.trim().split(/\s+/);
        const soNum = soArgs[0]!.replace(/[^0-9]/g, "");
        const soName = soArgs.slice(1).join(" ") || "Owner";
        if (soNum.length < 7) {
          await sock.sendMessage(jid, { text: "❌ Invalid number. Include country code (e.g. 2349031646071)" }, { quoted: msg });
          break;
        }
        setOwnerNumber(soNum, soName);
        await sock.sendMessage(jid, {
          text: `✅ *Owner Set!*\n\n👤 Name: *${soName}*\n📱 Number: *+${soNum}*\n\n_Only this number can now use owner commands._`,
        }, { quoted: msg });
        break;
      }

      case "owner": {
        const ownerNum = config.botOwnerJid
          ? config.botOwnerJid.replace("@s.whatsapp.net", "")
          : config.BOT_CONFIG.ownerNumber;
        if (!ownerNum) {
          await sock.sendMessage(jid, {
            text: `👑 *No owner set yet.*\nUse \`.setowner <number>\` to set one.`,
          }, { quoted: msg });
          break;
        }
        const ownerName = config.botOwnerName || "Owner";
        const vcard =
          `BEGIN:VCARD\n` +
          `VERSION:3.0\n` +
          `FN:${ownerName}\n` +
          `ORG:${config.BOT_CONFIG.botName};\n` +
          `TEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\n` +
          `END:VCARD`;
        await sock.sendMessage(jid, {
          contacts: {
            displayName: ownerName,
            contacts: [{ vcard }],
          },
        } as any, { quoted: msg });
        break;
      }

      // ── MODE CONTROL ───────────────────────────────────────────────────────
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

      case "nb":
      case "cinematic":
      case "filmgrade":
        await handleNbCommand(sock, msg);
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

      // ── GROUP STATUS (open to ALL members, no admin required) ─────────────
      case "groupstatus":
      case "gs":
      case "gstatus":
      case "gcstatus":
      case "swgc":
      case "upswgc":
      case "togstatus":
        await handleGroupStatus(sock, msg, rest);
        break;

      case "setgc":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleSetGC(sock, msg, rest);
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
        await handleKick(sock, msg);
        break;

      case "mute":
        await handleMuteGroup(sock, msg, true);
        break;

      case "unmute":
        await handleMuteGroup(sock, msg, false);
        break;

      case "promote":
        await handlePromote(sock, msg, true);
        break;

      // ── FUN ────────────────────────────────────────────────────────────────
      case "joke":      await handleJoke(sock, msg); break;
      case "meme":      await handleMeme(sock, msg); break;
      case "fact":      await handleFact(sock, msg); break;
      case "8ball":     await handle8Ball(sock, msg, rest); break;
      case "coinflip":
      case "flip":      await handleCoinFlip(sock, msg); break;
      case "dice":      await handleDice(sock, msg, rest); break;
      case "rps": { const rpsResult = playRPS(rest); await sock.sendMessage(jid, { text: rpsResult }, { quoted: msg }); break; }
      case "ship":      await handleShip(sock, msg, rest); break;
      case "rate":      await handleRate(sock, msg, rest); break;
      case "choose":    await handleChoose(sock, msg, rest); break;
      case "quote":     await handleQuote(sock, msg); break;
      case "roast":     await handleRoast(sock, msg, rest); break;
      case "compliment": await handleCompliment(sock, msg, rest); break;
      case "mock":      await handleMock(sock, msg, rest); break;
      case "reverse":   await handleReverse(sock, msg, rest); break;
      case "emojify":   await handleEmojify(sock, msg, rest); break;
      case "vapor":     await handleVapor(sock, msg, rest); break;
      case "cat":       await handleCat(sock, msg); break;
      case "dog":       await handleDog(sock, msg); break;
      case "random":    await handleRandom(sock, msg, rest); break;

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

      case "trivia": { const r = startTrivia(jid); await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }
      case "skip":   { const r = skipTrivia(jid);  await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }
      case "math":   { const r = startMath(jid);   await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }

      // ── TOOLS ──────────────────────────────────────────────────────────────
      case "wiki":
      case "wikipedia": await handleWiki(sock, msg, rest); break;
      case "weather":   await handleWeather(sock, msg, rest); break;

      case "translate":
      case "tr":
        await handleTranslate(sock, msg, rest);
        break;

      case "calc":
      case "calculate": await handleCalc(sock, msg, rest); break;

      case "qr":
      case "qrcode":    await handleQRGen(sock, msg, rest); break;

      case "password":
      case "pass":      await handlePassword(sock, msg, rest); break;

      case "shorten":
      case "urlshort":  await handleShorten(sock, msg, rest); break;

      case "base64": {
        const b = rest.split(" ");
        await handleBase64(sock, msg, b.slice(1).join(" "), b[0] === "decode");
        break;
      }

      case "binary":    await handleBinary(sock, msg, rest, false); break;
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
      case "format":    await handleFormat(sock, msg, rest.split(" ")[0] ?? "", rest.split(" ").slice(1).join(" ")); break;
      case "react":     await handleReact(sock, msg, rest); break;
      case "disappear": await handleDisappear(sock, msg, rest.toLowerCase()); break;
      case "anime":     await handleAnime(sock, msg, rest); break;
      case "crypto":    await handleCrypto(sock, msg, rest); break;
      case "news":      await handleNews(sock, msg, rest); break;
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

      // ── ANTIDELETE ─────────────────────────────────────────────────────────
      case "antidelete":
      case "ad": {
        const sub = rest.trim().toLowerCase();
        if (sub === "on") {
          setAntidelete(jid, true);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete ENABLED* for this chat!\n\nDeleted messages will be re-posted here with sender info.\nUse \`${config.BOT_CONFIG.prefix}antidelete off\` to disable.`,
          }, { quoted: msg });
        } else if (sub === "off") {
          setAntidelete(jid, false);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete DISABLED* for this chat.\n\nUse \`${config.BOT_CONFIG.prefix}antidelete on\` to re-enable.`,
          }, { quoted: msg });
        } else {
          const status = isAntideleteOn(jid);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete Status*\n\n` +
              `Status: ${status ? "ENABLED 🟢" : "DISABLED 🔴"}\n\n` +
              `Use \`${config.BOT_CONFIG.prefix}antidelete on/off\` to toggle.`,
          }, { quoted: msg });
        }
        break;
      }

      // ── GROUP — NEW ────────────────────────────────────────────────────────
      case "groupinvite":
      case "gclink":
      case "invitelink":  await handleGroupInviteLink(sock, msg); break;

      case "joingroup":
      case "join":        await handleJoinGroup(sock, msg, rest); break;

      case "leavegroup":
      case "leave":       await handleLeaveGroup(sock, msg); break;

      case "groupmeta":
      case "groupmetadata": await handleGroupMetadata(sock, msg); break;

      case "revokeinvite":
      case "revoke":      await handleRevokeInvite(sock, msg); break;

      // ── UTILITY+ ───────────────────────────────────────────────────────────
      case "getnewsletter":
      case "newsletter":  await handleGetNewsletter(sock, msg, rest); break;

      case "getjid":
      case "tojid2":      await handleGetJid(sock, msg, rest); break;

      case "mention":     await handleMention(sock, msg, rest); break;

      case "broadcast":
      case "bc":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleBroadcast(sock, msg, rest);
        break;

      // ── DOWNLOADER ─────────────────────────────────────────────────────────
      case "ytmp3":
      case "song":
      case "play":      await handleYouTubeDownload(sock, msg, rest, true); break;
      case "ytmp4":
      case "ytvid":     await handleYouTubeDownload(sock, msg, rest, false); break;
      case "ttdl":
      case "tiktok":    await handleTikTokDownload(sock, msg, rest); break;
      case "igdl":
      case "instagram": await handleInstagramDownload(sock, msg, rest); break;

      // ── STATUS GRAB ───────────────────────────────────────────────────────
      case "grabstatus":
      case "getstatus":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleGrabStatus(sock, msg, rest);
        break;

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
