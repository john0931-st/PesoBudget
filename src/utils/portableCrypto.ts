/**
 * @file portableCrypto.ts
 * @description Self-contained PBKDF2-HMAC-SHA256 + SHA256-CTR + HMAC-SHA256 encryption utilities.
 * Uses pure TypeScript + TextEncoder/crypto.getRandomValues so it works identically on
 * https://, http://localhost, file://, Android, iPhone, macOS, and Windows without WebCrypto origin restrictions.
 */

export interface EncryptedEnvelope {
  encrypted: true;
  alg: 'pbkdf2-sha256-ctr-hmac-v1';
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  mac: string; // hex
  ciphertext: string; // base64
}

export interface PortableLockMetadata {
  lockId: string;
  alg: 'pbkdf2-sha256-ctr-hmac-v1';
  iterations: number;
  salt: string; // hex
  verifier: string; // hex HMAC
  hint?: string;
  createdAt: string;
}

const DEFAULT_ITERATIONS = 6000;
const PORTABLE_LOCK_STORAGE_KEY = 'pesobudget_portable_lock_v1';
const SESSION_UNLOCKED_KEY = 'pesobudget_session_unlocked_lock_id_v1';

// Kept only in memory during the current unlocked tab session
let sessionPortablePassword: string | null = null;

export function setActivePortablePassword(password: string | null): void {
  sessionPortablePassword = password;
}

export function getActivePortablePassword(): string | null {
  return sessionPortablePassword;
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.encrypted === true &&
    v.alg === 'pbkdf2-sha256-ctr-hmac-v1' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.mac === 'string' &&
    typeof v.ciphertext === 'string'
  );
}

// ---------- UTF-8 / Hex / Base64 helpers ----------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function utf8ToBytes(str: string): Uint8Array {
  return textEncoder.encode(str);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < len; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------- Standard RFC 6234 SHA-256 ----------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const W_BUF = new Uint32Array(64);

