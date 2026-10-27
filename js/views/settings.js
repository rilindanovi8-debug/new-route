import { html, minutesToHHMM, hhmmToMinutes, toInt, formatMoney } from '../util.js';
import { actions, changes, forms, header, openSheet, closeSheet, toast, saveFile, isStandalone, go } from '../ui.js';
import {
  state, setSettings, upsert, remove, deleteHabit, deleteCategory, byOrder, isQuiet
} from '../store.js';
import { hasPin, setPin, clearPin, biometricAvailable, registerBiometric } from '../lock.js';
import { buildCalendar, nextOccurrence } from '../ics.js';

export const CURRENCIES = ['IDR', 'USD', 'EUR', 'GBP', 'SGD', 'MYR', 'AUD', 'CAD', 'JPY', 'INR'];
const WEEK = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const PARTS = [['morning', 'Morning'], ['midday', 'Midday'], ['evening', 'Evening']];

const toggle = (key, label, on, handler = 'settings.set') => html`
  <label class="setting"><span>${label}</span>
    <input type="checkbox" role="switch" data-change="${handler}" data-key="${key}" data-kind="bool" ${on ? 'checked' : ''}></label>`;

const timeRow = (key, label, minutes) => html`
  <label class="setting"><span>${label}</span>
    <input type="time" data-change="settings.set" data-key="${key}" data-kind="time" value="${minutesToHHMM(minutes)}"></label>`;

