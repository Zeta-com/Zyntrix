import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

// ── Pollinations Text AI (free, no key needed) ────────────────────────────────
async function pollinationsText(prompt: string, model = "openai"): Promise<string> {
  const encoded = encodeURIComponent(prompt);
  const { data } = await axios.get(
    `https://text.pollinations.ai/${encoded}?model=${model}&seed=42`,
    { timeout: 30000, responseType: "text" }
  );
  return typeof data === "string" ? data.trim() : JSON.stringify(data);
}

// ── GPT-4 AI ──────────────────────────────────────────────────────────────────
export async function handleAI(
  sock: WASocket,
  msg: WAMessage,
  prompt: string
): Promise<void> {
  if (!prompt) {
    await sock.sendMessage(jid(msg), {
      text: "🤖 *Usage:* `.ai <your question>`\nExample: `.ai What is the capital of France?`",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), {
    text: `🧠 *AI is thinking...*\n_"${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"_`,
  }, { quoted: msg });

  try {
    const reply = await pollinationsText(prompt, "openai");
    await sock.sendMessage(jid(msg), {
      text: `🤖 *AI*\n\n${reply}`,
    }, { quoted: msg });
  } catch (err: any) {
    try {
      const reply = await pollinationsText(prompt, "mistral");
      await sock.sendMessage(jid(msg), { text: `🤖 *AI*\n\n${reply}` }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), {
        text: `❌ *AI Error:* ${err.message}\n_Try again in a moment._`,
      }, { quoted: msg });
    }
  }
}

// ── Meta AI (used for chatbot auto-reply) ─────────────────────────────────────
export async function fetchMetaAI(prompt: string): Promise<string> {
  try {
    return await pollinationsText(prompt, "openai");
  } catch {
    try {
      return await pollinationsText(prompt, "mistral");
    } catch {
      return "🤖 I'm having trouble connecting right now. Try again!";
    }
  }
}

// ── Image Generation (Pollinations Flux) ─────────────────────────────────────
export async function handleImageGen(
  sock: WASocket,
  msg: WAMessage,
  prompt: string
): Promise<void> {
  if (!prompt) {
    await sock.sendMessage(jid(msg), {
      text: "🎨 *Usage:* `.img <description>`\nExample: `.img a cyberpunk city at night`",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), {
    text: `🎨 *Generating image...*\n_"${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"_\n_This may take 10-30 seconds..._`,
  }, { quoted: msg });

  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&model=flux&seed=${Date.now()}`;
    const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(data),
      caption: `🎨 *Generated Image*\n_Prompt: ${prompt}_`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), {
      text: `❌ *Image generation failed:* ${err.message}`,
    }, { quoted: msg });
  }
}

// ── Anime Image Generation (Pollinations Anime model) ────────────────────────
export async function handleAnimeImage(
  sock: WASocket,
  msg: WAMessage,
  prompt: string
): Promise<void> {
  if (!prompt) {
    await sock.sendMessage(jid(msg), {
      text: "🎌 *Usage:* `.animage <description>`\nExample: `.animage naruto in the rain, cinematic`",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), {
    text: `🎌 *Generating anime image...*\n_"${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"_\n_Hold tight... ⏳_`,
  }, { quoted: msg });

  try {
    const animePrompt = `${prompt}, anime style, high quality, detailed, masterpiece`;
    const encoded = encodeURIComponent(animePrompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&model=flux&seed=${Date.now()}`;
    const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(data),
      caption: `🎌 *Anime Image Generated!*\n_Prompt: ${prompt}_`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), {
      text: `❌ *Anime image generation failed:* ${err.message}`,
    }, { quoted: msg });
  }
}
