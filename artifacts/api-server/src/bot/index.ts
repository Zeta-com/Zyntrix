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
import { fakeTypeMode, fakeRecordMode } from "./state.js";
import { setQR, setConnected } from "./qrstore.js";
import { cacheMessage, handleDeletedMessage } from "./handlers/messageDelete.js";
import { handleViewOnce, handleVVCommand } from "./handlers/viewOnce.js";
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
      logger.info("QR Code received!");
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Scan the QR above or open /api/qr in your browser.\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      logger.info({ shouldReconnect }, "Connection closed");

      if (shouldReconnect) {
        setTimeout(() => startBot(), 5000);
      } else {
        logger.warn("Logged out — deleting session and restarting.");
        const sessionPath = BOT_CONFIG.sessionDir;
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true });
        }
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === "open") {
      setConnected();

      // ── Auto-detect owner from connected account ──────────────────────────
      if (sock.user?.id) {
        setBotOwnerJid(sock.user.id);
      }

      console.log(`\n✅ ${BOT_CONFIG.botName} is ONLINE! Owner: ${sock.user?.id ?? "unknown"}\n`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const text = getMessageText(msg);
      const jid = getJid(msg);
      const isFromMe = msg.key.fromMe === true;

      // ── Cache all incoming messages for delete spy ────────────────────────
      if (!isFromMe) {
        cacheMessage(msg);

        // ── Fake presence (typing/recording simulator) ────────────────────
        if (fakeTypeMode || fakeRecordMode) {
          const targetJid = msg.key.participant ?? jid;
          const mode = fakeRecordMode ? "recording" : "composing";
          // Send presence to the chat (not to the sender specifically)
          sock.sendPresenceUpdate(mode as any, jid).catch(() => {});
        }
      }

      // ── Owner: process commands from bot's own messages ───────────────────
      if (isFromMe) {
        if (text && text.startsWith(BOT_CONFIG.prefix)) {
          console.log(`[CMD/owner] ${text}`);
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

      // ── Others: full message processing ──────────────────────────────────
      const hasViewOnce =
        !!msg.message.viewOnceMessage ||
        !!msg.message.viewOnceMessageV2 ||
        !!msg.message.viewOnceMessageV2Extension;

      if (hasViewOnce) {
        await handleViewOnce(sock, msg);
      }

      if (!text) continue;

      console.log(`[MSG] ${jid}: ${text.slice(0, 80)}`);

      if (text.startsWith(BOT_CONFIG.prefix)) {
        const commandText = text.slice(BOT_CONFIG.prefix.length);
        const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";

        console.log(`[CMD] ${cmd} from ${jid}`);

        // .vv = manual view-once unlock (reply to a view-once)
        if (cmd === "vv") {
          await handleVVCommand(sock, msg);
          continue;
        }

        if (cmd === "status") {
          await handleStatusGrab(sock, msg, commandText.split(/\s+/)[1]);
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
