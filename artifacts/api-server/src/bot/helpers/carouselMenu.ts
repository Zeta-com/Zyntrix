// Native WhatsApp interactive carousel menu — swipeable cards with a header
// video/image, title, description, and a quick-reply button that runs a
// command. This mirrors a proven-working payload shape (fkontak quoted
// context + messageContextInfo.deviceListMetadataVersion: 2 + plain-object
// cards) instead of the earlier version that WhatsApp silently rejected.
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
        const { data } = await axios.get<ArrayBuffer>(opts.videoUrl, {
          responseType: "arraybuffer",
          timeout: 8000,
        });
        media = await prepareWAMessageMedia(
          { video: Buffer.from(data), gifPlayback: true },
          { upload: sock.waUploadToServer }
        );
      } catch {
        media = null;
      }
    }

    const cards = opts.cards.map((card) => ({
      header: {
        title: " ",
        ...(media?.videoMessage
          ? { hasMediaAttachment: true, videoMessage: media.videoMessage }
          : { hasMediaAttachment: false }),
      },
      body: { text: `*${card.title}*\n${card.description}` },
      nativeFlowMessage: {
        buttons: [
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: card.buttonText,
              id: card.command,
            }),
          },
        ],
      },
    }));

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: opts.bodyText }),
      contextInfo: proto.ContextInfo.create({ mentionedJid: [opts.sender] }),
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

    const generated = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: proto.Message.FutureProofMessage.create({
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage,
          },
        }),
      },
      {
        userJid: sock.user?.id ?? "",
        quoted: (opts.quoted ?? fakeQuoted) as any,
      }
    );

    await sock.relayMessage(jid, generated.message!, {
      messageId: generated.key.id!,
    });
    return true;
  } catch (err) {
    console.error("[MENU] carousel send failed:", err);
    return false;
  }
}
