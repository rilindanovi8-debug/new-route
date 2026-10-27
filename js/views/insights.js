import { html, raw, isoDay, addDays, parseDay, formatMoney, sum } from '../util.js';
import { header, bar } from '../ui.js';
import { state, scheduledOn, habitValue, byOrder } from '../store.js';

const WEEKDAY = (date) => date.toLocaleDateString([], { weekday: 'short' });
const money = (n) => formatMoney(n, state.settings.currency);

function last7() { return [6, 5, 4, 3, 2, 1, 0].map((back) => addDays(new Date(), -back)); }

function moodChart() {
  const days = last7();
  const points = days.map((d, i) => {
    const mood = state.moods.find((m) => m.day === isoDay(d));
    return mood ? { x: 25 + i * 42, y: 90 - (mood.rating - 1) * 20, rating: mood.rating } : null;
  });
  const real = points.filter(Boolean);
  if (!real.length) return html`<p class="muted small">Log your mood with the + button to see your week here.</p>`;

  const line = real.map((p) => `${p.x},${p.y}`).join(' ');
  const label = days.map((d, i) => (points[i] ? `${WEEKDAY(d)} ${points[i].rating}` : `${WEEKDAY(d)} none`)).join(', ');
  return raw(`<svg class="chart" viewBox="0 0 300 120" role="img" aria-label="Mood this week: ${label}">
    ${[10, 50, 90].map((y) => `<line x1="10" x2="290" y1="${y}" y2="${y}" stroke="#ece4da"/>`).join('')}
    <polyline points="${line}" fill="none" stroke="#87a9cc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${real.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#2f2a26" stroke-width="2"/>`).join('')}
    ${days.map((d, i) => `<text x="${25 + i * 42}" y="113" text-anchor="middle">${WEEKDAY(d)}</text>`).join('')}
  </svg>`);
}

function weeklySpend() {
  const now = new Date();
  const weeks = [0, 0, 0, 0, 0];
  state.transactions.forEach((t) => {
    const d = parseDay(t.day);
    if (t.type === 'expense' && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      weeks[Math.min(4, Math.floor((d.getDate() - 1) / 7))] += t.amount;
    }
  });
  const used = weeks.slice(0, Math.min(5, Math.floor((now.getDate() - 1) / 7) + 1));
  const max = Math.max(...used, 1);
  const bars = used.map((v, i) => {
    const h = Math.max(2, (v / max) * 80);
    return `<rect x="${24 + i * 56}" y="${90 - h}" width="40" height="${h}" rx="8" fill="${i === used.length - 1 ? '#ccaa87' : '#c09569'}"/>
      <text x="${44 + i * 56}" y="108" text-anchor="middle">Week ${i + 1}</text>`;
  }).join('');
  const label = used.map((v, i) => `Week ${i + 1}: ${money(v)}`).join(', ');
  return { total: sum(used), svg: raw(`<svg class="chart" viewBox="0 0 300 115" role="img" aria-label="Spending by week this month. ${label}">${bars}</svg>`) };
}

function habitCompletion() {
  return [...state.habits].sort(byOrder).map((h) => {
    let done = 0;
    let scheduled = 0;
    last7().forEach((d) => {
      const key = isoDay(d);
      if (!scheduledOn(key).some((x) => x.id === h.id)) return;
      scheduled++;
      if (habitValue(h.id, key) >= h.target) done++;
    });
    return { h, done, scheduled };
  });
}

/** Average spending on low-mood days (1-2) vs good days (4-5). Needs both groups to say anything. */
function moodSpendLink() {
  const spendByDay = {};
  state.transactions.filter((t) => t.type === 'expense').forEach((t) => { spendByDay[t.day] = (spendByDay[t.day] || 0) + t.amount; });
  const low = [];
  const good = [];
  state.moods.forEach((m) => {
    const spent = spendByDay[m.day] || 0;
    if (m.rating <= 2) low.push(spent); else if (m.rating >= 4) good.push(spent);
  });
  if (low.length < 2 || good.length < 2) return null;
  return { low: sum(low) / low.length, good: sum(good) / good.length };
}

function weeklyReview(completion) {
  const days = last7().map(isoDay);
  const moodDays = state.moods.filter((m) => days.includes(m.day));
  const wins = [];
  const perfect = completion.filter((c) => c.scheduled > 0 && c.done === c.scheduled);
  if (perfect.length) wins.push(`you kept up ${perfect.map((c) => c.h.name).slice(0, 2).join(' and ')} every day`);
  if (moodDays.length >= 4) wins.push(`you checked in on your mood ${moodDays.length} times`);
  const lowest = moodDays.length ? moodDays.reduce((a, b) => (b.rating < a.rating ? b : a)) : null;

  const weakest = completion.filter((c) => c.scheduled > 0).sort((a, b) => a.done / a.scheduled - b.done / b.scheduled)[0];
  const lead = wins.length ? `This week ${wins.join(' and ')}. Nice work.` : 'Every check-in counts, even the small ones.';
  const hard = lowest && lowest.rating <= 2
    ? ` ${parseDay(lowest.day).toLocaleDateString([], { weekday: 'long' })} was a harder day, and that is okay.` : '';
  const idea = weakest && weakest.done < weakest.scheduled
    ? ` One small idea for next week: pick a regular moment for ${weakest.h.name.toLowerCase()}.` : '';
  return lead + hard + idea;
}

export function insightsView() {
  const completion = habitCompletion();
  const spend = weeklySpend();
  const link = moodSpendLink();

  return {
    tab: 'insights',
    fab: true,
    html: html`
      ${header({ title: 'Insights', subtitle: 'This week' })}
      <div class="pad stack overlap">
        <div class="card white"><h3>Mood</h3><div style="margin-top:8px">${moodChart()}</div></div>

        <div class="card white"><h3>Spending by week</h3><p class="muted small">This month so far: ${money(spend.total)}</p><div style="margin-top:8px">${spend.svg}</div></div>

        <div class="card white stack">
          <h3>Habit completion, last 7 days</h3>
          ${completion.length ? completion.map((c) => html`<div>
            <div class="row between small bold"><span>${c.h.name}</span><span class="muted">${c.done} of ${c.scheduled}</span></div>
            ${bar(c.scheduled ? c.done / c.scheduled : 0, { blue: true, onMist: true })}</div>`) : html`<p class="muted small">No habits yet.</p>`}
        </div>

        <div class="card mist stack">
          <h3>Mood and spending</h3>
          ${link ? html`<p>On low-mood days you spent about ${money(link.low)} on average, compared with ${money(link.good)} on better days. This is a pattern, not a verdict.</p>`
            : html`<p class="muted">Log your mood and spending for a couple of weeks and any link between them will show here.</p>`}
        </div>

        <div class="card stack">
          <span class="badge sand" style="align-self:flex-start">Weekly review</span>
          <h3>Your week</h3>
          <p style="line-height:1.5">${weeklyReview(completion)}</p>
        </div>
      </div>`
  };
}
