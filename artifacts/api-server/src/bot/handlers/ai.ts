import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";

const DC_BASE = "https://apis.davidcyril.name.ng";

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

/** Parse the response from David Cyril API — tries all known key names */
function parseAIText(data: any): string {
  return (
    data?.result ??
    data?.reply ??
    data?.response ??
    data?.answer ??
    data?.message ??
    data?.text ??
    data?.output ??
    JSON.stringify(data)
  );
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

  // Thinking indicator
  await sock.sendMessage(jid(msg), {
    text: `🧠 *AI is thinking...*\n_Processing: "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"_`,
  }, { quoted: msg });

  try {
    const { data } = await axios.get(`${DC_BASE}/api/gpt4`, {
      params: { query: prompt },
      timeout: 30000,
    });
    const reply = parseAIText(data);
    await sock.sendMessage(jid(msg), {
      text: `🤖 *GPT-4*\n\n${reply}`,
    }, { quoted: msg });
  } catch (err: any) {
    // Fallback endpoint pattern
    try {
      const { data } = await axios.get(`${DC_BASE}/ai/gpt4`, {
        params: { q: prompt },
        timeout: 20000,
      });
      const reply = parseAIText(data);
      await sock.sendMessage(jid(msg), {
        text: `🤖 *GPT-4*\n\n${reply}`,
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), {
        text: `❌ *AI Error:* Could not reach GPT-4.\n_${err.message}_`,
      }, { quoted: msg });
    }
  }
}

// ── Meta AI (used for chatbot auto-reply) ─────────────────────────────────────
export async function fetchMetaAI(prompt: string): Promise<string> {
  try {
    const { data } = await axios.get(`${DC_BASE}/api/meta`, {
      params: { query: prompt },
      timeout: 20000,
    });
    return parseAIText(data);
  } catch {
    try {
      const { data } = await axios.get(`${DC_BASE}/ai/meta`, {
        params: { q: prompt },
        timeout: 15000,
      });
      return parseAIText(data);
    } catch {
      return "🤖 I'm having trouble connecting right now. Try again!";
    }
  }
}

// ── Image Generation (Flux v2) ────────────────────────────────────────────────
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
    text: `🎨 *Generating image...*\n_Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"_\n_This may take 10-30 seconds..._`,
  }, { quoted: msg });

  try {
    const { data } = await axios.get(`${DC_BASE}/api/flux`, {
      params: { prompt },
      timeout: 60000,
      responseType: "arraybuffer",
    });

    // If it returns an image buffer directly
    if (data instanceof Buffer || data.byteLength) {
      const buf = Buffer.from(data);
      await sock.sendMessage(jid(msg), {
        image: buf,
        caption: `🎨 *Generated Image*\n_Prompt: ${prompt}_`,
      }, { quoted: msg });
      return;
    }

    // If it returns JSON with URL
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    const imgUrl = parsed?.url ?? parsed?.image ?? parsed?.result;
    if (imgUrl) {
      const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 30000 });
      await sock.sendMessage(jid(msg), {
        image: Buffer.from(imgRes.data),
        caption: `🎨 *Generated Image*\n_Prompt: ${prompt}_`,
      }, { quoted: msg });
    } else {
      throw new Error("No image URL in response");
    }
  } catch (err: any) {
    // Fallback endpoint
    try {
      const { data } = await axios.get(`${DC_BASE}/imagegen/flux`, {
        params: { prompt },
        timeout: 60000,
        responseType: "arraybuffer",
      });
      const buf = Buffer.from(data);
      await sock.sendMessage(jid(msg), {
        image: buf,
        caption: `🎨 *Generated Image*\n_Prompt: ${prompt}_`,
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), {
        text: `❌ *Image generation failed:* ${err.message}`,
      }, { quoted: msg });
    }
  }
}

// ── Anime Image Generation (Animagine) ───────────────────────────────────────
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
    text: `🎌 *Generating anime image...*\n_Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"_\n_Hold tight... ⏳_`,
  }, { quoted: msg });

  try {
    const { data } = await axios.get(`${DC_BASE}/api/animagine`, {
      params: { prompt },
      timeout: 60000,
      responseType: "arraybuffer",
    });

    const buf = Buffer.from(data);
    await sock.sendMessage(jid(msg), {
      image: buf,
      caption: `🎌 *Anime Image Generated!*\n_Prompt: ${prompt}_`,
    }, { quoted: msg });
  } catch (err: any) {
    try {
      const { data } = await axios.get(`${DC_BASE}/imagegen/animagine`, {
        params: { prompt },
        timeout: 60000,
        responseType: "arraybuffer",
      });
      const buf = Buffer.from(data);
      await sock.sendMessage(jid(msg), {
        image: buf,
        caption: `🎌 *Anime Image Generated!*\n_Prompt: ${prompt}_`,
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), {
        text: `❌ *Anime image generation failed:* ${err.message}`,
      }, { quoted: msg });
    }
  }
}
