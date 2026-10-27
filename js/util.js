// Small helpers: safe HTML templates, dates, money.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

class Raw {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export const raw = (text) => new Raw(text);

function render(value) {
  if (value instanceof Raw) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

/** Tagged template: every interpolated value is escaped unless it is itself html`` output. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += render(value) + strings[i + 1]; });
  return new Raw(out);
}

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- Dates (local time, "YYYY-MM-DD" day keys) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const parseDay = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (date, n) => { const copy = new Date(date); copy.setDate(copy.getDate() + n); return copy; };
export const dayOffset = (n) => isoDay(addDays(new Date(), n));
export const sameMonth = (a, b = new Date()) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
export const inMonth = (dayKey, ref = new Date()) => sameMonth(parseDay(dayKey), ref);

export const fmtTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtWeekdayTime = (date) => date.toLocaleDateString([], { weekday: 'long' }) + ', ' + fmtTime(date);
export const fmtLongDate = (date) => date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShortDate = (date) => date.toLocaleDateString([], { day: 'numeric', month: 'short' });
export const fmtDateTime = (date) => date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + fmtTime(date);

export const minutesToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const hhmmToMinutes = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// ---------- Money ----------
export function formatMoney(amount, code) {
  const sep = ['IDR', 'EUR'].includes(code) ? '.' : ',';
  const text = Math.round(Math.abs(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${amount < 0 ? '-' : ''}${code} ${text}`;
}

export const digits = (s) => String(s ?? '').replace(/\D/g, '');
export const toInt = (s) => { const d = digits(s); return d ? parseInt(d, 10) : 0; };

export const sum = (list, pick = (x) => x) => list.reduce((total, item) => total + pick(item), 0);

export function bytesToHex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
export function hexToBytes(hex) { return new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16))); }
export function bytesToB64(bytes) { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); }
export function b64ToBytes(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
