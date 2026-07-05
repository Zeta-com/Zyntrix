// Native WhatsApp carousel menu.
//
// NOTE ON HISTORY: earlier attempts sent `carouselMessage` as a *top-level*
// message field, which Baileys' send pipeline never recognizes (only
// `nativeFlowMessage` / `interactiveResponseMessage` are handled at the top
// level) — hence the "your WhatsApp doesn't support it" error. Checking the
// actual WAProto.proto shows `carouselMessage` is not a top-level field at
// all: it's one of the `oneof interactiveMessage` variants nested *inside*
// `Message.InteractiveMessage` (WAProto.proto ~line 2685), alongside
// `nativeFlowMessage`. Each card in `CarouselMessage.cards` is itself a full
// `Message.InteractiveMessage` (its own header image + body + buttons).
// Wrapping it this way — a top-level `interactiveMessage` whose
// `carouselMessage` field holds the cards — is the correct, supported shape.
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
    imageUrl?: string;
    footerText?: string;
    sender: string;
    quoted?: WAMessage;
  }
): Promise<boolean> {
  try {
    let sharedMedia: Awaited<ReturnType<typeof prepareWAMessageMedia>> | null = null;

    if (opts.imageUrl) {
      try {
        const { data } = await axios.get<ArrayBuffer>(opts.imageUrl, {
          responseType: "arraybuffer",
          timeout: 8000,
        });
        sharedMedia = await prepareWAMessageMedia(
          { image: Buffer.from(data) },
          { upload: sock.waUploadToServer }
        );
      } catch {
        console.log("[MENU WARNING] Failed to load card image. Rendering carousel without it.");
      }
    }

    const cards = opts.cards.map((card) =>
      proto.Message.InteractiveMessage.create({
        header: proto.Message.InteractiveMessage.Header.create(
          sharedMedia?.imageMessage
            ? { title: card.title, hasMediaAttachment: true, imageMessage: sharedMedia.imageMessage }
            : { title: card.title }
        ),
        body: proto.Message.InteractiveMessage.Body.create({ text: card.description }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: card.buttonText,
                id: card.command,
              }),
            },
          ],
        }),
      })
    );

    const carouselMessage = proto.Message.InteractiveMessage.CarouselMessage.create({
      cards,
      carouselCardType:
        proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.HSCROLL_CARDS,
      messageVersion: 1,
    });

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: opts.bodyText }),
      footer: opts.footerText
        ? proto.Message.InteractiveMessage.Footer.create({ text: opts.footerText })
        : undefined,
      carouselMessage,
      contextInfo: proto.ContextInfo.create({ mentionedJid: [opts.sender] }),
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
      { quoted: opts.quoted ?? fakeQuoted } as any
    );

    await sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! });
    return true;
  } catch (err) {
    console.error("[MENU ERROR]", err);
    return false;
  }
}
