// Native WhatsApp interactive menu.
//
// NOTE ON HISTORY: this previously sent a raw `carouselMessage` (swipeable
// cards). Baileys has no first-class support for that field — it's
// hand-built protobuf with no handling anywhere in the library's send
// pipeline (grep `lib/Socket/messages-send.js`: only `nativeFlowMessage` /
// `interactiveResponseMessage` are recognized). WhatsApp gates rendering of
// that raw carousel shape per-account/client server-side, which is why the
// "your version of WhatsApp doesn't support it" error persisted even with a
// byte-for-byte copy of a working reference payload.
//
// This now sends a single `interactiveMessage` using the `single_select`
// native-flow button — the same mechanism WhatsApp uses for its own "View
// options" list menus. It is a real, currently-supported native flow (not a
// carousel), and gives the closest equivalent UX: tap one button, get a
// scrollable list of every category, tap a row to run its command.
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
    listButtonText?: string;
    listTitle?: string;
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

    const header = proto.Message.InteractiveMessage.Header.create(
      media?.videoMessage
        ? { title: " ", hasMediaAttachment: true, videoMessage: media.videoMessage }
        : { title: " " }
    );

    const rows = opts.cards.map((card) => ({
      header: "",
      title: card.title,
      description: card.description,
      id: card.command,
    }));

    const nativeFlowMessage = proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: opts.listButtonText ?? "📚 View Categories",
            sections: [
              {
                title: opts.listTitle ?? "Command Categories",
                rows,
              },
            ],
          }),
        },
      ],
    });

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      header,
      body: proto.Message.InteractiveMessage.Body.create({ text: opts.bodyText }),
      nativeFlowMessage,
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
