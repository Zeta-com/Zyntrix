import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import * as config from "../config.js";
import { setOwnerNumber } from "../config.js";
import { getUptime } from "../store.js";
import { startTrivia, checkTriviaAnswer, skipTrivia } from "../games/trivia.js";
import { getTruth, getDare, getTruthOrDare } from "../games/truthordare.js";
import { playRPS } from "../games/rps.js";
import { startMath } from "../games/math.js";
import { logger } from "../../lib/logger.js";
import { setFakeType, setFakeRecord, setChatbot, isChatbotOn, setAntidelete, isAntideleteOn } from "../state.js";
import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleYouTubeDownload,
} from "./downloader.js";
import {
  handleSticker, handleStickerToImage, handleJoke, handle8Ball,
  handleShip, handleMock, handleReverse, handleVapor, handleEmojify,
  handleCoinFlip, handleDice, handleRate, handleChoose, handleQuote,
  handleRoast, handleCompliment, handleFact,
} from "./fun.js";
import {
  handleWiki, handleWeather, handleTranslate, handleCalc, handleQRGen,
  handlePassword, handleShorten, handleBase64, handleBinary, handleHash,
  handleTime, handleDefine, handlePingUrl, handleWordCount, handleScreenshot,
} from "./utility.js";
import {
  handleTagAll, handleGroupInfo, handleAdmins, handleProfilePic,
  handleKick, handleMuteGroup, handlePromote,
  handleGroupInviteLink, handleJoinGroup, handleLeaveGroup,
  handleGroupMetadata, handleRevokeInvite,
} from "./group.js";
import {
  handleMovieSearch, handleMovieSubs, handleMovieDownload,
} from "./movie.js";
import {
  handleMeme, handleCat, handleDog, handleGithub, handleCrypto,
  handleNews, handleFancy, handleFont, handleFormat, handleReact,
  handleSpam, handleCountry, handleNASA, handleIPLookup, handleRandom,
  handleDisappear, handleAnime,
  handleGetNewsletter, handleGetJid, handleMention, handleBroadcast,
} from "./extra.js";
import { handleAI, handleImageGen, handleAnimeImage, handleNbCommand } from "./ai.js";
import { handleGroupStatus, handleSetGC } from "./groupstatus.js";
import { handleGrabStatus } from "./status.js";
import { sendCarouselMenu, type MenuCard } from "../helpers/carouselMenu.js";
import {
  handleSummarize, handleRewrite, handleCode, handleFixCode, handleQuiz, handleStory,
  handlePoll, handleWarn, handleClearWarn, handleCheckWarns,
  handleWouldYouRather, handleChatMemory, handleDashboard, handleZyntrix,
  handleSaveMedia, handleUserInfo, handleGroupStats, handleTopChatters,
  handleAutoRespond, handleApiStub,
} from "./v2commands.js";
import {
  handleAntiLink, handleAntiSpam, handleAntiBot, handleWelcome, handleGoodbye,
} from "./groupguard.js";
import { addSession, removeSession, listSessions } from "../sessions.js";
import {
  generateKeys, revokeKey, revokeAllKeys, getKeyStats,
} from "../keys.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getSender(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? "";
}

export function isOwner(msg: WAMessage): boolean {
  // If the message came FROM the connected device, it's always the owner
  if (msg.key.fromMe === true) return true;

  const sender = getSender(msg);

  // Explicit owner set via .setowner or auto-detected on connect
  if (config.botOwnerJid) {
    return config.isOwnerJid(sender) || config.isOwnerJid(msg.key.remoteJid ?? "");
  }

  // Fallback to OWNER_NUMBER env var
  const owner = config.BOT_CONFIG.ownerNumber;
  if (owner) {
    return sender.includes(owner) || (msg.key.remoteJid ?? "").includes(owner);
  }

  // No owner configured at all — nobody is owner except fromMe (handled above)
  return false;
}

export function getJid(msg: WAMessage): string {
  return msg.key.remoteJid ?? "";
}

export function getMessageText(msg: WAMessage): string {
  return (
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    ""
  );
}

// WhatsApp sometimes wraps the "real" message one level deep (disappearing
// messages, view-once, etc). Button taps can be affected by this too, so
// unwrap before looking for the interactive response payload.
function unwrapMessage(message: any): any {
  if (!message) return message;
  return (
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.documentWithCaptionMessage?.message ??
    message
  );
}

// Display text of every carousel/menu button, mapped back to its command.
// Used as a last-resort fallback if the button-tap payload doesn't carry the
// `id` we originally sent (some WhatsApp client versions only echo the
// visible button label). Keep in sync with the `cards` list built in the
// menu/help/start command below.
const BUTTON_LABEL_TO_COMMAND: Record<string, string> = {
  "media cmds": "listmedia",
  "ai cmds": "listai",
  "fun cmds": "listfun",
  "tools cmds": "listtools",
  "group cmds": "listgroup",
  "system cmds": "listsystem",
  "guard cmds": "listguard",
  "v2 menu": "zyntrix",
  "check ping": "ping",
  "check uptime": "uptime",
};

function normalizeButtonLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  // Strip emoji/symbols, collapse whitespace, lowercase — so "📂 Media Cmds"
  // and "Media Cmds" both normalize to "media cmds".
  const stripped = label
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return stripped.length > 0 ? stripped : null;
}

