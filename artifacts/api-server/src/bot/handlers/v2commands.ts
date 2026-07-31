/**
 * Zyntrix V2 — new command handlers.
 * AI commands use Pollinations (free, no API key).
 * Commands needing paid external APIs are stubbed with a clear explanation.
 */
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { logger } from "../../lib/logger.js";
import { BOT_CONFIG } from "../config.js";
import { isOwner, getSender } from "./commands.js";
import {
  addWarn, getWarns, clearWarns, MAX_WARNS,
  getGroupGuard,
  getTopChatters, getGroupMsgCount,
  getAutoRespondKeywords, setAutoRespond, removeAutoRespond,
} from "../state.js";
import { clearConversation, getConversationHistory } from "../store.js";
import { fetchMetaAI } from "./ai.js";

const p = () => BOT_CONFIG.prefix;
function jid(msg: WAMessage) { return msg.key.remoteJid!; }

// ── Pollinations text helper (mirrors what's in ai.ts) ────────────────────────
async function aiText(prompt: string): Promise<string> {
  return fetchMetaAI(prompt);
}

// ─────────────────────────────────────────────────────────────────────────────
// ZYNTRIX V2 MAIN MENU
// ─────────────────────────────────────────────────────────────────────────────
export async function handleZyntrix(sock: WASocket, msg: WAMessage): Promise<void> {
  const pr = p();
  const now = new Date();
  const senderName = (msg as any).pushName ?? getSender(msg).split("@")[0];

  await sock.sendMessage(jid(msg), {
    text: `╔═══════════════════╗
║  ⚡ *ZYNTRIX V2* ⚡  ║
╚═══════════════════╝

👤 User: *${senderName}*
🕐 Time: ${now.toLocaleTimeString()}

🔥 *V2 COMMAND CATEGORIES*

🧠 *AI & SMART TOOLS*
\`${pr}ask\` \`${pr}imagine\` \`${pr}summarize\`
\`${pr}rewrite\` \`${pr}code\` \`${pr}fixcode\`
\`${pr}quiz\` \`${pr}story\`

📱 *WHATSAPP & MEDIA*
\`${pr}save\` \`${pr}vv\` \`${pr}sticker\`
\`${pr}take\` \`${pr}toimg\` \`${pr}grabstatus\`

👥 *GROUP MANAGEMENT*
\`${pr}warn\` \`${pr}clearwarn\` \`${pr}poll\`
\`${pr}antilink\` \`${pr}antispam\` \`${pr}antibot\`
\`${pr}welcome\` \`${pr}goodbye\`
\`${pr}groupstats\` \`${pr}topchatters\`
\`${pr}autorespond\`

🎮 *FUN*
\`${pr}wouldyourather\` \`${pr}joke\`
\`${pr}truth\` \`${pr}dare\` \`${pr}8ball\`

⚙️ *SYSTEM*
\`${pr}userinfo\` \`${pr}chatmemory\` \`${pr}dashboard\`
\`${pr}sessions\` \`${pr}addsession\`

💎 *PREMIUM* _(external API required)_
\`${pr}plan\` \`${pr}voice\` \`${pr}read\`
\`${pr}vision\` \`${pr}edit\`

_Type \`${pr}menu\` for the full carousel menu_`,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — Bot control panel
// ─────────────────────────────────────────────────────────────────────────────
export async function handleDashboard(sock: WASocket, msg: WAMessage): Promise<void> {
  if (!isOwner(msg)) {
    await sock.sendMessage(jid(msg), { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }
  const pr = p();
  const guard = jid(msg).endsWith("@g.us") ? getGroupGuard(jid(msg)) : null;

  await sock.sendMessage(jid(msg), {
    text: `╔═══════════════════╗
║  🎛️ *ZYNTRIX DASHBOARD*  ║
╚═══════════════════╝

*BOT CONTROLS*
• ${pr}public / ${pr}private — toggle access mode
• ${pr}chatbot on/off — AI auto-reply
• ${pr}antidelete on/off — deleted msg spy
• ${pr}faketype on/off — typing indicator
• ${pr}fakerecord on/off — recording indicator

*GROUP GUARD* ${guard ? "" : "_(use in a group)_"}
${guard ? `• AntiLink: ${guard.antilink ? "ON 🟢" : "OFF 🔴"}
• AntiSpam: ${guard.antispam ? "ON 🟢" : "OFF 🔴"}
• AntiBot: ${guard.antibot ? "ON 🟢" : "OFF 🔴"}
• Welcome: ${guard.welcome ? "ON 🟢" : "OFF 🔴"}
• Goodbye: ${guard.goodbye ? "ON 🟢" : "OFF 🔴"}` : "• Run in a group to see group guard status"}

*AI & MEMORY*
• ${pr}chatmemory — view/clear AI memory
• ${pr}chatmemory clear — clear current chat history

*SESSIONS*
• ${pr}sessions — list connected WhatsApp numbers
• ${pr}addsession [name] — add another number

_Full command list: \`${pr}zyntrix\`_`,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — SUMMARIZE
// ─────────────────────────────────────────────────────────────────────────────
export async function handleSummarize(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  // Accept text from rest OR quoted message text
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation ?? quoted?.extendedTextMessage?.text ?? "";
  const input = rest.trim() || quotedText.trim();

  if (!input) {
    await sock.sendMessage(jid(msg), {
      text: `📝 *Summarize Usage:*\n\`${p()}summarize [text]\`\nOR reply to a message with \`${p()}summarize\``,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: "📝 *Summarizing...*" }, { quoted: msg });

  try {
    const summary = await aiText(`Summarize this concisely in clear bullet points:\n\n${input}`);
    await sock.sendMessage(jid(msg), {
      text: `📝 *Summary*\n\n${summary}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Summarize failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — REWRITE
// ─────────────────────────────────────────────────────────────────────────────
export async function handleRewrite(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation ?? quoted?.extendedTextMessage?.text ?? "";
  const args = rest.trim().split(" ");
  // First word could be a style: formal, casual, professional, funny, formal
  const styles = ["formal", "casual", "professional", "funny", "simple", "creative"];
  let style = "clear and professional";
  let input = rest.trim();

  if (styles.includes(args[0]?.toLowerCase())) {
    style = args[0];
    input = args.slice(1).join(" ").trim() || quotedText.trim();
  } else {
    input = input || quotedText.trim();
  }

  if (!input) {
    await sock.sendMessage(jid(msg), {
      text: `✏️ *Rewrite Usage:*\n\`${p()}rewrite [style] [text]\`\n\`${p()}rewrite formal your text here\`\n\nStyles: formal, casual, professional, funny, simple, creative\n\nOR reply to a message with \`${p()}rewrite [style]\``,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: `✏️ *Rewriting in ${style} style...*` }, { quoted: msg });

  try {
    const rewritten = await aiText(`Rewrite the following text in a ${style} style. Keep the meaning but change the wording:\n\n${input}`);
    await sock.sendMessage(jid(msg), {
      text: `✏️ *Rewritten (${style})*\n\n${rewritten}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Rewrite failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — CODE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export async function handleCode(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  if (!rest.trim()) {
    await sock.sendMessage(jid(msg), {
      text: `💻 *Code Usage:*\n\`${p()}code [description]\`\nExample: \`${p()}code Python function to reverse a string\``,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: "💻 *Generating code...*" }, { quoted: msg });

  try {
    const code = await aiText(`Generate clean, well-commented code for: ${rest}\n\nProvide only the code with brief comments. No lengthy explanation before or after.`);
    await sock.sendMessage(jid(msg), {
      text: `💻 *Generated Code*\n\n${code}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Code generation failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — FIX CODE
// ─────────────────────────────────────────────────────────────────────────────
export async function handleFixCode(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation ?? quoted?.extendedTextMessage?.text ?? "";
  const input = rest.trim() || quotedText.trim();

  if (!input) {
    await sock.sendMessage(jid(msg), {
      text: `🔧 *Fix Code Usage:*\n\`${p()}fixcode [broken code]\`\nOR reply to a code message with \`${p()}fixcode\``,
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: "🔧 *Analyzing and fixing code...*" }, { quoted: msg });

  try {
    const fixed = await aiText(`Debug and fix this code. Identify the bugs, explain what was wrong, then provide the corrected version:\n\n${input}`);
    await sock.sendMessage(jid(msg), {
      text: `🔧 *Fixed Code*\n\n${fixed}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Fix code failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — QUIZ
// ─────────────────────────────────────────────────────────────────────────────
export async function handleQuiz(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const topic = rest.trim() || "general knowledge";

  await sock.sendMessage(jid(msg), { text: `🎯 *Generating quiz on: ${topic}...*` }, { quoted: msg });

  try {
    const quiz = await aiText(
      `Create a fun multiple-choice quiz question about "${topic}". Format it exactly like this:
❓ *Question:* [the question]

A) [option A]
B) [option B]
C) [option C]
D) [option D]

✅ *Answer:* [correct letter and explanation]`
    );
    await sock.sendMessage(jid(msg), { text: `🎯 *AI Quiz — ${topic}*\n\n${quiz}` }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Quiz generation failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — STORY
// ─────────────────────────────────────────────────────────────────────────────
export async function handleStory(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const prompt = rest.trim() || "an unexpected adventure";

  await sock.sendMessage(jid(msg), { text: `📖 *Writing your story...*` }, { quoted: msg });

  try {
    const story = await aiText(
      `Write a short, engaging story (3-5 paragraphs) about: "${prompt}". Make it vivid, creative, and have a satisfying ending.`
    );
    await sock.sendMessage(jid(msg), {
      text: `📖 *Story: ${prompt}*\n\n${story}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(jid(msg), { text: `❌ Story generation failed: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POLL — native WhatsApp poll
// ─────────────────────────────────────────────────────────────────────────────
export async function handlePoll(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  // Format: .poll Question | Option1 | Option2 | Option3 (up to 12)
  const parts = rest.split("|").map(s => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    await sock.sendMessage(jid(msg), {
      text: `📊 *Poll Usage:*\n\`${p()}poll Question | Option1 | Option2 | Option3\`\n\nExample:\n\`${p()}poll Favorite color? | Red | Blue | Green | Yellow\`\n\n_Min 2 options, max 12 options_`,
    }, { quoted: msg });
    return;
  }

  const question = parts[0]!;
  const options = parts.slice(1).slice(0, 12);

  try {
    await sock.sendMessage(jid(msg), {
      poll: {
        name: question,
        values: options,
        selectableCount: 1,
      },
    } as any);
  } catch (err: any) {
    logger.error({ err }, "Poll send failed");
    await sock.sendMessage(jid(msg), { text: `❌ Could not create poll: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WARN
// ─────────────────────────────────────────────────────────────────────────────
export async function handleWarn(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const groupJid = jid(msg);
  if (!groupJid.endsWith("@g.us")) {
    await sock.sendMessage(groupJid, { text: "⚠️ *Warn only works in groups!*" }, { quoted: msg });
    return;
  }
  if (!isOwner(msg)) {
    await sock.sendMessage(groupJid, { text: "👑 *Owner/admin only!*" }, { quoted: msg });
    return;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    ?? msg.message?.extendedTextMessage?.contextInfo?.participant;
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

  const targetJid = mentioned ?? quotedParticipant;

  if (!targetJid) {
    await sock.sendMessage(groupJid, {
      text: `⚠️ *Usage:* Reply to a message or mention someone:\n\`${p()}warn @user [reason]\``,
    }, { quoted: msg });
    return;
  }

  const reason = rest.replace(/@\d+/g, "").trim() || "No reason given";
  const warnCount = addWarn(groupJid, targetJid);

  await sock.sendMessage(groupJid, {
    text: `⚠️ *Warning Issued!*\n\n👤 User: @${targetJid.split("@")[0]}\n📛 Reason: ${reason}\n🔢 Warns: ${warnCount}/${MAX_WARNS}\n\n${warnCount >= MAX_WARNS ? "🚨 *Max warns reached! Consider removing this member.*" : `_${MAX_WARNS - warnCount} warn(s) remaining before action._`}`,
    mentions: [targetJid],
  }, { quoted: msg });
}

export async function handleClearWarn(sock: WASocket, msg: WAMessage): Promise<void> {
  const groupJid = jid(msg);
  if (!groupJid.endsWith("@g.us")) {
    await sock.sendMessage(groupJid, { text: "⚠️ *Clearwarn only works in groups!*" }, { quoted: msg });
    return;
  }
  if (!isOwner(msg)) {
    await sock.sendMessage(groupJid, { text: "👑 *Owner/admin only!*" }, { quoted: msg });
    return;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    ?? msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (!mentioned) {
    await sock.sendMessage(groupJid, {
      text: `🧹 *Usage:* \`${p()}clearwarn @user\``,
    }, { quoted: msg });
    return;
  }

  clearWarns(groupJid, mentioned);
  await sock.sendMessage(groupJid, {
    text: `✅ *Warnings cleared for @${mentioned.split("@")[0]}!*`,
    mentions: [mentioned],
  }, { quoted: msg });
}

export async function handleCheckWarns(sock: WASocket, msg: WAMessage): Promise<void> {
  const groupJid = jid(msg);
  if (!groupJid.endsWith("@g.us")) {
    await sock.sendMessage(groupJid, { text: "⚠️ *Warnings only work in groups!*" }, { quoted: msg });
    return;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const targetJid = mentioned ?? getSender(msg);
  const count = getWarns(groupJid, targetJid);

  await sock.sendMessage(groupJid, {
    text: `⚠️ *Warnings for @${targetJid.split("@")[0]}*\n\n🔢 ${count}/${MAX_WARNS} warns\n${count === 0 ? "✅ Clean record!" : count >= MAX_WARNS ? "🚨 Max warns reached!" : `_${MAX_WARNS - count} warn(s) remaining._`}`,
    mentions: [targetJid],
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// WOULD YOU RATHER
// ─────────────────────────────────────────────────────────────────────────────
const WYR_LIST = [
  "Would you rather be able to fly or be invisible?",
  "Would you rather live without music or without TV?",
  "Would you rather always be 10 minutes late or always be 20 minutes early?",
  "Would you rather have unlimited money or unlimited time?",
  "Would you rather be famous or powerful?",
  "Would you rather speak all languages or play all instruments?",
  "Would you rather lose the ability to lie or lose the ability to say no?",
  "Would you rather have a pause or rewind button in your life?",
  "Would you rather be stuck in a loop of your best day or your funniest day?",
  "Would you rather be the funniest person or the smartest person in every room?",
  "Would you rather have no internet for a year or no phone for a year?",
  "Would you rather be feared or loved?",
  "Would you rather travel to the future or the past?",
  "Would you rather be a superhero with one weak power or a villain with a great power?",
  "Would you rather never sleep again or sleep 20 hours a day?",
];

export async function handleWouldYouRather(sock: WASocket, msg: WAMessage): Promise<void> {
  const q = WYR_LIST[Math.floor(Math.random() * WYR_LIST.length)]!;
  await sock.sendMessage(jid(msg), {
    text: `🤔 *Would You Rather?*\n\n${q}\n\nReply with *A* or *B*! 😄`,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT MEMORY
// ─────────────────────────────────────────────────────────────────────────────
export async function handleChatMemory(sock: WASocket, msg: WAMessage, sub: string): Promise<void> {
  const chatJid = jid(msg);

  if (sub.toLowerCase() === "clear") {
    clearConversation(chatJid);
    await sock.sendMessage(chatJid, {
      text: "🧹 *Chat memory cleared!*\nThe AI will start fresh with no previous context.",
    }, { quoted: msg });
    return;
  }

  const history = getConversationHistory(chatJid);
  if (history.length === 0) {
    await sock.sendMessage(chatJid, {
      text: `🧠 *Chat Memory*\n\nNo conversation history yet for this chat.\n\n_Use \`${p()}chatmemory clear\` to wipe the memory._`,
    }, { quoted: msg });
    return;
  }

  const preview = history.slice(-6).map(h =>
    `${h.role === "user" ? "👤" : "🤖"} ${h.text.slice(0, 60)}${h.text.length > 60 ? "..." : ""}`
  ).join("\n");

  await sock.sendMessage(chatJid, {
    text: `🧠 *Chat Memory* (last ${Math.min(6, history.length)} messages)\n\n${preview}\n\n_${history.length} total messages stored._\nUse \`${p()}chatmemory clear\` to reset.`,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE — save media from quoted message
// ─────────────────────────────────────────────────────────────────────────────
export async function handleSaveMedia(sock: WASocket, msg: WAMessage): Promise<void> {
  const chat = jid(msg);
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;

  if (!quoted || !ctx) {
    await sock.sendMessage(chat, {
      text: `💾 *Save Usage:*\nReply to any image, video, audio, or document with \`${p()}save\`\nThe bot will send it back as a saveable file.`,
    }, { quoted: msg });
    return;
  }

  // Reconstruct quoted message for downloading
  const quotedMsg: any = {
    key: {
      remoteJid: chat,
      id: ctx.stanzaId ?? msg.key.id,
      fromMe: false,
      participant: ctx.participant,
    },
    message: quoted,
  };

  try {
    if (quoted.imageMessage) {
      const buf = (await downloadMediaMessage(quotedMsg, "buffer", {})) as Buffer;
      await sock.sendMessage(chat, {
        document: buf,
        mimetype: quoted.imageMessage.mimetype ?? "image/jpeg",
        fileName: `image_${Date.now()}.jpg`,
        caption: "💾 *Saved!* Here is your image as a file.",
      }, { quoted: msg });
    } else if (quoted.videoMessage) {
      const buf = (await downloadMediaMessage(quotedMsg, "buffer", {})) as Buffer;
      await sock.sendMessage(chat, {
        document: buf,
        mimetype: quoted.videoMessage.mimetype ?? "video/mp4",
        fileName: `video_${Date.now()}.mp4`,
        caption: "💾 *Saved!* Here is your video as a file.",
      }, { quoted: msg });
    } else if (quoted.audioMessage) {
      const buf = (await downloadMediaMessage(quotedMsg, "buffer", {})) as Buffer;
      await sock.sendMessage(chat, {
        document: buf,
        mimetype: quoted.audioMessage.mimetype ?? "audio/ogg",
        fileName: `audio_${Date.now()}.ogg`,
        caption: "💾 *Saved!* Here is your audio as a file.",
      }, { quoted: msg });
    } else if (quoted.stickerMessage) {
      const buf = (await downloadMediaMessage(quotedMsg, "buffer", {})) as Buffer;
      await sock.sendMessage(chat, {
        document: buf,
        mimetype: "image/webp",
        fileName: `sticker_${Date.now()}.webp`,
        caption: "💾 *Saved!* Here is your sticker as a file.",
      }, { quoted: msg });
    } else if (quoted.documentMessage) {
      const buf = (await downloadMediaMessage(quotedMsg, "buffer", {})) as Buffer;
      const fname = quoted.documentMessage.fileName ?? `document_${Date.now()}`;
      await sock.sendMessage(chat, {
        document: buf,
        mimetype: quoted.documentMessage.mimetype ?? "application/octet-stream",
        fileName: fname,
        caption: "💾 *Saved!* Here is your document.",
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chat, {
        text: "❌ *Unsupported media type.* Reply to an image, video, audio, sticker, or document.",
      }, { quoted: msg });
    }
  } catch (err: any) {
    logger.error({ err }, "Save media failed");
    await sock.sendMessage(chat, { text: `❌ Failed to save: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER INFO
// ─────────────────────────────────────────────────────────────────────────────
export async function handleUserInfo(sock: WASocket, msg: WAMessage): Promise<void> {
  const chat = jid(msg);
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  const targetJid = mentioned ?? quotedParticipant ?? getSender(msg);

  const number = targetJid.split("@")[0];

  await sock.sendMessage(chat, { text: "🔍 *Fetching user info...*" }, { quoted: msg });

  let statusText = "Private / not set";
  let profilePicUrl = "";
  let isWAUser = true;

  try {
    const status = await sock.fetchStatus(targetJid);
    statusText = (status as any)?.status ?? "No status set";
  } catch {
    statusText = "Private / not set";
  }

  try {
    profilePicUrl = await sock.profilePictureUrl(targetJid, "image") ?? "";
  } catch {
    profilePicUrl = "";
  }

  const response =
    `👤 *User Information*\n\n` +
    `📱 *Number:* +${number}\n` +
    `💬 *Status:* ${statusText}\n` +
    `🖼️ *Profile Pic:* ${profilePicUrl ? "✅ Available" : "❌ Private/None"}\n` +
    `🔗 *WA Link:* https://wa.me/${number}\n` +
    `📛 *JID:* \`${targetJid}\``;

  if (profilePicUrl) {
    await sock.sendMessage(chat, {
      image: { url: profilePicUrl },
      caption: response,
    }, { quoted: msg });
  } else {
    await sock.sendMessage(chat, { text: response }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP STATS
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGroupStats(sock: WASocket, msg: WAMessage): Promise<void> {
  const groupJid = jid(msg);
  if (!groupJid.endsWith("@g.us")) {
    await sock.sendMessage(groupJid, { text: "⚠️ *Group stats only work in groups!*" }, { quoted: msg });
    return;
  }

  try {
    const meta = await sock.groupMetadata(groupJid);
    const guard = getGroupGuard(groupJid);
    const totalMsgs = getGroupMsgCount(groupJid);
    const admins = meta.participants.filter(p => p.admin).length;

    await sock.sendMessage(groupJid, {
      text: `📊 *Group Statistics*\n\n` +
        `👥 *Members:* ${meta.participants.length}\n` +
        `👑 *Admins:* ${admins}\n` +
        `💬 *Messages (this session):* ${totalMsgs}\n` +
        `📅 *Created:* ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : "Unknown"}\n\n` +
        `🛡️ *Group Guard*\n` +
        `• AntiLink: ${guard.antilink ? "ON 🟢" : "OFF 🔴"}\n` +
        `• AntiSpam: ${guard.antispam ? "ON 🟢" : "OFF 🔴"}\n` +
        `• AntiBot: ${guard.antibot ? "ON 🟢" : "OFF 🔴"}\n` +
        `• Welcome: ${guard.welcome ? "ON 🟢" : "OFF 🔴"}\n` +
        `• Goodbye: ${guard.goodbye ? "ON 🟢" : "OFF 🔴"}`,
    }, { quoted: msg });
  } catch (err: any) {
    await sock.sendMessage(groupJid, { text: `❌ Could not get group stats: ${err.message}` }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP CHATTERS
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTopChatters(sock: WASocket, msg: WAMessage): Promise<void> {
  const groupJid = jid(msg);
  if (!groupJid.endsWith("@g.us")) {
    await sock.sendMessage(groupJid, { text: "⚠️ *Top chatters only works in groups!*" }, { quoted: msg });
    return;
  }

  const top = getTopChatters(groupJid, 10);
  if (top.length === 0) {
    await sock.sendMessage(groupJid, {
      text: "📊 *No message data yet.*\n_Data is tracked from the moment the bot is online in this group. Keep chatting!_",
    }, { quoted: msg });
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const list = top.map((e, i) => `${medals[i] ?? "▫️"} @${e.jid.split("@")[0]} — *${e.count}* msgs`).join("\n");

  await sock.sendMessage(groupJid, {
    text: `🏆 *Top Chatters* (this session)\n\n${list}`,
    mentions: top.map(e => e.jid),
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RESPOND
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAutoRespond(sock: WASocket, msg: WAMessage, rest: string): Promise<void> {
  const chat = jid(msg);
  if (!isOwner(msg)) {
    await sock.sendMessage(chat, { text: "👑 *Owner only!*" }, { quoted: msg });
    return;
  }

  const parts = rest.trim().split(" ");
  const sub = parts[0]?.toLowerCase();
  const groupJid = chat.endsWith("@g.us") ? chat : undefined;

  const contextJid = groupJid ?? chat; // use group JID if in group, else private chat JID

  if (sub === "add") {
    // .autorespond add keyword | response
    const pipeIdx = rest.indexOf("|");
    if (pipeIdx === -1) {
      await sock.sendMessage(chat, {
        text: `📝 *Auto-Respond Add Usage:*\n\`${p()}autorespond add keyword | response\`\n\nExample:\n\`${p()}autorespond add hello | Hi there! 👋\``,
      }, { quoted: msg });
      return;
    }
    const keyword = rest.slice(4, pipeIdx).trim();
    const response = rest.slice(pipeIdx + 1).trim();
    if (!keyword || !response) {
      await sock.sendMessage(chat, { text: "❌ Both keyword and response are required." }, { quoted: msg });
      return;
    }
    setAutoRespond(contextJid, keyword, response);
    await sock.sendMessage(chat, {
      text: `✅ *Auto-respond added!*\n🔑 Keyword: \`${keyword}\`\n💬 Response: ${response}`,
    }, { quoted: msg });
    return;
  }

  if (sub === "remove" || sub === "del" || sub === "delete") {
    const keyword = parts.slice(1).join(" ").trim();
    if (!keyword) {
      await sock.sendMessage(chat, {
        text: `❌ *Usage:* \`${p()}autorespond remove keyword\``,
      }, { quoted: msg });
      return;
    }
    const removed = removeAutoRespond(contextJid, keyword);
    await sock.sendMessage(chat, {
      text: removed ? `✅ Removed keyword: \`${keyword}\`` : `❌ Keyword \`${keyword}\` not found.`,
    }, { quoted: msg });
    return;
  }

  if (sub === "list") {
    const keywords = getAutoRespondKeywords(contextJid);
    const entries = Object.entries(keywords);
    if (entries.length === 0) {
      await sock.sendMessage(chat, { text: "📋 *No auto-respond keywords set.*" }, { quoted: msg });
      return;
    }
    const list = entries.map(([k, v]) => `• \`${k}\` → ${v.slice(0, 40)}${v.length > 40 ? "..." : ""}`).join("\n");
    await sock.sendMessage(chat, {
      text: `📋 *Auto-Respond Keywords*\n\n${list}`,
    }, { quoted: msg });
    return;
  }

  // Help
  await sock.sendMessage(chat, {
    text: `🤖 *Auto-Respond*\nAutomatically reply to keywords in this chat.\n\n*Commands:*\n\`${p()}autorespond add keyword | response\`\n\`${p()}autorespond remove keyword\`\n\`${p()}autorespond list\``,
  }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// STUB — commands that require paid external APIs
// ─────────────────────────────────────────────────────────────────────────────
export async function handleApiStub(
  sock: WASocket,
  msg: WAMessage,
  commandName: string,
  description: string,
  apiNeeded: string
): Promise<void> {
  await sock.sendMessage(jid(msg), {
    text: `⚠️ *${commandName} — External API Required*\n\n${description}\n\n🔑 *API needed:* ${apiNeeded}\n\n_This feature is in the premium roadmap. To enable it, add the API key to the server environment and implement the handler._`,
  }, { quoted: msg });
}
