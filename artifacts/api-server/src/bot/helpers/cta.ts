import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";

/**
 * The fake "WhatsApp Business ✅" contact used as the reply-preview thumbnail.
 * This makes every bot message appear to be a reply from the official
 * WhatsApp Business system — the contact card shows in the swipe-to-reply tab.
 */
const FKONTAK: WAMessage = {
  key: {
    fromMe: false,
    participant: "0@s.whatsapp.net",   // "0" JID → looks like a system message
    remoteJid: "status@broadcast",      // "Status" label in the reply preview
    id: "FKONTAK_WA_BUSINESS_00000001",
  },
  message: {
    contactMessage: {
      displayName: "WhatsApp Business ✅",
      vcard:
        "BEGIN:VCARD\nVERSION:3.0\nFN:WhatsApp Business\nORG:WhatsApp Inc.\nEND:VCARD",
    },
  },
};

/**
 * Sends a text message styled as a forwarded WhatsApp newsletter post:
 *  • "Forwarded many times" indicator
 *  • Channel preview card with a "View channel" button (newsletter JID)
 *  • Reply-preview thumbnail that shows "WhatsApp Business ✅" contact card
 *
 * Uses relayMessage so it bypasses the sendMessage CTA patch (no recursion).
 */
export async function sendCTA(
  sock: WASocket,
  jid: string,
  text: string,
  opts?: {
    footer?: string;
    buttonText?: string;   // kept for API compat, not used with externalAdReply
    url?: string;
    quoted?: WAMessage;
    forwarded?: boolean;
  }
) {
  const channelUrl = opts?.url ?? BOT_CONFIG.channelUrl;
  const botName    = opts?.footer ?? BOT_CONFIG.botName;

  // ── Context info: forwarded flag + newsletter channel card ────────────────
  const contextInfo = proto.ContextInfo.create({
    isForwarded: true,
    forwardingScore: 999,
    externalAdReply: proto.ContextInfo.ExternalAdReplyInfo.create({
      title: botName,
      body: "📢 Tap to join our WhatsApp channel",
      sourceUrl: channelUrl,
      mediaType: 1,               // 1 = IMAGE → required for the card to render
      renderLargerThumbnail: false,
      showAdAttribution: true,
    }),
  });

  // ── Reply-preview thumbnail: always the fake WA Business contact ──────────
  // This fills the "replied to" tab on every bot message regardless of whether
  // the caller passed a real quoted message.
  const fk = FKONTAK;
  contextInfo.stanzaId    = fk.key.id ?? undefined;
  contextInfo.participant = fk.key.participant ?? undefined;
  contextInfo.remoteJid   = fk.key.remoteJid   ?? undefined;
  contextInfo.quotedMessage = fk.message as proto.IMessage ?? undefined;

  // ── Build and relay the message ───────────────────────────────────────────
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
