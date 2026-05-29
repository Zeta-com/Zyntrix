import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";

function jid(msg: WAMessage) { return msg.key.remoteJid!; }

// ── Meme ──────────────────────────────────────────────────────────────────────
export async function handleMeme(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get("https://meme-api.com/gimme", { timeout: 8000 });
    const { title, url, subreddit } = res.data;
    const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(imgRes.data),
      caption: `😂 *${title}*\n_r/${subreddit}_`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Couldn't fetch a meme right now!" }, { quoted: msg });
  }
}

// ── Cat pic ───────────────────────────────────────────────────────────────────
export async function handleCat(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get("https://api.thecatapi.com/v1/images/search", { timeout: 6000 });
    const url = res.data[0]?.url;
    const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(imgRes.data),
      caption: "🐱 *Random Cat!*",
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Couldn't fetch a cat pic!" }, { quoted: msg });
  }
}

// ── Dog pic ───────────────────────────────────────────────────────────────────
export async function handleDog(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get("https://dog.ceo/api/breeds/image/random", { timeout: 6000 });
    const url = res.data.message;
    const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(imgRes.data),
      caption: "🐶 *Random Dog!*",
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Couldn't fetch a dog pic!" }, { quoted: msg });
  }
}

// ── GitHub profile ────────────────────────────────────────────────────────────
export async function handleGithub(sock: WASocket, msg: WAMessage, user: string): Promise<void> {
  if (!user) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.github <username>*" }, { quoted: msg });
    return;
  }
  try {
    const [profileRes, reposRes] = await Promise.all([
      axios.get(`https://api.github.com/users/${user}`, { timeout: 8000 }),
      axios.get(`https://api.github.com/users/${user}/repos?sort=stars&per_page=3`, { timeout: 8000 }),
    ]);
    const p = profileRes.data;
    const topRepos = reposRes.data.map((r: any) => `  • *${r.name}* ⭐${r.stargazers_count}`).join("\n");
    const text =
      `🐙 *GitHub: ${p.login}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📝 ${p.bio || "No bio"}\n` +
      `👥 Followers: *${p.followers}* | Following: *${p.following}*\n` +
      `📦 Public Repos: *${p.public_repos}*\n` +
      `📍 ${p.location || "Unknown"}\n` +
      `🔗 ${p.html_url}\n\n` +
      `🌟 *Top Repos:*\n${topRepos || "None"}`;
    await sock.sendMessage(jid(msg), { text }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: `❌ GitHub user "*${user}*" not found.` }, { quoted: msg });
  }
}

// ── Crypto price ──────────────────────────────────────────────────────────────
export async function handleCrypto(sock: WASocket, msg: WAMessage, coin: string): Promise<void> {
  const symbol = (coin || "bitcoin").toLowerCase().trim();
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd,eur,gbp&include_24hr_change=true&include_market_cap=true`,
      { timeout: 8000 }
    );
    const data = res.data[symbol];
    if (!data) {
      await sock.sendMessage(jid(msg), { text: `❌ Coin "*${symbol}*" not found. Try: bitcoin, ethereum, dogecoin, solana` }, { quoted: msg });
      return;
    }
    const change = data.usd_24h_change?.toFixed(2);
    const changeEmoji = parseFloat(change) >= 0 ? "📈" : "📉";
    await sock.sendMessage(jid(msg), {
      text:
        `💰 *${symbol.toUpperCase()} Price*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `💵 USD: *$${data.usd?.toLocaleString()}*\n` +
        `💶 EUR: *€${data.eur?.toLocaleString()}*\n` +
        `💷 GBP: *£${data.gbp?.toLocaleString()}*\n` +
        `${changeEmoji} 24h Change: *${change}%*\n` +
        `📊 Market Cap: *$${(data.usd_market_cap / 1e9).toFixed(2)}B*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Crypto API is unavailable. Try again later." }, { quoted: msg });
  }
}

// ── News headlines ────────────────────────────────────────────────────────────
export async function handleNews(sock: WASocket, msg: WAMessage, topic: string): Promise<void> {
  try {
    const q = topic || "world";
    const res = await axios.get(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=5&apikey=free`,
      { timeout: 8000 }
    );
    if (!res.data.articles?.length) throw new Error("no articles");
    const list = res.data.articles.slice(0, 5).map((a: any, i: number) =>
      `*${i + 1}. ${a.title}*\n   🌐 ${a.source?.name ?? ""} — _${new Date(a.publishedAt).toLocaleDateString()}_`
    ).join("\n\n");
    await sock.sendMessage(jid(msg), {
      text: `📰 *Latest News: ${q}*\n\n${list}`,
    }, { quoted: msg });
  } catch {
    // Fallback to BBC RSS (no key needed)
    try {
      const rssRes = await axios.get("https://feeds.bbci.co.uk/news/rss.xml", { timeout: 8000 });
      const items = [...rssRes.data.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)].slice(1, 6);
      const headlines = items.map((m, i) => `*${i + 1}.* ${m[1]}`).join("\n");
      await sock.sendMessage(jid(msg), { text: `📰 *BBC News Headlines*\n\n${headlines}` }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), { text: "❌ News service unavailable." }, { quoted: msg });
    }
  }
}

