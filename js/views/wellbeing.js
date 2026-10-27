import { html, isoDay, addDays, fmtDateTime } from '../util.js';
import { header, icons } from '../ui.js';
import { state, streak, byOrder, apptDate } from '../store.js';

function lastSevenDays() {
  const today = new Date();
  return [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const date = addDays(today, -back);
    const mood = state.moods.find((m) => m.day === isoDay(date));
    return { date, rating: mood?.rating ?? null };
  });
}

export function primaryContact() {
  return state.contacts.find((c) => c.primary) || [...state.contacts].sort(byOrder)[0];
}

export function nextAppointment() {
  return state.appointments
    .filter((a) => apptDate(a).getTime() > Date.now())
    .sort((a, b) => apptDate(a) - apptDate(b))[0];
}

export function wellbeingView() {
  const next = nextAppointment();
  const contact = primaryContact();

  return {
    tab: 'wellbeing',
    fab: true,
    html: html`
      ${header({ title: 'Wellbeing', subtitle: 'Mood, habits and care', variant: 'gradient short' })}
      <div class="pad stack gap-lg" style="margin-top:-14px; position:relative">
        <div class="card white">
          <div class="row between"><h3>Mood this week</h3><span class="muted small bold">1 to 5</span></div>
          <div class="mood-week">
            ${lastSevenDays().map((d) => html`<div class="mood-day">
              <div class="mood-dot ${d.rating ? '' : 'empty'}">${d.rating ?? ''}</div>
              <small>${d.date.toLocaleDateString([], { weekday: 'narrow' })}</small></div>`)}
          </div>
        </div>

        <section class="stack">
          <span class="label">Habits</span>
          ${state.habits.length ? [...state.habits].sort(byOrder).map((h) => {
            const s = streak(h);
            return html`<div class="card mist row between"><span class="bold">${h.name}</span>${s > 0 ? html`<span class="muted small bold">${s} day streak</span>` : ''}</div>`;
          }) : html`<div class="card mist muted">No habits yet. Add some in Settings.</div>`}
          <a class="linkbtn" href="#/settings/habits">Manage habits</a>
        </section>

        <section class="stack">
          <span class="label">Care</span>
          <a class="card" href="#/care">
            <span class="grow"><span class="bold" style="font-size:17px">Appointments and notes</span><br>
              <span class="muted small">${next ? 'Next: ' + fmtDateTime(apptDate(next)) : 'No upcoming appointments'}</span></span>
            ${icons.lock}</a>
          <a class="card" href="#/emergency">
            <span class="grow"><span class="bold" style="font-size:17px">Emergency: ${contact ? contact.name : 'add a contact'}</span><br>
              <span class="muted small">Your primary contact · WhatsApp call</span></span>
            <span class="btn sm">Call</span></a>
        </section>
      </div>`
  };
}