export function settingsView() {
  const s = state.settings;
  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Settings', back: 'Back', variant: 'short' })}
      <div class="pad stack gap-lg" style="margin-top:14px">
        ${!isStandalone() ? html`<div class="banner"><span>For the best experience, tap the Share button in Safari, then "Add to Home Screen". It makes New Route open like an app and protects your saved data from being cleared.</span></div>` : ''}

        <section class="stack"><span class="label">Money</span>
          <div class="list">
            <label class="setting"><span>Currency</span>
              <select data-change="settings.set" data-key="currency" data-kind="text" aria-label="Currency">
                ${CURRENCIES.map((c) => html`<option ${c === s.currency ? 'selected' : ''}>${c}</option>`)}</select></label>
            <label class="setting"><span>Monthly income</span>
              <input type="text" inputmode="numeric" data-change="settings.set" data-key="income" data-kind="money" value="${s.income || ''}" placeholder="0"></label>
            <div class="setting"><a href="#/settings/categories">Categories and budgets <span class="chev">›</span></a></div>
          </div></section>

        <section class="stack"><span class="label">Habits</span>
          <div class="list"><div class="setting"><a href="#/settings/habits">Manage habits <span class="chev">›</span></a></div></div></section>

        <section class="stack"><span class="label">Reminders</span>
          <div class="list">
            ${toggle('checkIns', 'Daily check-ins', s.checkIns)}
            ${s.checkIns ? html`${timeRow('morningMinutes', 'Morning plan', s.morningMinutes)}${timeRow('eveningMinutes', 'Evening reflection', s.eveningMinutes)}` : ''}
            ${toggle('habitNudges', 'Habit nudges', s.habitNudges)}
            ${toggle('budgetAlerts', 'Budget alerts at 80% and 100%', s.budgetAlerts)}
            ${timeRow('quietStart', 'Quiet hours start', s.quietStart)}
            ${timeRow('quietEnd', 'Quiet hours end', s.quietEnd)}
            <div class="setting"><button class="plain" data-action="reminders.calendar">Add reminders to Calendar</button></div>
          </div>
          <p class="foot">A web app can't send notifications while it is closed, so New Route puts check-ins, habit nudges and appointment reminders in your iPhone Calendar instead. Tap the button, then "Add All". Tip: when asked, add them to a new calendar called "New Route" so you can remove them in one step. If you change times or habits later, delete the old ones first, then add again. Budget alerts appear inside the app when you log an expense. Reminders in quiet hours are left out.</p>
        </section>

        <section class="stack"><span class="label">Privacy</span>
          <div class="list">
            <label class="setting"><span>App lock (PIN)</span>
              <input type="checkbox" role="switch" data-change="lock.app" ${s.appLock && hasPin() ? 'checked' : ''}></label>
            ${hasPin() ? html`<div class="setting"><button class="plain" data-action="pin.set">Change PIN</button></div>` : ''}
            ${hasPin() && biometricAvailable ? toggle('biometric', 'Use Face ID / Touch ID too', !!s.biometricId, 'lock.bio') : ''}
            ${toggle('careLock', 'Extra PIN for Care', s.careLock)}
            ${s.careLock ? html`<label class="setting"><span>Care stays unlocked</span>
              <select data-change="settings.set" data-key="careGraceMinutes" data-kind="int" aria-label="Care unlock time">
                ${[[0, 'Never'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes']].map(([v, l]) => html`<option value="${v}" ${v === s.careGraceMinutes ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
            ${hasPin() ? html`<div class="setting"><button class="plain" style="color:#b3261e" data-action="pin.remove">Remove PIN</button></div>` : ''}
          </div>
          <p class="foot">${hasPin() ? 'The PIN keeps people with your unlocked phone out of New Route. It does not encrypt the data on the phone.' : 'Set a PIN to turn on the app lock and the extra Care lock. It keeps people with your unlocked phone out of New Route. It does not encrypt the data on the phone.'}</p>
          ${!hasPin() ? html`<button class="btn block" data-action="pin.set">Set a PIN</button>` : ''}
        </section>

        <section class="stack"><span class="label">Emergency</span>
          <div class="list"><div class="setting"><a href="#/emergency">Contacts and prebuilt messages <span class="chev">›</span></a></div></div></section>

        <section class="stack"><span class="label">Data</span>
          <div class="list"><div class="setting"><a href="#/settings/backup">Backup and restore <span class="chev">›</span></a></div></div></section>

        <section class="stack"><span class="label">About</span>
          <div class="list"><div class="setting"><span>Version</span><span class="muted">web 1.0</span></div></div>
          <p class="foot">Your data stays on this phone. New Route has no account, no server and no tracking.</p></section>
      </div>`
  };
}

changes['settings.set'] = (el) => {
  const { key, kind } = el.dataset;
  let value;
  if (kind === 'bool') value = el.checked;
  else if (kind === 'time') value = hhmmToMinutes(el.value);
  else if (kind === 'int') value = Number(el.value) || 0;
  else if (kind === 'money') value = toInt(el.value);
  else value = el.value;
  return setSettings({ [key]: value });
};

// ---------- Locks ----------
function pinSheet() {
  openSheet(html`
    <h2>${hasPin() ? 'Change PIN' : 'Set a PIN'}</h2>
    <p class="lead">Choose 4 to 6 digits.</p>
    <form data-form="pin.save" class="stack" autocomplete="off">
      <label class="field"><span>PIN</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required autocomplete="new-password"></label>
      <label class="field"><span>Repeat PIN</span><input type="password" name="pin2" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required autocomplete="new-password"></label>
      <p class="red small" id="pin-error" role="alert"></p>
      <button class="btn block" type="submit">Save PIN</button>
    </form>`, 'PIN');
}

actions['pin.set'] = () => pinSheet();

forms['pin.save'] = async (data) => {
  const pin = String(data.get('pin'));
  if (!/^\d{4,6}$/.test(pin)) { document.getElementById('pin-error').textContent = 'Use 4 to 6 digits.'; return; }
  if (pin !== String(data.get('pin2'))) { document.getElementById('pin-error').textContent = 'The PINs do not match.'; return; }
  const first = !hasPin();
  await setPin(pin);
  if (first) await setSettings({ appLock: true });
  closeSheet();
  toast('PIN saved');
};

actions['pin.remove'] = async () => {
  if (!confirm('Remove the PIN? The app lock and Care lock will turn off.')) return;
  await clearPin();
  toast('PIN removed');
};

changes['lock.app'] = (el) => {
  if (el.checked && !hasPin()) { el.checked = false; return pinSheet(); }
  return setSettings({ appLock: el.checked });
};

changes['lock.bio'] = async (el) => {
  if (!el.checked) return setSettings({ biometricId: '' });
  try {
    await registerBiometric();
    toast('Face ID / Touch ID is on. Your PIN still works.');
  } catch {
    el.checked = false;
    toast('Could not turn on Face ID. Your PIN still works.');
  }
};

// ---------- Calendar reminders ----------
actions['reminders.calendar'] = async () => {
  const s = state.settings;
  const sequence = s.reminderSeq;
  const events = [];
  const add = (uid, summary, minutes, weekdays = []) => {
    if (isQuiet(minutes)) return;
    events.push({
      uid, summary, sequence,
      start: nextOccurrence(minutes, weekdays.length ? weekdays[0] : null),
      repeat: weekdays.length ? 'WEEKLY' : 'DAILY',
      weekdays,
      alarmsBefore: [0]
    });
  };
  if (s.checkIns) {
    add('daily-morning', 'Take a minute to plan your day', s.morningMinutes);
    add('daily-evening', 'Take a minute to check in', s.eveningMinutes);
  }
  if (s.habitNudges) {
    state.habits.filter((h) => h.reminderMinutes !== null && h.reminderMinutes !== undefined)
      .forEach((h) => add(`habit-${h.id}`, `Time for: ${h.name}`, h.reminderMinutes, h.weekdays || []));
  }
  if (!events.length) return toast('Nothing to add. Turn on check-ins or give a habit a reminder time.');
  await saveFile('new-route-reminders.ics', 'text/calendar', buildCalendar(events, 'New Route'));
  await setSettings({ reminderSeq: sequence + 1 });
};

// ---------- Habits ----------
export function habitsView() {
  const list = [...state.habits].sort(byOrder);
  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Habits', back: 'Settings', variant: 'short' })}
      <div class="pad stack" style="margin-top:14px">
        <div class="list">${list.length ? list.map((h) => html`<a class="li" href="#/settings/habits/${h.id}">
          <span class="grow"><span class="title">${h.name}</span><br><span class="muted small">${PARTS.find((p) => p[0] === h.dayPart)?.[1]} · ${h.isCount ? `${h.target} ${h.unit}` : 'Yes or no'} · ${h.weekdays?.length ? `${h.weekdays.length} days a week` : 'every day'}${h.reminderMinutes != null ? ' · ' + minutesToHHMM(h.reminderMinutes) : ''}</span></span>
          <span class="chev">›</span></a>`) : html`<div class="empty">No habits yet.</div>`}</div>
        <a class="btn block" href="#/settings/habits/new">Add a habit</a>
      </div>`
  };
}

export function habitFormView(id) {
  const h = id === 'new' ? null : state.habits.find((x) => x.id === id);
  if (id !== 'new' && !h) return { subpage: true, tab: 'wellbeing', html: html`${header({ title: 'Not found', back: 'Habits' })}<div class="pad empty">This habit no longer exists.</div>` };
  const days = new Set(h?.weekdays || []);
  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: h ? 'Edit habit' : 'New habit', back: 'Habits', variant: 'short' })}
      <form data-form="habit.save" class="pad" style="margin-top:14px" autocomplete="off">
        <input type="hidden" name="id" value="${h?.id || ''}">
        <label class="field"><span>Name</span><input name="name" value="${h?.name || ''}" required maxlength="60" placeholder="e.g. Read"></label>
        <label class="check"><input type="checkbox" name="isCount" ${h?.isCount ? 'checked' : ''}> Count it (glasses, minutes, pages)</label>
        <div class="row">
          <label class="field grow"><span>Daily target</span><input name="target" type="number" min="1" max="500" value="${h?.target || 1}"></label>
          <label class="field grow"><span>Unit</span><input name="unit" value="${h?.unit || ''}" maxlength="20" placeholder="glasses"></label>
        </div>
        <label class="field"><span>Time of day</span>
          <select name="dayPart">${PARTS.map(([v, l]) => html`<option value="${v}" ${(h?.dayPart || 'midday') === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        <div class="field"><span>Days (none selected means every day)</span>
          <div class="days" role="group" aria-label="Days">${WEEK.map(([n, l]) => html`<label><input type="checkbox" name="wd" value="${n}" ${days.has(n) ? 'checked' : ''}><span aria-label="${l}">${l[0]}</span></label>`)}</div></div>
        <label class="check"><input type="checkbox" name="remind" ${h?.reminderMinutes != null ? 'checked' : ''}> Remind me</label>
        <label class="field"><span>Reminder time</span><input type="time" name="time" value="${minutesToHHMM(h?.reminderMinutes ?? 9 * 60)}"></label>
        <p class="help">Reminders are added to your iPhone Calendar from Settings.</p>
        <button class="btn block" type="submit">Save</button>
        ${h ? html`<button class="btn danger block" style="margin-top:10px" type="button" data-action="habit.delete" data-id="${h.id}">Delete habit</button>` : ''}
      </form>`
  };
}

