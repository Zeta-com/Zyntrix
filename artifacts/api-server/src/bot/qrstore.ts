let currentQR: string | null = null;
let isConnected = false;

export function setQR(qr: string) {
  currentQR = qr;
  isConnected = false;
}

export function setConnected() {
  currentQR = null;
  isConnected = true;
}

export function getQR() {
  return currentQR;
}

export function getIsConnected() {
  return isConnected;
}
