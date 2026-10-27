// In-memory state backed by IndexedDB. Views read `state` directly; changes go through the helpers below.
import * as db from './db.js';
import { uid, isoDay, parseDay, addDays, inMonth } from './util.js';

export const DEFAULT_SETTINGS = {
  onboarded: false,
  seeded: false,
  currency: 'IDR',
  income: 0,
  emergencyNumber: '',
  // Reminders (delivered through the iPhone Calendar, see ics.js)
  checkIns: true,
  morningMinutes: 8 * 60,
  eveningMinutes: 20 * 60,
  habitNudges: true,
  budgetAlerts: true,
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  reminderSeq: 1,
  // Privacy
  appLock: false,
  careLock: true,
  careGraceMinutes: 1,
  pinHash: '',
  pinSalt: '',
  pinLength: 4,
  biometricId: '',
  lastBackup: 0
};

/** Settings that stay on this device and are never exported or restored. */
export const DEVICE_ONLY = ['pinHash', 'pinSalt', 'pinLength', 'biometricId', 'appLock', 'seeded', 'onboarded', 'lastBackup', 'reminderSeq'];

export const state = {
  ready: false,
  settings: { ...DEFAULT_SETTINGS },
  habits: [],
  habitLogs: [],
  moods: [],
  categories: [],
  transactions: [],
  appointments: [],
  contacts: [],
  templates: []
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

async function loadAll() {
  for (const name of db.STORES) state[name] = await db.getAll(name);
}

export async function init() {
  await loadAll();
  const meta = (await db.getAll('meta')).find((m) => m.id === 'settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(meta?.value || {}) };
  if (!state.settings.seeded) await seed();
  state.ready = true;
}

async function seed() {
  const habits = [
    { name: 'Plan your day', isCount: false, target: 1, unit: '', dayPart: 'morning' },
    { name: 'Hydrate', isCount: true, target: 8, unit: 'glasses', dayPart: 'midday' },
    { name: 'Walk', isCount: true, target: 30, unit: 'min', dayPart: 'midday' },
    { name: 'Write', isCount: false, target: 1, unit: '', dayPart: 'evening' },
    { name: 'Meditate or breathe', isCount: true, target: 10, unit: 'min', dayPart: 'evening' }
  ];
  for (const [i, h] of habits.entries()) {
    await upsert('habits', { ...h, weekdays: [], reminderMinutes: null, sortOrder: i }, true);
  }
  const categories = ['Food and groceries', 'Transport and bills', 'Health and personal', 'Fun, gifts and other'];
  for (const [i, name] of categories.entries()) await upsert('categories', { name, budget: 0, sortOrder: i }, true);
  const templates = [
    ['Need to talk', 'I am having a hard time right now. Can you call me when you can?'],
    ['Need help now', 'I need help right now. Please call me as soon as you see this.'],
    ['Checking in', 'I am okay, just letting you know I am thinking of you.']
  ];
  for (const [i, [label, text]] of templates.entries()) await upsert('templates', { label, text, sortOrder: i }, true);
  await setSettings({ seeded: true }, true);
}

// ---------- Writes ----------
export async function upsert(store, record, silent = false) {
  if (!record.id) record.id = uid();
  const list = state[store];
  const index = list.findIndex((r) => r.id === record.id);
  if (index >= 0) list[index] = record; else list.push(record);
  await db.put(store, record);
  if (!silent) emit();
  return record;
}

export async function remove(store, id) {
  state[store] = state[store].filter((r) => r.id !== id);
  await db.remove(store, id);
  emit();
}

export async function setSettings(patch, silent = false) {
  Object.assign(state.settings, patch);
  await db.put('meta', { id: 'settings', value: state.settings });
  if (!silent) emit();
}

export async function deleteHabit(id) {
  const logIds = state.habitLogs.filter((l) => l.habitId === id).map((l) => l.id);
  state.habitLogs = state.habitLogs.filter((l) => l.habitId !== id);
  await db.removeMany('habitLogs', logIds);
  await remove('habits', id);
}

export async function deleteCategory(id) {
  for (const t of state.transactions.filter((x) => x.categoryId === id)) {
    await upsert('transactions', { ...t, categoryId: null }, true);
  }
  await remove('categories', id);
}

// ---------- Habits ----------
export const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

export function scheduledOn(day) {
  const weekday = parseDay(day).getDay();
  return [...state.habits].sort(byOrder).filter((h) => !h.weekdays?.length || h.weekdays.includes(weekday));
}

export const habitValue = (habitId, day) => state.habitLogs.find((l) => l.habitId === habitId && l.day === day)?.value ?? 0;

export async function setHabitValue(habit, day, value) {
  const existing = state.habitLogs.find((l) => l.habitId === habit.id && l.day === day);
  if (value <= 0) {
    if (existing) await remove('habitLogs', existing.id);
    return;
  }
  await upsert('habitLogs', { id: existing?.id, habitId: habit.id, day, value });
}

/** Forgiving streak: one missed scheduled day is allowed, two in a row end it. */
export function streak(habit, today = new Date()) {
  const done = new Set(state.habitLogs.filter((l) => l.habitId === habit.id && l.value >= habit.target).map((l) => l.day));
  let count = 0;
  let misses = 0;
  for (let i = 0; i < 365; i++) {
    const date = addDays(today, -i);
    const key = isoDay(date);
    if (habit.weekdays?.length && !habit.weekdays.includes(date.getDay())) continue;
    if (done.has(key)) { count++; misses = 0; }
    else if (i > 0) { misses++; if (misses >= 2) break; }
  }
  return count;
}

export const moodOn = (day) => state.moods.find((m) => m.day === day);

// ---------- Money ----------
export const categoryName = (id) => state.categories.find((c) => c.id === id)?.name;

export function categorySpent(categoryId, ref = new Date()) {
  return state.transactions
    .filter((t) => t.type === 'expense' && t.categoryId === categoryId && inMonth(t.day, ref))
    .reduce((total, t) => total + t.amount, 0);
}

export const monthSpent = (ref = new Date()) =>
  state.transactions.filter((t) => t.type === 'expense' && inMonth(t.day, ref)).reduce((total, t) => total + t.amount, 0);

export const totalBudget = () => state.categories.reduce((total, c) => total + (c.budget || 0), 0);

// ---------- Care ----------
export const apptDate = (appointment) => new Date(appointment.at);

// ---------- Quiet hours ----------
export function isQuiet(minutes, settings = state.settings) {
  const { quietStart: start, quietEnd: end } = settings;
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function isQuietNow() {
  const now = new Date();
  return isQuiet(now.getHours() * 60 + now.getMinutes());
}

// ---------- Export / restore ----------
export function exportData() {
  const settings = { ...state.settings };
  DEVICE_ONLY.forEach((key) => delete settings[key]);
  const data = {};
  db.STORES.forEach((name) => { data[name] = state[name]; });
  return { format: 'newroute-web', version: 1, createdAt: new Date().toISOString(), settings, data };
}

export function validateBackup(payload) {
  if (!payload || payload.format !== 'newroute-web' || typeof payload.data !== 'object') {
    throw new Error('This is not a New Route web backup.');
  }
  if (payload.version > 1) throw new Error('This backup was made by a newer version of New Route.');
  for (const name of db.STORES) {
    if (payload.data[name] !== undefined && !Array.isArray(payload.data[name])) {
      throw new Error('The backup is damaged.');
    }
  }
}

/** Replaces all records with the backup's. Throws before changing anything if the backup is invalid. */
export async function restoreData(payload) {
  validateBackup(payload);
  const data = {};
  db.STORES.forEach((name) => { data[name] = payload.data[name] || []; });
  await db.replaceAll(data);
  const keep = {};
  DEVICE_ONLY.forEach((key) => { keep[key] = state.settings[key]; });
  state.settings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}), ...keep, onboarded: true, seeded: true };
  await db.put('meta', { id: 'settings', value: state.settings });
  await loadAll();
  emit();
}
