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
import { BOT_CONFIG, setBotOwnerJid } from "./config.js";
import { setQR, setConnected, setSock } from "./qrstore.js";
import { patchSockForCTA, attachBotHandlers } from "./handlers/setup.js";
import { startTelegramBot } from "./telegram/bot.js";

// ── Telegram singleton guard — only ever start once ──────────────────────────
let telegramStarted = false;

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
      setSock(sock);
      if (sock.user?.id) setBotOwnerJid(sock.user.id);
      console.log(`\n✅ ${BOT_CONFIG.botName} is ONLINE! Owner: ${sock.user?.id ?? "unknown"}\n`);
    }
  });

  // ── Attach all command/game/chatbot handlers ──────────────────────────────
  attachBotHandlers(sock);

  // ── Start Telegram bot exactly once — never again on reconnects ───────────
  if (!telegramStarted) {
    telegramStarted = true;
    startTelegramBot().catch((e: any) => {
      console.log("[Telegram] Failed to start:", e.message);
      telegramStarted = false; // allow retry on next reconnect if it errored
    });
  }

  return sock;
}
