import { html, toInt, minutesToHHMM, hhmmToMinutes, digits } from '../util.js';
import { actions, forms, go, toast, isStandalone } from '../ui.js';
import { state, setSettings, upsert, deleteHabit, byOrder } from '../store.js';
import { setPin } from '../lock.js';
import { CURRENCIES } from './settings.js';

const TITLES = ['Welcome', 'Your money', 'Your habits', 'Reminders', 'Privacy', 'Emergency contact'];
let step = 0;

export function onboardingView() {
  const s = state.settings;
  const last = step === TITLES.length - 1;
  const body = [welcome, money, habits, reminders, privacy, emergency][step](s);

  return {
    tab: '',
    chrome: false,
    html: html`
      <header class="hdr" style="position:relative">
        <button class="skip" data-action="ob.skip">Skip setup</button>
        <div class="sub">Step ${step + 1} of ${TITLES.length}</div>
        <h1>${TITLES[step]}</h1>
        <div class="steps" aria-hidden="true">${TITLES.map((_, i) => html`<i class="${i <= step ? 'on' : ''}"></i>`)}</div>
      </header>
      <form data-form="ob.next" class="pad" style="margin-top:20px" autocomplete="off" novalidate>
        ${body}
        <div class="sticky-foot">
          ${step > 0 ? html`<button class="btn ghost" type="button" data-action="ob.back">Back</button>` : ''}
          <button class="btn" type="submit">${last ? 'Finish' : 'Next'}</button>
        </div>
      </form>`
  };
}

const welcome = (s) => html`
  <div class="stack">
    <p>A calm place for your habits, mood, money and care. Everything stays on this phone.</p>
    <p class="muted">Setup takes about a minute and you can change everything later in Settings.</p>
    <label class="field"><span>Currency</span>
      <select name="currency">${CURRENCIES.map((c) => html`<option ${c === s.currency ? 'selected' : ''}>${c}</option>`)}</select></label>
    ${!isStandalone() ? html`<div class="banner">To install: tap the Share button in Safari, then "Add to Home Screen". This makes New Route open like an app and protects your data from being cleared.</div>` : ''}
  </div>`;

const money = (s) => html`
  <p class="muted" style="margin-bottom:14px">Set a monthly limit for each category, or leave it blank and add budgets later.</p>
  <label class="field"><span>Monthly income (optional)</span><input name="income" inputmode="numeric" value="${s.income || ''}"></label>
  ${[...state.categories].sort(byOrder).map((c) => html`<label class="field"><span>${c.name}</span><input name="budget_${c.id}" inputmode="numeric" value="${c.budget || ''}"></label>`)}
  <label class="check"><input type="checkbox" name="budgetAlerts" ${s.budgetAlerts ? 'checked' : ''}> Warn me at 80% and 100% of a budget</label>`;

const habits = () => html`
  <p class="muted" style="margin-bottom:14px">Choose what to track. You can add your own, set days and reminder times later in Settings.</p>
  ${[...state.habits].sort(byOrder).map((h) => html`<label class="check card mist" style="padding:12px 16px">
    <input type="checkbox" name="keep_${h.id}" checked><span class="grow">${h.name}<br><span class="muted small">${h.isCount ? `${h.target} ${h.unit}` : 'Yes or no'}</span></span></label>`)}`;

const reminders = (s) => html`
  <p class="muted" style="margin-bottom:14px">Gentle and few. A web app can't send alerts while it is closed, so reminders go into your iPhone Calendar. You'll add them from Settings at the end.</p>
  <label class="check"><input type="checkbox" name="checkIns" ${s.checkIns ? 'checked' : ''}> Daily check-ins</label>
  <div class="row"><label class="field grow"><span>Morning plan</span><input type="time" name="morning" value="${minutesToHHMM(s.morningMinutes)}"></label>
    <label class="field grow"><span>Evening reflection</span><input type="time" name="evening" value="${minutesToHHMM(s.eveningMinutes)}"></label></div>
  <label class="check"><input type="checkbox" name="habitNudges" ${s.habitNudges ? 'checked' : ''}> Habit nudges</label>
  <div class="row"><label class="field grow"><span>Quiet hours start</span><input type="time" name="quietStart" value="${minutesToHHMM(s.quietStart)}"></label>
    <label class="field grow"><span>Quiet hours end</span><input type="time" name="quietEnd" value="${minutesToHHMM(s.quietEnd)}"></label></div>`;

