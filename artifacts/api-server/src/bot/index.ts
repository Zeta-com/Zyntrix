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
import { setQR, setConnected, setDisconnected, setSock } from "./qrstore.js";
import { patchSockForCTA, attachBotHandlers } from "./handlers/setup.js";
import { startTelegramBot } from "./telegram/bot.js";

// ── Telegram singleton guard — only ever start once ──────────────────────────
let telegramStarted = false;

// ── Reconnect guard — avoid stacking multiple concurrent reconnect attempts
//    (e.g. when the network flaps on/off repeatedly in quick succession) ──────
let reconnecting = false;

function scheduleReconnect(delayMs: number) {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    startBot().catch((err) => {
      logger.error({ err }, "Reconnect attempt failed — retrying");
      scheduleReconnect(5000);
    });
  }, delayMs);
}

export async function startBot() {
  try {
    if (!fs.existsSync(BOT_CONFIG.sessionDir)) {
      fs.mkdirSync(BOT_CONFIG.sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.sessionDir);

    let version: [number, number, number];
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch (err) {
      logger.warn({ err }, "Could not fetch latest Baileys version (offline?) — using cached default");
      version = [2, 3000, 1015901307];
    }

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
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 20000,
      retryRequestDelayMs: 500,
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
        setDisconnected();
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        logger.info({ statusCode, loggedOut }, "Connection closed");

        if (loggedOut) {
          logger.warn("Logged out — deleting session and restarting fresh.");
          if (fs.existsSync(BOT_CONFIG.sessionDir)) {
            fs.rmSync(BOT_CONFIG.sessionDir, { recursive: true });
          }
          scheduleReconnect(2000);
        } else {
          // Covers everything else — network drops (data toggled off),
          // connectionLost, restartRequired, timedOut, badSession, etc.
          // Baileys/Node will keep failing DNS lookups while there's no
          // network, so we just keep retrying with a short fixed delay
          // until the connection succeeds again once network returns.
          scheduleReconnect(3000);
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
  } catch (err) {
    // Covers failures before a socket even exists — e.g. no network at
    // startup, corrupted session files, etc. Keep retrying indefinitely.
    logger.error({ err }, "Failed to start bot — retrying shortly");
    scheduleReconnect(5000);
    return undefined;
  }
}
