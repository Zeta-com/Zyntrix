import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { BOT_CONFIG, isPublicMode, setPublicMode } from "../config.js";
import { getUptime, addToConversation, getConversationHistory } from "../store.js";
import { startTrivia, checkTriviaAnswer, skipTrivia } from "../games/trivia.js";
import { getTruth, getDare, getTruthOrDare } from "../games/truthordare.js";
import { playRPS } from "../games/rps.js";
import { startMath } from "../games/math.js";
import { logger } from "../../lib/logger.js";
import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleYouTubeDownload,
} from "./downloader.js";
import {
  handleSticker,
  handleStickerToImage,
  handleJoke,
  handle8Ball,
  handleShip,
  handleMock,
  handleReverse,
  handleVapor,
  handleEmojify,
  handleCoinFlip,
  handleDice,
  handleRate,
  handleChoose,
  handleQuote,
  handleRoast,
  handleCompliment,
  handleFact,
} from "./fun.js";
import {
  handleWiki,
  handleWeather,
  handleTranslate,
  handleCalc,
  handleQRGen,
  handlePassword,
  handleShorten,
  handleBase64,
  handleBinary,
  handleHash,
  handleTime,
  handleDefine,
  handlePingUrl,
  handleWordCount,
  handleScreenshot,
} from "./utility.js";
import {
  handleTagAll,
  handleGroupInfo,
  handleAdmins,
  handleProfilePic,
  handleKick,
  handleMuteGroup,
  handlePromote,
} from "./group.js";
import {
  handleMovieSearch,
  handleMovieSubs,
  handleMovieDownload,
} from "./movie.js";

function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

