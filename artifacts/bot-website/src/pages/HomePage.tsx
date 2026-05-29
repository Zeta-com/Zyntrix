import QRLinkSection from "@/components/QRLinkSection";

const FEATURES = [
  {
    icon: "🗑️",
    title: "AntiDelete Spy",
    desc: "Captures deleted messages before they vanish. Forwards to owner with sender info, group name, and timestamp.",
  },
  {
    icon: "👁️",
    title: "View-Once Reveal",
    desc: "Auto-captures view-once photos and videos. Use .vv to reveal in chat or .vv2 to send directly to your DM.",
  },
  {
    icon: "🤖",
    title: "AI Chatbot",
    desc: "Powered by Meta AI for smart conversational replies. Enable per-chat with .chatbot on for auto-responses.",
  },
  {
    icon: "🎮",
    title: "Games & Fun",
    desc: "Trivia, Truth or Dare, Rock Paper Scissors, Math challenges, 8-Ball, Slots, and 30+ more fun commands.",
  },
  {
    icon: "🛡️",
    title: "Group Manager",
    desc: "Tag all members, kick, promote, mute, get invite links, join/leave groups, and full group metadata.",
  },
  {
    icon: "🔧",
    title: "100+ Commands",
    desc: "Wikipedia, weather, translation, movies, YouTube/TikTok/Instagram downloader, QR gen, crypto, and more.",
  },
];

const COMMAND_CATEGORIES = [
  {
    name: "🛡️ Privacy",
    cmds: [".antidelete on/off", ".vv", ".vv2", ".chatbot on/off"],
  },
  {
    name: "👥 Groups",
    cmds: [".tagall", ".kick", ".promote", ".mute", ".groupinvite", ".joingroup", ".leavegroup", ".groupmeta"],
  },
  {
    name: "🤖 AI",
    cmds: [".ai [question]", ".gpt [question]", ".img [prompt]", ".anime [name]", ".animage [prompt]"],
  },
  {
    name: "🎬 Downloaders",
    cmds: [".ytmp3 [url]", ".ytmp4 [url]", ".ttdl [tiktok]", ".igdl [instagram]"],
  },
  {
    name: "🔧 Tools",
    cmds: [".wiki [topic]", ".weather [city]", ".translate [lang] [text]", ".qr [text]", ".calc [expr]", ".screenshot [url]"],
  },
  {
    name: "🎲 Games",
    cmds: [".trivia", ".math", ".rps rock/paper/scissors", ".truth", ".dare", ".8ball [q]"],
  },
];

const STATS = [
  { value: "100+", label: "Commands" },
  { value: "6+", label: "Categories" },
  { value: "24/7", label: "Online" },
  { value: "Free", label: "Always" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg green-bg flex items-center justify-center text-white font-bold text-sm">
              W
            </div>
            <span className="font-bold text-foreground">WhatsBot</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#commands" className="hover:text-foreground transition-colors">Commands</a>
            <a href="#link" className="hover:text-foreground transition-colors">Link Bot</a>
          </div>
          <a
            href="https://whatsapp.com/channel/120363424876568536"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-1.5 rounded-full green-bg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <span>📢</span> Channel
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-gradient pt-20 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-sm text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            Powered by Baileys v7
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-foreground leading-tight">
            Your Ultimate
            <span className="green-text block">WhatsApp Bot</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl">
            100+ commands, AI chat, antidelete spy, view-once reveal, group management,
            games, downloaders — all in one powerful bot.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-2 w-full max-w-md">
            {STATS.map(s => (
              <div key={s.label} className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-bold green-text count-in">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 justify-center mt-2">
            <a href="#link">
              <button className="px-6 py-3 rounded-xl green-bg text-white font-semibold hover:opacity-90 transition-all shadow-lg shadow-green-500/20">
                🔗 Link Your Bot
              </button>
            </a>
            <a href="#commands">
              <button className="px-6 py-3 rounded-xl bg-card border border-border/50 text-foreground font-semibold hover:border-primary/40 transition-all">
                📋 View Commands
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Everything You Need</h2>
            <p className="text-muted-foreground mt-2">Packed with powerful features for personal and group use</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="p-6 rounded-2xl bg-card border border-border/50 card-glow transition-all cursor-default"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-2xl mb-4">
                  {f.icon}
                </div>
                <h3 className="font-bold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commands */}
      <section id="commands" className="py-16 px-4 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Commands Overview</h2>
            <p className="text-muted-foreground mt-2">Use <code className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-sm">.menu</code> in WhatsApp to see all commands</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {COMMAND_CATEGORIES.map(cat => (
              <div key={cat.name} className="p-5 rounded-2xl bg-card border border-border/50 card-glow">
                <h3 className="font-semibold text-foreground mb-3">{cat.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {cat.cmds.map(cmd => (
                    <code
                      key={cmd}
                      className="px-2 py-1 rounded-md bg-green-500/8 border border-green-500/15 text-green-400 text-xs"
                    >
                      {cmd}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bot Link */}
      <section id="link" className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground">Link Your Bot</h2>
            <p className="text-muted-foreground mt-2">
              Scan the QR code or use phone number pairing to connect your WhatsApp bot
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Instructions */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-card border border-border/50">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full green-bg text-white text-xs flex items-center justify-center font-bold">1</span>
                  Start the Bot Server
                </h3>
                <p className="text-sm text-muted-foreground">
                  Deploy on Render or run locally with <code className="text-green-400">pnpm --filter @workspace/api-server run dev</code>. The QR code will appear here automatically.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-card border border-border/50">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full green-bg text-white text-xs flex items-center justify-center font-bold">2</span>
                  Scan or Enter Code
                </h3>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">QR:</strong> Open WhatsApp → Settings → Linked Devices → Link a Device → scan QR<br />
                  <strong className="text-foreground mt-1 block">Phone:</strong> Switch to phone tab → enter number → enter 8-char code in WhatsApp
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-card border border-border/50">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full green-bg text-white text-xs flex items-center justify-center font-bold">3</span>
                  Set Owner
                </h3>
                <p className="text-sm text-muted-foreground">
                  Set <code className="text-green-400">OWNER_NUMBER</code> env variable to your WhatsApp number (digits only) to enable owner-only commands.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/20">
                <p className="text-sm text-green-400/90">
                  💡 <strong>Tip:</strong> After linking, send <code>.alive</code> to verify the bot is online and responding.
                </p>
              </div>
            </div>

            {/* QR/Pairing Widget */}
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-xl shadow-black/20">
              <QRLinkSection />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded green-bg flex items-center justify-center text-white text-xs font-bold">W</div>
            <span>WhatsBot — Built with Baileys v7</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://whatsapp.com/channel/120363424876568536"
              target="_blank"
              rel="noreferrer"
              className="hover:text-green-400 transition-colors"
            >
              📢 WhatsApp Channel
            </a>
            <a
              href="https://github.com/Zeta-com/Zeta-AI-"
              target="_blank"
              rel="noreferrer"
              className="hover:text-green-400 transition-colors"
            >
              GitHub
            </a>
          </div>
          <span>© {new Date().getFullYear()} WhatsBot. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
