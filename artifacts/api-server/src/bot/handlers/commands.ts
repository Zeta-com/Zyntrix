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

export const MENU_TEXT = `╔══════════════════════╗
║  🤖 *${BOT_CONFIG.botName} MENU* 🤖  ║
╚══════════════════════╝

*📌 GENERAL*
• *.menu* — Show this menu
• *.alive* — Check if bot is online
• *.uptime* — Show bot uptime
• *.ping* — Ping the bot

*⬇️ DOWNLOADER*
• *.tiktok <url>* — Download TikTok (no watermark)
• *.instagram <url>* — Download Instagram reel/post
• *.youtube <url>* — Download YouTube video
• *.ytaudio <url>* — Download YouTube audio (MP3)

*🎮 GAMES*
• *.trivia* — Answer a trivia question
• *.truth* — Get a truth question
• *.dare* — Get a dare challenge
• *.tod* — Random truth or dare
• *.rps [rock/paper/scissors]* — Rock paper scissors
• *.math* — Math challenge
• *.skip* — Skip current game

*💬 CHAT*
• *.chat [message]* — Chat with AI
• *.clearchat* — Clear AI chat history

*🔍 UTILITY*
• *.deleted* — Show recently deleted messages
• *.status @user* — Grab a user's status info

*👑 OWNER ONLY*
• *.public* — Set bot to public mode
• *.private* — Set bot to private mode (owner only)

_Prefix: ${BOT_CONFIG.prefix}_`;

export async function handleCommand(
  sock: WASocket,
  msg: WAMessage,
  text: string
): Promise<void> {
  const jid = getJid(msg);
  const args = text.trim().split(/\s+/);
  const command = (args[0] ?? "").toLowerCase().replace(BOT_CONFIG.prefix, "");
  const rest = args.slice(1).join(" ");

  if (!isPublicMode && !isOwner(msg)) {
    await sock.sendMessage(jid, {
      text: "🔒 Bot is currently in *private mode*. Only the owner can use commands.",
    });
    return;
  }

  try {
    switch (command) {
      case "menu":
      case "help":
        await sock.sendMessage(jid, { text: MENU_TEXT }, { quoted: msg });
        break;

      case "alive":
      case "ping":
        await sock.sendMessage(
          jid,
          {
            text: `✅ *${BOT_CONFIG.botName} is Online!*\n\n🟢 Status: Active\n⏱️ Uptime: ${getUptime()}\n\nType *.menu* for commands.`,
          },
          { quoted: msg }
        );
        break;

      case "uptime":
        await sock.sendMessage(
          jid,
          { text: `⏱️ *Bot Uptime*\n\n${getUptime()}` },
          { quoted: msg }
        );
        break;

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

      case "chat": {
        if (!rest) {
          await sock.sendMessage(
            jid,
            { text: "Please provide a message! Example: *.chat Hello, how are you?*" },
            { quoted: msg }
          );
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
        await sock.sendMessage(
          jid,
          { text: "✅ Chat history cleared!" },
          { quoted: msg }
        );
        break;

      case "deleted": {
        const { getDeletedMessages } = await import("../store.js");
        const msgs = getDeletedMessages();
        if (msgs.length === 0) {
          await sock.sendMessage(
            jid,
            { text: "📭 No deleted messages recorded yet." },
            { quoted: msg }
          );
        } else {
          const list = msgs
            .slice(0, 10)
            .map(
              (m, i) =>
                `*${i + 1}.* From: ${m.sender}\n   "${m.text || `[${m.mediaType ?? "media"}]`}"\n   _${new Date(m.timestamp).toLocaleString()}_`
            )
            .join("\n\n");
          await sock.sendMessage(
            jid,
            { text: `🗑️ *Recently Deleted Messages*\n\n${list}` },
            { quoted: msg }
          );
        }
        break;
      }

      case "public":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can change this!" });
          break;
        }
        setPublicMode(true);
        await sock.sendMessage(
          jid,
          { text: "✅ Bot is now in *Public Mode*. Everyone can use commands." },
          { quoted: msg }
        );
        break;

      case "private":
        if (!isOwner(msg)) {
          await sock.sendMessage(jid, { text: "❌ Only the owner can change this!" });
          break;
        }
        setPublicMode(false);
        await sock.sendMessage(
          jid,
          { text: "🔒 Bot is now in *Private Mode*. Only owner can use commands." },
          { quoted: msg }
        );
        break;

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
  }
}

async function generateAIResponse(
  history: { role: string; text: string }[]
): Promise<string> {
  const responses = [
    "That's really interesting! Tell me more.",
    "I see what you mean! What do you think about it?",
    "Interesting perspective! I agree with your point.",
    "Wow, I hadn't thought about it that way!",
    "That's a great question! Let me think... I'd say it depends on the situation.",
    "Ha! That made me smile. You always have something interesting to say.",
    "Absolutely! I couldn't agree more.",
    "Hmm, that's tricky. What would you do in that situation?",
    "You know what, that's surprisingly deep. I like the way you think!",
    "Really? That's wild. Tell me more about that.",
  ];

  const lastMsg = history[history.length - 1]?.text ?? "";

  if (lastMsg.includes("?")) {
    return responses[Math.floor(Math.random() * 4)];
  }

  return responses[Math.floor(Math.random() * responses.length)];
}

export { getMessageText, getSender, isOwner, getJid, checkTriviaAnswer };
