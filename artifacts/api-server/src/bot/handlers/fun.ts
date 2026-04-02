import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import sharp from "sharp";

function jid(msg: WAMessage) {
  return msg.key.remoteJid!;
}

// ── Sticker maker ────────────────────────────────────────────────────────────
export async function handleSticker(sock: WASocket, msg: WAMessage): Promise<void> {
  const imgMsg =
    msg.message?.imageMessage ??
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

  if (!imgMsg) {
    await sock.sendMessage(jid(msg), {
      text: "📎 Send or reply to an *image* with *.sticker* to convert it.",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: "⏳ Converting to sticker..." }, { quoted: msg });

  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    const webp = await sharp(buffer as Buffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp()
      .toBuffer();

    await sock.sendMessage(jid(msg), {
      sticker: webp,
    } as any);
  } catch {
    await sock.sendMessage(jid(msg), {
      text: "❌ Failed to convert image. Make sure it's a valid image!",
    }, { quoted: msg });
  }
}

// ── Sticker → Image ──────────────────────────────────────────────────────────
export async function handleStickerToImage(sock: WASocket, msg: WAMessage): Promise<void> {
  const stickerMsg =
    msg.message?.stickerMessage ??
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;

  if (!stickerMsg) {
    await sock.sendMessage(jid(msg), {
      text: "📎 Reply to a *sticker* with *.toimg* to convert it to an image.",
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid(msg), { text: "⏳ Converting sticker to image..." }, { quoted: msg });

  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    const png = await sharp(buffer as Buffer).png().toBuffer();
    await sock.sendMessage(jid(msg), { image: png, caption: "🖼️ Here's your image!" }, { quoted: msg });
  } catch {
    await sock.sendMessage(jid(msg), { text: "❌ Failed to convert sticker." }, { quoted: msg });
  }
}

// ── Joke ──────────────────────────────────────────────────────────────────────
export async function handleJoke(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get(
      "https://v2.jokeapi.dev/joke/Any?safe-mode&blacklistFlags=racist,sexist",
      { timeout: 6000 }
    );
    const d = res.data;
    const text = d.type === "single"
      ? `😂 *Joke*\n\n${d.joke}`
      : `😂 *Joke*\n\n${d.setup}\n\n||${d.delivery}||`;
    await sock.sendMessage(jid(msg), { text }, { quoted: msg });
  } catch {
    const jokes = [
      "Why don't scientists trust atoms?\nBecause they make up everything! 😄",
      "I told my wife she was drawing her eyebrows too high.\nShe looked surprised. 😮",
      "Why can't you give Elsa a balloon?\nShe'll let it go. ❄️",
      "What do you call fake spaghetti?\nAn im-pasta! 🍝",
      "Why did the scarecrow win an award?\nHe was outstanding in his field! 🌾",
    ];
    await sock.sendMessage(jid(msg), {
      text: `😂 *Joke*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}`,
    }, { quoted: msg });
  }
}

// ── Magic 8-Ball ──────────────────────────────────────────────────────────────
export async function handle8Ball(sock: WASocket, msg: WAMessage, question: string): Promise<void> {
  const answers = [
    "🟢 It is certain!",       "🟢 Without a doubt!",
    "🟢 Yes, definitely!",     "🟢 You may rely on it.",
    "🟢 As I see it, yes.",    "🟢 Signs point to yes.",
    "🟡 Reply hazy, try again.", "🟡 Ask again later.",
    "🟡 Better not tell you now.", "🟡 Cannot predict now.",
    "🔴 Don't count on it.",   "🔴 My reply is no.",
    "🔴 My sources say no.",   "🔴 Very doubtful.",
    "🔴 Outlook not so good.",
  ];
  const answer = answers[Math.floor(Math.random() * answers.length)];
  await sock.sendMessage(jid(msg), {
    text: `🎱 *Magic 8-Ball*\n\n❓ _${question || "Your question..."}_\n\n${answer}`,
  }, { quoted: msg });
}

// ── Ship ─────────────────────────────────────────────────────────────────────
export async function handleShip(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const parts = args.split("|").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    await sock.sendMessage(jid(msg), {
      text: "💘 Usage: *.ship Name1 | Name2*",
    }, { quoted: msg });
    return;
  }
  const [a, b] = parts;
  const percent = Math.floor(Math.random() * 101);
  const bar = "█".repeat(Math.floor(percent / 10)) + "░".repeat(10 - Math.floor(percent / 10));
  const emoji = percent >= 80 ? "💞" : percent >= 50 ? "💕" : percent >= 30 ? "💔" : "😐";
  await sock.sendMessage(jid(msg), {
    text: `💘 *Shipping*\n\n👤 ${a}\n💝 x\n👤 ${b}\n\n${emoji} *${percent}% Compatible!*\n[${bar}]`,
  }, { quoted: msg });
}