// ── Fancy text ────────────────────────────────────────────────────────────────
const FANCY_STYLES: Record<string, (c: string) => string> = {
  "bold serif": c => {
    const a = "𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳";
    const A = "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙";
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return a[code - 97];
    if (code >= 65 && code <= 90) return A[code - 65];
    return c;
  },
  "italic": c => {
    const a = "𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧";
    const A = "𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍";
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return a[code - 97];
    if (code >= 65 && code <= 90) return A[code - 65];
    return c;
  },
  "bubble": c => {
    const a = "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ";
    const A = "ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ";
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return a[code - 97];
    if (code >= 65 && code <= 90) return A[code - 65];
    return c;
  },
  "double struck": c => {
    const a = "𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫";
    const A = "𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ";
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return a[code - 97];
    if (code >= 65 && code <= 90) return A[code - 65];
    return c;
  },
  "fraktur": c => {
    const a = "𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷";
    const A = "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ";
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return a[code - 97];
    if (code >= 65 && code <= 90) return A[code - 65];
    return c;
  },
};

function applyFont(text: string, fn: (c: string) => string): string {
  return text.split("").map(fn).join("");
}

export async function handleFancy(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.fancy <text>*" }, { quoted: msg });
    return;
  }
  const output = Object.entries(FANCY_STYLES).map(([name, fn]) =>
    `*${name}:* ${applyFont(text, fn)}`
  ).join("\n");
  await sock.sendMessage(jid(msg), { text: `✨ *Fancy Text: "${text}"*\n\n${output}` }, { quoted: msg });
}

// ── Font (single style) ───────────────────────────────────────────────────────
export async function handleFont(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(" ");
  const style = parts[0]?.toLowerCase();
  const text = parts.slice(1).join(" ");
  if (!style || !text) {
    await sock.sendMessage(jid(msg), {
      text: "Usage: *.font <style> <text>*\nStyles: bold, italic, bubble, double, fraktur",
    }, { quoted: msg });
    return;
  }
  const map: Record<string, string> = { bold: "bold serif", italic: "italic", bubble: "bubble", double: "double struck", fraktur: "fraktur" };
  const fn = FANCY_STYLES[map[style] ?? style];
  if (!fn) {
    await sock.sendMessage(jid(msg), { text: "❌ Unknown style. Try: bold, italic, bubble, double, fraktur" }, { quoted: msg });
    return;
  }
  await sock.sendMessage(jid(msg), { text: applyFont(text, fn) }, { quoted: msg });
}

// ── WhatsApp text formatting helpers ─────────────────────────────────────────
export async function handleFormat(sock: WASocket, msg: WAMessage, style: string, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: `Usage: *.${style} <text>*` }, { quoted: msg });
    return;
  }
  const formats: Record<string, string> = {
    bold: `*${text}*`,
    italic: `_${text}_`,
    mono: `\`\`\`${text}\`\`\``,
    strike: `~${text}~`,
    spoiler: `||${text}||`,
  };
  await sock.sendMessage(jid(msg), { text: formats[style] ?? text }, { quoted: msg });
}

// ── React to quoted message ───────────────────────────────────────────────────
export async function handleReact(sock: WASocket, msg: WAMessage, emoji: string): Promise<void> {
  const quotedKey = msg.message?.extendedTextMessage?.contextInfo;
  if (!quotedKey?.stanzaId) {
    await sock.sendMessage(jid(msg), {
      text: "📎 *Reply to a message* with *.react <emoji>* to react to it.",
    }, { quoted: msg });
    return;
  }
  const targetKey = {
    remoteJid: jid(msg),
    id: quotedKey.stanzaId,
    fromMe: quotedKey.participant === undefined,
    participant: quotedKey.participant,
  };
  await sock.sendMessage(jid(msg), {
    react: { text: emoji || "🔥", key: targetKey },
  });
}

// ── Spam ─────────────────────────────────────────────────────────────────────
export async function handleSpam(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(" ");
  const count = Math.min(Math.max(parseInt(parts[0]) || 1, 1), 10);
  const text = parts.slice(1).join(" ");
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.spam <count> <message>*\nMax: 10" }, { quoted: msg });
    return;
  }
  for (let i = 0; i < count; i++) {
    await sock.sendMessage(jid(msg), { text });
    if (i < count - 1) await new Promise(r => setTimeout(r, 600));
  }
}