function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;
  const paddedLen = ((len + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W_BUF[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((W_BUF[i - 15] >>> 7) | (W_BUF[i - 15] << 25)) ^
        ((W_BUF[i - 15] >>> 18) | (W_BUF[i - 15] << 14)) ^
        (W_BUF[i - 15] >>> 3);
      const s1 =
        ((W_BUF[i - 2] >>> 17) | (W_BUF[i - 2] << 15)) ^
        ((W_BUF[i - 2] >>> 19) | (W_BUF[i - 2] << 13)) ^
        (W_BUF[i - 2] >>> 10);
      W_BUF[i] = (W_BUF[i - 16] + s0 + W_BUF[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W_BUF[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  const k = key.length > blockSize ? sha256(key) : key;
  const ipad = new Uint8Array(blockSize + message.length);
  const opad = new Uint8Array(blockSize + 32);

  for (let i = 0; i < blockSize; i++) {
    const kb = i < k.length ? k[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  ipad.set(message, blockSize);
  const inner = sha256(ipad);
  opad.set(inner, blockSize);
  return sha256(opad);
}

function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLenBytes: number
): Uint8Array {
  const passBytes = utf8ToBytes(password);
  const blocks = Math.ceil(keyLenBytes / 32);
  const dk = new Uint8Array(blocks * 32);

  for (let blockIdx = 1; blockIdx <= blocks; blockIdx++) {
    const blockInput = new Uint8Array(salt.length + 4);
    blockInput.set(salt);
    blockInput[salt.length] = (blockIdx >>> 24) & 0xff;
    blockInput[salt.length + 1] = (blockIdx >>> 16) & 0xff;
    blockInput[salt.length + 2] = (blockIdx >>> 8) & 0xff;
    blockInput[salt.length + 3] = blockIdx & 0xff;

    let u = hmacSha256(passBytes, blockInput);
    const t = new Uint8Array(u);
    for (let iter = 1; iter < iterations; iter++) {
      u = hmacSha256(passBytes, u);
      for (let j = 0; j < 32; j++) {
        t[j] ^= u[j];
      }
    }
    dk.set(t, (blockIdx - 1) * 32);
  }

  return dk.subarray(0, keyLenBytes);
}

function applyCtrKeystream(
  data: Uint8Array,
  encKey: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  const out = new Uint8Array(data.length);
  const counterBlock = new Uint8Array(encKey.length + iv.length + 4);
  counterBlock.set(encKey, 0);
  counterBlock.set(iv, encKey.length);

  let offset = 0;
  let counter = 0;
  while (offset < data.length) {
    const pos = encKey.length + iv.length;
    counterBlock[pos] = (counter >>> 24) & 0xff;
    counterBlock[pos + 1] = (counter >>> 16) & 0xff;
    counterBlock[pos + 2] = (counter >>> 8) & 0xff;
    counterBlock[pos + 3] = counter & 0xff;
    const keystream = sha256(counterBlock);
    const chunk = Math.min(32, data.length - offset);
    for (let i = 0; i < chunk; i++) {
      out[offset + i] = data[offset + i] ^ keystream[i];
    }
    offset += chunk;
    counter++;
  }
  return out;
}

// ---------- Public Encryption & Lock API ----------

export function createPortableLockMetadata(
  password: string,
  hint?: string
): PortableLockMetadata {
  const salt = randomBytes(16);
  const lockId = `lock_${bytesToHex(randomBytes(8))}`;
  const dk = pbkdf2Sha256(password, salt, DEFAULT_ITERATIONS, 64);
  const macKey = dk.subarray(32, 64);
  const verifier = bytesToHex(
    hmacSha256(macKey, utf8ToBytes(`PESOBUDGET_LOCK_VERIFIER_V1:${lockId}`))
  );

  return {
    lockId,
    alg: 'pbkdf2-sha256-ctr-hmac-v1',
    iterations: DEFAULT_ITERATIONS,
    salt: bytesToHex(salt),
    verifier,
    hint: hint?.trim() ? hint.trim().slice(0, 120) : undefined,
    createdAt: new Date().toISOString(),
  };
}

export function verifyPortableLockPassword(
  lockMeta: PortableLockMetadata,
  password: string
): boolean {
  try {
    const salt = hexToBytes(lockMeta.salt);
    const dk = pbkdf2Sha256(password, salt, lockMeta.iterations || DEFAULT_ITERATIONS, 64);
    const macKey = dk.subarray(32, 64);
    const expected = hexToBytes(lockMeta.verifier);
    const actual = hmacSha256(
      macKey,
      utf8ToBytes(`PESOBUDGET_LOCK_VERIFIER_V1:${lockMeta.lockId}`)
    );
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function encryptTextWithPassword(
  plaintext: string,
  password: string
): EncryptedEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const dk = pbkdf2Sha256(password, salt, DEFAULT_ITERATIONS, 64);
  const encKey = dk.subarray(0, 32);
  const macKey = dk.subarray(32, 64);

  const plainBytes = utf8ToBytes(plaintext);
  const cipherBytes = applyCtrKeystream(plainBytes, encKey, iv);

  const macInput = new Uint8Array(iv.length + cipherBytes.length);
  macInput.set(iv, 0);
  macInput.set(cipherBytes, iv.length);
  const mac = hmacSha256(macKey, macInput);

  return {
    encrypted: true,
    alg: 'pbkdf2-sha256-ctr-hmac-v1',
    iterations: DEFAULT_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    mac: bytesToHex(mac),
    ciphertext: bytesToBase64(cipherBytes),
  };
}

export function decryptTextWithPassword(
  envelope: EncryptedEnvelope,
  password: string
): string {
  const salt = hexToBytes(envelope.salt);
  const iv = hexToBytes(envelope.iv);
  const cipherBytes = base64ToBytes(envelope.ciphertext);
  const expectedMac = hexToBytes(envelope.mac);

  const dk = pbkdf2Sha256(
    password,
    salt,
    envelope.iterations || DEFAULT_ITERATIONS,
    64
  );
  const encKey = dk.subarray(0, 32);
  const macKey = dk.subarray(32, 64);

  const macInput = new Uint8Array(iv.length + cipherBytes.length);
  macInput.set(iv, 0);
  macInput.set(cipherBytes, iv.length);
  const actualMac = hmacSha256(macKey, macInput);

  if (!constantTimeEqual(actualMac, expectedMac)) {
    throw new Error('Incorrect password or corrupted encrypted data.');
  }

  const plainBytes = applyCtrKeystream(cipherBytes, encKey, iv);
  return bytesToUtf8(plainBytes);
}

// ---------- LocalStorage / SessionStorage Lock Helpers ----------

export function getStoredPortableLock(): PortableLockMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PORTABLE_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortableLockMetadata;
    if (parsed && parsed.lockId && parsed.salt && parsed.verifier) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredPortableLock(meta: PortableLockMetadata | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!meta) {
      localStorage.removeItem(PORTABLE_LOCK_STORAGE_KEY);
      localStorage.removeItem('pesobudget_portable_biometrics_v1');
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      sessionPortablePassword = null;
    } else {
      localStorage.setItem(PORTABLE_LOCK_STORAGE_KEY, JSON.stringify(meta));
    }
  } catch {
    // ignore storage errors
  }
}

export function markSessionUnlocked(lockId: string, password: string): void {
  sessionPortablePassword = password;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, lockId);
    } catch {
      // ignore
    }
  }
}

export function clearSessionUnlocked(): void {
  sessionPortablePassword = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    } catch {
      // ignore
    }
  }
}

export function isSessionUnlockedForLock(lockMeta: PortableLockMetadata): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === lockMeta.lockId;
  } catch {
    return false;
  }
}