// ── Mock text ─────────────────────────────────────────────────────────────────
export async function handleMock(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.mock <text>*" }, { quoted: msg });
    return;
  }
  const mocked = text.split("").map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase())).join("");
  await sock.sendMessage(jid(msg), { text: `🐸 ${mocked}` }, { quoted: msg });
}

// ── Reverse text ─────────────────────────────────────────────────────────────
export async function handleReverse(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.reverse <text>*" }, { quoted: msg });
    return;
  }
  const reversed = text.split("").reverse().join("");
  await sock.sendMessage(jid(msg), { text: `🔄 ${reversed}` }, { quoted: msg });
}

// ── Vaporwave text ────────────────────────────────────────────────────────────
export async function handleVapor(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.vapor <text>*" }, { quoted: msg });
    return;
  }
  const full = text.split("").map(c => {
    const code = c.charCodeAt(0);
    if (code >= 33 && code <= 126) return String.fromCharCode(code + 65248);
    if (c === " ") return "　";
    return c;
  }).join("");
  await sock.sendMessage(jid(msg), { text: `🌊 ${full}` }, { quoted: msg });
}

// ── Emojify ───────────────────────────────────────────────────────────────────
export async function handleEmojify(sock: WASocket, msg: WAMessage, text: string): Promise<void> {
  if (!text) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.emojify <text>*" }, { quoted: msg });
    return;
  }
  const emojis = ["🔥", "💯", "✨", "🌟", "💪", "😍", "🚀", "🎉", "👑", "💥"];
  const words = text.split(" ").map(w => {
    const e = emojis[Math.floor(Math.random() * emojis.length)];
    return `${e} ${w}`;
  });
  await sock.sendMessage(jid(msg), { text: words.join(" ") + " 🔥" }, { quoted: msg });
}

// ── Coin flip ────────────────────────────────────────────────────────────────
export async function handleCoinFlip(sock: WASocket, msg: WAMessage): Promise<void> {
  const result = Math.random() < 0.5 ? "🪙 *HEADS!*" : "🪙 *TAILS!*";
  await sock.sendMessage(jid(msg), { text: `Flipping a coin...\n\n${result}` }, { quoted: msg });
}

// ── Dice roll ────────────────────────────────────────────────────────────────
export async function handleDice(sock: WASocket, msg: WAMessage, sides: string): Promise<void> {
  const max = parseInt(sides) || 6;
  const n = Math.floor(Math.random() * max) + 1;
  const faces: Record<number, string> = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };
  const icon = max === 6 ? (faces[n] ?? n) : `[${n}]`;
  await sock.sendMessage(jid(msg), { text: `🎲 You rolled a D${max}...\n\n${icon} *${n}!*` }, { quoted: msg });
}

// ── Rate ─────────────────────────────────────────────────────────────────────
export async function handleRate(sock: WASocket, msg: WAMessage, thing: string): Promise<void> {
  if (!thing) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.rate <something>*" }, { quoted: msg });
    return;
  }
  const rating = Math.floor(Math.random() * 11);
  const stars = "⭐".repeat(rating) + "☆".repeat(10 - rating);
  const comment =
    rating >= 9 ? "Absolutely amazing! 🔥" :
    rating >= 7 ? "Pretty good! 👍" :
    rating >= 5 ? "Just okay 😐" :
    rating >= 3 ? "Could be better 😕" :
    "Not great... 💀";
  await sock.sendMessage(jid(msg), {
    text: `📊 *Rating: ${thing}*\n\n${stars}\n*${rating}/10* — ${comment}`,
  }, { quoted: msg });
}

