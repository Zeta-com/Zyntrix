---
name: Baileys carouselMessage must nest inside interactiveMessage, not top-level
description: How to correctly construct a real WhatsApp carousel (swipeable cards) message with Baileys — carouselMessage is a oneof variant nested inside interactiveMessage, not a top-level message field.
---

## The actual root cause (confirmed by reading WAProto.proto)

`carouselMessage` is NOT a top-level `Message` field. In the protobuf schema (`WAProto/WAProto.proto`), it is one of the `oneof interactiveMessage` variants defined *inside* `Message.InteractiveMessage`, as a sibling of `nativeFlowMessage`:

```
message InteractiveMessage {
  optional Header header = 1;
  optional Body body = 2;
  optional Footer footer = 3;
  oneof interactiveMessage {
    ...
    NativeFlowMessage nativeFlowMessage = 6;
    CarouselMessage carouselMessage = 7;
  }
  message CarouselMessage {
    repeated Message.InteractiveMessage cards = 1;  // each card is a full InteractiveMessage
    optional CarouselCardType carouselCardType = 3; // HSCROLL_CARDS = 1
  }
}
```

Sending `{ carouselMessage: {...} }` as a top-level message content field is silently unrecognized by Baileys' send pipeline (only top-level `nativeFlowMessage`/`interactiveResponseMessage`-style fields are handled there) — this produces either a visible "your WhatsApp doesn't support it" placeholder or a fully silent drop with zero rendering and no error, depending on WA client version. The fix is to wrap it correctly: a top-level `interactiveMessage` whose `carouselMessage` field holds the `cards` array, where each card is itself a complete `InteractiveMessage` (own header image + body text + its own `nativeFlowMessage` button, e.g. `quick_reply`).

## How to apply

- Before assuming a WhatsApp/Baileys interactive message type is "blocked" or "unsupported," check the installed Baileys version's `WAProto/WAProto.proto` for the field's actual nesting — unofficial/reverse-engineered message types are easy to place at the wrong protobuf level.
- Correct carousel shape: `generateWAMessageFromContent(jid, { interactiveMessage: { body, footer, carouselMessage: { cards: InteractiveMessage[], carouselCardType } } }, opts)`.
- A "no response at all" symptom (no success, no error, no fallback) for a custom interactive message usually means the send call resolved without throwing but WhatsApp discarded the render — check whether the payload is nested at the correct protobuf level before assuming it's a permanent WhatsApp-side block.
