import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";

/**
 * Sends a text message with the native WhatsApp "View channel" button —
 * identical to what appears when a post is forwarded from a WhatsApp newsletter.
 * Uses forwardedNewsletterMessageInfo which is the correct field that triggers
 * the native channel card (not externalAdReply which shows an ad card).
 */
export async function sendCTA(
  sock: WASocket,
  jid: string,
  text: string,
  opts?: {
    footer?: string;
    buttonText?: string;
    url?: string;
    quoted?: WAMessage;
    forwarded?: boolean;
  }
) {
  const botName = opts?.footer ?? BOT_CONFIG.botName;

  // fkontak — fake "WhatsApp Business" contact card shown as the quoted
  // message context, layered together with the native channel forward info.
  // The "0@s.whatsapp.net" participant JID makes it render like an official
  // system-generated contact, not a regular user message.
  const fkontak = proto.Message.create({
    contactMessage: proto.Message.ContactMessage.create({
      displayName: "WhatsApp Business ✅",
      vcard:
        "BEGIN:VCARD\nVERSION:3.0\nFN:WhatsApp Business\nORG:WhatsApp Inc.\nEND:VCARD",
    }),
  });

  const contextInfo = proto.ContextInfo.create({
    isForwarded: true,
    forwardingScore: 999,
    forwardedNewsletterMessageInfo:
      proto.ContextInfo.ForwardedNewsletterMessageInfo.create({
        newsletterJid: BOT_CONFIG.channelJid,
        serverMessageId: -1,
        newsletterName: botName,
      }),
    participant: "0@s.whatsapp.net",
    remoteJid: "status@broadcast",
    stanzaId: `FKONTAK-${Date.now()}`,
    quotedMessage: fkontak,
  });

  const generated = generateWAMessageFromContent(
    jid,
    {
      extendedTextMessage: proto.Message.ExtendedTextMessage.create({
        text,
        contextInfo,
      }),
    },
    {
      userJid: sock.user?.id ?? "",
      quoted: opts?.quoted as any,
    }
  );

  await sock.relayMessage(jid, generated.message!, {
    messageId: generated.key.id!,
  });
}