forms['habit.save'] = async (data) => {
  const existing = state.habits.find((h) => h.id === data.get('id'));
  const selected = data.getAll('wd').map(Number);
  const isCount = data.get('isCount') === 'on';
  await upsert('habits', {
    id: existing?.id,
    name: String(data.get('name')).trim(),
    isCount,
    target: isCount ? Math.max(1, Number(data.get('target')) || 1) : 1,
    unit: isCount ? String(data.get('unit') || '').trim() : '',
    dayPart: data.get('dayPart'),
    weekdays: selected.length === 7 ? [] : selected,
    reminderMinutes: data.get('remind') === 'on' ? hhmmToMinutes(data.get('time')) : null,
    sortOrder: existing ? existing.sortOrder : state.habits.length
  });
  toast('Habit saved');
  go('#/settings/habits');
};

actions['habit.delete'] = async (el) => {
  if (!confirm('Delete this habit and its history?')) return;
  await deleteHabit(el.dataset.id);
  go('#/settings/habits');
};

// ---------- Categories ----------
export function categoriesView() {
  const list = [...state.categories].sort(byOrder);
  const money = (n) => formatMoney(n, state.settings.currency);
  return {
    tab: 'money',
    subpage: true,
    html: html`
      ${header({ title: 'Categories', back: 'Settings', variant: 'short' })}
      <div class="pad stack" style="margin-top:14px">
        <div class="list">${list.map((c) => html`<button class="li" data-action="category.edit" data-id="${c.id}">
          <span class="grow title">${c.name}</span><span class="muted small">${c.budget > 0 ? money(c.budget) : 'No budget'}</span></button>`)}</div>
        <button class="dashed" data-action="category.edit" data-id="">+ Add a category</button>
        <p class="foot">Deleting a category keeps its transactions; they show as Uncategorized.</p>
      </div>`
  };
}