const privacy = () => html`
  <p class="muted" style="margin-bottom:14px">Optional. A PIN keeps people with your unlocked phone out of New Route, and gives Care its own lock. It does not encrypt the data on the phone.</p>
  <label class="field"><span>PIN (4 to 6 digits, optional)</span><input type="password" name="pin" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
  <label class="field"><span>Repeat PIN</span><input type="password" name="pin2" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
  <p class="red small" id="ob-error" role="alert"></p>`;

const emergency = (s) => html`
  <p class="muted" style="margin-bottom:14px">Someone you can reach on WhatsApp in a hard moment. You can add more contacts and write prebuilt messages later.</p>
  <label class="field"><span>Name</span><input name="cname"></label>
  <label class="field"><span>Relationship</span><input name="crelation"></label>
  <label class="field"><span>WhatsApp number, with country code</span><input name="cnumber" type="tel" inputmode="tel" placeholder="+62 ..."></label>
  <label class="field"><span>Local emergency number (phone)</span><input name="enumber" type="tel" inputmode="tel" value="${s.emergencyNumber}"></label>`;

// ---------- Step handling ----------
const collected = {};

forms['ob.next'] = async (data) => {
  if (step === 4) {
    const pin = String(data.get('pin') || '');
    if (pin) {
      const error = document.getElementById('ob-error');
      if (!/^\d{4,6}$/.test(pin)) { error.textContent = 'Use 4 to 6 digits, or leave it blank to skip.'; return; }
      if (pin !== String(data.get('pin2') || '')) { error.textContent = 'The PINs do not match.'; return; }
    }
  }
  // Replace this step's earlier answers so a box the user unticked stays unticked.
  Object.keys(collected).filter((k) => k.startsWith(`${step}:`)).forEach((k) => delete collected[k]);
  Object.assign(collected, Object.fromEntries([...data.entries()].map(([k, v]) => [`${step}:${k}`, v])));
  collected[`seen${step}`] = true;

  if (step < TITLES.length - 1) {
    step++;
    rerender();
    return;
  }
  await finish();
};

const rerender = () => window.dispatchEvent(new Event('nr:rerender'));

actions['ob.back'] = () => { if (step > 0) { step--; rerender(); } };

actions['ob.skip'] = async () => {
  await setSettings({ onboarded: true, checkIns: false, habitNudges: false, budgetAlerts: false });
  step = 0;
  go('#/today');
};

const get = (name, s = step) => collected[`${s}:${name}`];
const checked = (name, s) => get(name, s) === 'on';

async function finish() {
  const patch = { onboarded: true };
  if (collected.seen0) patch.currency = get('currency', 0) || state.settings.currency;

  if (collected.seen1) {
    patch.income = toInt(get('income', 1));
    patch.budgetAlerts = checked('budgetAlerts', 1);
    for (const c of state.categories) {
      const value = get(`budget_${c.id}`, 1);
      if (value !== undefined) await upsert('categories', { ...c, budget: toInt(value) }, true);
    }
  }

  if (collected.seen2) {
    for (const h of [...state.habits]) {
      if (!checked(`keep_${h.id}`, 2)) await deleteHabit(h.id);
    }
  }

  if (collected.seen3) {
    patch.checkIns = checked('checkIns', 3);
    patch.habitNudges = checked('habitNudges', 3);
    patch.morningMinutes = hhmmToMinutes(get('morning', 3));
    patch.eveningMinutes = hhmmToMinutes(get('evening', 3));
    patch.quietStart = hhmmToMinutes(get('quietStart', 3));
    patch.quietEnd = hhmmToMinutes(get('quietEnd', 3));
  }

  const pin = String(get('pin', 4) || '');
  if (pin) await setPin(pin), (patch.appLock = true);

  const name = String(get('cname', 5) || '').trim();
  const number = String(get('cnumber', 5) || '');
  if (name && digits(number)) {
    await upsert('contacts', {
      name, relation: String(get('crelation', 5) || '').trim(), number: number.trim(),
      primary: state.contacts.length === 0, sortOrder: state.contacts.length
    }, true);
  }
  if (collected.seen5) patch.emergencyNumber = String(get('enumber', 5) || '').trim();

  await setSettings(patch);
  step = 0;
  Object.keys(collected).forEach((k) => delete collected[k]);
  toast('All set. Add your reminders from Settings when you are ready.', 5000);
  go('#/today');
}
