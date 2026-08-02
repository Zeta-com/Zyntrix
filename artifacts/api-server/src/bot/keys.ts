/**
 * Zyntrix Auth Key Management
 * - 200 pre-generated valid keys (all contain "zynt")
 * - Per-Telegram-user verification stored to disk
 * - WhatsApp .keys / .revoke / .revokeall commands
 */
import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const VERIFIED_FILE = path.join(DATA_DIR, "verified_users.json");

// ── 200 pre-generated valid keys ─────────────────────────────────────────────
const INITIAL_KEYS: string[] = [
  "ZYNT-UC7B-64E5-AGD8","ZYNT-JHEG-FWXK-GF5K","ZYNT-W238-7L5W-UJQ5","ZYNT-LD65-BJYV-UARJ",
  "ZYNT-FA58-6FBB-4DUU","ZYNT-JGGD-N8RR-5PE7","ZYNT-7EUV-FBD4-JN8V","ZYNT-SABM-YAQB-Z8LH",
  "ZYNT-797W-FVSZ-S9AC","ZYNT-TJZW-L94C-LJLK","ZYNT-AHRD-HDQX-VGMY","ZYNT-QX3B-EBGX-2W8T",
  "ZYNT-35GB-XVKY-U42T","ZYNT-B2HP-3UYJ-C49S","ZYNT-2G7B-98W3-9L9A","ZYNT-CVRR-ZJRP-RYBZ",
  "ZYNT-ENHY-Z74H-PX4K","ZYNT-X5CF-VWUJ-AE8Q","ZYNT-7PKY-8MG8-W5HM","ZYNT-KU8L-AJR5-URRK",
  "ZYNT-9XS5-U3AN-G3BF","ZYNT-3WDA-9J8K-33W5","ZYNT-5D6E-4MGB-Q42X","ZYNT-4DVH-C6GK-JUME",
  "ZYNT-DJ6E-52LU-Q5J2","ZYNT-5YKS-YWP7-WM6L","ZYNT-BSCN-L6RY-EZST","ZYNT-NDT4-KEK5-J7S9",
  "ZYNT-SNX7-3VKY-VN6W","ZYNT-SWWR-RGXC-6YUU","ZYNT-JBTY-P7VF-U2WH","ZYNT-QZQZ-RV8F-GEZH",
  "ZYNT-Z8P9-XG2D-DBQZ","ZYNT-NYPP-4RAD-GKJT","ZYNT-MZR3-5NY5-7DZX","ZYNT-JAS3-MA73-V2EE",
  "ZYNT-A2RB-58QE-3644","ZYNT-9645-RWSM-Q72K","ZYNT-J8TH-SDYA-9VBW","ZYNT-SXWY-JBTD-PAS9",
  "ZYNT-ZZ8F-M9KT-LAEX","ZYNT-H588-XUGL-6U3L","ZYNT-N3RJ-CN95-RX6J","ZYNT-JK73-N9X5-X5C7",
  "ZYNT-5RLB-2RHR-85KH","ZYNT-PH7J-YMP5-55G5","ZYNT-X87X-8R3T-RZ4F","ZYNT-TYZ3-LUQD-ZQR8",
  "ZYNT-ED5E-4JC8-4TQB","ZYNT-UH8H-XCTC-QHXS","ZYNT-29GY-BCRP-6XJZ","ZYNT-WKM2-GQ68-2GTU",
  "ZYNT-5MDL-T8TH-VWBL","ZYNT-TBFE-L2E5-GKN2","ZYNT-6SKL-KZCL-MZ4T","ZYNT-S2H4-U46C-4EM5",
  "ZYNT-FALB-BS3L-QE5J","ZYNT-J5P6-PD9P-BSD2","ZYNT-7Z63-ZFVC-HK29","ZYNT-4GJD-X5U4-WMJY",
  "ZYNT-26NL-7X6S-PGB2","ZYNT-X85R-N75E-ZVBD","ZYNT-YCGW-RHEM-GFM4","ZYNT-MH4J-BFS7-7BRT",
  "ZYNT-C4TF-3HG9-AVMD","ZYNT-XF47-ZG7L-NJ5M","ZYNT-CNZT-6UWN-D4XP","ZYNT-544Z-46Y8-SG4L",
  "ZYNT-BPWQ-UXW3-7X2L","ZYNT-WZJK-A5H5-JN4F","ZYNT-6TZZ-PQTX-U4ZQ","ZYNT-BGJR-6VAX-DAU3",
  "ZYNT-HPHL-VJUZ-VZER","ZYNT-LY79-8GB3-BRCJ","ZYNT-MUFV-HT9G-K7K4","ZYNT-BERH-TEYP-FNVP",
  "ZYNT-QV2A-9V8M-WWS5","ZYNT-W5FE-DS5P-RGFX","ZYNT-LQB3-N7M8-RPQJ","ZYNT-G8XK-6AH9-ZBXG",
  "ZYNT-T4BV-WMQJ-RRLM","ZYNT-6UHS-BDKF-NKGQ","ZYNT-BMDE-JZW8-3RK2","ZYNT-XUQ3-QG7H-JDNQ",
  "ZYNT-YCGH-4YBP-ZWJD","ZYNT-DUCE-HGNS-U4D9","ZYNT-YR8N-STA2-RLZ9","ZYNT-3Y28-SDSQ-6DJX",
  "ZYNT-KNMV-K6X6-X24M","ZYNT-VA7W-H654-ZNZA","ZYNT-FMLA-56AE-HVPA","ZYNT-6LND-NTQ5-XXZ3",
  "ZYNT-Z372-36KL-AXFX","ZYNT-KHGR-N8X2-SKD4","ZYNT-XCMS-LHPC-KCCQ","ZYNT-CPVH-CVA7-S8JK",
  "ZYNT-4MCS-WYLX-STR4","ZYNT-ELTG-E33U-YA5P","ZYNT-QTYS-QP84-BEEE","ZYNT-XTXG-YBSV-VF3G",
  "ZYNT-JLZ5-VC5B-U5KX","ZYNT-J3TS-SPZT-W8R3","ZYNT-BD3F-8V5W-7JZN","ZYNT-KAXJ-4B7B-DGXL",
  "ZYNT-BSJ4-HFU7-VLWU","ZYNT-RT43-HCPQ-77E9","ZYNT-S9CX-9LTA-YF44","ZYNT-JLUS-APMY-LA56",
  "ZYNT-CART-YTNG-FTBS","ZYNT-XQ3V-8QAB-X9TG","ZYNT-QB65-2GUV-MHGM","ZYNT-Q6PJ-WQHK-ZGB7",
  "ZYNT-39PB-NG9W-U8ZP","ZYNT-TZFD-ZMJ2-ANGR","ZYNT-BY7P-NWWF-MHYS","ZYNT-TS2J-X72P-WZBN",
  "ZYNT-9RB8-F4SZ-E5Y4","ZYNT-8EUV-J9NF-AXLU","ZYNT-Q3NJ-SUDB-8RDT","ZYNT-6A7R-KELK-N8E5",
  "ZYNT-4ZX8-9VXA-WRMB","ZYNT-3H9V-FG47-JF5A","ZYNT-UVSN-ZBLF-C9NY","ZYNT-FPCH-XAAP-UQZ3",
  "ZYNT-F3G4-DJ73-LKXY","ZYNT-ZXXE-SYSZ-WAUS","ZYNT-NVKU-GSKW-7SYY","ZYNT-9THZ-W6GE-KSRJ",
  "ZYNT-7FAJ-JV2V-K2HR","ZYNT-GV2Y-7LM5-Y654","ZYNT-F5NN-VDLH-GRFS","ZYNT-LSSY-YRX3-UKED",
  "ZYNT-PW9B-A928-7VHZ","ZYNT-6AH4-8N3U-D6NE","ZYNT-TQZJ-RBFS-FWZW","ZYNT-FN9B-R8E3-SHWP",
  "ZYNT-977J-PNR8-EB4U","ZYNT-44YY-Y5EL-GL5S","ZYNT-ED4V-NVHH-8EEH","ZYNT-9TSS-KG6E-AYV5",
  "ZYNT-EYAR-FLEF-KD62","ZYNT-6232-CEPN-HKVW","ZYNT-W4ZN-PY5Z-8TXD","ZYNT-JXBW-URJD-EYFJ",
  "ZYNT-UEJY-L5HD-NP5V","ZYNT-HRZL-NBX9-R3FY","ZYNT-HDKC-WLSU-LW29","ZYNT-JXBD-MHZM-TKNB",
  "ZYNT-MTBF-DQ3L-Q9GE","ZYNT-TN3R-6NMU-JHLX","ZYNT-NFJD-33HR-Y2SG","ZYNT-JGHJ-RJN9-J9R8",
  "ZYNT-N43H-A6F8-XHSQ","ZYNT-X7JQ-RRYU-SC7Q","ZYNT-K9BF-Q3P8-EZZ3","ZYNT-425B-MZP2-R3K3",
  "ZYNT-65NS-QDYN-MHFU","ZYNT-KFD9-DE7C-BNTP","ZYNT-DGY6-BANK-2D6S","ZYNT-UC6G-REV2-PFSZ",
  "ZYNT-8SJQ-DEPN-BRR8","ZYNT-3UZF-RKJA-M34F","ZYNT-XMSH-VMDG-6AY9","ZYNT-WAYP-VZWW-7M9J",
  "ZYNT-9SLA-QH9Y-KLB4","ZYNT-9G4U-L25D-5TXP","ZYNT-PJBG-28V8-MXAZ","ZYNT-NX3S-9BYP-NCE2",
  "ZYNT-HEX6-YYLG-4BYZ","ZYNT-T2C4-S4DR-Y8KM","ZYNT-L9YP-DEY4-THC3","ZYNT-882N-ZA2Z-TRR3",
  "ZYNT-RDNH-L4H8-R3MP","ZYNT-33G7-VQ96-BSFB","ZYNT-HQ2B-EHXT-39JZ","ZYNT-K85F-KYSD-J3TF",
  "ZYNT-PDL8-B746-9ETE","ZYNT-RYL5-BD82-EQRA","ZYNT-YKV9-XG7K-TU3M","ZYNT-8ECW-NBN8-HMK5",
  "ZYNT-W2DW-JDAV-6N3N","ZYNT-37LZ-UN5Z-7CGV","ZYNT-LHK6-EL3B-5ZH8","ZYNT-QR28-B87W-TAUV",
  "ZYNT-WYAE-LWCS-DGXW","ZYNT-87MB-2ZUT-ULKG","ZYNT-MUH8-UY3K-JD9T","ZYNT-E5CM-REG3-26SH",
  "ZYNT-8XDC-8FY7-ZSVX","ZYNT-7QV3-TZ49-DWSH","ZYNT-TTCR-9SN7-ZZ3C","ZYNT-L3XW-B3H5-J7L7",
  "ZYNT-UEFC-99KY-64ZN","ZYNT-YFU8-CYNZ-ESH4","ZYNT-3DZX-M25X-QXC2","ZYNT-QKHD-BEQB-UMQY",
  "ZYNT-MUSU-GBB2-W5M2","ZYNT-WM4M-5TTJ-5RDA","ZYNT-Z2FJ-DE9K-XEJ9","ZYNT-8LYM-DZDM-LUZN",
];

