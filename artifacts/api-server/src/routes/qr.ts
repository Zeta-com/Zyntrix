import { Router, type IRouter } from "express";
import { getQR, getIsConnected } from "../bot/qrstore.js";

const router: IRouter = Router();

router.get("/qr", async (_req, res) => {
  const qr = getQR();
  const connected = getIsConnected();

  if (connected) {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsBot - Connected</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #111; color: #fff; text-align: center; }
    .icon { font-size: 80px; margin-bottom: 20px; }
    h1 { color: #25D366; font-size: 28px; margin-bottom: 10px; }
    p { color: #aaa; font-size: 16px; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h1>Bot is Connected!</h1>
  <p>Your WhatsApp bot is online and ready to use.</p>
  <p style="margin-top:20px; color:#666;">Type <strong>.menu</strong> in WhatsApp to see all commands.</p>
</body>
</html>`);
    return;
  }

  if (!qr) {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsBot - Waiting</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #111; color: #fff; text-align: center; }
    .spinner { width: 60px; height: 60px; border: 5px solid #333; border-top-color: #25D366; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 30px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { color: #25D366; font-size: 24px; margin-bottom: 10px; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h1>Starting bot...</h1>
  <p>QR code is being generated. This page will refresh automatically.</p>
</body>
</html>`);
    return;
  }

  let qrDataUrl = "";
  try {
    const QRCode = (await import("qrcode")).default;
    qrDataUrl = await QRCode.toDataURL(qr, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    res.send("Error generating QR code image.");
    return;
  }

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsBot - Scan QR</title>
  <meta http-equiv="refresh" content="20">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #111; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1a1a1a; border-radius: 20px; padding: 30px 24px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .logo { font-size: 48px; margin-bottom: 12px; }
    h1 { color: #25D366; font-size: 22px; margin-bottom: 6px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; line-height: 1.4; }
    .qr-wrap { background: #fff; border-radius: 12px; padding: 12px; display: inline-block; margin-bottom: 24px; }
    .qr-wrap img { display: block; width: 280px; height: 280px; }
    .steps { text-align: left; background: #222; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; font-size: 14px; color: #ccc; line-height: 1.4; }
    .step:last-child { margin-bottom: 0; }
    .num { background: #25D366; color: #000; font-weight: bold; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; margin-top: 1px; }
    .refresh-note { color: #555; font-size: 12px; }
    .dot { display: inline-block; width: 8px; height: 8px; background: #25D366; border-radius: 50%; animation: pulse 1.5s ease-in-out infinite; margin-right: 6px; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🤖</div>
    <h1>Connect WhatsBot</h1>
    <p class="subtitle">Scan this QR code with WhatsApp to connect your bot</p>
    
    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
    </div>

    <div class="steps">
      <div class="step"><div class="num">1</div><span>Open <strong>WhatsApp</strong> on your phone</span></div>
      <div class="step"><div class="num">2</div><span>Tap <strong>⋮ Menu</strong> (3 dots) → <strong>Linked Devices</strong></span></div>
      <div class="step"><div class="num">3</div><span>Tap <strong>Link a Device</strong> and scan this code</span></div>
    </div>

    <p class="refresh-note"><span class="dot"></span>Page refreshes every 20 seconds — QR expires quickly, refresh if needed</p>
  </div>
</body>
</html>`);
});

export default router;
