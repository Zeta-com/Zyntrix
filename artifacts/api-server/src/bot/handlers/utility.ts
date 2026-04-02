import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { createHash } from "crypto";
import { evaluate } from "mathjs";
import QRCode from "qrcode";

function jid(msg: WAMessage) {
  return msg.key.remoteJid!;
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────
export async function handleWiki(sock: WASocket, msg: WAMessage, query: string): Promise<void> {
  if (!query) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.wiki <topic>*" }, { quoted: msg });
    return;
  }
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await axios.get(url, { timeout: 7000 });
    const d = res.data;
    if (d.type === "disambiguation") {
      await sock.sendMessage(jid(msg), {
        text: `🔍 *Wikipedia*\n\n"${query}" has multiple meanings. Try being more specific.`,
      }, { quoted: msg });
      return;
    }
    const text = `📖 *${d.title}*\n\n${d.extract?.slice(0, 800)}...\n\n🔗 ${d.content_urls?.desktop?.page ?? ""}`;
    await sock.sendMessage(jid(msg), { text }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ Couldn't find anything for "*${query}*" on Wikipedia.`,
    }, { quoted: msg });
  }
}

// ── Weather ──────────────────────────────────────────────────────────────────
export async function handleWeather(sock: WASocket, msg: WAMessage, city: string): Promise<void> {
  if (!city) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.weather <city>*" }, { quoted: msg });
    return;
  }
  try {
    const geoRes = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { timeout: 5000 }
    );
    const loc = geoRes.data.results?.[0];
    if (!loc) {
      await sock.sendMessage(jid(msg), { text: `❌ City "*${city}*" not found.` }, { quoted: msg });
      return;
    }
    const weatherRes = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&wind_speed_unit=kmh&timezone=auto`,
      { timeout: 5000 }
    );
    const c = weatherRes.data.current;
    const codeMap: Record<number, string> = {
      0: "☀️ Clear sky", 1: "🌤️ Mainly clear", 2: "⛅ Partly cloudy", 3: "☁️ Overcast",
      45: "🌫️ Foggy", 48: "🌫️ Icy fog", 51: "🌦️ Light drizzle", 53: "🌦️ Drizzle",
      61: "🌧️ Slight rain", 63: "🌧️ Rain", 65: "🌧️ Heavy rain",
      71: "🌨️ Slight snow", 73: "🌨️ Snow", 75: "❄️ Heavy snow",
      80: "🌦️ Rain showers", 81: "🌧️ Rain showers", 82: "⛈️ Heavy showers",
      95: "⛈️ Thunderstorm", 96: "⛈️ Thunder + hail", 99: "⛈️ Heavy thunder + hail",
    };
    const condition = codeMap[c.weather_code] ?? "🌡️ Unknown";
    await sock.sendMessage(jid(msg), {
      text: `🌍 *Weather in ${loc.name}, ${loc.country}*\n\n${condition}\n🌡️ Temp: *${c.temperature_2m}°C* (feels ${c.apparent_temperature}°C)\n💧 Humidity: *${c.relative_humidity_2m}%*\n💨 Wind: *${c.wind_speed_10m} km/h*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Couldn't fetch weather. Try again later." }, { quoted: msg });
  }
}

