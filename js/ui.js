// Shared UI pieces: event registries, sheets, toasts, header, charts bits, file saving.
import { html, raw, esc } from './util.js';

/** Click handlers, keyed by data-action. */
export const actions = {};
/** Change handlers, keyed by data-change. */
export const changes = {};
/** Submit handlers, keyed by data-form. */
export const forms = {};

export const go = (hash) => { location.hash = hash; };

// ---------- Icons ----------
const svg = (body, size = 20) =>
  raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);

export const icons = {
  check: svg('<path d="M5 12.500l4.500 4.500L19 7"/>', 16),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 18),
  back: svg('<path d="M15 6l-6 6 6 6"/>', 18),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 18),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>', 22),
  phone: svg('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', 22)
};

// ---------- Header ----------
export function header({ title, subtitle = '', variant = '', back = '', pill = '' }) {
  return html`<header class="hdr ${variant}">
    ${back ? html`<button class="back" data-action="back" aria-label="Back">${icons.back}${back}</button>` : ''}
    ${subtitle ? html`<div class="sub">${subtitle}</div>` : ''}
    <h1>${title}</h1>
    ${pill ? html`<div class="pill">${icons.lock}${pill}</div>` : ''}
  </header>`;
}

export function ring(progress) {
  const circumference = 251.33;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  return raw(`<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${Math.round(progress * 100)} percent done">
    <circle class="track" cx="50" cy="50" r="40" fill="none" stroke-width="10"/>
    <circle class="val" cx="50" cy="50" r="40" fill="none" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 50 50)"/>
  </svg>`);
}

export function bar(fraction, { blue = false, onMist = false, thick = false } = {}) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return raw(`<div class="bar ${blue ? 'blue' : ''} ${onMist ? 'on-mist' : ''} ${thick ? 'thick' : ''}"><i style="width:${pct}%"></i></div>`);
}

// ---------- Sheet ----------
const sheetRoot = () => document.getElementById('sheet-root');
let returnFocus = null;

export function openSheet(content, label = 'Dialog') {
  returnFocus = document.activeElement;
  sheetRoot().innerHTML = html`<div class="scrim" data-action="sheet.close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${label}"><div class="grab"></div>${content}</div>`.toString();
  const first = sheetRoot().querySelector('input:not([type=hidden]), textarea, select');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
}

export function closeSheet() {
  sheetRoot().innerHTML = '';
  if (returnFocus?.isConnected) returnFocus.focus?.();
  returnFocus = null;
}

export const sheetOpen = () => sheetRoot().childElementCount > 0;
actions['sheet.close'] = () => closeSheet();
actions.back = () => history.length > 1 ? history.back() : go('#/today');
actions.nav = (el) => go(el.dataset.to);

// ---------- Toast ----------
let toastTimer;
export function toast(message, ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Files ----------
/**
 * Saves a file. On iPhone the share sheet lets you pick "Save to Files" (or Calendar for .ics).
 * Falls back to a normal download. Must be called straight from a tap.
 */
export async function saveFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// ---------- Calendar files ----------
// The iPhone share sheet has no "Add to Calendar" for files shared from a web app. The reliable route is
// Save to Files, then tapping the saved file in the Files app, which opens Calendar's "Add All" screen.
let calendarFile = null;

export function offerCalendarFile(name, ics, { what, onSaved } = {}) {
  calendarFile = { name, ics, onSaved };
  openSheet(html`
    <h2>Add ${what || 'to Calendar'}</h2>
    <p class="lead">Your iPhone adds these in two quick steps:</p>
    <ol class="steps">
      <li>Tap <b>Save file</b> below, then choose <b>Save to Files</b> and tap Save.</li>
      <li>Open the <b>Files</b> app, tap <b>${name}</b>, then tap <b>Add All</b> at the bottom and choose a calendar.</li>
    </ol>
    <button class="btn block" data-action="calendar.save">Save file</button>
    <button class="btn ghost block" style="margin-top:8px" data-action="sheet.close">Close</button>`, 'Add to Calendar');
}

actions['calendar.save'] = async () => {
  if (!calendarFile) return;
  const saved = await saveFile(calendarFile.name, 'text/calendar', calendarFile.ics);
  if (!saved) return;
  const { onSaved } = calendarFile;
  calendarFile = null;
  closeSheet();
  toast('Saved. Now open it from the Files app.', 5000);
  await onSaved?.();
};

export const isStandalone =() => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export { html, raw, esc };
