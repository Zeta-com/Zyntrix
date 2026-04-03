import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { BOT_CONFIG } from "../config.js";

/**
 * Send a message with a WhatsApp-style CTA URL button (the same "View Channel" style button).
 * Uses InteractiveMessage → nativeFlowMessage with name "cta_url".
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
  const footer = opts?.footer ?? BOT_CONFIG.botName;
  const buttonText = opts?.buttonText ?? "📢 Join Channel";
  const url = opts?.url ?? BOT_CONFIG.channelUrl;

  const contextInfo: proto.IContextInfo = {};
  if (opts?.forwarded) {
    contextInfo.isForwarded = true;
    contextInfo.forwardingScore = 999;
  }
  if (opts?.quoted) {
    const qKey = opts.quoted.key;
    contextInfo.stanzaId = qKey.id;
    contextInfo.participant = qKey.participant ?? qKey.remoteJid ?? undefined;
    contextInfo.quotedMessage = opts.quoted.message ?? undefined;
  }

  const interactive = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
    header: proto.Message.InteractiveMessage.Header.create({
      hasMediaAttachment: false,
    }),
    nativeFlowMessage:
      proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: [
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: buttonText,
              url,
              merchant_url: url,
            }),
          },
        ],
      }),
    contextInfo,
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage: interactive },
    {
      userJid: sock.user?.id,
      quoted: opts?.quoted,
    }
  );

  await sock.relayMessage(jid, generated.message!, {
    messageId: generated.key.id!,
  });
}
