import TelegramBot from "node-telegram-bot-api";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import pino from "pino";
import { setBotOwnerJid } from "../config.js";

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const SESSIONS_DIR = "./sessions";

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Active socket registry: telegramChatId → WASocket
const activeSockets = new Map<string, any>();
const qrMessages = new Map<number, number>();
const userState: Record<number, string> = {};

export function startTelegramBot() {
  if (!TOKEN) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot.");
    return;
  }

  const bot = new TelegramBot(TOKEN, { polling: true });
  console.log("[Telegram] Bot started!");

  // ── /start ────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `👋 *Welcome to WhatsBot Manager!*\n\nLink your WhatsApp account below to start using the bot.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Link via QR Code", callback_data: "link_qr" }],
            [{ text: "📱 Link via Phone Number", callback_data: "link_pair" }],
            [{ text: "❓ Help", callback_data: "help" }],
          ],
        },
      }
    );
  });

  bot.onText(/\/link/, (msg) => handleQRLink(bot, msg.chat.id));
  bot.onText(/\/status/, (msg) => {
    const id = String(msg.chat.id);
    const active = activeSockets.has(id);
    bot.sendMessage(msg.chat.id, active ? "✅ *WhatsApp is connected!*" : "❌ *Not connected.* Use /start to link.", { parse_mode: "Markdown" });
  });
  bot.onText(/\/disconnect/, (msg) => {
    const id = String(msg.chat.id);
    if (activeSockets.has(id)) {
      const s = activeSockets.get(id);
      try { s.ev?.removeAllListeners(); s.ws?.close(); s.end?.(); } catch {}
      activeSockets.delete(id);
    }
    bot.sendMessage(msg.chat.id, "❌ *Disconnected.* Use /start to reconnect.", { parse_mode: "Markdown" });
  });

  // ── Callback buttons ──────────────────────────────────────────────────────
  bot.on("callback_query", async (q) => {
    const chatId = q.message!.chat.id;
    await bot.answerCallbackQuery(q.id);

    if (q.data === "link_qr") return handleQRLink(bot, chatId);

    if (q.data === "link_pair") {
      userState[chatId] = "WAITING_NUM";
      return bot.sendMessage(
        chatId,
        "📱 *Send your WhatsApp number* (with country code, no +)\n\nExample: `2349031646071`",
        { parse_mode: "Markdown" }
      );
    }

    if (q.data === "help") {
      return bot.sendMessage(
        chatId,
        `❓ *How to connect:*\n\n*Option 1 — QR Code:*\nTap "Link via QR Code", scan the QR in WhatsApp → Linked Devices\n\n*Option 2 — Phone Number:*\nTap "Link via Phone Number", send your number, then enter the code in WhatsApp → Linked Devices → Link with phone number\n\nAfter linking, send *.menu* on WhatsApp to get started!`,
        { parse_mode: "Markdown" }
      );
    }

    if (q.data === "cancel") {
      const sessionId = String(chatId);
      if (activeSockets.has(sessionId)) {
        const s = activeSockets.get(sessionId);
        try { s.ev?.removeAllListeners(); s.ws?.close(); s.end?.(); } catch {}
        activeSockets.delete(sessionId);
      }
      const prev = qrMessages.get(chatId);
      if (prev) { bot.deleteMessage(chatId, prev).catch(() => {}); qrMessages.delete(chatId); }
      return bot.sendMessage(chatId, "❌ *Cancelled.*", { parse_mode: "Markdown" });
    }
  });

  // ── Phone number input ────────────────────────────────────────────────────
  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === "WAITING_NUM" && msg.text && !msg.text.startsWith("/")) {
      const number = msg.text.replace(/[^0-9]/g, "");
      if (number.length < 10) {
        bot.sendMessage(chatId, "❌ Invalid number format. Try again:");
        return;
      }
      delete userState[chatId];
      const sessionPath = path.join(SESSIONS_DIR, number);
      if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
      bot.sendMessage(
        chatId,
        `🔄 *Processing +${number}...*\n\n1. Open WhatsApp\n2. Tap ⋮ → Linked Devices → Link a Device\n3. Tap "Link with phone number"\n4. Enter the code when it appears below...`,
        { parse_mode: "Markdown" }
      );
      startWhatsAppSession(bot, chatId, number, true);
    }
  });
}

