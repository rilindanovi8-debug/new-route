// App shell: boots storage, routes between views, and wires up events.
import { init, state, subscribe } from './store.js';
import { actions, changes, forms, toast, closeSheet, sheetOpen, go } from './ui.js';
import {
  isAppLocked, lockApp, unlockApp, careIsUnlocked, startCareGrace, requireCare, detectBiometrics, lockVisible
} from './lock.js';

import { todayView } from './views/today.js';
import { wellbeingView } from './views/wellbeing.js';
import { careView, appointmentView } from './views/care.js';
import { emergencyView } from './views/emergency.js';
import { moneyView, allTransactionsView } from './views/money.js';
import { insightsView } from './views/insights.js';
import { settingsView, habitsView, habitFormView, categoriesView } from './views/settings.js';
import { onboardingView } from './views/onboarding.js';
import { backupView } from './views/backup.js';

const view = document.getElementById('view');
let wasCare = false;
let lastKey = '';

/** Maps the URL hash to a view. Returns null if the route is blocked (Care while locked). */
function resolve() {
  const parts = (location.hash || '#/today').replace(/^#\/?/, '').split('/');
  const [root, a, b] = parts;

  if (!state.settings.onboarded && root !== 'onboarding') { location.replace('#/onboarding'); return null; }

  const inCare = root === 'care';
  if (wasCare && !inCare) startCareGrace();
  wasCare = inCare;

  switch (root) {
    case 'onboarding': return onboardingView();
    case 'wellbeing': return wellbeingView();
    case 'money': return a === 'all' ? allTransactionsView() : moneyView();
    case 'insights': return insightsView();
    case 'emergency': return emergencyView();
    case 'care':
      if (!careIsUnlocked()) {
        if (!lockVisible()) requireCare(() => render(true), () => go('#/wellbeing'));
        return { tab: 'wellbeing', subpage: true, html: '' };
      }
      return a === 'appt' ? appointmentView(b) : careView();
    case 'settings':
      if (a === 'habits') return b ? habitFormView(b) : habitsView();
      if (a === 'categories') return categoriesView();
      if (a === 'backup') return backupView();
      return settingsView();
    case 'today':
    default: return todayView();
  }
}

function render(resetScroll = false) {
  if (!state.ready) return;
  const result = resolve();
  if (!result) return;

  const key = location.hash;
  const keepScroll = !resetScroll && key === lastKey ? view.scrollTop : 0;
  lastKey = key;

  view.innerHTML = result.html.toString();
  view.scrollTop = keepScroll;
  view.classList.toggle('with-fab', !!result.fab);

  document.body.classList.toggle('subpage', !!result.subpage);
  document.body.classList.toggle('no-chrome', result.chrome === false);
  document.getElementById('fab').hidden = !result.fab;
  document.querySelectorAll('#tabs a').forEach((a) => {
    const active = a.dataset.tab === result.tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

let queued = false;
const scheduleRender = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
};

// ---------- Events ----------
async function run(handler, ...args) {
  try {
    await handler(...args);
  } catch (error) {
    console.error(error);
    toast('Something went wrong. Please try again.');
  }
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const handler = actions[el.dataset.action];
  if (!handler) return;
  // Links keep their normal behaviour (opening WhatsApp, etc.); buttons don't submit forms by accident.
  if (el.tagName !== 'A') event.preventDefault();
  run(handler, el, event);
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  const handler = el && changes[el.dataset.change];
  if (handler) run(handler, el, event);
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  const handler = form && forms[form.dataset.form];
  if (!handler) return;
  event.preventDefault();
  run(handler, new FormData(form), form);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sheetOpen()) closeSheet();
});

window.addEventListener('hashchange', () => render(true));
window.addEventListener('nr:rerender', () => render(true));

// Lock again whenever the app goes to the background.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    if (state.settings.appLock && state.settings.pinHash) lockApp();
  } else if (isAppLocked()) {
    await unlockApp();
  }
});

// ---------- Boot ----------
async function boot() {
  try {
    await init();
  } catch (error) {
    console.error(error);
    view.innerHTML = '<div style="padding:32px"><h2>New Route can\'t open its storage</h2><p>Private browsing or a storage restriction may be blocking it. Open New Route in a normal Safari tab.</p></div>';
    return;
  }
  detectBiometrics();
  navigator.storage?.persist?.().catch(() => {});

  subscribe(scheduleRender);
  if (isAppLocked()) await unlockApp();
  render(true);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
