/**
 * Shared bot handler setup — used by both the main bot (index.ts)
 * and Telegram-linked sessions (telegram/bot.ts).
 * 
 * Call `attachBotHandlers(sock)` right after a socket connects
 * and ALL commands, chatbot, games, view-once, etc. will work on it.
 */
import type {
  WASocket,
  AnyMessageContent,
  MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";
import { fakeTypeMode, fakeRecordMode, isChatbotOn } from "../state.js";
import { cacheMessage, handleDeletedMessage } from "./messageDelete.js";
import { handleViewOnce, handleVVCommand } from "./viewOnce.js";
import { handleStatusGrab } from "./status.js";
import { handleCommand, getMessageText, getJid } from "./commands.js";
import { fetchMetaAI } from "./ai.js";
import { hasActiveTrivia, checkTriviaAnswer } from "../games/trivia.js";
import { hasActiveMath, checkMathAnswer } from "../games/math.js";
import { sendCTA } from "../helpers/cta.js";

// ── CTA patch: text-only messages get forwarded + channel-button style ────────
export function patchSockForCTA(sock: WASocket): WASocket {
  const original = sock.sendMessage.bind(sock);

  (sock as any).sendMessage = async (
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions
  ) => {
    const c = content as any;
    const isTextOnly =
      "text" in c &&
      typeof c.text === "string" &&
      !("image" in c) &&
      !("video" in c) &&
      !("audio" in c) &&
      !("sticker" in c) &&
      !("document" in c) &&
      !("react" in c) &&
      !("delete" in c) &&
      !("forward" in c) &&
      !("poll" in c) &&
      !("disappearingMessagesInChat" in c) &&
      !("groupUpdate" in c) &&
      // Don't strip @mentions — pass those through as-is
      !(Array.isArray(c.mentions) && c.mentions.length > 0);

    if (isTextOnly) {
      await sendCTA(sock, jid, c.text as string, {
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

// ── Attach all message handlers to a connected socket ─────────────────────────
export function attachBotHandlers(sock: WASocket): void {
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

        if (fakeTypeMode || fakeRecordMode) {
          sock.sendPresenceUpdate(
            fakeRecordMode ? "recording" : ("composing" as any),
            chatJid
          ).catch(() => {});
        }
      }

      // ── Owner sending commands from their own phone ──────────────────────
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

      // ── View-once spy ────────────────────────────────────────────────────
      const hasViewOnce =
        !!msg.message.viewOnceMessage ||
        !!msg.message.viewOnceMessageV2 ||
        !!msg.message.viewOnceMessageV2Extension;
      if (hasViewOnce) await handleViewOnce(sock, msg);

      if (!text) continue;

      // ── Commands ─────────────────────────────────────────────────────────
      if (text.startsWith(BOT_CONFIG.prefix)) {
        const commandText = text.slice(BOT_CONFIG.prefix.length);
        const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";

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

      // ── Games ────────────────────────────────────────────────────────────
      if (hasActiveTrivia(chatJid)) {
        const result = checkTriviaAnswer(chatJid, text);
        if (result) {
          await sock.sendMessage(chatJid, { text: result }, { quoted: msg });
          continue;
        }
      }

      if (hasActiveMath(chatJid)) {
        const result = checkMathAnswer(chatJid, text);
        if (result) {
          await sock.sendMessage(chatJid, { text: result }, { quoted: msg });
          continue;
        }
      }

      // ── Chatbot (AI auto-reply) ───────────────────────────────────────────
      if (isChatbotOn(chatJid)) {
        try {
          const aiResponse = await fetchMetaAI(text);
          if (isGroup && sender) {
            const senderNum = sender.split("@")[0];
            // messages with mentions bypass CTA patch (see patchSockForCTA)
            await sock.sendMessage(
              chatJid,
              { text: `@${senderNum} ${aiResponse}`, mentions: [sender] } as any,
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
          }
        } catch (err: any) {
          console.error("[Chatbot] Failed to send reply:", err?.message ?? err);
        }
      }
    }
  });

  sock.ev.on("messages.delete", async (update) => {
    if ("keys" in update) await handleDeletedMessage(sock, update);
  });
}
