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
import { patchSockForCTA, attachBotHandlers } from "../handlers/setup.js";
import { isValidKey, isVerifiedUser, verifyUser } from "../keys.js";

// Support both BOT_TOKEN and TELEGRAM_BOT_TOKEN
const TOKEN =
  process.env["BOT_TOKEN"] ??
  process.env["TELEGRAM_BOT_TOKEN"] ??
  "";

const SESSIONS_DIR = "./sessions";

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const activeSockets = new Map<string, any>();
const qrMessages = new Map<number, number>();

// Track pending states per user
type UserState =
  | "WAITING_NUM"
  | "WAITING_KEY";

const userState: Record<number, UserState> = {};

export async function startTelegramBot() {
  if (!TOKEN) {
    console.log("[Telegram] BOT_TOKEN not set — skipping Telegram bot.");
    return;
  }

  // Drop webhook and clear pending updates before starting polling
  const bot = new TelegramBot(TOKEN, { polling: false });
  try { await bot.deleteWebHook(); } catch {}
  bot.startPolling({ restart: true });
  console.log("[Telegram] Bot started!");

  // ── /start ────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Already verified? Go straight to the connection menu
    if (isVerifiedUser(chatId)) {
      return showConnectionMenu(bot, chatId);
    }

    // Not verified — ask for auth key first
    userState[chatId] = "WAITING_KEY";
    bot.sendMessage(
      chatId,
      `🔐 *Welcome to Zyntrix Bot Manager*\n\nThis bot is protected.\nPlease enter your *authorization key* to continue.\n\n_Keys look like:_ \`ZYNT-XXXX-XXXX-XXXX\`\n\n_Contact the bot admin if you don't have a key._`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/link/, (msg) => {
    if (!isVerifiedUser(msg.chat.id)) {
      return askForKey(bot, msg.chat.id);
    }
    handleQRLink(bot, msg.chat.id);
  });

  bot.onText(/\/status/, (msg) => {
    if (!isVerifiedUser(msg.chat.id)) {
      return askForKey(bot, msg.chat.id);
    }
    const id = String(msg.chat.id);
    const active = activeSockets.has(id);
    bot.sendMessage(
      msg.chat.id,
      active
        ? "✅ *WhatsApp is connected!*\n\nSend *.menu* on WhatsApp to see all commands."
        : "❌ *Not connected.* Use /start to link.",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/disconnect/, (msg) => {
    if (!isVerifiedUser(msg.chat.id)) {
      return askForKey(bot, msg.chat.id);
    }
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

    if (!isVerifiedUser(chatId) && q.data !== "cancel") {
      return askForKey(bot, chatId);
    }

    if (q.data === "link_qr") return handleQRLink(bot, chatId);

    if (q.data === "link_pair") {
      userState[chatId] = "WAITING_NUM";
      return bot.sendMessage(
        chatId,
        "📱 *Send your WhatsApp number*\n\nFormat: `923417407434`",
        { parse_mode: "Markdown" }
      );
    }

    if (q.data === "help") {
      return bot.sendMessage(
        chatId,
        `❓ *Option 1:* Tap "Link WhatsApp (QR)" → Scan\n*Option 2:* Send phone number → Enter code\n\nAfter linking, send *.menu* on WhatsApp!`,
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

  // ── Message input (key entry + phone number entry) ────────────────────────
  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith("/")) return;

    // ── Auth key verification ─────────────────────────────────────────────
    if (userState[chatId] === "WAITING_KEY") {
      const key = msg.text.trim().toUpperCase();
      if (verifyUser(chatId, key)) {
        delete userState[chatId];
        bot.sendMessage(
          chatId,
          `✅ *Access Granted!*\n\nWelcome to *Zyntrix Bot Manager* 🎉\n_Your key has been verified. You won't need to enter it again._`,
          { parse_mode: "Markdown" }
        ).then(() => showConnectionMenu(bot, chatId));
      } else {
        bot.sendMessage(
          chatId,
          `❌ *Invalid or revoked key.*\n\nPlease enter a valid \`ZYNT-XXXX-XXXX-XXXX\` key.\n_Contact the bot admin if you don't have one._`,
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    // ── Phone number input ────────────────────────────────────────────────
    if (userState[chatId] === "WAITING_NUM") {
      const number = msg.text.replace(/[^0-9]/g, "");
      if (number.length < 10) {
        bot.sendMessage(chatId, "🩸 Invalid number.");
        return;
      }
      delete userState[chatId];
      const sessionPath = path.join(SESSIONS_DIR, number);
      if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
      bot.sendMessage(
        chatId,
        `🔄 Processing +${number}...\n\n1. Open WhatsApp\n2. Linked Devices → Link a Device\n3. Click *Link with phone number*\n4. Wait for code...`,
        { parse_mode: "Markdown" }
      );
      startWhatsAppSession(bot, chatId, number, true);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function askForKey(bot: TelegramBot, chatId: number) {
  userState[chatId] = "WAITING_KEY";
  bot.sendMessage(
    chatId,
    `🔐 *Authorization Required*\n\nPlease enter your Zyntrix key to continue.\n\nFormat: \`ZYNT-XXXX-XXXX-XXXX\``,
    { parse_mode: "Markdown" }
  );
}

function showConnectionMenu(bot: TelegramBot, chatId: number) {
  bot.sendMessage(
    chatId,
    `👋 *Zyntrix Bot Manager*\n\nTap below to link your WhatsApp.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Link WhatsApp (QR)", callback_data: "link_qr" }],
          [{ text: "📱 Link with Phone Number", callback_data: "link_pair" }],
          [{ text: "❓ Help", callback_data: "help" }],
        ],
      },
    }
  );
}

// ── Initiate QR link ──────────────────────────────────────────────────────────
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
  await bot.sendMessage(chatId, "⏳ *Generating QR...*", { parse_mode: "Markdown" });
  startWhatsAppSession(bot, chatId, sessionId, false);
}

// ── Core: start a WhatsApp session and wire up ALL bot handlers ───────────────
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

    const rawSock = makeWASocket({
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

    const sock = patchSockForCTA(rawSock);
    activeSockets.set(identifier, sock);

    // ── Pairing code ─────────────────────────────────────────────────────────
    if (usePairing && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(identifier);
          const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
          bot.sendMessage(
            tgChatId,
            `*YOUR CODE:*\n\`${formatted}\`\n\n_(Tap to copy)_`,
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

      // ── Send QR to Telegram ───────────────────────────────────────────────
      if (qr && !usePairing) {
        qrCount++;
        if (qrCount > 5) {
          bot.sendMessage(tgChatId, "⏰ *QR expired.* /link for new one.", { parse_mode: "Markdown" });
          return;
        }
        try {
          const qrBuf = await QRCode.toBuffer(qr, { type: "png", width: 512, margin: 2 });
          const prev = qrMessages.get(tgChatId);
          if (prev) bot.deleteMessage(tgChatId, prev).catch(() => {});
          const sent = await bot.sendPhoto(tgChatId, qrBuf, {
            caption: `📱 *Scan QR* — WhatsApp → Linked Devices\n🔄 ${qrCount}/5`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel" }]] },
          });
          qrMessages.set(tgChatId, sent.message_id);
        } catch (e: any) {
          console.error("[TG-WA] QR error:", e.message);
        }
      }

      // ── Disconnected ──────────────────────────────────────────────────────
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

      // ── Connected — wire up ALL command handlers ──────────────────────────
      if (connection === "open") {
        console.log(`[TG-WA] Connected: ${identifier} ✅`);

        const prev = qrMessages.get(tgChatId);
        if (prev) { bot.deleteMessage(tgChatId, prev).catch(() => {}); qrMessages.delete(tgChatId); }

        bot.sendMessage(
          tgChatId,
          `✅ *Connected!*\n👑 You are now Owner.\nSend *.menu* on WhatsApp.`,
          { parse_mode: "Markdown" }
        ).catch(() => {});

        attachBotHandlers(sock);
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (e: any) {
    console.error(`[TG-WA] Session error for ${identifier}:`, e.message);
    bot.sendMessage(tgChatId, `❌ Error starting session: ${e.message}`).catch(() => {});
  }
}
