import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import * as config from "../config.js";
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

function isOwner(msg: WAMessage): boolean {
  const sender = getSender(msg);
  if (config.botOwnerJid) return config.isOwnerJid(sender) || config.isOwnerJid(msg.key.remoteJid ?? "");
  const owner = config.BOT_CONFIG.ownerNumber;
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
║   🤖 ${config.BOT_CONFIG.botName} MENU 🤖    ║
╚═══════════════════════╝

📌 GENERAL
• .menu — This menu
• .alive — Check bot status
• .ping — Measure bot latency
• .uptime — How long bot is running
• .tojid <channel link> — Extract channel JID

... (rest of menu stays the same, references config.BOT_CONFIG, config.prefix, etc.)
`;

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

  if (!config.isPublicMode && !isOwner(msg)) {
    await sock.sendMessage(jid, {
      text: `🔒 *Private Mode*\nThis bot is owner-only.\n\nContact the owner to get access.`,
    });
    return;
  }

  try {
    switch (command) {
      case "menu":
      case "help":
      case "start":
        await sock.sendMessage(jid, { text: MENU_TEXT }, { quoted: msg });
        break;

      case "alive": {
        await sock.sendMessage(jid, {
          text: `✅ *I'm Alive!* 🤖🔥\n\n_Getting full status..._`,
        }, { quoted: msg });

        await new Promise(r => setTimeout(r, 800));

        await sock.sendMessage(jid, {
          text: `🤖 *${config.BOT_CONFIG.botName} — System Status*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🟢 Status: *ONLINE*\n` +
            `⏱️ Uptime: *${getUptime()}*\n` +
            `🔑 Mode: *${config.isPublicMode ? "Public 🌍" : "Private 🔒"}*\n` +
            `👑 Owner: *${config.botOwnerJid ? "+" + config.botOwnerJid.split("@")[0] : "Not set"}*\n` +
            `📅 Date: *${new Date().toLocaleString()}*\n` +
            `📡 Connected: *Yes ✅*\n\n` +
            `_Type *.menu* to see all commands_`,
        }, { quoted: msg });
        break;
      }

      case "public":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!* You can't change bot mode." });
          break;
        }
        config.setPublicMode(true);
        await sock.sendMessage(jid, {
          text: "✅ *Public Mode ON*\nEveryone can now use bot commands.",
        }, { quoted: msg });
        break;

      case "private":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "👑 *Owner only command!* You can't change bot mode." });
          break;
        }
        config.setPublicMode(false);
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