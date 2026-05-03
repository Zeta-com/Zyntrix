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
import { fakeTypeMode, fakeRecordMode } from "./state.js";
import { setQR, setConnected } from "./qrstore.js";
import { cacheMessage, handleDeletedMessage } from "./handlers/messageDelete.js";
import { handleViewOnce, handleVVCommand } from "./handlers/viewOnce.js";
import { handleStatusGrab } from "./handlers/status.js";
import { handleCommand, getMessageText, getJid } from "./handlers/commands.js";
import { hasActiveTrivia, checkTriviaAnswer } from "./games/trivia.js";
import { hasActiveMath, checkMathAnswer } from "./games/math.js";
import { sendCTA } from "./helpers/cta.js";

// ──────────────────────────────────────────────────────────────
// Intercepts sock.sendMessage to send text-only messages as CTA
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Main bot start function
// ──────────────────────────────────────────────────────────────
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

    if (connection === "connecting") {
      console.log("⏳ Connecting to WhatsApp...");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      logger.info({ shouldReconnect }, "Connection closed");

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        setTimeout(() => startBot(), 5000);
      } else {
        console.log("⚠️ Logged out — deleting session...");
        if (fs.existsSync(BOT_CONFIG.sessionDir)) {
          fs.rmSync(BOT_CONFIG.sessionDir, { recursive: true });
        }
        setTimeout(() => startBot(), 2000);
      }
    } else if (connection === "open") {
      setConnected();

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

      if (!isFromMe) {
        cacheMessage(msg);

        // Fake typing / recording
        try {
          if (fakeTypeMode || fakeRecordMode) {
            const mode = fakeRecordMode ? "recording" : "composing";
            await sock.sendPresenceUpdate(mode as any, jid);
          }
        } catch (err) {
          logger.warn({ err }, "Failed to update fake presence");
        }
      }

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

      // View-once spy
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