// ── Initiate QR link ─────────────────────────────────────────────────────────
async function handleQRLink(bot: TelegramBot, chatId: number) {
  const sessionId = String(chatId);
  if (activeSockets.has(sessionId)) {
    const s = activeSockets.get(sessionId);
    try { s.ev?.removeAllListeners(); s.ws?.close(); s.end?.(); } catch {}
    activeSockets.delete(sessionId);
  }
  const prev = qrMessages.get(chatId);
  if (prev) { bot.deleteMessage(chatId, prev).catch(() => {}); qrMessages.delete(chatId); }
  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
  await bot.sendMessage(chatId, "⏳ *Generating QR code...*", { parse_mode: "Markdown" });
  startWhatsAppSession(bot, chatId, sessionId, false);
}

// ── Core WhatsApp session starter ─────────────────────────────────────────────
async function startWhatsAppSession(
  bot: TelegramBot,
  tgChatId: number,
  identifier: string,
  usePairing: boolean
) {
  const sessionPath = path.join(SESSIONS_DIR, identifier);
  console.log(`[TG-WA] Starting session: ${identifier}`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    let version: [number, number, number];
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch {
      version = [2, 3000, 1015901307];
    }

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }) as any,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }) as any),
      },
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      connectTimeoutMs: 60000,
    });

    activeSockets.set(identifier, sock);

    // ── Pairing code ─────────────────────────────────────────────────────────
    if (usePairing && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(identifier);
          const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
          bot.sendMessage(
            tgChatId,
            `🔑 *Your WhatsApp Code:*\n\`${formatted}\`\n\n_Tap to copy, then enter it in WhatsApp Linked Devices_`,
            { parse_mode: "Markdown" }
          );
        } catch (e: any) {
          bot.sendMessage(tgChatId, `❌ Pairing failed: ${e.message}\n\nTry /link for QR instead.`);
        }
      }, 6000);
    }

    let qrCount = 0;

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR Code ──────────────────────────────────────────────────────────
      if (qr && !usePairing) {
        qrCount++;
        if (qrCount > 5) {
          bot.sendMessage(tgChatId, "⏰ *QR expired.* Use /link to generate a new one.", { parse_mode: "Markdown" });
          return;
        }
        try {
          const qrBuf = await QRCode.toBuffer(qr, { type: "png", width: 512, margin: 2 });
          const prev = qrMessages.get(tgChatId);
          if (prev) bot.deleteMessage(tgChatId, prev).catch(() => {});
          const sent = await bot.sendPhoto(tgChatId, qrBuf, {
            caption: `📱 *Scan this QR Code*\n\nWhatsApp → ⋮ → Linked Devices → Link a Device\n\n🔄 QR ${qrCount}/5`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel" }]] },
          });
          qrMessages.set(tgChatId, sent.message_id);
        } catch (e: any) {
          console.error("[TG-WA] QR error:", e.message);
        }
      }

      // ── Disconnected ─────────────────────────────────────────────────────
      if (connection === "close") {
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[TG-WA] Closed: ${identifier}, reason: ${reason}`);
        if (reason !== DisconnectReason.loggedOut && reason !== 401) {
          setTimeout(() => startWhatsAppSession(bot, tgChatId, identifier, false), 5000);
        } else {
          bot.sendMessage(tgChatId, "⚠️ *Logged out.* Use /start to reconnect.", { parse_mode: "Markdown" }).catch(() => {});
          if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
          activeSockets.delete(identifier);
        }
      }

      // ── Connected ────────────────────────────────────────────────────────
      if (connection === "open") {
        console.log(`[TG-WA] Connected: ${identifier}`);

        // Auto-register owner
        const myNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? "";
        if (myNumber) setBotOwnerJid(sock.user!.id);

        const prev = qrMessages.get(tgChatId);
        if (prev) { bot.deleteMessage(tgChatId, prev).catch(() => {}); qrMessages.delete(tgChatId); }

        bot.sendMessage(
          tgChatId,
          `✅ *WhatsApp Connected!*\n\n👑 You are now the bot owner.\n📱 Number: +${myNumber}\n\nSend *.menu* on WhatsApp to get started! 🚀`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (e: any) {
    console.error(`[TG-WA] Session error for ${identifier}:`, e.message);
    bot.sendMessage(tgChatId, `❌ Error starting session: ${e.message}`).catch(() => {});
  }
}