// ── Country info ──────────────────────────────────────────────────────────────
export async function handleCountry(sock: WASocket, msg: WAMessage, name: string): Promise<void> {
  if (!name) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.country <name>*" }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`, { timeout: 8000 });
    const c = res.data[0];
    const langs = Object.values(c.languages ?? {}).join(", ");
    const currencies = Object.values(c.currencies ?? {}).map((x: any) => `${x.name} (${x.symbol})`).join(", ");
    await sock.sendMessage(jid(msg), {
      text:
        `🌍 *${c.name.common}* (${c.name.official})\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🏳️ Flag: ${c.flag}\n` +
        `🗺️ Region: ${c.region} — ${c.subregion}\n` +
        `🏙️ Capital: ${c.capital?.[0] || "N/A"}\n` +
        `👥 Population: ${c.population?.toLocaleString()}\n` +
        `🗣️ Languages: ${langs}\n` +
        `💰 Currency: ${currencies}\n` +
        `📞 Dial: +${c.idd?.root}${c.idd?.suffixes?.[0] ?? ""}\n` +
        `🌐 TLD: ${c.tld?.[0] ?? "N/A"}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: `❌ Country "*${name}*" not found.` }, { quoted: msg });
  }
}

// ── NASA APOD ─────────────────────────────────────────────────────────────────
export async function handleNASA(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", { timeout: 10000 });
    const { title, explanation, url, date } = res.data;
    try {
      const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 12000 });
      await sock.sendMessage(jid(msg), {
        image: Buffer.from(imgRes.data),
        caption: `🌌 *NASA: ${title}*\n📅 ${date}\n\n${explanation.slice(0, 600)}...`,
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), {
        text: `🌌 *NASA: ${title}*\n📅 ${date}\n\n${explanation.slice(0, 600)}...\n\n🔗 ${url}`,
      }, { quoted: msg });
    }
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ NASA API unavailable." }, { quoted: msg });
  }
}

// ── IP Lookup ─────────────────────────────────────────────────────────────────
export async function handleIPLookup(sock: WASocket, msg: WAMessage, ip: string): Promise<void> {
  if (!ip) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.ip <IP address>*" }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 8000 });
    const d = res.data;
    if (d.error) throw new Error(d.reason);
    await sock.sendMessage(jid(msg), {
      text:
        `🔍 *IP Lookup: ${ip}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🌍 Country: ${d.country_name} ${d.country_code}\n` +
        `🏙️ City: ${d.city}, ${d.region}\n` +
        `🌐 ISP: ${d.org}\n` +
        `📡 ASN: ${d.asn}\n` +
        `🕐 Timezone: ${d.timezone}\n` +
        `📍 Coords: ${d.latitude}, ${d.longitude}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: `❌ Could not look up IP: ${ip}` }, { quoted: msg });
  }
}

// ── Random number ─────────────────────────────────────────────────────────────
export async function handleRandom(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const min = parseInt(parts[0]) || 1;
  const max = parseInt(parts[1]) || 100;
  if (min >= max) {
    await sock.sendMessage(jid(msg), { text: "❌ Min must be less than max.\nUsage: *.random [min] [max]*" }, { quoted: msg });
    return;
  }
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  await sock.sendMessage(jid(msg), {
    text: `🎲 *Random Number* (${min}-${max})\n\n*${n}*`,
  }, { quoted: msg });
}

// ── Disappearing messages toggle ──────────────────────────────────────────────
export async function handleDisappear(sock: WASocket, msg: WAMessage, mode: string): Promise<void> {
  const chatJid = jid(msg);
  try {
    if (mode === "on") {
      await (sock as any).sendMessage(chatJid, {
        disappearingMessagesInChat: 604800, // 7 days
      });
      await sock.sendMessage(chatJid, { text: "⏳ *Disappearing messages enabled!* Messages will auto-delete after 7 days." }, { quoted: msg });
    } else {
      await (sock as any).sendMessage(chatJid, {
        disappearingMessagesInChat: 0,
      });
      await sock.sendMessage(chatJid, { text: "♾️ *Disappearing messages disabled!*" }, { quoted: msg });
    }
  } catch {
    await sock.sendMessage(chatJid, { text: "❌ Couldn't toggle disappearing messages." }, { quoted: msg });
  }
}

