import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import fs from "fs";
import { logger } from "../lib/logger.js";
import { BOT_CONFIG, setBotOwnerJid } from "./config.js";
import { fakeTypeMode, fakeRecordMode, isChatbotOn } from "./state.js";
import { setQR, setConnected } from "./qrstore.js";
import { cacheMessage, handleDeletedMessage } from "./handlers/messageDelete.js";
import { handleViewOnce, handleVVCommand } from "./handlers/viewOnce.js";
import { handleStatusGrab } from "./handlers/status.js";
import { handleCommand, getMessageText, getJid } from "./handlers/commands.js";
import { fetchMetaAI } from "./handlers/ai.js";
import { hasActiveTrivia, checkTriviaAnswer } from "./games/trivia.js";
import { hasActiveMath, checkMathAnswer } from "./games/math.js";
import { sendCTA } from "./helpers/cta.js";
import { startTelegramBot } from "./telegram/bot.js";

// ── Patch sock.sendMessage: text-only → CTA forwarded style ──────────────────
function patchSockForCTA(sock: WASocket): WASocket {
  const original = sock.sendMessage.bind(sock);

  (sock as any).sendMessage = async (
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions
  ) => {
    const isTextOnly =
      "text" in content &&
      typeof (content as any).text === "string" &&
      !("image" in content) &&
      !("video" in content) &&
      !("audio" in content) &&
      !("sticker" in content) &&
      !("document" in content) &&
      !("react" in content) &&
      !("delete" in content) &&
      !("forward" in content) &&
      !("poll" in content) &&
      !("disappearingMessagesInChat" in content) &&
      !("groupUpdate" in content);

    if (isTextOnly) {
      await sendCTA(sock, jid, (content as any).text as string, {
        forwarded: true,
        quoted: options?.quoted as any,
        footer: BOT_CONFIG.botName,
        buttonText: "📢 Join Our Channel",
      });
      return { key: { id: "", remoteJid: jid, fromMe: true } } as any;
    }

    return original(jid, content, options);
  };

  return sock;
}

export async function startBot() {
  if (!fs.existsSync(BOT_CONFIG.sessionDir)) {
    fs.mkdirSync(BOT_CONFIG.sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ version }, "Starting WhatsApp bot with Baileys version");

  const rawSock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    printQRInTerminal: false,
    logger: logger as any,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  const sock = patchSockForCTA(rawSock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setQR(qr);
      logger.info("QR Code received!");
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Scan the QR above or open /api/qr in your browser.\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      logger.info({ shouldReconnect }, "Connection closed");

      if (shouldReconnect) {
        setTimeout(() => startBot(), 5000);
      } else {
        logger.warn("Logged out — deleting session and restarting.");
        if (fs.existsSync(BOT_CONFIG.sessionDir)) {
          fs.rmSync(BOT_CONFIG.sessionDir, { recursive: true });
        }
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === "open") {
      setConnected();
      if (sock.user?.id) setBotOwnerJid(sock.user.id);
      console.log(`\n✅ ${BOT_CONFIG.botName} is ONLINE! Owner: ${sock.user?.id ?? "unknown"}\n`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const text = getMessageText(msg);
      const chatJid = getJid(msg);
      const sender = msg.key.participant ?? msg.key.remoteJid ?? "";
      const isFromMe = msg.key.fromMe === true;
      const isGroup = chatJid.endsWith("@g.us");

      if (!isFromMe) {
        cacheMessage(msg);

        // Fake typing / recording
        if (fakeTypeMode || fakeRecordMode) {
          sock.sendPresenceUpdate(fakeRecordMode ? "recording" : "composing" as any, chatJid).catch(() => {});
        }
      }

      // Owner typing their own commands
      if (isFromMe) {
        if (text && text.startsWith(BOT_CONFIG.prefix)) {
          const commandText = text.slice(BOT_CONFIG.prefix.length);
          const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";
          if (cmd === "status") {
            await handleStatusGrab(sock, msg, commandText.split(/\s+/)[1]);
          } else {
            await handleCommand(sock, msg, commandText);
          }
        }
        continue;
      }

      // View-once spy
      const hasViewOnce =
        !!msg.message.viewOnceMessage ||
        !!msg.message.viewOnceMessageV2 ||
        !!msg.message.viewOnceMessageV2Extension;

      if (hasViewOnce) await handleViewOnce(sock, msg);

      if (!text) continue;

      // ── Command handling ────────────────────────────────────────────────
      if (text.startsWith(BOT_CONFIG.prefix)) {
        const commandText = text.slice(BOT_CONFIG.prefix.length);
        const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";

        if (cmd === "vv") { await handleVVCommand(sock, msg); continue; }
        if (cmd === "status") {
          await handleStatusGrab(sock, msg, commandText.split(/\s+/)[1]);
        } else {
          await handleCommand(sock, msg, commandText);
        }
        continue;
      }

      // ── Active game checks ──────────────────────────────────────────────
      if (hasActiveTrivia(chatJid)) {
        const result = checkTriviaAnswer(chatJid, text);
        if (result) { await sock.sendMessage(chatJid, { text: result }, { quoted: msg }); continue; }
      }

      if (hasActiveMath(chatJid)) {
        const result = checkMathAnswer(chatJid, text);
        if (result) { await sock.sendMessage(chatJid, { text: result }, { quoted: msg }); continue; }
      }

      // ── Chatbot auto-reply (Meta AI) ────────────────────────────────────
      if (isChatbotOn(chatJid)) {
        try {
          const aiResponse = await fetchMetaAI(text);
          if (isGroup && sender) {
            const senderNum = sender.split("@")[0];
            await sock.sendMessage(chatJid, {
              text: `@${senderNum} ${aiResponse}`,
              mentions: [sender],
            } as any, { quoted: msg });
          } else {
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
          }
        } catch {}
      }
    }
  });

  sock.ev.on("messages.delete", async (update) => {
    if ("keys" in update) await handleDeletedMessage(sock, update);
  });

  // Start Telegram bot manager (non-blocking)
  try {
    startTelegramBot();
  } catch (e: any) {
    console.log("[Telegram] Skipped:", e.message);
  }

  return sock;
}