// Recursively walk an object looking for any of the known
// button-response field names, regardless of how deeply WhatsApp nests them
// (message wrappers change across client/Baileys versions). This is a
// deliberately brute-force fallback on top of the direct-path lookup below.
function deepFindButtonId(node: any, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 6) return null;

  if (typeof node.paramsJson === "string") {
    try {
      const parsed = JSON.parse(node.paramsJson);
      if (typeof parsed?.id === "string") return parsed.id;
    } catch {
      if (node.paramsJson.trim().length > 0) return node.paramsJson;
    }
  }
  if (typeof node.selectedButtonId === "string") return node.selectedButtonId;
  if (typeof node.selectedRowId === "string") return node.selectedRowId;
  if (typeof node.selectedId === "string") return node.selectedId;
  if (typeof node.buttonId === "string") return node.buttonId;

  for (const key of Object.keys(node)) {
    const found = deepFindButtonId(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function deepFindButtonLabel(node: any, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (typeof node.body?.text === "string") return node.body.text;
  if (typeof node.selectedDisplayText === "string") return node.selectedDisplayText;
  for (const key of Object.keys(node)) {
    const found = deepFindButtonLabel(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// Tapping a native-flow button (e.g. a carousel card's quick_reply button)
// doesn't produce a plain text message — it produces an
// `interactiveResponseMessage` whose `nativeFlowResponseMessage.paramsJson`
// echoes back the JSON we sent in the button (`{ display_text, id }`). The
// normal command router only ever looked at `conversation`/`extendedTextMessage`,
// so button taps were silently ignored — no error, no reply, nothing. This
// pulls a usable command out of the response using several fallback
// strategies, since button-response shapes have changed across
// WhatsApp/Baileys versions:
//  1. interactiveResponseMessage.nativeFlowResponseMessage.paramsJson.id (current, direct path)
//  2. legacy buttonsResponseMessage.selectedButtonId / listResponseMessage.singleSelectReply.selectedRowId
//  3. a recursive deep-search for any of the above fields, anywhere in the message tree
//  4. matching the visible button label text against a known command map
export function getButtonCommand(msg: WAMessage): string | null {
  const message = unwrapMessage(msg.message as any);
  const nativeFlow = message?.interactiveResponseMessage?.nativeFlowResponseMessage;

  logger.info(
    {
      messageKeys: message ? Object.keys(message) : [],
      hasInteractiveResponse: !!message?.interactiveResponseMessage,
      nativeFlowName: nativeFlow?.name,
      paramsJson: nativeFlow?.paramsJson,
      interactiveResponseMessage: message?.interactiveResponseMessage,
    },
    "[ButtonTap] Incoming interactive response payload"
  );

  let id = deepFindButtonId(message);

  if (!id) {
    const label = deepFindButtonLabel(message);
    const normalized = normalizeButtonLabel(label);
    if (normalized && BUTTON_LABEL_TO_COMMAND[normalized]) {
      id = `${BUTTON_LABEL_TO_COMMAND[normalized]}`;
      logger.info({ label, normalized, id }, "[ButtonTap] Resolved command via label fallback");
    }
  }

  logger.info({ extractedButtonId: id }, "[ButtonTap] Extracted button id");

  return id;
}

// ── Dynamic menu builder ──────────────────────────────────────────────────────
const MENU_IMAGE_URL = "https://i.postimg.cc/T1nBJN9L/f8a339cefd71e77ac0aacdb64ef1ed8e.jpg";

function buildMenu(senderName: string, chatJid: string): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const p = config.BOT_CONFIG.prefix;
  const chatOn = isChatbotOn(chatJid);

  return `╔═══════════════════╗
║  ⚡ *${config.BOT_CONFIG.botName} V2* ⚡  ║
╚═══════════════════╝
👤 User: ${senderName}
📅 ${date}  ⏰ ${time}
⚡ 60+ Commands  🤖 Chatbot: ${chatOn ? "ON 🟢" : "OFF 🔴"}
🔑 Mode: ${config.isPublicMode ? "Public 🌍" : "Private 🔒"}

┏❐ 《 *🧠 AI & SMART TOOLS* 》
┃├◆ ${p}ai / ${p}ask [question]
┃├◆ ${p}imagine / ${p}img [prompt]
┃├◆ ${p}summarize [text or reply]
┃├◆ ${p}rewrite [style] [text]
┃├◆ ${p}code [description]
┃├◆ ${p}fixcode [code or reply]
┃├◆ ${p}quiz [topic]
┃├◆ ${p}story [prompt]
┃├◆ ${p}nb — cinematic transform
┃├◆ ${p}animage [anime prompt]
┃├◆ ${p}chatbot on/off
┃└◆ ${p}chatmemory [clear]
┗❐

┏❐ 《 *📱 MEDIA & STATUS* 》
┃├◆ ${p}save — save quoted media
┃├◆ ${p}vv / ${p}vv2 — view-once reveal
┃├◆ ${p}sticker / ${p}take — create stickers
┃├◆ ${p}toimage — sticker → image
┃├◆ ${p}grabstatus — reply to status to grab it
┗❐

┏❐ 《 *🎵 DOWNLOADS* 》
┃├◆ ${p}song / ${p}ytmp3 [search/url]
┃├◆ ${p}ytvid / ${p}ytmp4 [search/url]
┃├◆ ${p}ttdl [tiktok url]
┃├◆ ${p}igdl [instagram url]
┃├◆ ${p}movie / ${p}sm [title]
┗❐

┏❐ 《 *👥 GROUP MANAGEMENT* 》
┃├◆ ${p}warn @user [reason]
┃├◆ ${p}clearwarn @user
┃├◆ ${p}poll Question | A | B | C
┃├◆ ${p}groupstats / ${p}topchatters
┃├◆ ${p}autorespond add/remove/list
┃├◆ ${p}tagall / ${p}admins
┃├◆ ${p}kick / ${p}promote / ${p}mute
┗❐

┏❐ 《 *🛡️ GROUP GUARD* 》
┃├◆ ${p}antilink on/off
┃├◆ ${p}antispam on/off
┃├◆ ${p}antibot on/off
┃├◆ ${p}welcome on [msg] / off
┃└◆ ${p}goodbye on [msg] / off
┗❐

┏❐ 《 *🎮 FUN & GAMES* 》
┃├◆ ${p}wouldyourather / ${p}wyr
┃├◆ ${p}truth / ${p}dare / ${p}tod
┃├◆ ${p}8ball / ${p}joke / ${p}meme
┃├◆ ${p}trivia / ${p}math / ${p}rps
┃├◆ ${p}ship / ${p}roast / ${p}compliment
┗❐

┏❐ 《 *⚙️ SYSTEM & OWNER* 》
┃├◆ ${p}dashboard — control panel
┃├◆ ${p}userinfo [@user/number]
┃├◆ ${p}sessions — connected numbers
┃├◆ ${p}addsession [name]
┃├◆ ${p}ping / ${p}uptime / ${p}alive
┃├◆ ${p}owner / ${p}setowner
┃└◆ ${p}public / ${p}private
┗❐

_Use ${p}zyntrix for the full V2 command list_
_Powered by ${config.BOT_CONFIG.botName} © ${now.getFullYear()}_`;
}

// ── Main command handler ──────────────────────────────────────────────────────
export async function handleCommand(
  sock: WASocket,
  msg: WAMessage,
  text: string
): Promise<void> {
  const jid = getJid(msg);
  const args = text.trim().split(/\s+/);
  const command = (args[0] ?? "").toLowerCase();
  const rest = args.slice(1).join(" ");
  const senderName = (msg as any).pushName ?? getSender(msg).split("@")[0];

  if (!config.isPublicMode && !isOwner(msg)) {
    await sock.sendMessage(jid, {
      text: `🔒 *Private Mode*\nThis bot is currently owner-only.\n\nContact the owner to get access.`,
    }, { quoted: msg });
    return;
  }

  try {
    switch (command) {

      // ── MENU ──────────────────────────────────────────────────────────────
      case "menu":
      case "help":
      case "start": {
        // Plain text+image menu — reliable on all WhatsApp clients.
        // The carousel is still in carouselMenu.ts for future use.
        await sock.sendMessage(jid, {
          image: { url: MENU_IMAGE_URL },
          caption: buildMenu(senderName, jid),
        } as any, { quoted: msg });
        break;
      }

      // ── MENU CATEGORY LISTS (buttons from the carousel land here) ──────────
      case "listmedia": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *📂 MEDIA & DOWNLOADS* ⌟ ◆\n┣ ◆ ${p}song / ${p}ytmp3 [search/url]\n┣ ◆ ${p}ytvid / ${p}ytmp4 [search/url]\n┣ ◆ ${p}ttdl [tiktok url]\n┣ ◆ ${p}igdl [instagram url]\n┣ ◆ ${p}movie / ${p}sm [title]\n┣ ◆ ${p}dlmovie [id] [season] [ep]\n┣ ◆ ${p}smsubs [id] [season] [ep]\n┣ ◆ ${p}save — save quoted media\n┣ ◆ ${p}vv — view once reveal\n┣ ◆ ${p}sticker — create sticker\n┗ ◆ ${p}take — branded sticker`,
        }, { quoted: msg });
        break;
      }
      case "listai": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *🧠 AI & SMART TOOLS* ⌟ ◆\n┣ ◆ ${p}ai / ${p}ask [question]\n┣ ◆ ${p}imagine / ${p}img [prompt]\n┣ ◆ ${p}animage [anime prompt]\n┣ ◆ ${p}nb — cinematic transform\n┣ ◆ ${p}summarize [text or reply]\n┣ ◆ ${p}rewrite [style] [text]\n┣ ◆ ${p}code [description]\n┣ ◆ ${p}fixcode [code or reply]\n┣ ◆ ${p}quiz [topic]\n┣ ◆ ${p}story [prompt]\n┣ ◆ ${p}chatbot on/off\n┣ ◆ ${p}chatmemory [clear]\n┣ ◆ ${p}anime [name]\n┗ ◆ ${p}vision* / ${p}edit* / ${p}voice* _(API required)_`,
        }, { quoted: msg });
        break;
      }
      case "listfun": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *🎮 FUN & GAMES* ⌟ ◆\n┣ ◆ ${p}joke / ${p}meme / ${p}fact\n┣ ◆ ${p}truth / ${p}dare / ${p}tod\n┣ ◆ ${p}8ball [question]\n┣ ◆ ${p}wouldyourather / ${p}wyr\n┣ ◆ ${p}dice / ${p}coinflip / ${p}slots\n┣ ◆ ${p}rps [r/p/s]\n┣ ◆ ${p}ship / ${p}rate / ${p}choose\n┣ ◆ ${p}quote / ${p}roast / ${p}compliment\n┣ ◆ ${p}mock / ${p}reverse / ${p}emojify\n┣ ◆ ${p}trivia / ${p}math\n┗ ◆ ${p}cat / ${p}dog / ${p}random`,
        }, { quoted: msg });
        break;
      }
      case "listtools": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *⚙️ UTILITIES* ⌟ ◆\n┣ ◆ ${p}wiki [topic]\n┣ ◆ ${p}weather [city]\n┣ ◆ ${p}translate [lang] [text]\n┣ ◆ ${p}calc [expression]\n┣ ◆ ${p}qr [text]\n┣ ◆ ${p}password [length]\n┣ ◆ ${p}shorten [url]\n┣ ◆ ${p}base64 encode/decode [text]\n┣ ◆ ${p}binary / ${p}hash [text]\n┣ ◆ ${p}define [word]\n┣ ◆ ${p}screenshot [url]\n┣ ◆ ${p}sticker / ${p}toimage\n┣ ◆ ${p}fancy / ${p}vapor / ${p}emojify [text]\n┣ ◆ ${p}crypto [coin]\n┣ ◆ ${p}news / ${p}nasa\n┣ ◆ ${p}ip [address] / ${p}country [name]\n┣ ◆ ${p}github [user]\n┗ ◆ ${p}disappear on/off`,
        }, { quoted: msg });
        break;
      }
      case "listgroup": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *👥 GROUP MANAGEMENT* ⌟ ◆\n┣ ◆ ${p}tagall / ${p}admins\n┣ ◆ ${p}kick / ${p}promote / ${p}mute / ${p}unmute\n┣ ◆ ${p}warn @user [reason]\n┣ ◆ ${p}clearwarn @user\n┣ ◆ ${p}warnings [@user]\n┣ ◆ ${p}poll Question | Opt1 | Opt2\n┣ ◆ ${p}groupinfo / ${p}groupmeta\n┣ ◆ ${p}groupstats — group stats\n┣ ◆ ${p}topchatters — top chatters\n┣ ◆ ${p}autorespond add/remove/list\n┣ ◆ ${p}groupinvite / ${p}gclink\n┣ ◆ ${p}joingroup [link] / ${p}leavegroup\n┣ ◆ ${p}revokeinvite\n┣ ◆ ${p}gs / ${p}gcstatus / ${p}swgc [caption]\n┣ ◆ ${p}setgc [invite link or JID]\n┗ ◆ ${p}getpp [@user]`,
        }, { quoted: msg });
        break;
      }
      case "listguard": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *🛡️ GROUP GUARD* ⌟ ◆\n┣ ◆ ${p}antilink on/off — block links\n┣ ◆ ${p}antispam on/off — block spam\n┣ ◆ ${p}antibot on/off — remove bots on join\n┣ ◆ ${p}welcome on [msg] / off\n┣ ◆ ${p}goodbye on [msg] / off\n┗ _Use {name} in welcome/goodbye as placeholder_\n\n_All group guard features require owner/admin._`,
        }, { quoted: msg });
        break;
      }
      case "listsystem": {
        const p = config.BOT_CONFIG.prefix;
        await sock.sendMessage(jid, {
          text: `┏ ❑ ⌜ *⚙️ SYSTEM & OWNER* ⌟ ◆\n┣ ◆ ${p}ping / ${p}uptime / ${p}alive\n┣ ◆ ${p}owner / ${p}setowner [number] [name?]\n┣ ◆ ${p}public / ${p}private\n┣ ◆ ${p}antidelete on/off\n┣ ◆ ${p}grabstatus — reply to a status\n┣ ◆ ${p}userinfo [@user/number]\n┣ ◆ ${p}dashboard — bot control panel\n┣ ◆ ${p}sessions — connected numbers\n┣ ◆ ${p}addsession [name] — add number\n┣ ◆ ${p}removesession [name] — remove\n┣ ◆ ${p}faketype on/off / ${p}fakerecord on/off\n┣ ◆ ${p}broadcast [message] (owner)\n┗ ◆ ${p}getnewsletter [channel link]`,
        }, { quoted: msg });
        break;
      }

      // ── STATUS ─────────────────────────────────────────────────────────────
      case "alive": {
        const start = Date.now();
        await sock.sendMessage(jid, { text: "🏓 *Checking status...*" }, { quoted: msg });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, {
          text: `✅ *${config.BOT_CONFIG.botName} is ONLINE!*\n\n` +
            `🟢 Status: Active\n` +
            `⏱️ Uptime: ${getUptime()}\n` +
            `⚡ Latency: ${latency}ms\n` +
            `🔑 Mode: ${config.isPublicMode ? "Public 🌍" : "Private 🔒"}\n` +
            `🤖 Chatbot: ${isChatbotOn(jid) ? "ON 🟢" : "OFF 🔴"}\n` +
            `📅 ${new Date().toLocaleString()}`,
        }, { quoted: msg });
        break;
      }

      case "uptime":
        await sock.sendMessage(jid, {
          text: `⏱️ *Uptime:* ${getUptime()}\n_${config.BOT_CONFIG.botName} has been running non-stop!_`,
        }, { quoted: msg });
        break;

      // ── OWNER MANAGEMENT ───────────────────────────────────────────────────
      case "setowner": {
        if (!rest) {
          await sock.sendMessage(jid, {
            text: `👑 *Set Owner*\n\nUsage: \`.setowner <number> [name]\`\nExample: \`.setowner 2349031646071 David\`\n\n_Number must include country code, no + sign._`,
          }, { quoted: msg });
          break;
        }
        const soArgs = rest.trim().split(/\s+/);
        const soNum = soArgs[0]!.replace(/[^0-9]/g, "");
        const soName = soArgs.slice(1).join(" ") || "Owner";
        if (soNum.length < 7) {
          await sock.sendMessage(jid, { text: "❌ Invalid number. Include country code (e.g. 2349031646071)" }, { quoted: msg });
          break;
        }
        setOwnerNumber(soNum, soName);
        await sock.sendMessage(jid, {
          text: `✅ *Owner Set!*\n\n👤 Name: *${soName}*\n📱 Number: *+${soNum}*\n\n_Only this number can now use owner commands._`,
        }, { quoted: msg });
        break;
      }

      case "owner": {
        const ownerNum = config.botOwnerJid
          ? config.botOwnerJid.replace("@s.whatsapp.net", "")
          : config.BOT_CONFIG.ownerNumber;
        if (!ownerNum) {
          await sock.sendMessage(jid, {
            text: `👑 *No owner set yet.*\nUse \`.setowner <number>\` to set one.`,
          }, { quoted: msg });
          break;
        }
        const ownerName = config.botOwnerName || "Owner";
        const vcard =
          `BEGIN:VCARD\n` +
          `VERSION:3.0\n` +
          `FN:${ownerName}\n` +
          `ORG:${config.BOT_CONFIG.botName};\n` +
          `TEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\n` +
          `END:VCARD`;
        await sock.sendMessage(jid, {
          contacts: {
            displayName: ownerName,
            contacts: [{ vcard }],
          },
        } as any, { quoted: msg });
        break;
      }

      // ── MODE CONTROL ───────────────────────────────────────────────────────
      case "public":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        config.setPublicMode(true);
        await sock.sendMessage(jid, { text: "✅ *Public Mode ON*\nEveryone can now use bot commands." }, { quoted: msg });
        break;

      case "private":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        config.setPublicMode(false);
        await sock.sendMessage(jid, { text: "🔒 *Private Mode ON*\nOnly the owner can use commands." }, { quoted: msg });
        break;

      case "faketype": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const on = rest.toLowerCase() === "on";
        setFakeType(on);
        await sock.sendMessage(jid, { text: on ? "⌨️ *Fake Typing ON!*" : "⌨️ *Fake Typing OFF.*" }, { quoted: msg });
        break;
      }

      case "fakerecord": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const on = rest.toLowerCase() === "on";
        setFakeRecord(on);
        await sock.sendMessage(jid, { text: on ? "🎙️ *Fake Recording ON!*" : "🎙️ *Fake Recording OFF.*" }, { quoted: msg });
        break;
      }

      // ── TOJID ──────────────────────────────────────────────────────────────
      case "tojid": {
        if (!rest) { await sock.sendMessage(jid, { text: `Usage: \`.tojid <channel_link>\`` }, { quoted: msg }); break; }
        const match = rest.match(/channel\/([A-Za-z0-9_-]+)/);
        if (match) {
          await sock.sendMessage(jid, { text: `📡 *Channel JID:*\n\`${match[1]}@newsletter\`` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: `❌ Could not extract JID from: ${rest}` }, { quoted: msg });
        }
        break;
      }

      // ── AI ─────────────────────────────────────────────────────────────────
      case "ai":
      case "gpt":
      case "chatgpt":
      case "ask":
        await handleAI(sock, msg, rest);
        break;

      case "img":
      case "imagine":
      case "genimage":
        await handleImageGen(sock, msg, rest);
        break;

      case "animage":
        await handleAnimeImage(sock, msg, rest);
        break;

      case "nb":
      case "cinematic":
      case "filmgrade":
        await handleNbCommand(sock, msg);
        break;

      // ── CHATBOT ON/OFF ─────────────────────────────────────────────────────
      case "chatbot": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const toggle = rest.toLowerCase();
        if (toggle === "on") {
          setChatbot(jid, true);
          await sock.sendMessage(jid, {
            text: `🤖 *Chatbot ON!*\n\nMeta AI will now auto-reply to *all messages* in this chat.\n_Disable with .chatbot off_`,
          }, { quoted: msg });
        } else if (toggle === "off") {
          setChatbot(jid, false);
          await sock.sendMessage(jid, { text: "🔴 *Chatbot OFF.*\nAuto-replies disabled." }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, {
            text: `🤖 *Chatbot:* ${isChatbotOn(jid) ? "ON 🟢" : "OFF 🔴"}\n\n• \`.chatbot on\` — Enable Meta AI\n• \`.chatbot off\` — Disable`,
          }, { quoted: msg });
        }
        break;
      }

      // ── GROUP STATUS (open to ALL members, no admin required) ─────────────
      case "groupstatus":
      case "gs":
      case "gstatus":
      case "gcstatus":
      case "swgc":
      case "upswgc":
      case "togstatus":
        await handleGroupStatus(sock, msg, rest);
        break;

      case "setgc":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleSetGC(sock, msg, rest);
        break;

      // ── MOVIE ──────────────────────────────────────────────────────────────
      case "movie":
      case "sm":
      case "cineverse":
        await handleMovieSearch(sock, msg, rest);
        break;

      case "dlmovie":
      case "downloadmovie":
        await handleMovieDownload(sock, msg, rest);
        break;

      case "smsubs":
        await handleMovieSubs(sock, msg, rest);
        break;

      // ── GROUP ──────────────────────────────────────────────────────────────
      case "tagall":
      case "tag":
        await handleTagAll(sock, msg, rest);
        break;

      case "admins":
        await handleAdmins(sock, msg);
        break;

      case "groupinfo":
        await handleGroupInfo(sock, msg);
        break;

      case "getpp":
        await handleProfilePic(sock, msg, rest);
        break;

      case "kick":
        await handleKick(sock, msg);
        break;

      case "mute":
        await handleMuteGroup(sock, msg, true);
        break;

      case "unmute":
        await handleMuteGroup(sock, msg, false);
        break;

      case "promote":
        await handlePromote(sock, msg, true);
        break;

      // ── FUN ────────────────────────────────────────────────────────────────
      case "joke":      await handleJoke(sock, msg); break;
      case "meme":      await handleMeme(sock, msg); break;
      case "fact":      await handleFact(sock, msg); break;
      case "8ball":     await handle8Ball(sock, msg, rest); break;
      case "coinflip":
      case "flip":      await handleCoinFlip(sock, msg); break;
      case "dice":      await handleDice(sock, msg, rest); break;
      case "rps": { const rpsResult = playRPS(rest); await sock.sendMessage(jid, { text: rpsResult }, { quoted: msg }); break; }
      case "ship":      await handleShip(sock, msg, rest); break;
      case "rate":      await handleRate(sock, msg, rest); break;
      case "choose":    await handleChoose(sock, msg, rest); break;
      case "quote":     await handleQuote(sock, msg); break;
      case "roast":     await handleRoast(sock, msg, rest); break;
      case "compliment": await handleCompliment(sock, msg, rest); break;
      case "mock":      await handleMock(sock, msg, rest); break;
      case "reverse":   await handleReverse(sock, msg, rest); break;
      case "emojify":   await handleEmojify(sock, msg, rest); break;
      case "vapor":     await handleVapor(sock, msg, rest); break;
      case "cat":       await handleCat(sock, msg); break;
      case "dog":       await handleDog(sock, msg); break;
      case "random":    await handleRandom(sock, msg, rest); break;

      case "truth":
        await sock.sendMessage(jid, { text: `🔴 *Truth:* ${getTruth()}` }, { quoted: msg });
        break;

      case "dare":
        await sock.sendMessage(jid, { text: `🟡 *Dare:* ${getDare()}` }, { quoted: msg });
        break;

      case "tod":
        await sock.sendMessage(jid, { text: getTruthOrDare() }, { quoted: msg });
        break;

      case "slots": {
        const emojis = ["🍒", "🍋", "🔔", "💎", "7️⃣", "🍉"];
        const r = () => emojis[Math.floor(Math.random() * emojis.length)];
        const s1 = r(), s2 = r(), s3 = r();
        const won = s1 === s2 && s2 === s3;
        await sock.sendMessage(jid, {
          text: `🎰 *Slot Machine*\n\n[ ${s1} | ${s2} | ${s3} ]\n\n${won ? "🎉 *JACKPOT! You won!*" : "😔 No luck this time. Try again!"}`,
        }, { quoted: msg });
        break;
      }

      case "trivia": { const r = startTrivia(jid); await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }
      case "skip":   { const r = skipTrivia(jid);  await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }
      case "math":   { const r = startMath(jid);   await sock.sendMessage(jid, { text: r }, { quoted: msg }); break; }

      // ── TOOLS ──────────────────────────────────────────────────────────────
      case "wiki":
      case "wikipedia": await handleWiki(sock, msg, rest); break;
      case "weather":   await handleWeather(sock, msg, rest); break;

      case "translate":
      case "tr":
        await handleTranslate(sock, msg, rest);
        break;

      case "calc":
      case "calculate": await handleCalc(sock, msg, rest); break;

      case "qr":
      case "qrcode":    await handleQRGen(sock, msg, rest); break;

      case "password":
      case "pass":      await handlePassword(sock, msg, rest); break;

      case "shorten":
      case "urlshort":  await handleShorten(sock, msg, rest); break;

      case "base64": {
        const b = rest.split(" ");
        await handleBase64(sock, msg, b.slice(1).join(" "), b[0] === "decode");
        break;
      }

      case "binary":    await handleBinary(sock, msg, rest, false); break;
      case "hash":      await handleHash(sock, msg, rest); break;
      case "time":      await handleTime(sock, msg, rest); break;
      case "define":
      case "dict":      await handleDefine(sock, msg, rest); break;

      case "ping": {
        if (rest.startsWith("http")) {
          await handlePingUrl(sock, msg, rest);
        } else {
          const t = Date.now();
          await sock.sendMessage(jid, { text: "🏓 *Pong!*" }, { quoted: msg });
          await sock.sendMessage(jid, { text: `🏓 *Pong!* ⚡ ${Date.now() - t}ms` }, { quoted: msg });
        }
        break;
      }

      case "wc":
      case "wordcount": await handleWordCount(sock, msg, rest); break;
      case "screenshot":
      case "ss":        await handleScreenshot(sock, msg, rest); break;
      case "sticker":
      case "s":         await handleSticker(sock, msg); break;
      case "toimage":   await handleStickerToImage(sock, msg); break;
      case "fancy":     await handleFancy(sock, msg, rest); break;
      case "font":      await handleFont(sock, msg, rest); break;
      case "format":    await handleFormat(sock, msg, rest.split(" ")[0] ?? "", rest.split(" ").slice(1).join(" ")); break;
      case "react":     await handleReact(sock, msg, rest); break;
      case "disappear": await handleDisappear(sock, msg, rest.toLowerCase()); break;
      case "anime":     await handleAnime(sock, msg, rest); break;
      case "crypto":    await handleCrypto(sock, msg, rest); break;
      case "news":      await handleNews(sock, msg, rest); break;
      case "nasa":      await handleNASA(sock, msg); break;
      case "ip":
      case "iptrack":   await handleIPLookup(sock, msg, rest); break;
      case "country":   await handleCountry(sock, msg, rest); break;
      case "github":
      case "git":       await handleGithub(sock, msg, rest); break;

      case "spam":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleSpam(sock, msg, rest);
        break;

      // ── ANTIDELETE ─────────────────────────────────────────────────────────
      case "antidelete":
      case "ad": {
        const sub = rest.trim().toLowerCase();
        if (sub === "on") {
          setAntidelete(jid, true);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete ENABLED* for this chat!\n\nDeleted messages will be re-posted here with sender info.\nUse \`${config.BOT_CONFIG.prefix}antidelete off\` to disable.`,
          }, { quoted: msg });
        } else if (sub === "off") {
          setAntidelete(jid, false);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete DISABLED* for this chat.\n\nUse \`${config.BOT_CONFIG.prefix}antidelete on\` to re-enable.`,
          }, { quoted: msg });
        } else {
          const status = isAntideleteOn(jid);
          await sock.sendMessage(jid, {
            text: `🛡️ *AntiDelete Status*\n\n` +
              `Status: ${status ? "ENABLED 🟢" : "DISABLED 🔴"}\n\n` +
              `Use \`${config.BOT_CONFIG.prefix}antidelete on/off\` to toggle.`,
          }, { quoted: msg });
        }
        break;
      }

      // ── GROUP — NEW ────────────────────────────────────────────────────────
      case "groupinvite":
      case "gclink":
      case "invitelink":  await handleGroupInviteLink(sock, msg); break;

      case "joingroup":
      case "join":        await handleJoinGroup(sock, msg, rest); break;

      case "leavegroup":
      case "leave":       await handleLeaveGroup(sock, msg); break;

      case "groupmeta":
      case "groupmetadata": await handleGroupMetadata(sock, msg); break;

      case "revokeinvite":
      case "revoke":      await handleRevokeInvite(sock, msg); break;

      // ── UTILITY+ ───────────────────────────────────────────────────────────
      case "getnewsletter":
      case "newsletter":  await handleGetNewsletter(sock, msg, rest); break;

      case "getjid":
      case "tojid2":      await handleGetJid(sock, msg, rest); break;

      case "mention":     await handleMention(sock, msg, rest); break;

      case "broadcast":
      case "bc":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleBroadcast(sock, msg, rest);
        break;

      // ── DOWNLOADER ─────────────────────────────────────────────────────────
      case "ytmp3":
      case "song":
      case "play":      await handleYouTubeDownload(sock, msg, rest, true); break;
      case "ytmp4":
      case "ytvid":     await handleYouTubeDownload(sock, msg, rest, false); break;
      case "ttdl":
      case "tiktok":    await handleTikTokDownload(sock, msg, rest); break;
      case "igdl":
      case "instagram": await handleInstagramDownload(sock, msg, rest); break;

      // ── STATUS GRAB ───────────────────────────────────────────────────────
      case "grabstatus":
      case "getstatus":
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        await handleGrabStatus(sock, msg, rest);
        break;

      // ── V2 AI COMMANDS ────────────────────────────────────────────────────
      case "summarize":
      case "sum":
        await handleSummarize(sock, msg, rest);
        break;

      case "rewrite":
      case "rw":
        await handleRewrite(sock, msg, rest);
        break;

      case "code":
      case "gencode":
        await handleCode(sock, msg, rest);
        break;

      case "fixcode":
      case "fix":
        await handleFixCode(sock, msg, rest);
        break;

      case "quiz":
        await handleQuiz(sock, msg, rest);
        break;

      case "story":
        await handleStory(sock, msg, rest);
        break;

      case "wouldyourather":
      case "wyr":
        await handleWouldYouRather(sock, msg);
        break;

      case "chatmemory":
      case "memory":
        await handleChatMemory(sock, msg, rest);
        break;

      // ── V2 MEDIA ─────────────────────────────────────────────────────────
      case "save":
        await handleSaveMedia(sock, msg);
        break;

      // ── V2 POLLS ─────────────────────────────────────────────────────────
      case "poll":
        await handlePoll(sock, msg, rest);
        break;

      // ── V2 WARN SYSTEM ───────────────────────────────────────────────────
      case "warn":
        await handleWarn(sock, msg, rest);
        break;

      case "clearwarn":
      case "unwarn":
        await handleClearWarn(sock, msg);
        break;

      case "warnings":
      case "checkwarn":
        await handleCheckWarns(sock, msg);
        break;

      // ── V2 GROUP STATS ───────────────────────────────────────────────────
      case "groupstats":
      case "gstats":
        await handleGroupStats(sock, msg);
        break;

      case "topchatters":
      case "top":
        await handleTopChatters(sock, msg);
        break;

      // ── V2 AUTO-RESPOND ──────────────────────────────────────────────────
      case "autorespond":
      case "ar":
        await handleAutoRespond(sock, msg, rest);
        break;

      // ── V2 GROUP GUARD ───────────────────────────────────────────────────
      case "antilink":
        await handleAntiLink(sock, msg, rest);
        break;

      case "antispam":
        await handleAntiSpam(sock, msg, rest);
        break;

      case "antibot":
        await handleAntiBot(sock, msg, rest);
        break;

      case "welcome":
        await handleWelcome(sock, msg, rest);
        break;

      case "goodbye":
      case "bye":
        await handleGoodbye(sock, msg, rest);
        break;

      // ── V2 USER INFO ─────────────────────────────────────────────────────
      case "userinfo":
      case "whois":
      case "profile":
        await handleUserInfo(sock, msg);
        break;

      // ── V2 DASHBOARD ─────────────────────────────────────────────────────
      case "dashboard":
      case "panel":
        await handleDashboard(sock, msg);
        break;

      case "zyntrix":
      case "v2":
        await handleZyntrix(sock, msg);
        break;

      // ── V2 SESSION MANAGEMENT ─────────────────────────────────────────────
      case "sessions": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const list = listSessions();
        await sock.sendMessage(jid, {
          text: list.length === 0
            ? "📱 *No extra sessions active.*\nOnly the main session is running.\n\n_Use .addsession [name] to add one._"
            : `📱 *Active Sessions (${list.length})*\n\n${list.map((s, i) => `${i + 1}. \`${s.id}\` — ${s.connected ? "🟢 Connected" : "🔴 Disconnected"}`).join("\n")}`,
        }, { quoted: msg });
        break;
      }

      case "addsession": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        if (!rest) { await sock.sendMessage(jid, { text: "Usage: `.addsession <name>`" }, { quoted: msg }); break; }
        await sock.sendMessage(jid, { text: `⏳ *Starting session:* \`${rest}\`...\n\nCheck your Telegram for the QR code, or use pairing code via the session name.` }, { quoted: msg });
        await addSession(rest);
        break;
      }

      case "removesession": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        if (!rest) { await sock.sendMessage(jid, { text: "Usage: `.removesession <name>`" }, { quoted: msg }); break; }
        removeSession(rest);
        await sock.sendMessage(jid, { text: `✅ *Session \`${rest}\` removed.*` }, { quoted: msg });
        break;
      }

      // ── COMMAND SEARCH ────────────────────────────────────────────────────
      case "search":
      case "find":
      case "cmdsearch": {
        if (!rest) {
          await sock.sendMessage(jid, {
            text: `🔍 *Command Search*\n\nDescribe what you're looking for and I'll find the right command!\n\nUsage: \`.search what you want to do\`\n\nExamples:\n• \`.search download youtube video\`\n• \`.search send someone a funny insult\`\n• \`.search block links in group\``,
          }, { quoted: msg });
          break;
        }
        const p = config.BOT_CONFIG.prefix;
        const query = rest.toLowerCase();
        // Keyword map: description fragments → command suggestions
        const commandMap: Array<{ keywords: string[]; cmd: string; desc: string }> = [
          { keywords: ["youtube","yt","video","download video","music","song","audio","mp3","mp4"], cmd: `${p}ytmp3 / ${p}ytmp4`, desc: "Download YouTube audio or video" },
          { keywords: ["tiktok","tt","tok"], cmd: `${p}ttdl`, desc: "Download TikTok videos" },
          { keywords: ["instagram","ig","insta","reel"], cmd: `${p}igdl`, desc: "Download Instagram posts/reels" },
          { keywords: ["movie","film","series","watch","cinema"], cmd: `${p}movie`, desc: "Search and download movies" },
          { keywords: ["ai","gpt","chatgpt","ask","question","answer","chat"], cmd: `${p}ai`, desc: "Ask the AI anything" },
          { keywords: ["image","generate","create image","picture","photo","art"], cmd: `${p}imagine`, desc: "Generate AI images" },
          { keywords: ["sticker","make sticker","create sticker"], cmd: `${p}sticker`, desc: "Convert image/video to sticker" },
          { keywords: ["summarize","summary","shorten text","tl;dr","brief"], cmd: `${p}summarize`, desc: "Summarize long text or a quoted message" },
          { keywords: ["rewrite","paraphrase","rephrase","improve writing"], cmd: `${p}rewrite`, desc: "Rewrite text in a different style" },
          { keywords: ["code","write code","generate code","programming","script"], cmd: `${p}code`, desc: "Generate code from a description" },
          { keywords: ["fix code","debug","error in code","broken code"], cmd: `${p}fixcode`, desc: "Debug and fix code" },
          { keywords: ["quiz","test","question","trivia"], cmd: `${p}quiz`, desc: "Get a quiz question on any topic" },
          { keywords: ["story","write story","fiction","narrative","tale"], cmd: `${p}story`, desc: "Generate a short story" },
          { keywords: ["joke","funny","laugh","humor","comedy"], cmd: `${p}joke`, desc: "Get a random joke" },
          { keywords: ["truth","dare","game","truth or dare"], cmd: `${p}tod`, desc: "Play truth or dare" },
          { keywords: ["would you rather","wyr","choice","dilemma"], cmd: `${p}wyr`, desc: "Would you rather question" },
          { keywords: ["weather","temperature","forecast","rain","climate"], cmd: `${p}weather`, desc: "Get weather for any city" },
          { keywords: ["translate","language","translation","convert language"], cmd: `${p}translate`, desc: "Translate text to another language" },
          { keywords: ["calculator","calculate","math","equation","solve"], cmd: `${p}calc`, desc: "Calculate a math expression" },
          { keywords: ["qr","qr code","barcode","generate qr"], cmd: `${p}qr`, desc: "Generate a QR code" },
          { keywords: ["wiki","wikipedia","information","about","facts"], cmd: `${p}wiki`, desc: "Search Wikipedia" },
          { keywords: ["warn","warning","strike","punish member"], cmd: `${p}warn`, desc: "Warn a group member" },
          { keywords: ["poll","vote","question members","survey"], cmd: `${p}poll`, desc: "Create a poll in the group" },
          { keywords: ["tagall","mention all","tag everyone","ping all"], cmd: `${p}tagall`, desc: "Mention everyone in the group" },
          { keywords: ["kick","remove member","remove user"], cmd: `${p}kick`, desc: "Kick a member from the group" },
          { keywords: ["antilink","block link","remove link","no links"], cmd: `${p}antilink`, desc: "Block links in the group" },
          { keywords: ["antispam","block spam","spam filter"], cmd: `${p}antispam`, desc: "Block spam messages in the group" },
          { keywords: ["welcome","greet new member","join message"], cmd: `${p}welcome`, desc: "Set a welcome message for new members" },
          { keywords: ["goodbye","leave message","bye message"], cmd: `${p}goodbye`, desc: "Set a goodbye message when members leave" },
          { keywords: ["save","save media","save photo","save video","download media"], cmd: `${p}save`, desc: "Save quoted media to your DM" },
          { keywords: ["status","grab status","download status","someone status"], cmd: `${p}grabstatus`, desc: "Reply to a status to grab it" },
          { keywords: ["view once","reveal","see view once","vv"], cmd: `${p}vv`, desc: "Reveal view-once messages" },
          { keywords: ["group stats","activity","most active","chat count"], cmd: `${p}groupstats`, desc: "Show group message statistics" },
          { keywords: ["top chatters","most messages","active users"], cmd: `${p}topchatters`, desc: "Show who sends the most messages" },
          { keywords: ["auto respond","auto reply","keyword reply","auto answer"], cmd: `${p}autorespond`, desc: "Set up keyword auto-responses" },
          { keywords: ["ping","latency","speed","response time"], cmd: `${p}ping`, desc: "Check bot speed and latency" },
          { keywords: ["uptime","how long running","bot age"], cmd: `${p}uptime`, desc: "Check how long the bot has been running" },
          { keywords: ["dashboard","control panel","bot stats","overview"], cmd: `${p}dashboard`, desc: "View bot dashboard and stats" },
          { keywords: ["sessions","multiple numbers","extra number","add number"], cmd: `${p}sessions`, desc: "Manage multiple WhatsApp sessions" },
          { keywords: ["crypto","bitcoin","ethereum","price","coin"], cmd: `${p}crypto`, desc: "Get cryptocurrency prices" },
          { keywords: ["news","headlines","today","current events"], cmd: `${p}news`, desc: "Get the latest news" },
          { keywords: ["roast","insult","burn","clap back"], cmd: `${p}roast`, desc: "Roast someone with an AI comeback" },
          { keywords: ["compliment","nice words","praise","appreciate"], cmd: `${p}compliment`, desc: "Compliment someone" },
          { keywords: ["ship","relationship","couple","love meter"], cmd: `${p}ship`, desc: "Calculate relationship compatibility" },
          { keywords: ["chat memory","conversation history","remember"], cmd: `${p}chatmemory`, desc: "View or clear your AI conversation history" },
          { keywords: ["user info","profile info","who is","phone number info"], cmd: `${p}userinfo`, desc: "Get info about a user" },
          { keywords: ["password","generate password","strong password","random password"], cmd: `${p}password`, desc: "Generate a secure password" },
          { keywords: ["github","git","developer","repo"], cmd: `${p}github`, desc: "Look up a GitHub profile" },
        ];
        const matches = commandMap.filter(e =>
          e.keywords.some(k => query.includes(k))
        );
        if (matches.length === 0) {
          await sock.sendMessage(jid, {
            text: `🔍 *No matching commands found for:* "${rest}"\n\n_Try different words, or use ${p}menu to browse all categories._`,
          }, { quoted: msg });
        } else {
          const top = matches.slice(0, 5);
          const lines = top.map((m, i) => `${i + 1}. \`${m.cmd}\`\n   ↳ ${m.desc}`).join("\n\n");
          await sock.sendMessage(jid, {
            text: `🔍 *Results for:* "${rest}"\n\n${lines}\n\n_Showing ${top.length} of ${matches.length} match(es). Use ${p}menu for full list._`,
          }, { quoted: msg });
        }
        break;
      }

      // ── KEYS (WhatsApp — owner only) ──────────────────────────────────────
      case "keys": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        // Usage: .keys <password>
        if (rest.trim() !== "2483") {
          await sock.sendMessage(jid, {
            text: `🔑 *Key Generator*\n\nSend your password to generate 4 new Zyntrix keys:\n\`${config.BOT_CONFIG.prefix}keys <password>\``,
          }, { quoted: msg });
          break;
        }
        const newKeys = generateKeys(4);
        const stats = getKeyStats();
        await sock.sendMessage(jid, {
          text: `✅ *4 New Keys Generated!*\n\n${newKeys.map((k, i) => `${i + 1}. \`${k}\``).join("\n")}\n\n📊 Total valid keys: *${stats.valid}*\n_Share these with users who need bot access._`,
        }, { quoted: msg });
        break;
      }

      case "revokeall": {
        if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
        const count = revokeAllKeys();
        await sock.sendMessage(jid, {
          text: `🚫 *All Keys Revoked!*\n\n*${count}* keys have been invalidated.\nAll users will need new keys to access the Telegram bot.\n\n_Use ${config.BOT_CONFIG.prefix}keys to generate new ones._`,
        }, { quoted: msg });
        break;
      }

      // ── API STUBS (need external API) ─────────────────────────────────────
      case "vision":
      case "ocr":
      case "read":
        await handleApiStub(sock, msg, command, "OpenAI Vision API", "analyze images, extract text from photos, and read documents");
        break;

      case "voice":
        await handleApiStub(sock, msg, command, "Text-to-Speech API", "convert text to natural-sounding voice messages");
        break;

      case "edit":
        await handleApiStub(sock, msg, command, "Image Editing AI API", "edit and transform images with AI instructions");
        break;

      case "agent":
      case "autopilot":
        await handleApiStub(sock, msg, command, "OpenAI Assistants API", "run autonomous AI agents that complete complex multi-step tasks");
        break;

      case "commandai":
        await handleApiStub(sock, msg, command, "OpenAI Function Calling API", "AI that can execute any bot command by understanding natural language");
        break;

      case "plan":
      case "myplan":
      case "buy":
      case "redeem":
      case "keygen":
      case "usage":
        await handleApiStub(sock, msg, command, "Payment Gateway + Database", "manage premium plans, subscriptions and billing");
        break;

      default:
        // Handle .revoke<key> pattern (e.g. .revokeZYNT-XXX-XXX-XXX)
        if (command.startsWith("revoke") && command.length > 6) {
          if (!isOwner(msg)) { await sock.sendMessage(jid, { text: "👑 *Owner only!*" }, { quoted: msg }); break; }
          // Support both .revokeZYNT-... and .revoke ZYNT-...
          const keyArg = command.slice(6).toUpperCase() || rest.toUpperCase();
          if (!keyArg) {
            await sock.sendMessage(jid, { text: `Usage: \`.revoke ZYNT-XXXX-XXXX-XXXX\`\nOr: \`.revokeZYNT-XXXX-XXXX-XXXX\`` }, { quoted: msg });
          } else {
            const ok = revokeKey(keyArg);
            const stats = getKeyStats();
            await sock.sendMessage(jid, {
              text: ok
                ? `✅ *Key Revoked!*\n\n\`${keyArg}\` is now invalid.\nAny user who had this key will need a new one.\n\n📊 Remaining valid keys: *${stats.valid}*`
                : `❌ *Key not found:* \`${keyArg}\`\n_It may already be revoked or doesn't exist._`,
            }, { quoted: msg });
          }
          break;
        }
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    await sock.sendMessage(jid, {
      text: `❌ Something went wrong with *.${command}*\nTry again or use *.menu*`,
    }, { quoted: msg });
  }
}

export { checkTriviaAnswer };
