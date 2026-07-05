# Memory Index

- [Baileys carouselMessage nesting](baileys-interactive-messages-blocked.md) — carouselMessage must nest inside interactiveMessage (a oneof sibling of nativeFlowMessage), not sent top-level, or it silently fails to render.
- [Baileys button tap routing](baileys-button-tap-routing.md) — quick_reply/native-flow button taps arrive as interactiveResponseMessage, not conversation/extendedTextMessage; must be unwrapped or taps silently no-op.
