import { StoreOperator } from '../types/product';

export const DEFAULT_MANAGER_PIN = '1234';
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

const PIN_LOCK_PREFIX = 'prontopreco_pin_lock_v1_';
const UNLOCKED_OP_PREFIX = 'prontopreco_unlocked_op_v2_';

export interface PinLockState {
  failedAttempts: number;
  lockedUntil: number;
  remainingSeconds: number;
  isLocked: boolean;
}

export interface UnlockedOperatorSession {
  operatorId: string;
  credentialSignature: string;
  unlockedAt: number;
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

export function sanitizePinInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH);
}

// Pure JS SHA-256 fallback for environments without WebCrypto subtle (e.g. non-HTTPS localhost previews)
function sha256FallbackHex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  const W = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
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

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export async function hashPin(
  storeId: string,
  operatorId: string,
  pin: string,
): Promise<string> {
  const cleanPin = pin.trim();
  const salted = `prontopreco-pin-v1:${storeId}:${operatorId}:${cleanPin}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(salted),
      );
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `sha256:${hex}`;
    } catch {
      // Fallback below
    }
  }

  return `sha256:${sha256FallbackHex(salted)}`;
}

export async function verifyPin(
  storeId: string,
  operator: Pick<StoreOperator, 'id' | 'pinHash' | 'pin'>,
  candidatePin: string,
): Promise<boolean> {
  const clean = candidatePin.trim();
  if (!isValidPinFormat(clean)) return false;

  if (operator.pinHash) {
    const computed = await hashPin(storeId, operator.id, clean);
    return computed === operator.pinHash;
  }

  if (operator.pin) {
    return clean === operator.pin;
  }

  return false;
}

export function getCredentialSignature(
  operator: Pick<StoreOperator, 'pinHash' | 'pin'>,
): string {
  return operator.pinHash || operator.pin || '';
}

export async function isUsingDefaultManagerPin(
  storeId: string,
  managerOp: StoreOperator | null | undefined,
): Promise<boolean> {
  if (!managerOp || managerOp.role !== 'manager') return false;
  return verifyPin(storeId, managerOp, DEFAULT_MANAGER_PIN);
}

// --- Brute-force PIN Lockout / Cooldown per Store ---

interface RawLockRecord {
  failedAttempts: number;
  lockedUntil: number;
}

export function getPinLockState(storeId: string): PinLockState {
  try {
    const raw = localStorage.getItem(`${PIN_LOCK_PREFIX}${storeId}`);
    if (!raw) {
      return { failedAttempts: 0, lockedUntil: 0, remainingSeconds: 0, isLocked: false };
    }
    const parsed = JSON.parse(raw) as RawLockRecord;
    const now = Date.now();
    const lockedUntil = Number(parsed.lockedUntil) || 0;
    const remainingMs = Math.max(0, lockedUntil - now);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    return {
      failedAttempts: Number(parsed.failedAttempts) || 0,
      lockedUntil,
      remainingSeconds,
      isLocked: remainingMs > 0,
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: 0, remainingSeconds: 0, isLocked: false };
  }
}

export function recordFailedPinAttempt(storeId: string): PinLockState {
  const current = getPinLockState(storeId);
  const nextAttempts = current.failedAttempts + 1;

  let cooldownSeconds = 0;
  if (nextAttempts === 3) cooldownSeconds = 15;
  else if (nextAttempts === 4) cooldownSeconds = 30;
  else if (nextAttempts >= 5) cooldownSeconds = 60;

  const lockedUntil =
    cooldownSeconds > 0 ? Date.now() + cooldownSeconds * 1000 : 0;

  try {
    localStorage.setItem(
      `${PIN_LOCK_PREFIX}${storeId}`,
      JSON.stringify({ failedAttempts: nextAttempts, lockedUntil }),
    );
  } catch {
    // Ignore quota failures
  }

  return getPinLockState(storeId);
}

export function clearPinAttempts(storeId: string): void {
  try {
    localStorage.removeItem(`${PIN_LOCK_PREFIX}${storeId}`);
  } catch {
    // Ignore storage errors
  }
}

// --- Per-Device Unlocked Operator Session Token ---

export function readUnlockedOperatorSession(
  storeId: string,
): UnlockedOperatorSession | null {
  if (!storeId) return null;
  try {
    const raw = localStorage.getItem(`${UNLOCKED_OP_PREFIX}${storeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnlockedOperatorSession;
    if (!parsed?.operatorId || typeof parsed.credentialSignature !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveUnlockedOperatorSession(
  storeId: string,
  operator: Pick<StoreOperator, 'id' | 'pinHash' | 'pin'>,
): void {
  if (!storeId) return;
  try {
    const payload: UnlockedOperatorSession = {
      operatorId: operator.id,
      credentialSignature: getCredentialSignature(operator),
      unlockedAt: Date.now(),
    };
    localStorage.setItem(`${UNLOCKED_OP_PREFIX}${storeId}`, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export function clearUnlockedOperatorSession(storeId: string): void {
  if (!storeId) return;
  try {
    localStorage.removeItem(`${UNLOCKED_OP_PREFIX}${storeId}`);
  } catch {
    // Ignore storage errors
  }
}