function isOwner(msg: WAMessage): boolean {
  const sender = getSender(msg);
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

export const MENU_TEXT = `╔═══════════════════════╗
║  🤖 *${BOT_CONFIG.botName} MENU* 🤖   ║
╚═══════════════════════╝

*📌 GENERAL*
• *.menu* — Show this menu
• *.alive* — Check if bot is alive
• *.uptime* — Bot uptime
• *.ping* — Bot response check

*⬇️ DOWNLOADERS*
• *.tiktok <url>* — TikTok (no watermark)
• *.instagram <url>* — Instagram reel/post
• *.youtube <url>* — YouTube video
• *.ytaudio <url>* — YouTube → MP3

*🎨 MEDIA & STICKERS*
• *.sticker* — Image → Sticker
• *.toimg* — Sticker → Image
• *.qr <text>* — Generate QR code
• *.ss <url>* — Screenshot a website

*🎮 GAMES*
• *.trivia* — Trivia question
• *.truth* — Truth question
• *.dare* — Dare challenge
• *.tod* — Random truth or dare
• *.rps rock|paper|scissors* — Rock paper scissors
• *.math* — Math challenge
• *.skip* — Skip current game

*😂 FUN STUFF*
• *.joke* — Random joke
• *.8ball <question>* — Magic 8 ball
• *.ship Name1 | Name2* — Love compatibility
• *.mock <text>* — SpOnGeBoB mock text
• *.reverse <text>* — Reverse text
• *.vapor <text>* — Ｖａｐｏｒｗａｖｅ text
• *.emojify <text>* — Add 🔥 emojis
• *.coinflip* — Heads or tails
• *.dice [sides]* — Roll a dice
• *.rate <thing>* — Rate something /10
• *.choose A | B | C* — Random choice
• *.quote* — Motivational quote
• *.roast [name]* — Roast someone 🔥
• *.compliment [name]* — Compliment someone
• *.fact* — Random fun fact

*🔧 UTILITY*
• *.wiki <topic>* — Wikipedia summary
• *.weather <city>* — Live weather
• *.tr <lang> <text>* — Translate text
• *.calc <expression>* — Calculator
• *.define <word>* — Dictionary lookup
• *.time <city>* — World clock
• *.short <url>* — Shorten a URL
• *.pingurl <url>* — Check if site is up
• *.wc <text>* — Word & char count
• *.password [length]* — Generate password
• *.b64 <text>* — Encode to base64
• *.unb64 <text>* — Decode from base64
• *.bin <text>* — Text to binary
• *.unbin <binary>* — Binary to text
• *.hash [algo] <text>* — Hash text

*👥 GROUP COMMANDS*
• *.tagall [msg]* — Tag everyone
• *.groupinfo* — Group details
• *.admins* — List all admins
• *.pp [@user]* — Get profile picture
• *.kick* — Kick (reply to msg) 👑
• *.promote* — Make admin (reply) 👑
• *.demote* — Remove admin (reply) 👑
• *.mute* — Mute group (admin only) 👑
• *.unmute* — Unmute group 👑

*💬 AI CHAT*
• *.chat <message>* — Chat with AI
• *.clearchat* — Clear AI history

*🔍 SPY FEATURES*
• *.deleted* — Show deleted messages

*👑 OWNER ONLY*
• *.public* — Allow everyone to use bot
• *.private* — Restrict to owner only

_Prefix: *${BOT_CONFIG.prefix}*  |  👑 = Admin/Owner required_`;

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
      text: "🔒 Bot is currently in *private mode*. Only the owner can use commands.",
    });
    return;
  }

  try {
    switch (command) {

      // ── General ───────────────────────────────────────────────────────────
      case "menu":
      case "help":
        await sock.sendMessage(jid, { text: MENU_TEXT }, { quoted: msg });
        break;

      case "alive":
      case "ping":
        await sock.sendMessage(jid, {
          text: `✅ *${BOT_CONFIG.botName} is Online!*\n\n🟢 Status: Active\n⏱️ Uptime: ${getUptime()}\n\nType *.menu* for all commands.`,
        }, { quoted: msg });
        break;

      case "uptime":
        await sock.sendMessage(jid, { text: `⏱️ *Bot Uptime:* ${getUptime()}` }, { quoted: msg });
        break;

      // ── Downloaders ───────────────────────────────────────────────────────
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

      // ── Stickers ──────────────────────────────────────────────────────────
      case "sticker":
      case "s":
      case "stiker":
        await handleSticker(sock, msg);
        break;

      case "toimg":
      case "toimage":
        await handleStickerToImage(sock, msg);
        break;

      // ── QR / Screenshot ───────────────────────────────────────────────────
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

      case "coinflip":
      case "coin":
        await handleCoinFlip(sock, msg);
        break;

      case "dice":
      case "roll":
        await handleDice(sock, msg, rest);
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

      // ── Utility ───────────────────────────────────────────────────────────
      case "wiki":
      case "wikipedia":
        await handleWiki(sock, msg, rest);
        break;

      case "weather":
      case "w":
        await handleWeather(sock, msg, rest);
        break;

      case "tr":
      case "translate":
        await handleTranslate(sock, msg, rest);
        break;

      case "calc":
      case "math2":
      case "calculate":
        await handleCalc(sock, msg, rest);
        break;

      case "define":
      case "dict":
      case "dictionary":
        await handleDefine(sock, msg, rest);
        break;

      case "time":
      case "clock":
        await handleTime(sock, msg, rest);
        break;

      case "short":
      case "shorten":
      case "shorturl":
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
      case "genpass":
        await handlePassword(sock, msg, rest);
        break;

      case "b64":
      case "base64":
        await handleBase64(sock, msg, rest, false);
        break;

      case "unb64":
      case "debase64":
        await handleBase64(sock, msg, rest, true);
        break;

      case "bin":
      case "binary":
        await handleBinary(sock, msg, rest, false);
        break;

      case "unbin":
      case "unbinary":
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
      case "profilepic":
        await handleProfilePic(sock, msg, rest);
        break;

      case "kick":
      case "remove":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner/admin can use this!" });
          break;
        }
        await handleKick(sock, msg);
        break;

      case "promote":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can use this!" });
          break;
        }
        await handlePromote(sock, msg, true);
        break;

      case "demote":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can use this!" });
          break;
        }
        await handlePromote(sock, msg, false);
        break;

      case "mute":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can use this!" });
          break;
        }
        await handleMuteGroup(sock, msg, true);
        break;

      case "unmute":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can use this!" });
          break;
        }
        await handleMuteGroup(sock, msg, false);
        break;

      // ── AI Chat ───────────────────────────────────────────────────────────
      case "chat": {
        if (!rest) {
          await sock.sendMessage(jid, {
            text: "Usage: *.chat <message>*\nExample: *.chat Tell me a fun fact*",
          }, { quoted: msg });
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
          await sock.sendMessage(jid, { text: "📭 No deleted messages recorded yet." }, { quoted: msg });
        } else {
          const list = msgs.slice(0, 10).map((m, i) =>
            `*${i + 1}.* From: ${m.sender}\n   "${m.text || `[${m.mediaType ?? "media"}]`}"\n   _${new Date(m.timestamp).toLocaleString()}_`
          ).join("\n\n");
          await sock.sendMessage(jid, {
            text: `🗑️ *Recently Deleted Messages*\n\n${list}`,
          }, { quoted: msg });
        }
        break;
      }

      // ── Owner ─────────────────────────────────────────────────────────────
      case "public":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can change this!" });
          break;
        }
        setPublicMode(true);
        await sock.sendMessage(jid, {
          text: "✅ Bot is now in *Public Mode*. Everyone can use commands.",
        }, { quoted: msg });
        break;

      case "private":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can change this!" });
          break;
        }
        setPublicMode(false);
        await sock.sendMessage(jid, {
          text: "🔒 Bot is now in *Private Mode*. Only owner can use commands.",
        }, { quoted: msg });
        break;

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    await sock.sendMessage(jid, {
      text: `❌ Something went wrong running *.${command}*. Please try again.`,
    }, { quoted: msg });
  }
}

async function generateAIResponse(history: { role: string; text: string }[]): Promise<string> {
  const responses = [
    "That's really interesting! Tell me more 👀",
    "I see what you mean! What do you think about it?",
    "Facts! I couldn't agree more with that 💯",
    "Wow, I hadn't thought about it that way!",
    "That's a great question. It really depends on the situation 🤔",
    "Ha! You always have something interesting to say 😄",
    "Absolutely! You're speaking facts right now 🔥",
    "Hmm, that's tricky. What would YOU do though?",
    "You know what, that's surprisingly deep. Big brain energy ✨",
    "Really? That's wild. Tell me more about that!",
    "Bro you're so right about that 😭",
    "No cap, that's actually facts 💀",
    "Okay okay, I hear you! Keep going 👂",
    "Damn, never thought about it like that. You're different 🌟",
    "Say less, I completely understand 😌",
  ];
  const lastMsg = history[history.length - 1]?.text ?? "";
  if (lastMsg.includes("?")) return responses[Math.floor(Math.random() * 5)];
  return responses[Math.floor(Math.random() * responses.length)];
}

export { getMessageText, getSender, isOwner, getJid, checkTriviaAnswer };