// ── Translate ────────────────────────────────────────────────────────────────
export async function handleTranslate(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(" ");
  const lang = parts[0];
  const text = parts.slice(1).join(" ");
  if (!lang || !text) {
    await sock.sendMessage(jid(msg), {
      text: "Usage: *.tr <lang> <text>*\nExample: *.tr es Hello how are you*\n\nLang codes: en, es, fr, de, pt, ar, hi, zh, ja, ko, ru, it, tr",
    }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`,
      { timeout: 8000 }
    );
    const translated = res.data.responseData?.translatedText;
    if (!translated || translated === text) {
      await sock.sendMessage(jid(msg), { text: "❌ Translation failed. Check the language code!" }, { quoted: msg });
      return;
    }
    await sock.sendMessage(jid(msg), {
      text: `🌐 *Translation → ${lang.toUpperCase()}*\n\n📝 _Original:_ ${text}\n\n✅ _Translated:_ *${translated}*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Translation service unavailable." }, { quoted: msg });
  }
}

// ── Calculator ────────────────────────────────────────────────────────────────
export async function handleCalc(sock: WASocket, msg: WAMessage, expr: string): Promise<void> {
  if (!expr) {
    await sock.sendMessage(jid(msg), {
      text: "Usage: *.calc <expression>*\nExample: *.calc (25 * 4) / 2 + sqrt(16)*",
    }, { quoted: msg });
    return;
  }
  try {
    const result = evaluate(expr);
    await sock.sendMessage(jid(msg), {
      text: `🧮 *Calculator*\n\n📝 ${expr}\n\n= *${result}*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ Invalid expression: *${expr}*\n\nTry: *.calc 2 + 2*`,
    }, { quoted: msg });
  }
}

// ── QR Code generator ─────────────────────────────────────────────────────────
export async function handleQRGen(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.qr <text or URL>*" }, { quoted: msg });
    return;
  }
  try {
    const buffer = await QRCode.toBuffer(text, { width: 512, margin: 2 });
    await sock.sendMessage(jid(msg), {
      image: buffer,
      caption: `📲 *QR Code*\n_Scan to get:_ ${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to generate QR code." }, { quoted: msg });
  }
}

// ── Password generator ────────────────────────────────────────────────────────
export async function handlePassword(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const len = Math.min(Math.max(parseInt(args) || 16, 6), 64);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}";
  let pass = "";
  for (let i = 0; i < len; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  await sock.sendMessage(jid(msg), {
    text: `🔐 *Generated Password* (${len} chars)\n\n\`${pass}\`\n\n⚠️ _Save this somewhere safe!_`,
  }, { quoted: msg });
}

// ── URL Shortener ─────────────────────────────────────────────────────────────
export async function handleShorten(sock: WASocket, msg: WAMessage, url: string): Promise<void> {
  if (!url || !url.startsWith("http")) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.short <URL>*\nExample: *.short https://google.com*" }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 6000 });
    await sock.sendMessage(jid(msg), {
      text: `🔗 *URL Shortened*\n\n📎 Original: ${url.slice(0, 50)}...\n✅ Short: *${res.data}*`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to shorten URL." }, { quoted: msg });
  }
}

// ── Base64 ────────────────────────────────────────────────────────────────────
export async function handleBase64(sock: WASocket, msg: WAMessage, text: string, decode: boolean): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), {
      text: decode ? "Usage: *.unb64 <base64 text>*" : "Usage: *.b64 <text>*",
    }, { quoted: msg });
    return;
  }
  try {
    const result = decode
      ? Buffer.from(text, "base64").toString("utf8")
      : Buffer.from(text).toString("base64");
    await sock.sendMessage(jid(msg), {
      text: `${decode ? "🔓" : "🔒"} *Base64 ${decode ? "Decoded" : "Encoded"}*\n\n\`${result}\``,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Invalid base64 string." }, { quoted: msg });
  }
}

// ── Binary ────────────────────────────────────────────────────────────────────
export async function handleBinary(sock: WASocket, msg: WAMessage, text: string, decode: boolean): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), {
      text: decode ? "Usage: *.unbin <binary>*" : "Usage: *.bin <text>*",
    }, { quoted: msg });
    return;
  }
  try {
    let result: string;
    if (decode) {
      result = text.split(" ").map(b => String.fromCharCode(parseInt(b, 2))).join("");
    } else {
      result = text.split("").map(c => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
    }
    await sock.sendMessage(jid(msg), {
      text: `${decode ? "🔓" : "🔒"} *Binary ${decode ? "Decoded" : "Encoded"}*\n\n\`${result.slice(0, 1000)}\``,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Invalid binary string." }, { quoted: msg });
  }
}

// ── Hash ──────────────────────────────────────────────────────────────────────
export async function handleHash(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.trim().split(" ");
  const algorithm = ["md5", "sha1", "sha256", "sha512"].includes(parts[0]?.toLowerCase() ?? "")
    ? parts.shift()!.toLowerCase()
    : "sha256";
  const text = parts.join(" ");
  if (!text) {
    await sock.sendMessage(jid(msg), {
      text: "Usage: *.hash [md5|sha1|sha256|sha512] <text>*\nDefault: sha256",
    }, { quoted: msg });
    return;
  }
  const hash = createHash(algorithm).update(text).digest("hex");
  await sock.sendMessage(jid(msg), {
    text: `#️⃣ *Hash (${algorithm.toUpperCase()})*\n\n📝 Input: ${text}\n\n🔢 \`${hash}\``,
  }, { quoted: msg });
}

// ── World Time ────────────────────────────────────────────────────────────────
export async function handleTime(sock: WASocket, msg: WAMessage, city: string): Promise<void> {
  const zones: Record<string, string> = {
    "new york": "America/New_York", "los angeles": "America/Los_Angeles",
    "london": "Europe/London", "paris": "Europe/Paris",
    "berlin": "Europe/Berlin", "dubai": "Asia/Dubai",
    "india": "Asia/Kolkata", "delhi": "Asia/Kolkata", "mumbai": "Asia/Kolkata",
    "tokyo": "Asia/Tokyo", "beijing": "Asia/Shanghai", "shanghai": "Asia/Shanghai",
    "singapore": "Asia/Singapore", "sydney": "Australia/Sydney",
    "lagos": "Africa/Lagos", "nairobi": "Africa/Nairobi",
    "cairo": "Africa/Cairo", "moscow": "Europe/Moscow",
    "sao paulo": "America/Sao_Paulo", "toronto": "America/Toronto",
  };
  const key = city.toLowerCase();
  const zone = zones[key] ?? (city.includes("/") ? city : null);
  if (!zone) {
    await sock.sendMessage(jid(msg), {
      text: `⏰ Unknown city. Try: *london, new york, dubai, tokyo, lagos, india, paris, moscow*\nOr a timezone like: *Africa/Lagos*`,
    }, { quoted: msg });
    return;
  }
  try {
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit",
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour12: true,
    }).format(new Date());
    await sock.sendMessage(jid(msg), {
      text: `🕐 *Time in ${city}*\n\n${time}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Invalid timezone." }, { quoted: msg });
  }
}

// ── Dictionary ────────────────────────────────────────────────────────────────
export async function handleDefine(sock: WASocket, msg: WAMessage, word: string): Promise<void> {
  if (!word) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.define <word>*" }, { quoted: msg });
    return;
  }
  try {
    const res = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { timeout: 6000 }
    );
    const entry = res.data[0];
    const meanings = entry.meanings.slice(0, 2).map((m: any) => {
      const def = m.definitions[0];
      return `📌 *${m.partOfSpeech}*: ${def.definition}${def.example ? `\n  _"${def.example}"_` : ""}`;
    }).join("\n\n");
    const phonetic = entry.phonetic ?? entry.phonetics?.[0]?.text ?? "";
    await sock.sendMessage(jid(msg), {
      text: `📚 *${entry.word}* ${phonetic}\n\n${meanings}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ No definition found for "*${word}*".`,
    }, { quoted: msg });
  }
}

// ── Ping URL ─────────────────────────────────────────────────────────────────
export async function handlePingUrl(sock: WASocket, msg: WAMessage, url: string): Promise<void> {
  if (!url || !url.startsWith("http")) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.pingurl <https://example.com>*" }, { quoted: msg });
    return;
  }
  const start = Date.now();
  try {
    const res = await axios.head(url, { timeout: 8000 });
    const ms = Date.now() - start;
    await sock.sendMessage(jid(msg), {
      text: `🏓 *Ping Result*\n\n🌐 ${url}\n✅ Status: *${res.status} ${res.statusText}*\n⚡ Response time: *${ms}ms*`,
    }, { quoted: msg });
  } catch (err: any) {
    const ms = Date.now() - start;
    await sock.sendMessage(jid(msg), {
      text: `🏓 *Ping Result*\n\n🌐 ${url}\n❌ *Unreachable* (${ms}ms)\n${err?.response?.status ? `Status: ${err.response.status}` : "No response"}`,
    }, { quoted: msg });
  }
}

// ── Word count ─────────────────────────────────────────────────────────────────
export async function handleWordCount(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.wc <text>*" }, { quoted: msg });
    return;
  }
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  const chars_no_space = text.replace(/\s/g, "").length;
  const sentences = (text.match(/[.!?]+/g) || []).length;
  await sock.sendMessage(jid(msg), {
    text: `📊 *Text Stats*\n\n📝 Words: *${words}*\n🔤 Characters: *${chars}*\n🔠 Chars (no spaces): *${chars_no_space}*\n💬 Sentences: *${sentences}*`,
  }, { quoted: msg });
}

// ── Screenshot via API ────────────────────────────────────────────────────────
export async function handleScreenshot(sock: WASocket, msg: WAMessage, url: string): Promise<void> {
  if (!url || !url.startsWith("http")) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.ss <URL>*\nExample: *.ss https://google.com*" }, { quoted: msg });
    return;
  }
  await sock.sendMessage(jid(msg), { text: `📸 Taking screenshot of ${url}...` }, { quoted: msg });
  try {
    const apiUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=1280&viewport_height=720&format=jpg&timeout=30`;
    const res = await axios.get(apiUrl, { responseType: "arraybuffer", timeout: 20000 });
    await sock.sendMessage(jid(msg), {
      image: Buffer.from(res.data),
      caption: `📸 *Screenshot of* ${url}`,
    }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), {
      text: `❌ Couldn't take screenshot. Try a different URL.`,
    }, { quoted: msg });
  }
}
