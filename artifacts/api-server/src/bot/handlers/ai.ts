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

// ── NB: Cinematic image transformation ───────────────────────────────────────
export async function handleNbCommand(
  sock: WASocket,
  msg: WAMessage
): Promise<void> {
  const chat = jid(msg);

  // Get quoted image or attached image
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgMsg =
    msg.message?.imageMessage ??
    quoted?.imageMessage ??
    null;

  if (!imgMsg) {
    await sock.sendMessage(chat, {
      text: `🎬 *Usage:* Reply to an image with \`.nb\`\n\nTransforms any photo into a cinematic, film-grade style.`,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(chat, {
    text: `🎬 *Processing cinematic transform...*\n_Analyzing image & applying film grade..._`,
  }, { quoted: msg });

  try {
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");

    // Determine the correct message source for downloading
    const sourceMsg = msg.message?.imageMessage
      ? msg
      : {
          ...msg,
          message: quoted,
          key: {
            ...msg.key,
            id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId ?? msg.key.id,
          },
        };

    const buf = (await downloadMediaMessage(sourceMsg as any, "buffer", {})) as Buffer;
    const base64 = buf.toString("base64");
    const mimeType = imgMsg.mimetype ?? "image/jpeg";

    // Step 1: Vision — describe the image using Pollinations
    let description = "";
    try {
      const { data } = await axios.post(
        "https://text.pollinations.ai/",
        {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
                {
                  type: "text",
                  text: "Describe this image in detail: the subjects, environment, lighting, colors, mood, and composition. Be specific and visual.",
                },
              ],
            },
          ],
          model: "openai-large",
          stream: false,
        },
        { timeout: 30000 }
      );
      description = typeof data === "string" ? data.trim() : (data?.choices?.[0]?.message?.content ?? "");
    } catch {
      description = "a person or scene";
    }

    // Step 2: Generate cinematic version
    const cinematicPrompt = [
      description,
      "cinematic photography",
      "anamorphic lens flare",
      "film grain",
      "dramatic color grading",
      "golden hour light",
      "professional cinema camera",
      "35mm film",
      "shallow depth of field",
      "bokeh background",
      "ultra realistic",
      "4K",
    ].join(", ");

    const encoded = encodeURIComponent(cinematicPrompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&nologo=true&model=flux&seed=${Date.now()}`;
    const { data: imgData } = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 90000,
    });

    await sock.sendMessage(chat, {
      image: Buffer.from(imgData),
      caption: `🎬 *Cinematic Transform*\n_Your image styled in professional film grade_`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(chat, {
      text: `❌ *Cinematic transform failed:* ${err.message ?? "Unknown error"}\n_Try again in a moment._`,
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
