import type { Response } from "express";
import type { WASocket } from "@whiskeysockets/baileys";

let currentQR: string | null = null;
let isConnected = false;
let activeSock: WASocket | null = null;
const sseClients = new Set<Response>();

export function setQR(qr: string) {
  currentQR = qr;
  isConnected = false;
  broadcast({ type: "qr", qr });
}

export function setConnected() {
  currentQR = null;
  isConnected = true;
  broadcast({ type: "connected" });
}

export function setDisconnected() {
  isConnected = false;
  broadcast({ type: "disconnected" });
}

export function getQR()          { return currentQR; }
export function getIsConnected() { return isConnected; }
export function setSock(s: WASocket | null) { activeSock = s; }
export function getSock() { return activeSock; }

export function addSSEClient(res: Response) {
  sseClients.add(res);
  // send current state immediately
  if (isConnected) {
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  } else if (currentQR) {
    res.write(`data: ${JSON.stringify({ type: "qr", qr: currentQR })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: "waiting" })}\n\n`);
  }
}

export function removeSSEClient(res: Response) {
  sseClients.delete(res);
}

function broadcast(payload: object) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}
