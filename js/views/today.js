import { html, isoDay, fmtLongDate, fmtWeekdayTime, formatMoney } from '../util.js';
import { actions, header, ring, bar, icons } from '../ui.js';
import {
  state, scheduledOn, habitValue, setHabitValue, moodOn, apptDate, categorySpent
} from '../store.js';
import { openMoodSheet } from './quickadd.js';

const PARTS = [['morning', 'Morning'], ['midday', 'Midday'], ['evening', 'Evening']];

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour < 18 && hour >= 12) return 'Good afternoon';
  return 'Good evening';
}

/** The next appointment within 24 hours. Wording stays neutral: no provider type or name. */
function soonAppointment() {
  const now = Date.now();
  return state.appointments
    .map((a) => ({ a, t: apptDate(a).getTime() }))
    .filter(({ t }) => t > now && t < now + 86400000)
    .sort((x, y) => x.t - y.t)[0]?.a;
}

function hotCategory() {
  return state.categories
    .filter((c) => c.budget > 0)
    .map((c) => ({ c, ratio: categorySpent(c.id) / c.budget }))
    .filter(({ ratio }) => ratio >= 0.8)
    .sort((x, y) => y.ratio - x.ratio)[0];
}

function row(item) {
  const check = item.done ? icons.check : '';
  if (item.kind === 'mood') {
    return html`<div class="item ${item.done ? 'done' : ''}">
      <button class="item-main" data-action="mood.open" aria-pressed="${item.done}">
        <span class="chk">${check}</span>
        <span><span class="item-title">Mood check-in</span><br><span class="item-sub">${item.done ? 'Logged. Tap to edit' : 'Takes about 10 seconds'}</span></span>
      </button>
    </div>`;
  }
  const { h, value } = item;
  return html`<div class="item ${item.done ? 'done' : ''}">
    <button class="item-main" data-action="habit.toggle" data-id="${h.id}" aria-pressed="${item.done}">
      <span class="chk">${check}</span>
      <span><span class="item-title">${h.name}</span>${h.isCount ? html`<br><span class="item-sub">${value} of ${h.target} ${h.unit}</span>` : ''}</span>
    </button>
    ${h.isCount && !item.done ? html`<button class="plus-btn" data-action="habit.inc" data-id="${h.id}" aria-label="Add one to ${h.name}">+</button>` : ''}
  </div>`;
}

export function todayView() {
  const day = isoDay();
  const items = scheduledOn(day).map((h) => {
    const value = habitValue(h.id, day);
    return { kind: 'habit', h, part: h.dayPart, value, done: value >= h.target };
  });
  items.push({ kind: 'mood', part: 'evening', done: !!moodOn(day) });

  const doneCount = items.filter((i) => i.done).length;
  const progress = items.length ? doneCount / items.length : 0;
  const soon = soonAppointment();
  const hot = hotCategory();

  return {
    tab: 'today',
    fab: true,
    html: html`
      ${header({ title: greeting(), subtitle: fmtLongDate(new Date()) })}
      <div class="pad stack overlap">
        <div class="card float ring-card">
          ${ring(progress)}
          <div class="grow"><div class="big">${doneCount} of ${items.length} done</div><div class="muted small">One small step at a time.</div></div>
        </div>

        ${soon ? html`<a class="card mist" href="#/care">
          <span aria-hidden="true">${icons.calendar}</span>
          <span class="grow"><span class="bold">Appointment ${new Date(apptDate(soon)).toDateString() === new Date().toDateString() ? 'today' : 'tomorrow'}</span><br><span class="muted small">${fmtWeekdayTime(apptDate(soon))}</span></span>
          ${icons.chevron}</a>` : ''}

        ${hot ? html`<a class="card" href="#/money">
          <span class="grow"><span class="bold">${hot.c.name}</span><br><span class="muted small">${Math.round(hot.ratio * 100)}% of this month's budget used</span>${bar(hot.ratio)}</span></a>` : ''}

        ${PARTS.map(([key, title]) => {
          const list = items.filter((i) => i.part === key);
          return list.length ? html`<section class="stack"><span class="label">${title}</span>${list.map(row)}</section>` : '';
        })}
      </div>`
  };
}

actions['habit.toggle'] = (el) => {
  const habit = state.habits.find((h) => h.id === el.dataset.id);
  if (!habit) return;
  const day = isoDay();
  return setHabitValue(habit, day, habitValue(habit.id, day) >= habit.target ? 0 : habit.target);
};

actions['habit.inc'] = (el) => {
  const habit = state.habits.find((h) => h.id === el.dataset.id);
  if (!habit) return;
  const day = isoDay();
  return setHabitValue(habit, day, Math.min(habit.target, habitValue(habit.id, day) + 1));
};

actions['mood.open'] = () => openMoodSheet();
