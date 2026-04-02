import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import fs from "fs";
import { logger } from "../lib/logger.js";
import { BOT_CONFIG } from "./config.js";
import { setQR, setConnected } from "./qrstore.js";
import { cacheMessage, handleDeletedMessage } from "./handlers/messageDelete.js";
import { handleViewOnce } from "./handlers/viewOnce.js";
import { handleStatusGrab } from "./handlers/status.js";
import {
  handleCommand,
  getMessageText,
  getJid,
} from "./handlers/commands.js";
import { hasActiveTrivia, checkTriviaAnswer } from "./games/trivia.js";
import { hasActiveMath, checkMathAnswer } from "./games/math.js";

export async function startBot() {
  if (!fs.existsSync(BOT_CONFIG.sessionDir)) {
    fs.mkdirSync(BOT_CONFIG.sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ version }, "Starting WhatsApp bot with Baileys version");

  const sock = makeWASocket({
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

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setQR(qr);
      logger.info("QR Code received! Scan it with WhatsApp:");
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Scan the QR code above with WhatsApp to connect the bot!\n");
      console.log("🌐 Or open this URL in your browser to scan: /api/qr\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      logger.info(
        { shouldReconnect, reason: lastDisconnect?.error?.message },
        "Connection closed"
      );

      if (shouldReconnect) {
        logger.info("Reconnecting in 5 seconds...");
        setTimeout(() => startBot(), 5000);
      } else {
        logger.warn("Logged out. Please delete the session folder and restart.");
        const sessionPath = BOT_CONFIG.sessionDir;
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true });
        }
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === "open") {
      setConnected();
      logger.info(
        `✅ ${BOT_CONFIG.botName} connected successfully! Bot is now online.`
      );
      console.log(`\n✅ ${BOT_CONFIG.botName} is now online and ready!\n`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      cacheMessage(msg);

      const text = getMessageText(msg);
      const jid = getJid(msg);

      const hasViewOnce =
        !!msg.message.viewOnceMessage ||
        !!msg.message.viewOnceMessageV2 ||
        !!msg.message.viewOnceMessageV2Extension;

      if (hasViewOnce) {
        await handleViewOnce(sock, msg);
        continue;
      }

      if (!text) continue;

      if (text.startsWith(BOT_CONFIG.prefix)) {
        const commandText = text.slice(BOT_CONFIG.prefix.length);
        const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";

        if (cmd === "status") {
          const args = commandText.split(/\s+/);
          const target = args[1];
          await handleStatusGrab(sock, msg, target);
        } else {
          await handleCommand(sock, msg, commandText);
        }
        continue;
      }

      if (hasActiveTrivia(jid)) {
        const result = checkTriviaAnswer(jid, text);
        if (result) {
          await sock.sendMessage(jid, { text: result }, { quoted: msg });
          continue;
        }
      }

      if (hasActiveMath(jid)) {
        const result = checkMathAnswer(jid, text);
        if (result) {
          await sock.sendMessage(jid, { text: result }, { quoted: msg });
          continue;
        }
      }
    }
  });

  sock.ev.on("messages.delete", async (update) => {
    if ("keys" in update) {
      await handleDeletedMessage(sock, update);
    }
  });

  return sock;
}