export interface KeyStore {
  valid: string[];     // keys still active
  revoked: string[];   // revoked keys
}

export interface VerifiedStore {
  // telegram chatId (as string) → key they used
  [chatId: string]: string;
}

// ── Persistence helpers ───────────────────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadKeys(): KeyStore {
  ensureDir();
  if (!fs.existsSync(KEYS_FILE)) {
    const store: KeyStore = { valid: [...INITIAL_KEYS], revoked: [] };
    fs.writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")) as KeyStore;
  } catch {
    const store: KeyStore = { valid: [...INITIAL_KEYS], revoked: [] };
    fs.writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveKeys(store: KeyStore) {
  ensureDir();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2));
}

function loadVerified(): VerifiedStore {
  ensureDir();
  if (!fs.existsSync(VERIFIED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(VERIFIED_FILE, "utf8")) as VerifiedStore;
  } catch { return {}; }
}

function saveVerified(store: VerifiedStore) {
  ensureDir();
  fs.writeFileSync(VERIFIED_FILE, JSON.stringify(store, null, 2));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Check if a key is valid (not revoked). */
export function isValidKey(key: string): boolean {
  const store = loadKeys();
  return store.valid.includes(key.trim().toUpperCase());
}

/** Check if a Telegram user has already verified with a valid key. */
export function isVerifiedUser(chatId: number | string): boolean {
  const verified = loadVerified();
  const key = verified[String(chatId)];
  if (!key) return false;
  // Check the key is still valid (not revoked since)
  return isValidKey(key);
}

/** Verify a user with their key. Returns true if the key was accepted. */
export function verifyUser(chatId: number | string, key: string): boolean {
  if (!isValidKey(key)) return false;
  const verified = loadVerified();
  verified[String(chatId)] = key.trim().toUpperCase();
  saveVerified(verified);
  return true;
}

/** Generate N new keys and add them to the valid pool. */
export function generateKeys(n = 4): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const newKeys: string[] = [];
  for (let i = 0; i < n; i++) {
    newKeys.push(`ZYNT-${seg()}-${seg()}-${seg()}`);
  }
  const store = loadKeys();
  store.valid.push(...newKeys);
  saveKeys(store);
  return newKeys;
}

/** Revoke a specific key. Returns true if key was found and revoked. */
export function revokeKey(key: string): boolean {
  const store = loadKeys();
  const k = key.trim().toUpperCase();
  const idx = store.valid.indexOf(k);
  if (idx === -1) return false;
  store.valid.splice(idx, 1);
  store.revoked.push(k);
  saveKeys(store);
  // Also un-verify any user that was using this key
  const verified = loadVerified();
  for (const uid of Object.keys(verified)) {
    if (verified[uid] === k) delete verified[uid];
  }
  saveVerified(verified);
  return true;
}

/** Revoke ALL keys. Returns count of keys revoked. */
export function revokeAllKeys(): number {
  const store = loadKeys();
  const count = store.valid.length;
  store.revoked.push(...store.valid);
  store.valid = [];
  saveKeys(store);
  // Clear all verified users
  saveVerified({});
  return count;
}

/** Get stats about keys. */
export function getKeyStats(): { valid: number; revoked: number } {
  const store = loadKeys();
  return { valid: store.valid.length, revoked: store.revoked.length };
}

/** Get list of all valid keys (for display). */
export function listValidKeys(): string[] {
  return loadKeys().valid;
}
