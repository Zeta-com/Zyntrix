import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";

/**
 * Sends a text message that looks exactly like a forwarded WhatsApp channel
 * message — "Forwarded many times" tag + channel preview card + "View channel"
 * green button at the bottom.
 *
 * Uses contextInfo.externalAdReply with the channel URL as the sourceUrl.
 * WhatsApp renders the "View channel" button automatically when the sourceUrl
 * is a whatsapp.com/channel link.
 *
 * Uses relayMessage (bypasses the sendMessage patch) so there's no recursion.
 */
export async function sendCTA(
  sock: WASocket,
  jid: string,
  text: string,
  opts?: {
    footer?: string;
    buttonText?: string;     // unused with externalAdReply, kept for API compat
    url?: string;
    quoted?: WAMessage;
    forwarded?: boolean;     // always true in this impl
  }
) {
  const channelUrl = opts?.url ?? BOT_CONFIG.channelUrl;
  const botName = opts?.footer ?? BOT_CONFIG.botName;

  // Build the context info: forwarded + channel preview card
  const contextInfo = proto.ContextInfo.create({
    isForwarded: true,
    forwardingScore: 999,
    externalAdReply: proto.ContextInfo.ExternalAdReplyInfo.create({
      title: botName,
      body: "📢 Tap to view our WhatsApp channel",
      sourceUrl: channelUrl,
      mediaType: 1,          // 1 = IMAGE (required for the card to render)
      renderLargerThumbnail: false,
      showAdAttribution: true,
    }),
  });

  // If there's a quoted message, embed it in the context
  if (opts?.quoted) {
    const qk = opts.quoted.key;
    contextInfo.stanzaId = qk.id ?? undefined;
    contextInfo.participant = qk.participant ?? qk.remoteJid ?? undefined;
    contextInfo.quotedMessage = opts.quoted.message ?? undefined;
    contextInfo.remoteJid = qk.remoteJid ?? undefined;
  }

  const generated = generateWAMessageFromContent(
    jid,
    {
      extendedTextMessage: proto.Message.ExtendedTextMessage.create({
        text,
        contextInfo,
      }),
    },
    { userJid: sock.user?.id }
  );

  // relayMessage bypasses the sendMessage patch → no infinite recursion
  await sock.relayMessage(jid, generated.message!, {
    messageId: generated.key.id!,
  });
}
