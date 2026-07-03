// Native WhatsApp interactive carousel menu — swipeable cards with a header
// image, title, description, and a quick-reply button that runs a command.
// Falls back to a plain text menu automatically if the carousel message
// fails to send (older clients / unsupported versions).
import {
  generateWAMessageFromContent,
  proto,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";

export interface MenuCard {
  title: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  command: string;
}

export async function sendCarouselMenu(
  sock: WASocket,
  jid: string,
  opts: {
    bodyText: string;
    footerText: string;
    cards: MenuCard[];
    quoted?: WAMessage;
  }
): Promise<boolean> {
  try {
    // Cards are plain objects — protobufjs accepts them directly for
    // nested message fields; there's no exported `.Card` constructor.
    const cards = opts.cards.map((card) => ({
      header: {
        title: card.title,
        hasMediaAttachment: true,
        imageMessage: { url: card.imageUrl, mimetype: "image/jpeg" },
      },
      body: { text: card.description },
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

    // `messageContextInfo.deviceListMetadataVersion: 2` is what tells current
    // WhatsApp clients this is a v3 "native flow" message they know how to
    // render. Without it, clients show "your version of WhatsApp doesn't
    // support it" even though the schema itself is otherwise valid.
    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: opts.bodyText }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footerText }),
      header: proto.Message.InteractiveMessage.Header.create({
        title: "",
        hasMediaAttachment: false,
      }),
      carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
        cards: cards as any,
      }),
    });

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
        quoted: opts.quoted as any,
      }
    );

    await sock.relayMessage(jid, generated.message!, {
      messageId: generated.key.id!,
    });
    return true;
  } catch {
    return false;
  }
}
