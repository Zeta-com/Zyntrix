// Native WhatsApp interactive carousel menu — ported as closely as possible
// from a proven-working reference implementation (fkontak quoted context +
// messageContextInfo.deviceListMetadataVersion: 2 + per-card nativeFlowMessage
// quick_reply buttons + gifPlayback video header). Only the categories/
// commands and bot name are ours — the message-building shape below is
// intentionally left matching the reference script.
import axios from "axios";
import {
  generateWAMessageFromContent,
  proto,
  prepareWAMessageMedia,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";

export interface MenuCard {
  title: string;
  description: string;
  buttonText: string;
  command: string;
}

export async function sendCarouselMenu(
  sock: WASocket,
  jid: string,
  opts: {
    bodyText: string;
    cards: MenuCard[];
    videoUrl?: string;
    sender: string;
    quoted?: WAMessage;
  }
): Promise<boolean> {
  try {
    let media: Awaited<ReturnType<typeof prepareWAMessageMedia>> | null = null;

    if (opts.videoUrl) {
      try {
        const { data: gifBuffer } = await axios.get<ArrayBuffer>(opts.videoUrl, {
          responseType: "arraybuffer",
          timeout: 8000,
        });

        media = await prepareWAMessageMedia(
          { video: Buffer.from(gifBuffer), gifPlayback: true },
          { upload: sock.waUploadToServer }
        );
      } catch {
        console.log("[MENU WARNING] Failed to load the GIF. Rendering menu without it.");
      }
    }

    const cards = opts.cards.map((cat) => {
      let cardHeader = proto.Message.InteractiveMessage.Header.create({ title: " " });

      if (media?.videoMessage) {
        cardHeader = proto.Message.InteractiveMessage.Header.create({
          title: " ",
          hasMediaAttachment: true,
          videoMessage: media.videoMessage,
        });
      }

      return {
        body: proto.Message.InteractiveMessage.Body.create({
          text: `*${cat.title}*\n${cat.description}\n\n| © ZYNTRIX`,
        }),
        header: cardHeader,
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: cat.buttonText,
                id: cat.command,
              }),
            },
          ],
        }),
      };
    });

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: opts.bodyText }),
      carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
        cards: cards as any,
        messageVersion: 1,
      }),
    });

    // fkontak — fake "WhatsApp Business" contact card used as the quoted
    // message context, same trick used by sendCTA for the channel button.
    const fkontak = proto.Message.create({
      contactMessage: proto.Message.ContactMessage.create({
        displayName: "WhatsApp Business ✅",
        vcard:
          "BEGIN:VCARD\nVERSION:3.0\nFN:WhatsApp Business\nORG:WhatsApp Inc.\nEND:VCARD",
      }),
    });
    const fakeQuoted: WAMessage = {
      key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast",
        id: `FKONTAK-${Date.now()}`,
      },
      message: fkontak,
    };

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage,
          },
        },
      } as any,
      { quoted: opts.quoted ?? fakeQuoted, mentions: [opts.sender] } as any
    );

    await sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! });
    return true;
  } catch (err) {
    console.error("[MENU ERROR]", err);
    return false;
  }
}
