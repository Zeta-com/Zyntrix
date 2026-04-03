import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { BOT_CONFIG, isPublicMode, setPublicMode, isOwnerJid, botOwnerJid } from "../config.js";
import { getUptime, addToConversation, getConversationHistory } from "../store.js";
import { startTrivia, checkTriviaAnswer, skipTrivia } from "../games/trivia.js";
import { getTruth, getDare, getTruthOrDare } from "../games/truthordare.js";
import { playRPS } from "../games/rps.js";
import { startMath } from "../games/math.js";
import { logger } from "../../lib/logger.js";
import { setFakeType, setFakeRecord } from "../state.js";
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
import { sendCTA } from "../helpers/cta.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

function isOwner(msg: WAMessage): boolean {
  const sender = getSender(msg);
  // If bot owner JID is auto-detected, use it
  if (botOwnerJid) return isOwnerJid(sender) || isOwnerJid(msg.key.remoteJid ?? "");
  // Fallback to env var
  const owner = BOT_CONFIG.ownerNumber;
  if (!owner) return true;
  return sender.includes(owner) || (msg.key.remoteJid ?? "").includes(owner);
}

function getJid(msg: WAMessage): string {
  return msg.key.remoteJid ?? "";
}

function getMessageText(msg: WAMessage): string {
  return (
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    ""
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────
export const MENU_TEXT = `╔═══════════════════════╗
║   🤖 *${BOT_CONFIG.botName} MENU* 🤖    ║
╚═══════════════════════╝

*📌 GENERAL*
• *.menu* — This menu
• *.alive* — Check bot status
• *.ping* — Measure bot latency
• *.uptime* — How long bot is running
• *.tojid <channel link>* — Extract channel JID

*⬇️ DOWNLOADERS*
• *.tiktok <url>* — TikTok (no watermark)
• *.instagram <url>* — Instagram reel/post
• *.youtube <url>* — YouTube video
• *.ytaudio <url>* — YouTube → MP3

*🎬 MOVIES*
• *.movie <name>* — Search movies/series
• *.dlmovie <id> [s] [ep]* — Download movie
• *.smsubs <id> [s] [ep]* — List subtitles

*🎨 MEDIA & STICKERS*
• *.sticker* — Image → WhatsApp sticker
• *.toimg* — Sticker → Image
• *.qr <text>* — Generate QR code image
• *.ss <url>* — Screenshot a website
• *.vv* — Unlock view-once (reply to it)

*🎮 GAMES*
• *.trivia* — Trivia question
• *.truth* — Truth question
• *.dare* — Dare challenge
• *.tod* — Random truth or dare
• *.rps rock|paper|scissors* — RPS game
• *.math* — Math challenge
• *.skip* — Skip current game

*😂 FUN STUFF*
• *.joke* — Random internet joke
• *.meme* — Random meme image
• *.cat* — Random cat pic 🐱
• *.dog* — Random dog pic 🐶
• *.nasa* — NASA picture of the day 🌌
• *.anime <name>* — Anime info
• *.8ball <question>* — Magic 8 ball
• *.ship Name1 | Name2* — Love % meter
• *.mock <text>* — SpOnGeBoB text
• *.reverse <text>* — Reverse text
• *.vapor <text>* — Ｖａｐｏｒｗａｖｅ
• *.emojify <text>* — Add emojis 🔥
• *.fancy <text>* — All fancy fonts
• *.font bold|italic|bubble <text>* — 1 font
• *.bold/italic/mono/strike <text>* — Format
• *.coinflip* — Heads or tails
• *.dice [sides]* — Roll a dice
• *.random [min] [max]* — Random number
• *.rate <thing>* — Rate anything /10
• *.choose A | B | C* — Pick randomly
• *.quote* — Motivational quote
• *.roast [name]* — 🔥 Roast
• *.compliment [name]* — Compliment
• *.fact* — Random fun fact
• *.spam <n> <text>* — Send msg n times

*🔧 UTILITY*
• *.wiki <topic>* — Wikipedia summary
• *.weather <city>* — Live weather
• *.tr <lang> <text>* — Translate
• *.calc <expr>* — Calculator
• *.define <word>* — Dictionary
• *.time <city>* — World clock
• *.country <name>* — Country info
• *.crypto <coin>* — Crypto prices
• *.github <user>* — GitHub profile
• *.news [topic]* — News headlines
• *.ip <address>* — IP lookup
• *.short <url>* — Shorten URL
• *.pingurl <url>* — Site uptime check
• *.wc <text>* — Word count stats
• *.password [len]* — Generate password
• *.b64 / .unb64 <text>* — Base64
• *.bin / .unbin <text>* — Binary
• *.hash [algo] <text>* — Hash text
• *.react <emoji>* — React to msg

*👥 GROUP COMMANDS*
• *.tagall [msg]* — Tag everyone
• *.groupinfo* — Group details
• *.admins* — List admins
• *.pp [@user]* — Profile picture
• *.kick* — Kick member (reply) 👑
• *.promote/demote* — Admin control 👑
• *.mute/unmute* — Lock group 👑
• *.disappear on|off* — Auto-delete msgs

*💬 AI CHAT*
• *.chat <msg>* — Chat with AI
• *.clearchat* — Clear chat history

*👁️ SPY FEATURES*
• *.deleted* — Show deleted messages
• *.vv* — Unlock view-once media

*🔴 OWNER ONLY*
• *.public* — Allow everyone to use bot
• *.private* — Owner-only mode
• *.faketype on|off* — Fake typing 👑
• *.fakerecord on|off* — Fake voice rec 👑
• *.broadcast <msg>* — Send to all 👑

_Prefix: *${BOT_CONFIG.prefix}*  |  👑 = Owner/Admin only_
_Join channel: ${BOT_CONFIG.channelUrl}_`;

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

  if (!isPublicMode && !isOwner(msg)) {
    await sock.sendMessage(jid, {
      text: `🔒 *Private Mode*\nThis bot is owner-only.\n\nContact the owner to get access.`,
    });
    return;
  }

  try {
    switch (command) {

      // ── General ─────────────────────────────────────────────────────────
      case "menu":
      case "help":
      case "start":
        await sendCTA(sock, jid, MENU_TEXT, {
          footer: BOT_CONFIG.botName,
          buttonText: "📢 Join Our Channel",
          quoted: msg,
        });
        break;

      case "alive": {
        // Step 1 — quick alive blip
        await sock.sendMessage(jid, {
          text: `✅ *I'm Alive!* 🤖🔥\n\n_Getting full status..._`,
        }, { quoted: msg });
        // Step 2 — full details card with CTA button
        await new Promise(r => setTimeout(r, 800));
        const aliveText =
          `🤖 *${BOT_CONFIG.botName} — System Status*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 Status: *ONLINE*\n` +
          `⏱️ Uptime: *${getUptime()}*\n` +
          `🔑 Mode: *${isPublicMode ? "Public 🌍" : "Private 🔒"}*\n` +
          `👑 Owner: *${botOwnerJid ? "+" + botOwnerJid.split("@")[0] : "Not set"}*\n` +
          `📅 Date: *${new Date().toLocaleString()}*\n` +
          `📡 Connected: *Yes ✅*\n\n` +
          `_Type *.menu* to see all commands_`;
        await sendCTA(sock, jid, aliveText, {
          footer: BOT_CONFIG.botName,
          buttonText: "📢 Join Our Channel",
        });
        break;
      }

      case "ping": {
        const start = Date.now();
        await sock.sendMessage(jid, { react: { text: "🏓", key: msg.key } });
        const latency = Date.now() - start;
        const quality =
          latency < 200 ? "🟢 Excellent" :
          latency < 500 ? "🟡 Good" :
          latency < 1000 ? "🟠 Fair" : "🔴 Poor";
        const pingText =
          `🏓 *Pong!*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ Latency: *${latency}ms*\n` +
          `📶 Quality: *${quality}*\n` +
          `🟢 Bot Status: *Online*`;
        await sendCTA(sock, jid, pingText, {
          footer: BOT_CONFIG.botName,
          buttonText: "📢 Join Our Channel",
          quoted: msg,
        });
        break;
      }

      case "uptime":
        await sock.sendMessage(jid, {
          text: `⏱️ *Bot Uptime:* ${getUptime()}\n🟢 Running strong!`,
        }, { quoted: msg });
        break;

      case "tojid": {
        const url = rest.trim();
        if (!url) {
          await sock.sendMessage(jid, {
            text: "Usage: *.tojid <WhatsApp channel link>*\nExample: *.tojid https://whatsapp.com/channel/0029Vb...*",
          }, { quoted: msg });
          break;
        }
        const match = url.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/);
        if (!match?.[1]) {
          await sock.sendMessage(jid, { text: "❌ Invalid WhatsApp channel link." }, { quoted: msg });
          break;
        }
        const newsletterJid = `${match[1]}@newsletter`;
        await sock.sendMessage(jid, {
          text:
            `📋 *Channel JID Extracted!*\n\n` +
            `🔗 Link: ${url}\n` +
            `🆔 JID: \`${newsletterJid}\`\n\n` +
            `_Copy the JID above to use it in Baileys commands_`,
        }, { quoted: msg });
        break;
      }

      // ── Downloaders ──────────────────────────────────────────────────────
      case "tiktok":
      case "tt":
        await handleTikTokDownload(sock, msg, rest);
        break;

      case "instagram":
      case "ig":
      case "insta":
        await handleInstagramDownload(sock, msg, rest);
        break;

      case "youtube":
      case "yt":
        await handleYouTubeDownload(sock, msg, rest, false);
        break;

      case "ytaudio":
      case "yta":
      case "ytmp3":
        await handleYouTubeDownload(sock, msg, rest, true);
        break;

      // ── Movies ────────────────────────────────────────────────────────────
      case "movie":
      case "sm":
      case "cineverse":
      case "film":
        await handleMovieSearch(sock, msg, rest);
        break;

      case "dlmovie":
      case "downloadmovie":
        await handleMovieDownload(sock, msg, rest);
        break;

      case "smsubs":
      case "moviesubs":
        await handleMovieSubs(sock, msg, rest);
        break;

      // ── Media ─────────────────────────────────────────────────────────────
      case "sticker":
      case "s":
      case "stiker":
        await handleSticker(sock, msg);
        break;

      case "toimg":
      case "toimage":
        await handleStickerToImage(sock, msg);
        break;

      case "qr":
      case "qrgen":
        await handleQRGen(sock, msg, rest);
        break;

      case "ss":
      case "screenshot":
        await handleScreenshot(sock, msg, rest);
        break;

      // ── Games ─────────────────────────────────────────────────────────────
      case "trivia":
        await sock.sendMessage(jid, { text: startTrivia(jid) }, { quoted: msg });
        break;

      case "skip":
        await sock.sendMessage(jid, { text: skipTrivia(jid) }, { quoted: msg });
        break;

      case "truth":
        await sock.sendMessage(jid, { text: getTruth() }, { quoted: msg });
        break;

      case "dare":
        await sock.sendMessage(jid, { text: getDare() }, { quoted: msg });
        break;

      case "tod":
        await sock.sendMessage(jid, { text: getTruthOrDare() }, { quoted: msg });
        break;

      case "rps":
        await sock.sendMessage(jid, { text: playRPS(rest) }, { quoted: msg });
        break;

      case "math":
        await sock.sendMessage(jid, { text: startMath(jid) }, { quoted: msg });
        break;

      // ── Fun ───────────────────────────────────────────────────────────────
      case "joke":
        await handleJoke(sock, msg);
        break;

      case "meme":
        await handleMeme(sock, msg);
        break;

      case "cat":
        await handleCat(sock, msg);
        break;

      case "dog":
        await handleDog(sock, msg);
        break;

      case "nasa":
      case "space":
        await handleNASA(sock, msg);
        break;

      case "anime":
        await handleAnime(sock, msg, rest);
        break;

      case "8ball":
        await handle8Ball(sock, msg, rest);
        break;

      case "ship":
        await handleShip(sock, msg, rest);
        break;

      case "mock":
        await handleMock(sock, msg, rest);
        break;

      case "reverse":
        await handleReverse(sock, msg, rest);
        break;

      case "vapor":
      case "vaporwave":
        await handleVapor(sock, msg, rest);
        break;

      case "emojify":
        await handleEmojify(sock, msg, rest);
        break;

      case "fancy":
        await handleFancy(sock, msg, rest);
        break;

      case "font":
        await handleFont(sock, msg, rest);
        break;

      case "bold":
      case "italic":
      case "mono":
      case "strike":
      case "spoiler":
        await handleFormat(sock, msg, command, rest);
        break;

      case "coinflip":
      case "coin":
        await handleCoinFlip(sock, msg);
        break;

      case "dice":
      case "roll":
        await handleDice(sock, msg, rest);
        break;

      case "random":
      case "rand":
        await handleRandom(sock, msg, rest);
        break;

      case "rate":
        await handleRate(sock, msg, rest);
        break;

      case "choose":
      case "pick":
        await handleChoose(sock, msg, rest);
        break;

      case "quote":
      case "inspire":
        await handleQuote(sock, msg);
        break;

      case "roast":
        await handleRoast(sock, msg, rest);
        break;

      case "compliment":
      case "flatter":
        await handleCompliment(sock, msg, rest);
        break;

      case "fact":
        await handleFact(sock, msg);
        break;

      case "spam":
        await handleSpam(sock, msg, rest);
        break;

      case "react":
        await handleReact(sock, msg, rest);
        break;

      // ── Utility ───────────────────────────────────────────────────────────
      case "wiki":
      case "wikipedia":
        await handleWiki(sock, msg, rest);
        break;

      case "weather":
        await handleWeather(sock, msg, rest);
        break;

      case "tr":
      case "translate":
        await handleTranslate(sock, msg, rest);
        break;

      case "calc":
      case "calculate":
        await handleCalc(sock, msg, rest);
        break;

      case "define":
      case "dict":
        await handleDefine(sock, msg, rest);
        break;

      case "time":
      case "clock":
        await handleTime(sock, msg, rest);
        break;

      case "country":
        await handleCountry(sock, msg, rest);
        break;

      case "crypto":
      case "coin2":
        await handleCrypto(sock, msg, rest);
        break;

      case "github":
      case "gh":
        await handleGithub(sock, msg, rest);
        break;

      case "news":
        await handleNews(sock, msg, rest);
        break;

      case "ip":
      case "iplookup":
        await handleIPLookup(sock, msg, rest);
        break;

      case "short":
      case "shorten":
        await handleShorten(sock, msg, rest);
        break;

      case "pingurl":
      case "checksite":
        await handlePingUrl(sock, msg, rest);
        break;

      case "wc":
      case "wordcount":
        await handleWordCount(sock, msg, rest);
        break;

      case "password":
      case "pass":
        await handlePassword(sock, msg, rest);
        break;

      case "b64":
      case "base64":
        await handleBase64(sock, msg, rest, false);
        break;

      case "unb64":
        await handleBase64(sock, msg, rest, true);
        break;

      case "bin":
      case "binary":
        await handleBinary(sock, msg, rest, false);
        break;

      case "unbin":
        await handleBinary(sock, msg, rest, true);
        break;

      case "hash":
        await handleHash(sock, msg, rest);
        break;

      // ── Group ─────────────────────────────────────────────────────────────
      case "tagall":
      case "everyone":
      case "all":
        await handleTagAll(sock, msg, rest);
        break;

      case "groupinfo":
      case "ginfo":
        await handleGroupInfo(sock, msg);
        break;

      case "admins":
      case "admin":
        await handleAdmins(sock, msg);
        break;

      case "pp":
      case "pfp":
        await handleProfilePic(sock, msg, rest);
        break;

      case "kick":
      case "remove":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        await handleKick(sock, msg);
        break;

      case "promote":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        await handlePromote(sock, msg, true);
        break;

      case "demote":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        await handlePromote(sock, msg, false);
        break;

      case "mute":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        await handleMuteGroup(sock, msg, true);
        break;

      case "unmute":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        await handleMuteGroup(sock, msg, false);
        break;

      case "disappear":
        await handleDisappear(sock, msg, rest.toLowerCase());
        break;

      // ── AI Chat ───────────────────────────────────────────────────────────
      case "chat": {
        if (!rest) {
          await sock.sendMessage(jid, { text: "Usage: *.chat <message>*" }, { quoted: msg });
          break;
        }
        addToConversation(jid, "user", rest);
        const history = getConversationHistory(jid);
        const response = await generateAIResponse(history);
        addToConversation(jid, "bot", response);
        await sock.sendMessage(jid, { text: `🤖 ${response}` }, { quoted: msg });
        break;
      }

      case "clearchat":
        import("../store.js").then(({ clearConversation }) => clearConversation(jid));
        await sock.sendMessage(jid, { text: "✅ Chat history cleared!" }, { quoted: msg });
        break;

      // ── Spy ───────────────────────────────────────────────────────────────
      case "deleted": {
        const { getDeletedMessages } = await import("../store.js");
        const msgs = getDeletedMessages();
        if (msgs.length === 0) {
          await sock.sendMessage(jid, { text: "📭 No deleted messages yet." }, { quoted: msg });
        } else {
          const list = msgs.slice(0, 10).map((m, i) =>
            `*${i + 1}.* +${m.sender.split("@")[0]}\n   "${m.text || `[${m.mediaType ?? "media"}]`}"\n   _${new Date(m.timestamp).toLocaleString()}_`
          ).join("\n\n");
          await sock.sendMessage(jid, { text: `🗑️ *Deleted Messages*\n\n${list}` }, { quoted: msg });
        }
        break;
      }

      // ── Owner commands ────────────────────────────────────────────────────
      case "public":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!* You can't change bot mode." });
          break;
        }
        setPublicMode(true);
        await sock.sendMessage(jid, {
          text: "✅ *Public Mode ON*\nEveryone can now use bot commands.",
        }, { quoted: msg });
        break;

      case "private":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!* You can't change bot mode." });
          break;
        }
        setPublicMode(false);
        await sock.sendMessage(jid, {
          text: "🔒 *Private Mode ON*\nOnly the owner can use bot commands.",
        }, { quoted: msg });
        break;

      case "faketype": {
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        const on = rest.toLowerCase() === "on";
        setFakeType(on);
        await sock.sendMessage(jid, {
          text: on
            ? "⌨️ *Fake Typing Mode ON!*\nThe bot will show typing... to everyone who messages it."
            : "⌨️ *Fake Typing Mode OFF.*",
        }, { quoted: msg });
        break;
      }

      case "fakerecord": {
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        const on = rest.toLowerCase() === "on";
        setFakeRecord(on);
        await sock.sendMessage(jid, {
          text: on
            ? "🎙️ *Fake Recording Mode ON!*\nThe bot will show 'recording...' to everyone who messages it."
            : "🎙️ *Fake Recording Mode OFF.*",
        }, { quoted: msg });
        break;
      }

      case "broadcast": {
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!*" });
          break;
        }
        if (!rest) {
          await sock.sendMessage(jid, { text: "Usage: *.broadcast <message>*" }, { quoted: msg });
          break;
        }
        await sock.sendMessage(jid, {
          text: `📢 *Broadcasting:* "${rest}"\n_Feature requires a contact list. Use in DM._`,
        }, { quoted: msg });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    await sock.sendMessage(jid, {
      text: `❌ Something went wrong with *.${command}*. Try again.`,
    }, { quoted: msg });
  }
}

async function generateAIResponse(history: { role: string; text: string }[]): Promise<string> {
  const responses = [
    "That's really interesting! Tell me more 👀",
    "I see what you mean! What do you think about it?",
    "Facts! I couldn't agree more 💯",
    "Wow, I hadn't thought about it that way!",
    "That's a great question. It depends on the situation 🤔",
    "Ha! You always have something interesting to say 😄",
    "Absolutely! You're speaking facts right now 🔥",
    "Hmm, that's tricky. What would YOU do though?",
    "You know what, that's surprisingly deep 🌟",
    "Really? That's wild. Tell me more!",
    "Bro you're so right about that 😭",
    "No cap, that's actually facts 💀",
    "Okay okay, I hear you! Keep going 👂",
    "Damn, never thought about it like that 🌟",
    "Say less, I completely understand 😌",
  ];
  const lastMsg = history[history.length - 1]?.text ?? "";
  if (lastMsg.includes("?")) return responses[Math.floor(Math.random() * 5)];
  return responses[Math.floor(Math.random() * responses.length)];
}

export { getMessageText, getSender, isOwner, getJid, checkTriviaAnswer };
