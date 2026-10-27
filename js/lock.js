// PIN lock (and optional Face ID / Touch ID through WebAuthn) for the whole app and for Care.
// This is a privacy screen against casual snooping on an unlocked phone. It does not encrypt the stored data.
import { html, bytesToHex, hexToBytes, bytesToB64, b64ToBytes } from './util.js';
import { actions, toast } from './ui.js';
import { state, setSettings } from './store.js';

let appUnlocked = false;
let careUntil = 0;
let failures = 0;
let blockedUntil = 0;

// ---------- PIN storage ----------
async function hashPin(pin, saltHex) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 200000, hash: 'SHA-256' }, material, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function setPin(pin) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  await setSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt), pinLength: pin.length });
}

export async function clearPin() {
  await setSettings({ pinHash: '', pinSalt: '', appLock: false, biometricId: '' });
}

async function verifyPin(pin) {
  return (await hashPin(pin, state.settings.pinSalt)) === state.settings.pinHash;
}

export const hasPin = () => !!state.settings.pinHash;

// ---------- State ----------
export const isAppLocked = () => state.settings.appLock && hasPin() && !appUnlocked;
export const lockApp = () => { appUnlocked = false; };
export const careIsUnlocked = () => !state.settings.careLock || !hasPin() || Date.now() < careUntil;
export const unlockCareFor = (minutes) => { careUntil = Date.now() + minutes * 60000; };
export const startCareGrace = () => { careUntil = Date.now() + (state.settings.careGraceMinutes || 0) * 60000; };

// ---------- Biometrics (WebAuthn, best effort) ----------
export let biometricAvailable = false;
export async function detectBiometrics() {
  try {
    biometricAvailable = !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    biometricAvailable = false;
  }
}

export async function registerBiometric() {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'New Route' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'new-route', displayName: 'New Route' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000
    }
  });
  await setSettings({ biometricId: bytesToB64(new Uint8Array(credential.rawId)) });
}

async function verifyBiometric() {
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: b64ToBytes(state.settings.biometricId) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return true;
}

// ---------- Lock screen ----------
let entry = '';
let pending = null; // { title, subtitle, onSuccess, onCancel }

const lockEl = () => document.getElementById('lock');

function paint(message = '') {
  const length = state.settings.pinLength || 4;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  lockEl().innerHTML = html`
    <h2>${pending.title}</h2>
    <p aria-live="polite">${message || pending.subtitle}</p>
    <div class="dots" aria-label="${entry.length} of ${length} digits entered">${Array.from({ length }, (_, i) => html`<i class="${i < entry.length ? 'on' : ''}"></i>`)}</div>
    <div class="keypad">
      ${keys.map((k) => k === '' ? html`<button class="blank" tabindex="-1" aria-hidden="true"></button>`
        : k === 'del' ? html`<button class="small" data-action="pin.del" aria-label="Delete last digit">Delete</button>`
        : html`<button data-action="pin.key" data-k="${k}">${k}</button>`)}
    </div>
    ${state.settings.biometricId && biometricAvailable ? html`<button class="linkbtn" data-action="pin.bio">Use Face ID</button>` : ''}
    ${pending.onCancel ? html`<button class="linkbtn" data-action="pin.cancel">Cancel</button>` : ''}`.toString();
}

export function showLock(options) {
  pending = options;
  entry = '';
  lockEl().hidden = false;
  paint();
  if (state.settings.biometricId && biometricAvailable && !options.skipBiometric) actions['pin.bio']?.();
}

function hideLock() {
  lockEl().hidden = true;
  lockEl().innerHTML = '';
  entry = '';
}

async function succeed() {
  const done = pending?.onSuccess;
  pending = null;
  hideLock();
  failures = 0;
  done?.();
}

actions['pin.key'] = async (el) => {
  if (Date.now() < blockedUntil) return paint(`Too many tries. Wait ${Math.ceil((blockedUntil - Date.now()) / 1000)}s.`);
  const length = state.settings.pinLength || 4;
  if (entry.length >= length) return;
  entry += el.dataset.k;
  paint();
  if (entry.length < length) return;
  if (await verifyPin(entry)) return succeed();
  failures++;
  entry = '';
  if (failures >= 5) { blockedUntil = Date.now() + 30000 * (failures - 4); return paint('Too many tries. Wait 30 seconds.'); }
  paint('Wrong PIN. Try again.');
};

actions['pin.del'] = () => { entry = entry.slice(0, -1); paint(); };
actions['pin.cancel'] = () => { const cancel = pending?.onCancel; pending = null; hideLock(); cancel?.(); };
actions['pin.bio'] = async () => {
  try {
    if (await verifyBiometric()) await succeed();
  } catch {
    if (pending) paint('Face ID did not work. Use your PIN.');
  }
};

// Keyboard digits work too.
document.addEventListener('keydown', (event) => {
  if (lockEl().hidden || !pending) return;
  if (/^\d$/.test(event.key)) actions['pin.key']({ dataset: { k: event.key } });
  else if (event.key === 'Backspace') actions['pin.del']();
});

export const lockVisible = () => !lockEl().hidden;

export function unlockApp() {
  return new Promise((resolve) => {
    showLock({
      title: 'New Route',
      subtitle: 'Enter your PIN',
      onSuccess: () => { appUnlocked = true; resolve(); }
    });
  });
}

export function requireCare(onSuccess, onCancel) {
  showLock({
    title: 'Care is locked',
    subtitle: 'Enter your PIN to open Care',
    onSuccess: () => { unlockCareFor(60); onSuccess(); },
    onCancel
  });
}

export { toast };
