---
name: Baileys interactive/carousel messages get blocked on real WhatsApp accounts
description: WhatsApp actively rejects or silently drops unofficial nativeFlow/carousel interactive messages sent from Baileys-based clients; do not keep iterating on payload shape.
---

## What happened

Two structurally different interactive message shapes were sent via Baileys (a `carouselMessage` protobuf field, then a `nativeFlowMessage` `single_select` list button) to a real WhatsApp account for a bot `.menu` command. Both failed, but in different ways:

- `carouselMessage`: WhatsApp showed a visible "your WhatsApp doesn't support it" placeholder. Root cause: this raw/unofficial protobuf field has zero handling in Baileys' own send pipeline (`lib/Socket/messages-send.js` only recognizes `nativeFlowMessage`/`interactiveResponseMessage`), so it's inherently unsupported.
- `nativeFlowMessage` (`single_select`): no visible error at all — the message was silently dropped with zero rendering on the recipient device, even though the send call itself completed without throwing (`relayMessage` did not reject).

## Why this matters

This is not a payload-shape bug you can keep patching. It's WhatsApp's server-side/client-side gating of unofficial interactive message types from non-official clients — one generation of WA client shows a rejection placeholder, a newer one just discards the message silently. Continuing to try new interactive/native-flow shapes on a real account is unlikely to succeed and wastes cycles.

## How to apply

- Default any menu/interactive UI in a Baileys bot to plain text (+ optional image) messages — these are guaranteed to render.
- If experimenting with interactive/native-flow/carousel messages, gate them behind an explicit opt-in (e.g. an env var like `MENU_STYLE=interactive`) with a fallback to plain text if the send doesn't clearly succeed, so a failed experiment never silently breaks a core command.
- Don't diagnose "no response at all" bugs in this class of message as a code exception first — check whether the send call actually resolved successfully (no throw) but WhatsApp discarded the render. Absence of both a success message AND an error/fallback message is a strong signal of this silent-drop behavior, not an unhandled exception.