// ── Anime info ───────────────────────────────────────────────────────────────
export async function handleAnime(sock: WASocket, msg: WAMessage, query: string): Promise<void> {
  if (!query) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.anime <name>*" }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`, { timeout: 8000 });
    const a = res.data.data?.[0];
    if (!a) throw new Error("Not found");
    const caption = `🎌 *${a.title}* (${a.title_english ?? a.title})\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⭐ Score: *${a.score}/10* (${a.scored_by?.toLocaleString()} votes)\n` +
      `📺 Episodes: *${a.episodes || "?"}*\n` +
      `🗓️ Aired: ${a.aired?.string || "Unknown"}\n` +
      `🎭 Genres: ${a.genres?.map((g: any) => g.name).join(", ") || "N/A"}\n` +
      `📊 Status: ${a.status}\n` +
      `🏆 Rank: #${a.rank || "?"}\n\n` +
      `📝 ${(a.synopsis || "No synopsis.").slice(0, 400)}...`;
    try {
      const imgRes = await axios.get(a.images?.jpg?.image_url, { responseType: "arraybuffer", timeout: 8000 });
      await sock.sendMessage(jid(msg), { image: Buffer.from(imgRes.data), caption }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid(msg), { text: caption }, { quoted: msg });
    }
  } catch {
    await sock.sendMessage(jid(msg), { text: `❌ Anime "*${query}*" not found.` }, { quoted: msg });
  }
}


// ── Convert WhatsApp channel link → newsletter JID ────────────────────────────
export async function handleGetNewsletter(sock: WASocket, msg: WAMessage, link: string): Promise<void> {
  if (!link || !link.trim()) {
    await sock.sendMessage(jid(msg), {
      text: `📢 *Get Newsletter JID*\n\n*Usage:* \`.getnewsletter [channel link]\`\n*Example:* \`.getnewsletter https://whatsapp.com/channel/120363424876568536\`\n\n_Converts a WhatsApp channel link into its newsletter JID for use in commands._`,
    }, { quoted: msg });
    return;
  }
  const match = link.match(/channel\/([A-Za-z0-9]+)/);
  if (!match) {
    await sock.sendMessage(jid(msg), { text: "❌ Invalid channel link. Use: `https://whatsapp.com/channel/...`" }, { quoted: msg });
    return;
  }
  const id = match[1];
  const newsletterJid = `${id}@newsletter`;
  await sock.sendMessage(jid(msg), {
    text: `📢 *Newsletter JID*\n\n🔗 *Link:* ${link}\n🆔 *JID:* \`${newsletterJid}\`\n\n_Use this JID to follow/reference this channel in bot commands._`,
  }, { quoted: msg });
}

// ── Convert phone number → WhatsApp JID ───────────────────────────────────────
export async function handleGetJid(sock: WASocket, msg: WAMessage, input: string): Promise<void> {
  if (!input || !input.trim()) {
    await sock.sendMessage(jid(msg), {
      text: `📱 *Get JID*\n\n*Usage:* \`.getjid [number]\`\n*Example:* \`.getjid 2348012345678\`\n\n_Converts a phone number to a WhatsApp JID._`,
    }, { quoted: msg });
    return;
  }
  const clean = input.replace(/[^0-9]/g, "");
  if (clean.length < 7) {
    await sock.sendMessage(jid(msg), { text: "❌ Invalid number. Include country code (e.g. `2348012345678`)." }, { quoted: msg });
    return;
  }
  const userJid  = `${clean}@s.whatsapp.net`;
  await sock.sendMessage(jid(msg), {
    text: `📱 *JID Result*\n\n🔢 *Number:* +${clean}\n👤 *User JID:* \`${userJid}\``,
  }, { quoted: msg });
}

// ── Mention/tag a user by number ───────────────────────────────────────────────
export async function handleMention(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const number = parts[0]?.replace(/[^0-9]/g, "") ?? "";
  const text   = parts.slice(1).join(" ") || "Hey!";
  if (!number) {
    await sock.sendMessage(jid(msg), { text: "📌 *Usage:* `.mention [number] [message]`" }, { quoted: msg });
    return;
  }
  const targetJid = `${number}@s.whatsapp.net`;
  await sock.sendMessage(jid(msg), {
    text: `@${number} ${text}`,
    mentions: [targetJid],
  }, { quoted: msg });
}

// ── Broadcast message to all active chats (owner only) ────────────────────────
export async function handleBroadcast(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text.trim()) {
    await sock.sendMessage(jid(msg), { text: "📢 *Usage:* `.broadcast [message]`" }, { quoted: msg });
    return;
  }
  const chats = await (sock as any).groupFetchAllParticipating?.().catch(() => ({}));
  const jids = Object.keys(chats ?? {});
  if (!jids.length) {
    await sock.sendMessage(jid(msg), { text: "❌ No groups found to broadcast to." }, { quoted: msg });
    return;
  }
  let sent = 0;
  for (const g of jids) {
    try { await sock.sendMessage(g, { text }); sent++; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  await sock.sendMessage(jid(msg), { text: `📢 *Broadcast sent to ${sent} group(s)!*` }, { quoted: msg });
}
