// Passphrase encryption for backup files (WebCrypto).
//
// File layout (same container as the iPhone-app backup):
//   "NRBK" (4) | version (1) | PBKDF2 iterations, big-endian (4) | salt (16) | IV (12) | ciphertext + 16-byte tag
// Key: PBKDF2-HMAC-SHA256 -> AES-256-GCM. The 25-byte header is authenticated, so editing it breaks decryption.

const MAGIC = [0x4e, 0x52, 0x42, 0x4b];
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = 4 + 1 + 4 + SALT_LEN;
export const DEFAULT_ITERATIONS = 600000;
const MAX_ITERATIONS = 5000000;

export class BackupError extends Error {}

async function deriveKey(passphrase, salt, iterations, usage) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, [usage]
  );
}

export async function encryptBytes(plain, passphrase, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  new DataView(header.buffer).setUint32(5, iterations, false);
  header.set(salt, 9);

  const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain));

  const out = new Uint8Array(HEADER_LEN + IV_LEN + sealed.length);
  out.set(header, 0);
  out.set(iv, HEADER_LEN);
  out.set(sealed, HEADER_LEN + IV_LEN);
  return out;
}

export async function decryptBytes(file, passphrase) {
  const bytes = new Uint8Array(file);
  if (bytes.length < HEADER_LEN + IV_LEN + 16 || !MAGIC.every((b, i) => bytes[i] === b)) {
    throw new BackupError('This file is not a New Route backup.');
  }
  if (bytes[4] !== VERSION) throw new BackupError('This backup was made by a newer version of New Route.');

  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(5, false);
  if (iterations < 1 || iterations > MAX_ITERATIONS) throw new BackupError('This file is not a New Route backup.');

  const header = bytes.slice(0, HEADER_LEN);
  const salt = bytes.slice(9, 9 + SALT_LEN);
  const iv = bytes.slice(HEADER_LEN, HEADER_LEN + IV_LEN);
  const sealed = bytes.slice(HEADER_LEN + IV_LEN);

  const key = await deriveKey(passphrase, salt, iterations, 'decrypt');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, key, sealed));
  } catch {
    throw new BackupError('Wrong passphrase, or the file is damaged.');
  }
}

export async function encryptJson(value, passphrase, iterations) {
  return encryptBytes(new TextEncoder().encode(JSON.stringify(value)), passphrase, iterations);
}

export async function decryptJson(file, passphrase) {
  const bytes = await decryptBytes(file, passphrase);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BackupError('This file is not a New Route backup.');
  }
}
