/**
 * Shared bot handler setup — used by both the main bot (index.ts)
 * and Telegram-linked sessions (telegram/bot.ts).
 */
import type {
  WASocket,
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
} from "@whiskeysockets/baileys";
import { proto, generateWAMessageFromContent } from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";
import { fakeTypeMode, fakeRecordMode, isChatbotOn } from "../state.js";
import { cacheMessage, handleDeletedMessage } from "./messageDelete.js";
import { handleViewOnce, handleVVCommand, handleVV2Command } from "./viewOnce.js";
import { handleStatusGrab } from "./status.js";
import { cacheStatusUpdate } from "./statusStore.js";
import { handleCommand, getMessageText, getButtonCommand, getJid } from "./commands.js";
import { fetchMetaAI } from "./ai.js";
import { hasActiveTrivia, checkTriviaAnswer } from "../games/trivia.js";
import { hasActiveMath, checkMathAnswer } from "../games/math.js";
import { sendCTA } from "../helpers/cta.js";
import { logger } from "../../lib/logger.js";

// ── fkontak: fake "WhatsApp Business" quoted message that injects the
//    branded thumbnail / channel badge into any message type ──────────────────
function makeFkontak(): WAMessage {
  return {
    key: {
      fromMe: false,
      participant: "0@s.whatsapp.net",
      remoteJid: "status@broadcast",
      id: `FKONTAK-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    message: {
      contactMessage: {
        displayName: "WhatsApp Business ✅",
        vcard:
          "BEGIN:VCARD\nVERSION:3.0\nFN:WhatsApp Business\nORG:WhatsApp Inc.\nEND:VCARD",
      },
    },
  };
}

// ── CTA patch: ALL bot messages get the fkontak thumbnail badge ──────────────
// Text-only messages → sendCTA (channel "View" badge + fkontak context)
// Media / other messages → injected fkontak as `quoted` when none exists
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
      // Full CTA treatment for text messages (channel badge + fkontak)
      await sendCTA(sock, jid, c.text as string, {
        forwarded: true,
        quoted: options?.quoted as any,
        footer: BOT_CONFIG.botName,
      });
      return { key: { id: "", remoteJid: jid, fromMe: true } } as any;
    }

    // For all other message types (image, video, audio, sticker, document…)
    // inject fkontak as the quoted message when no quoted is already set.
    // This makes WhatsApp show the branded thumbnail badge on every reply.
    const opts = { ...(options ?? {}) };
    if (!opts.quoted) {
      opts.quoted = makeFkontak() as any;
    }

    return original(jid, content, opts);
  };

  return sock;
}

// ── Attach all message handlers to a connected socket ─────────────────────────
export function attachBotHandlers(sock: WASocket): void {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;
  console.log("🔥 MESSAGE RECEIVED:", getMessageText(msg));
        // A tapped native-flow button (e.g. a carousel card) produces an
        // interactiveResponseMessage, not plain text — resolve its `id` first
        // so button taps route through the same command handler as typed text.
        const buttonCommand = getButtonCommand(msg);
        const text = buttonCommand
  ? `${BOT_CONFIG.prefix}${buttonCommand}`
  : getMessageText(msg);
        const chatJid = getJid(msg);
        const sender = msg.key.participant ?? msg.key.remoteJid ?? "";
        const isFromMe = msg.key.fromMe === true;
        const isGroup = chatJid.endsWith("@g.us");

        if (buttonCommand) {
          logger.info(
            { buttonCommand, chatJid, isGroup, isFromMe },
            "[ButtonTap] Resolved command from button tap"
          );
        }

        // ── Status broadcast — cache so `.grabstatus` can forward it later ──
        if (chatJid === "status@broadcast") {
          if (!isFromMe) cacheStatusUpdate(msg);
          continue;
        }

        // Cache ALL messages (including fromMe) so group admins deleting
        // the bot owner's messages are also caught by antidelete
        cacheMessage(msg);

        if (!isFromMe && (fakeTypeMode || fakeRecordMode)) {
          sock.sendPresenceUpdate(
            fakeRecordMode ? "recording" : ("composing" as any),
            chatJid
          ).catch(() => {});
        }

        // ── Owner sending commands from their own phone ────────────────────
        if (isFromMe) {
          if (text && text.startsWith(BOT_CONFIG.prefix)) {
            const commandText = text.slice(BOT_CONFIG.prefix.length);
            const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";
            if (cmd === "status") {
              await handleStatusGrab(sock, msg, commandText.split(/\s+/)[1]);
            } else if (cmd === "vv") {
              await handleVVCommand(sock, msg);
            } else if (cmd === "vv2") {
              await handleVV2Command(sock, msg);
            } else {
              if (buttonCommand) {
                logger.info({ commandText }, "[ButtonTap] Dispatching to handleCommand (fromMe)");
              }
              await handleCommand(sock, msg, commandText);
              if (buttonCommand) {
                logger.info({ commandText }, "[ButtonTap] handleCommand completed (fromMe)");
              }
            }
          } else if (buttonCommand) {
            logger.warn(
              { buttonCommand, text },
              "[ButtonTap] Resolved a button command but it doesn't start with the configured prefix — check BOT_CONFIG.prefix"
            );
          }
          continue;
        }

        // ── View-once spy ────────────────────────────────────────────────
        const hasViewOnce =
          !!msg.message.viewOnceMessage ||
          !!msg.message.viewOnceMessageV2 ||
          !!msg.message.viewOnceMessageV2Extension;
        if (hasViewOnce) await handleViewOnce(sock, msg);

        if (!text) continue;

        // ── Commands ───────────────────────────────────────────────────────
        if (text.startsWith(BOT_CONFIG.prefix)) {
          const commandText = text.slice(BOT_CONFIG.prefix.length);
          const cmd = commandText.split(/\s+/)[0]?.toLowerCase() ?? "";

          if (cmd === "vv") {
            await handleVVCommand(sock, msg);
            continue;
          }
          if (cmd === "vv2") {
            await handleVV2Command(sock, msg);
            continue;
          }
          if (cmd === "status") {
            await handleStatusGrab(sock, msg, commandText.split(/\s+/)[1]);
          } else {
            if (buttonCommand) {
              logger.info({ commandText, isGroup }, "[ButtonTap] Dispatching to handleCommand");
            }
            await handleCommand(sock, msg, commandText);
            if (buttonCommand) {
              logger.info({ commandText, isGroup }, "[ButtonTap] handleCommand completed");
            }
          }
          continue;
        }

        // ── Games ──────────────────────────────────────────────────────────
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

        // ── Chatbot (AI auto-reply) ──────────────────────────────────────
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
            logger.error({ err: err?.message ?? err }, "[Chatbot] Failed to send reply");
          }
        }
      } catch (err: any) {
        logger.error(
          { err: err?.stack ?? err?.message ?? err, key: msg.key },
          "[MessageHandler] Uncaught error while processing an incoming message"
        );
      }
    }
  });

  // ── Antidelete: primary event (message key revoke) ──────────────────────────
  sock.ev.on("messages.delete", async (update) => {
    if ("keys" in update) await handleDeletedMessage(sock, update);
  });

  // ── Antidelete: secondary event — Baileys v7 also fires messages.update
  //    with a ProtocolMessage REVOKE (type=0) when someone deletes for everyone
  sock.ev.on("messages.update" as any, async (updates: any[]) => {
    for (const { key, update } of updates) {
      const proto = update?.message?.protocolMessage;
      if (proto?.type === 0 && proto?.key) {
        await handleDeletedMessage(sock, { keys: [proto.key] });
      }
    }
  });
}
