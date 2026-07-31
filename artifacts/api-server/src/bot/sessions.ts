/**
 * Multi-session manager for Zyntrix V2.
 * Allows connecting multiple WhatsApp numbers simultaneously
 * without disconnecting the primary session.
 *
 * Primary session (the one in ./session) is still managed by index.ts.
 * This module manages ADDITIONAL sessions only.
 */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import qrcode from "qrcode-terminal";
import { logger } from "../lib/logger.js";
import { patchSockForCTA, attachBotHandlers } from "./handlers/setup.js";

export interface SessionInfo {
  id: string;
  dir: string;
  connected: boolean;
  phone: string | null;
  qr: string | null;
}

const sessions = new Map<string, {
  info: SessionInfo;
  sock: WASocket | null;
  reconnecting: boolean;
}>();

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
}

export function listSessions(): SessionInfo[] {
  return Array.from(sessions.values()).map(s => s.info);
}

export function getSessionQR(id: string): string | null {
  return sessions.get(sanitizeId(id))?.info.qr ?? null;
}

export function isSessionConnected(id: string): boolean {
  return sessions.get(sanitizeId(id))?.info.connected ?? false;
}

/**
 * Start an additional WhatsApp session.
 * Returns false if a session with that id already exists.
 */
export async function addSession(id: string): Promise<{ success: boolean; message: string }> {
  const safeId = sanitizeId(id);
  if (sessions.has(safeId)) {
    const s = sessions.get(safeId)!;
    if (s.info.connected) {
      return { success: false, message: `Session "${safeId}" is already connected (${s.info.phone ?? "unknown"}).` };
    }
    return { success: false, message: `Session "${safeId}" already exists. Remove it first or wait for it to connect.` };
  }

  const dir = `./session_${safeId}`;
  const sessionEntry = {
    info: { id: safeId, dir, connected: false, phone: null, qr: null } as SessionInfo,
    sock: null as WASocket | null,
    reconnecting: false,
  };
  sessions.set(safeId, sessionEntry);

  // Start connection in background
  startSessionConnection(safeId, dir).catch(err => {
    logger.error({ err, safeId }, "[Sessions] Failed to start additional session");
  });

  return { success: true, message: `Session "${safeId}" started. Scan the QR at /api/sessions/${safeId}/qr or watch the server logs.` };
}

export async function removeSession(id: string): Promise<{ success: boolean; message: string }> {
  const safeId = sanitizeId(id);
  const entry = sessions.get(safeId);
  if (!entry) {
    return { success: false, message: `Session "${safeId}" not found.` };
  }

  try {
    entry.sock?.end(undefined);
  } catch {}

  sessions.delete(safeId);

  // Optionally delete session files
  const dir = entry.info.dir;
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { success: true, message: `Session "${safeId}" removed and disconnected.` };
}

async function startSessionConnection(safeId: string, dir: string): Promise<void> {
  const entry = sessions.get(safeId);
  if (!entry) return;

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version: [number, number, number];
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch {
    version = [2, 3000, 1015901307];
  }

  const rawSock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    printQRInTerminal: false,
    logger: logger as any,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 20000,
    retryRequestDelayMs: 500,
  });

  const sock = patchSockForCTA(rawSock);
  entry.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const e = sessions.get(safeId);
    if (!e) return;

    if (qr) {
      e.info.qr = qr;
      logger.info({ safeId }, `[Sessions] QR for session "${safeId}"`);
      qrcode.generate(qr, { small: true });
      console.log(`\n📱 [Session: ${safeId}] Scan QR or open /api/sessions/${safeId}/qr\n`);
    }

    if (connection === "close") {
      e.info.connected = false;
      e.info.phone = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      logger.info({ safeId, statusCode, loggedOut }, "[Sessions] Additional session disconnected");

      if (loggedOut) {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
        sessions.delete(safeId);
      } else {
        if (!e.reconnecting) {
          e.reconnecting = true;
          setTimeout(async () => {
            if (!sessions.has(safeId)) return;
            e.reconnecting = false;
            await startSessionConnection(safeId, dir);
          }, 4000);
        }
      }
    } else if (connection === "open") {
      e.info.connected = true;
      e.info.qr = null;
      e.info.phone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      console.log(`\n✅ [Session: ${safeId}] Connected! Phone: ${e.info.phone ?? "unknown"}\n`);
    }
  });

  // Attach the same bot command handlers to the additional session
  attachBotHandlers(sock);
}