// ── Choose ────────────────────────────────────────────────────────────────────
export async function handleChoose(sock: WASocket, msg: WAMessage, args: string): Promise<void> {
  const options = args.split("|").map(s => s.trim()).filter(Boolean);
  if (options.length < 2) {
    await sock.sendMessage(jid(msg), { text: "Usage: *.choose option1 | option2 | option3*" }, { quoted: msg });
    return;
  }
  const chosen = options[Math.floor(Math.random() * options.length)];
  await sock.sendMessage(jid(msg), {
    text: `🎯 *I choose...*\n\n*${chosen}!*`,
  }, { quoted: msg });
}

// ── Quote ─────────────────────────────────────────────────────────────────────
export async function handleQuote(sock: WASocket, msg: WAMessage): Promise<void> {
  const quotes = [
    { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
    { q: "In the middle of every difficulty lies opportunity.", a: "Albert Einstein" },
    { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
    { q: "Life is what happens when you're busy making other plans.", a: "John Lennon" },
    { q: "The future belongs to those who believe in the beauty of their dreams.", a: "Eleanor Roosevelt" },
    { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
    { q: "Don't watch the clock; do what it does. Keep going.", a: "Sam Levenson" },
    { q: "You miss 100% of the shots you don't take.", a: "Wayne Gretzky" },
    { q: "Whether you think you can or you think you can't, you're right.", a: "Henry Ford" },
    { q: "The best time to plant a tree was 20 years ago. The second best time is now.", a: "Chinese Proverb" },
    { q: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },
    { q: "It does not matter how slowly you go as long as you do not stop.", a: "Confucius" },
  ];
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  await sock.sendMessage(jid(msg), {
    text: `💬 *Quote of the Moment*\n\n_"${q.q}"_\n\n— *${q.a}*`,
  }, { quoted: msg });
}

// ── Roast ─────────────────────────────────────────────────────────────────────
export async function handleRoast(sock: WASocket, msg: WAMessage, target: string): Promise<void> {
  const roasts = [
    "You're not stupid, you just have bad luck thinking.",
    "I'd agree with you but then we'd both be wrong.",
    "You're proof that even WiFi signals can be weak.",
    "Your birth certificate is an apology from the hospital.",
    "You're the human equivalent of a participation trophy.",
    "I'd insult you, but my parents told me to be nice to people who struggle.",
    "You have your entire life to be an idiot. Why not take the day off?",
    "Calling you an idiot would be an insult to idiots.",
    "You're not the sharpest tool in the shed... but you are a tool.",
    "You're like a software update. Whenever I see you, I think 'not now'.",
  ];
  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  await sock.sendMessage(jid(msg), {
    text: `🔥 *Roast${target ? ` for ${target}` : ""}*\n\n${roast}`,
  }, { quoted: msg });
}

// ── Compliment ────────────────────────────────────────────────────────────────
export async function handleCompliment(sock: WASocket, msg: WAMessage, target: string): Promise<void> {
  const compliments = [
    "You light up every room you walk into ✨",
    "Your smile could cure world hunger 😊",
    "You make the world a better place just by existing 🌍",
    "You're literally one in a million 💫",
    "Your energy is absolutely contagious 🔥",
    "You have the heart of a champion 👑",
    "People are lucky to know you 🍀",
    "You're stronger than you think 💪",
    "You make difficult things look easy 🌟",
    "Anyone who has you in their life is incredibly blessed 🙏",
  ];
  const c = compliments[Math.floor(Math.random() * compliments.length)];
  await sock.sendMessage(jid(msg), {
    text: `💝 *Compliment${target ? ` for ${target}` : ""}*\n\n${c}`,
  }, { quoted: msg });
}

// ── Fact ─────────────────────────────────────────────────────────────────────
export async function handleFact(sock: WASocket, msg: WAMessage): Promise<void> {
  try {
    const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", { timeout: 5000 });
    await sock.sendMessage(jid(msg), {
      text: `🧠 *Random Fact*\n\n${res.data.text}`,
    }, { quoted: msg });
  } catch {
    const facts = [
      "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still good.",
      "A group of flamingos is called a 'flamboyance'.",
      "Octopuses have three hearts.",
      "Bananas are slightly radioactive.",
      "The shortest war in history lasted only 38-45 minutes (Anglo-Zanzibar War).",
    ];
    await sock.sendMessage(jid(msg), {
      text: `🧠 *Random Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}`,
    }, { quoted: msg });
  }
}
