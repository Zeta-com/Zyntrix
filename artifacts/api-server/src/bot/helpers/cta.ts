import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";

/**
 * Sends a text message with the official WhatsApp "View channel" button —
 * identical to what appears when someone forwards a post from a WhatsApp
 * newsletter/channel. Uses sourceId (newsletter JID) which is the key that
 * triggers the native channel card in WhatsApp clients.
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
  const channelUrl = opts?.url ?? BOT_CONFIG.channelUrl;
  const botName    = opts?.footer ?? BOT_CONFIG.botName;

  // sourceId = newsletter JID → WhatsApp renders the native "View channel" button
  const contextInfo = proto.ContextInfo.create({
    isForwarded: true,
    forwardingScore: 999,
    externalAdReply: proto.ContextInfo.ExternalAdReplyInfo.create({
      title: botName,
      body: "WhatsApp Channel",
      sourceUrl: channelUrl,
      sourceId: BOT_CONFIG.channelJid,
      mediaType: 1,
      renderLargerThumbnail: false,
      showAdAttribution: false,
      containsAutoReply: false,
    }),
  });

  const generated = generateWAMessageFromContent(
    jid,
    {
      extendedTextMessage: proto.Message.ExtendedTextMessage.create({
        text,
        contextInfo,
      }),
    },
    { userJid: sock.user?.id ?? "" }
  );

  await sock.relayMessage(jid, generated.message!, {
    messageId: generated.key.id!,
  });
}
