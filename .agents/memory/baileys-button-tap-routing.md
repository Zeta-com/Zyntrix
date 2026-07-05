---
name: Baileys button tap routing
description: Native-flow button taps (carousel/list quick_reply) arrive as a different message type than typed text and must be unwrapped separately.
---

Tapping a `quick_reply` (or other native-flow) button on an interactive/carousel
message does not produce a `conversation` or `extendedTextMessage` — it produces
`message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson`, a JSON
string that echoes back whatever was sent in the button's own `buttonParamsJson`
(e.g. `{ display_text, id }`).

**Why:** A command router that only reads `conversation` / `extendedTextMessage` /
media captions will silently ignore every button tap — no error, no reply, just
nothing happening. This is easy to miss because typed commands keep working fine
in the same testing session.

**How to apply:** When building any interactive/carousel/list menu with
buttons, add a small extraction step that parses
`interactiveResponseMessage.nativeFlowResponseMessage.paramsJson` and pulls out
the `id` field, then feed that back into the same command-routing path used for
typed text (falling back to normal text extraction when it's absent).
