import { html, fmtDateTime, fmtWeekdayTime, uid } from '../util.js';
import { actions, changes, forms, header, icons, openSheet, closeSheet, toast, saveFile, go } from '../ui.js';
import { state, upsert, remove, apptDate } from '../store.js';
import { buildCalendar } from '../ics.js';

const TYPES = ['Psychologist', 'Psychiatrist'];
const toLocalInput = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};

function apptRow(a) {
  return html`<a class="li" href="#/care/appt/${a.id}">
    <span class="grow"><span class="title">${fmtDateTime(apptDate(a))}</span><br>
      <span class="muted small">${a.type}${a.name ? ' · ' + a.name : ''}${a.weekly ? ' · weekly' : ''}</span></span>
    <span class="chev">${icons.chevron}</span></a>`;
}

export function careView() {
  const now = Date.now();
  const sorted = [...state.appointments].sort((a, b) => apptDate(a) - apptDate(b));
  const upcoming = sorted.filter((a) => apptDate(a).getTime() >= now);
  const past = sorted.filter((a) => apptDate(a).getTime() < now).reverse();
  const lockOn = state.settings.careLock && state.settings.pinHash;

  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Care', back: 'Wellbeing', variant: 'short', pill: lockOn ? 'Unlocked' : '' })}
      <div class="pad stack gap-lg" style="margin-top:14px">
        <section class="stack">
          <span class="label">Upcoming</span>
          <div class="list">${upcoming.length ? upcoming.map(apptRow) : html`<div class="empty">No upcoming appointments</div>`}</div>
          <button class="dashed" data-action="appt.new">+ Add appointment</button>
        </section>
        ${past.length ? html`<section class="stack"><span class="label">Past visits</span><div class="list">${past.map(apptRow)}</div></section>` : ''}
        <p class="foot">Your Care notes stay on this phone. Notifications and calendar entries use neutral wording like "Appointment".</p>
      </div>`
  };
}

export function appointmentView(id) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return { subpage: true, tab: 'wellbeing', html: html`${header({ title: 'Not found', back: 'Care' })}<div class="pad empty">This appointment no longer exists.</div>` };

  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Appointment', back: 'Care', variant: 'short' })}
      <div class="pad stack gap-lg" style="margin-top:14px">
        <div class="card mist stack" style="gap:4px">
          <span class="badge" style="align-self:flex-start">${a.type}</span>
          <span class="bold" style="font-size:20px">${fmtWeekdayTime(apptDate(a))}</span>
          ${a.name ? html`<span class="muted">${a.name}</span>` : ''}
          ${a.location ? html`<span class="muted">${/^https?:\/\//i.test(a.location) ? html`<a class="linkbtn" style="padding:0" href="${a.location}" target="_blank" rel="noopener">Open video link</a>` : a.location}</span>` : ''}
          ${a.weekly ? html`<span class="muted small">Repeats weekly</span>` : ''}
          <div class="btn-row" style="margin-top:8px">
            <button class="btn sm ghost" data-action="appt.edit" data-id="${a.id}">Edit</button>
            <button class="btn sm" data-action="appt.calendar" data-id="${a.id}">Add to Calendar</button>
          </div>
        </div>

        <label class="field"><span>Pre-visit notes: topics and questions</span>
          <textarea data-change="appt.field" data-id="${a.id}" data-field="pre" maxlength="5000">${a.pre || ''}</textarea></label>
        <label class="field"><span>Post-visit notes</span>
          <textarea data-change="appt.field" data-id="${a.id}" data-field="post" maxlength="5000">${a.post || ''}</textarea></label>

        <section class="stack">
          <span class="label">Action items</span>
          <div class="list">
            ${(a.items || []).length ? a.items.map((item) => html`<div class="li">
              <button class="item-main" style="padding:0;min-height:44px" data-action="appt.item.toggle" data-id="${a.id}" data-item="${item.id}" aria-pressed="${item.done}">
                <span class="chk" style="${item.done ? 'background:var(--clay-deep)' : ''}">${item.done ? icons.check : ''}</span>
                <span style="${item.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${item.text}</span></button>
              <button class="linkbtn" data-action="appt.item.delete" data-id="${a.id}" data-item="${item.id}" aria-label="Delete ${item.text}">Remove</button>
            </div>`) : html`<div class="empty">Nothing yet</div>`}
          </div>
          <form data-form="appt.item.add" class="row" autocomplete="off">
            <input type="hidden" name="id" value="${a.id}">
            <input class="input grow" name="text" placeholder="Add an action item" required maxlength="200" aria-label="New action item">
            <button class="btn sm" type="submit">Add</button>
          </form>
        </section>

        <button class="btn danger block" data-action="appt.delete" data-id="${a.id}">Delete appointment</button>
      </div>`
  };
}

function apptForm(a) {
  const when = a ? a.at : toLocalInput(new Date(Date.now() + 86400000));
  openSheet(html`
    <h2>${a ? 'Edit appointment' : 'New appointment'}</h2>
    <form data-form="appt.save" class="stack" style="margin-top:12px" autocomplete="off">
      <input type="hidden" name="id" value="${a?.id || ''}">
      <label class="field"><span>Provider</span>
        <select name="type">${TYPES.map((t) => html`<option ${a?.type === t ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label class="field"><span>Provider name (optional)</span><input name="name" value="${a?.name || ''}" maxlength="80"></label>
      <label class="field"><span>When</span><input type="datetime-local" name="at" value="${when}" required></label>
      <label class="field"><span>Location or video link</span><input name="location" value="${a?.location || ''}" maxlength="300"></label>
      <label class="check"><input type="checkbox" name="weekly" ${a?.weekly ? 'checked' : ''}> Repeats weekly</label>
      <button class="btn block" type="submit">Save</button>
    </form>`, 'Appointment');
}

actions['appt.new'] = () => apptForm(null);
actions['appt.edit'] = (el) => apptForm(state.appointments.find((a) => a.id === el.dataset.id));

forms['appt.save'] = async (data) => {
  const existing = state.appointments.find((a) => a.id === data.get('id'));
  const saved = await upsert('appointments', {
    id: existing?.id,
    type: data.get('type'),
    name: String(data.get('name') || '').trim(),
    at: data.get('at'),
    location: String(data.get('location') || '').trim(),
    weekly: data.get('weekly') === 'on',
    pre: existing?.pre || '',
    post: existing?.post || '',
    items: existing?.items || []
  });
  closeSheet();
  toast('Appointment saved. Tap "Add to Calendar" for reminders.');
  if (!existing) go(`#/care/appt/${saved.id}`);
};

changes['appt.field'] = (el) => {
  const a = state.appointments.find((x) => x.id === el.dataset.id);
  if (a) return upsert('appointments', { ...a, [el.dataset.field]: el.value });
};

actions['appt.item.toggle'] = (el) => {
  const a = state.appointments.find((x) => x.id === el.dataset.id);
  if (!a) return;
  return upsert('appointments', { ...a, items: a.items.map((i) => (i.id === el.dataset.item ? { ...i, done: !i.done } : i)) });
};

actions['appt.item.delete'] = (el) => {
  const a = state.appointments.find((x) => x.id === el.dataset.id);
  if (!a) return;
  return upsert('appointments', { ...a, items: a.items.filter((i) => i.id !== el.dataset.item) });
};

forms['appt.item.add'] = (data, form) => {
  const a = state.appointments.find((x) => x.id === data.get('id'));
  const text = String(data.get('text') || '').trim();
  if (!a || !text) return;
  form.reset();
  return upsert('appointments', { ...a, items: [...(a.items || []), { id: uid(), text, done: false }] });
};

actions['appt.delete'] = async (el) => {
  if (!confirm('Delete this appointment and its notes? This cannot be undone.')) return;
  await remove('appointments', el.dataset.id);
  go('#/care');
};

/** Calendar entry with neutral wording and alerts 24 hours and 1 hour before. */
actions['appt.calendar'] = async (el) => {
  const a = state.appointments.find((x) => x.id === el.dataset.id);
  if (!a) return;
  const ics = buildCalendar([{
    uid: `appt-${a.id}`,
    summary: 'Appointment',
    start: apptDate(a),
    minutes: 60,
    repeat: a.weekly ? 'WEEKLY' : undefined,
    weekdays: a.weekly ? [apptDate(a).getDay()] : undefined,
    alarmsBefore: [1440, 60]
  }], 'New Route appointment');
  await saveFile('appointment.ics', 'text/calendar', ics);
};
