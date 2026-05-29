import { Router, type IRouter, type Request, type Response } from "express";
import { getQR, getIsConnected, addSSEClient, removeSSEClient, getSock } from "../bot/qrstore.js";

const router: IRouter = Router();

// ── Status ─────────────────────────────────────────────────────────────────────
router.get("/link/status", (_req: Request, res: Response) => {
  res.json({
    connected: getIsConnected(),
    hasQR: !!getQR(),
  });
});

// ── Real-time QR via SSE ────────────────────────────────────────────────────────
router.get("/link/qr-events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 25000);

  addSSEClient(res);

  req.on("close", () => {
    clearInterval(ping);
    removeSSEClient(res);
  });
});

// ── QR as base64 data URL ───────────────────────────────────────────────────────
router.get("/link/qr", async (_req: Request, res: Response) => {
  const qr = getQR();
  if (getIsConnected()) { res.json({ status: "connected" }); return; }
  if (!qr)             { res.json({ status: "waiting" });   return; }
  try {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
    res.json({ status: "qr", dataUrl });
  } catch {
    res.status(500).json({ error: "QR generation failed" });
  }
});

// ── Phone number pairing ────────────────────────────────────────────────────────
router.post("/link/pair", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  const clean = phone.replace(/[^0-9]/g, "");
  if (clean.length < 7) {
    res.status(400).json({ error: "Invalid phone number. Include country code (e.g. 12345678901)" });
    return;
  }
  if (getIsConnected()) {
    res.status(409).json({ error: "Bot is already connected" });
    return;
  }
  const sock = getSock();
  if (!sock) {
    res.status(503).json({ error: "Bot is not ready yet. Wait for QR code to appear first." });
    return;
  }
  try {
    const code = await (sock as any).requestPairingCode(clean);
    res.json({ code: code as string, phone: clean });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to generate pairing code" });
  }
});

export default router;
