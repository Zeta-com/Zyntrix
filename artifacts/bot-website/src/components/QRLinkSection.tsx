import { useState, useEffect, useRef } from "react";

type BotStatus = "loading" | "waiting" | "qr" | "connected";

const API = "/api";

export default function QRLinkSection() {
  const [tab, setTab]         = useState<"qr" | "phone">("qr");
  const [status, setStatus]   = useState<BotStatus>("loading");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [phone, setPhone]     = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const evtRef = useRef<EventSource | null>(null);

  const fetchQR = async () => {
    try {
      const r = await fetch(`${API}/link/qr`);
      const d = await r.json() as { status: string; dataUrl?: string };
      if (d.status === "qr" && d.dataUrl) setQrImage(d.dataUrl);
      else if (d.status === "connected") setStatus("connected");
    } catch {}
  };

  useEffect(() => {
    const es = new EventSource(`${API}/link/qr-events`);
    evtRef.current = es;

    es.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; qr?: string };
        if (data.type === "qr") {
          setStatus("qr");
          await fetchQR();
        } else if (data.type === "connected") {
          setStatus("connected");
          setQrImage(null);
        } else if (data.type === "waiting") {
          setStatus("waiting");
        }
      } catch {}
    };

    es.onerror = () => {
      setStatus("waiting");
    };

    // Initial fetch
    fetchQR().then(() => {
      fetch(`${API}/link/status`)
        .then(r => r.json())
        .then((d: any) => {
          if (d.connected) setStatus("connected");
          else if (d.hasQR) setStatus("qr");
          else setStatus("waiting");
        })
        .catch(() => setStatus("waiting"));
    });

    return () => { es.close(); };
  }, []);

  const handlePair = async () => {
    setPairError(null);
    setPairCode(null);
    setPairing(true);
    try {
      const r = await fetch(`${API}/link/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/[^0-9]/g, "") }),
      });
      const d = await r.json() as { code?: string; error?: string };
      if (!r.ok) { setPairError(d.error ?? "Failed to get pairing code"); }
      else { setPairCode(d.code ?? null); }
    } catch {
      setPairError("Network error. Is the bot running?");
    } finally { setPairing(false); }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 bg-card/60 rounded-xl p-1 mb-6 border border-border/50">
        {(["qr", "phone"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t
                ? "green-bg text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "qr" ? "📱 QR Code" : "🔢 Phone Number"}
          </button>
        ))}
      </div>

      {/* QR Tab */}
      {tab === "qr" && (
        <div className="flex flex-col items-center gap-4">
          {status === "connected" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-20 h-20 rounded-full green-bg flex items-center justify-center text-4xl glow-box">
                ✅
              </div>
              <p className="text-xl font-bold green-text">Bot Connected!</p>
              <p className="text-muted-foreground text-sm text-center">
                Your WhatsApp bot is online and ready to use.
              </p>
            </div>
          ) : status === "qr" && qrImage ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative p-3 bg-white rounded-2xl shadow-xl glow-box">
                <div className="relative overflow-hidden rounded-lg">
                  <img src={qrImage} alt="WhatsApp QR Code" className="w-64 h-64 block" />
                  <div className="scan-line" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Open WhatsApp → Settings → Linked Devices → Link a Device
              </p>
              <p className="text-xs text-muted-foreground/60">QR refreshes automatically every 60s</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-64 h-64 rounded-2xl bg-card/80 border border-border/50 flex flex-col items-center justify-center gap-3 qr-loading">
                <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {status === "loading" ? "Connecting to bot..." : "Waiting for QR code..."}
                </p>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Make sure the API server is running
              </p>
            </div>
          )}
        </div>
      )}

      {/* Phone Tab */}
      {tab === "phone" && (
        <div className="flex flex-col gap-4">
          {status === "connected" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-20 h-20 rounded-full green-bg flex items-center justify-center text-4xl glow-box">
                ✅
              </div>
              <p className="text-xl font-bold green-text">Bot Connected!</p>
              <p className="text-muted-foreground text-sm text-center">
                Your WhatsApp bot is online and ready to use.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-card/60 border border-border/50 rounded-xl p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Enter your WhatsApp number with country code</li>
                  <li>Copy the 8-character code shown below</li>
                  <li>In WhatsApp: Settings → Linked Devices → Link with phone number</li>
                  <li>Enter the code to link your bot</li>
                </ol>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Phone Number (with country code)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 2348012345678"
                  className="w-full px-4 py-3 rounded-xl bg-card/80 border border-border/50 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
              </div>

              <button
                onClick={handlePair}
                disabled={pairing || !phone.trim()}
                className="w-full py-3 rounded-xl green-bg text-white font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {pairing ? "Generating code..." : "Get Pairing Code"}
              </button>

              {pairCode && (
                <div className="mt-2 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-2">Your pairing code:</p>
                  <p className="text-3xl font-mono font-bold tracking-widest green-text">
                    {pairCode}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Enter this in WhatsApp → Linked Devices → Link with phone number
                  </p>
                </div>
              )}

              {pairError && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                  {pairError}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