actions['category.edit'] = (el) => {
  const c = state.categories.find((x) => x.id === el.dataset.id);
  openSheet(html`
    <h2>${c ? 'Edit category' : 'New category'}</h2>
    <form data-form="category.save" class="stack" style="margin-top:12px" autocomplete="off">
      <input type="hidden" name="id" value="${c?.id || ''}">
      <label class="field"><span>Name</span><input name="name" value="${c?.name || ''}" required maxlength="50"></label>
      <label class="field"><span>Monthly budget (${state.settings.currency})</span><input name="budget" inputmode="numeric" value="${c?.budget || ''}" placeholder="0"></label>
      <button class="btn block" type="submit">Save</button>
      ${c ? html`<button class="btn danger block" type="button" data-action="category.delete" data-id="${c.id}">Delete category</button>` : ''}
    </form>`, 'Category');
};

forms['category.save'] = async (data) => {
  const existing = state.categories.find((c) => c.id === data.get('id'));
  await upsert('categories', {
    id: existing?.id,
    name: String(data.get('name')).trim(),
    budget: toInt(data.get('budget')),
    sortOrder: existing ? existing.sortOrder : state.categories.length
  });
  closeSheet();
};

actions['category.delete'] = async (el) => {
  if (!confirm('Delete this category? Its transactions are kept as Uncategorized.')) return;
  await deleteCategory(el.dataset.id);
  closeSheet();
};
