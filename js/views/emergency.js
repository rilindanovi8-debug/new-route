import { html, digits } from '../util.js';
import { actions, changes, forms, header, openSheet, closeSheet, toast } from '../ui.js';
import { state, upsert, remove, setSettings, byOrder } from '../store.js';
import { primaryContact } from './wellbeing.js';

/** WhatsApp has no link that starts a call: this opens the chat, and you tap the call icon there. */
const chatUrl = (number, text) => {
  const d = digits(number);
  if (!d) return '';
  return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
};

const phoneUrl = (number) => {
  const d = String(number || '').replace(/[^\d+]/g, '');
  return d ? `tel:${d}` : '';
};

export function emergencyView() {
  const contact = primaryContact();
  const contacts = [...state.contacts].sort(byOrder);
  const phone = phoneUrl(state.settings.emergencyNumber);

  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Emergency', subtitle: 'One tap to reach someone', back: 'Wellbeing', variant: 'short' })}
      <div class="pad stack gap-lg" style="margin-top:14px">
        <div class="card sky stack" style="padding:20px; border-radius:24px">
          <span class="small bold" style="letter-spacing:.08em">PRIMARY CONTACT · WHATSAPP</span>
          <span style="font-size:30px; font-weight:800">${contact ? contact.name : 'Add a contact'}</span>
          <span class="small bold">Starts a WhatsApp chat. Tap the call icon there to ring.</span>
          ${contact ? html`<a class="btn dark big block" href="${chatUrl(contact.number)}" target="_blank" rel="noopener">Call now</a>`
            : html`<button class="btn dark big block" data-action="contact.new">Add a contact</button>`}
        </div>

        <div class="card mist row">
          <div class="grow">
            <div class="small bold">Emergency services</div>
            <input class="input" style="min-height:40px; margin-top:4px" type="tel" inputmode="tel" placeholder="Local number"
              value="${state.settings.emergencyNumber}" data-change="emergency.number" aria-label="Local emergency number">
          </div>
          ${phone ? html`<a class="btn sm ghost" style="border-color:var(--header)" href="${phone}">Call by phone</a>` : html`<span class="btn sm ghost" style="opacity:.5">Call by phone</span>`}
        </div>

        <section class="stack">
          <span class="label">Your contacts on WhatsApp</span>
          ${contacts.map((c) => html`<div class="card stack">
            <div class="row">
              <div class="avatar" aria-hidden="true">${(c.name || '?').slice(0, 1).toUpperCase()}</div>
              <div class="grow"><div class="bold" style="font-size:17px">${c.name}</div><div class="muted small">${c.relation ? c.relation + ' · ' : ''}${c.number}</div></div>
              ${c.id === contact?.id ? html`<span class="badge">Primary</span>` : html`<button class="linkbtn" data-action="contact.primary" data-id="${c.id}">Make primary</button>`}
            </div>
            <div class="btn-row">
              <a class="btn sm" href="${chatUrl(c.number)}" target="_blank" rel="noopener">WhatsApp call</a>
              <button class="btn sm ghost" data-action="contact.message" data-id="${c.id}">Send message</button>
            </div>
            <div class="row between"><button class="linkbtn" data-action="contact.edit" data-id="${c.id}">Edit</button>
              <button class="linkbtn" style="color:#b3261e" data-action="contact.delete" data-id="${c.id}">Remove</button></div>
          </div>`)}
          <button class="dashed" data-action="contact.new">+ Add a contact</button>
        </section>

        <section class="stack">
          <span class="label">Prebuilt messages</span>
          ${[...state.templates].sort(byOrder).map((t) => html`<div class="card mist"><div class="small bold muted" style="text-transform:uppercase">${t.label}</div><div>${t.text}</div></div>`)}
          <button class="dashed blue" data-action="template.manage">Add or edit messages</button>
        </section>

        <div class="card small">WhatsApp opens in its own app and needs internet. You always finish the call or press Send yourself in WhatsApp. This screen is not covered by the Care lock.</div>
      </div>`
  };
}

changes['emergency.number'] = (el) => setSettings({ emergencyNumber: el.value.trim() });

function contactSheet(c) {
  openSheet(html`
    <h2>${c ? 'Edit contact' : 'New contact'}</h2>
    <form data-form="contact.save" class="stack" style="margin-top:12px" autocomplete="off">
      <input type="hidden" name="id" value="${c?.id || ''}">
      <label class="field"><span>Name</span><input name="name" value="${c?.name || ''}" required maxlength="60"></label>
      <label class="field"><span>Relationship</span><input name="relation" value="${c?.relation || ''}" maxlength="40"></label>
      <label class="field"><span>WhatsApp number, with country code</span>
        <input name="number" type="tel" inputmode="tel" placeholder="+62 ..." value="${c?.number || ''}" required></label>
      <button class="btn block" type="submit">Save</button>
    </form>`, 'Contact');
}

actions['contact.new'] = () => contactSheet(null);
actions['contact.edit'] = (el) => contactSheet(state.contacts.find((c) => c.id === el.dataset.id));

forms['contact.save'] = async (data) => {
  if (!digits(data.get('number'))) return toast('Enter a phone number');
  const existing = state.contacts.find((c) => c.id === data.get('id'));
  await upsert('contacts', {
    id: existing?.id,
    name: String(data.get('name')).trim(),
    relation: String(data.get('relation') || '').trim(),
    number: String(data.get('number')).trim(),
    primary: existing ? existing.primary : state.contacts.length === 0,
    sortOrder: existing ? existing.sortOrder : state.contacts.length
  });
  closeSheet();
};

actions['contact.primary'] = async (el) => {
  for (const c of state.contacts) await upsert('contacts', { ...c, primary: c.id === el.dataset.id }, true);
  await setSettings({});
};

actions['contact.delete'] = async (el) => {
  const c = state.contacts.find((x) => x.id === el.dataset.id);
  if (!c || !confirm(`Remove ${c.name}?`)) return;
  await remove('contacts', c.id);
  if (c.primary && state.contacts[0]) await upsert('contacts', { ...state.contacts[0], primary: true });
};

actions['contact.message'] = (el) => {
  const c = state.contacts.find((x) => x.id === el.dataset.id);
  if (!c) return;
  openSheet(html`
    <h2>Message ${c.name}</h2>
    <p class="lead">Choose a message. WhatsApp opens with it ready, and you tap Send.</p>
    ${[...state.templates].sort(byOrder).map((t) => html`<a class="choice" href="${chatUrl(c.number, t.text)}" target="_blank" rel="noopener" data-action="sheet.close">${t.text}</a>`)}
    ${state.templates.length ? '' : html`<p class="muted">No messages yet. Add some under "Add or edit messages".</p>`}
    <button class="btn ghost block" data-action="sheet.close">Cancel</button>`, 'Choose a message');
};

actions['template.manage'] = () => {
  openSheet(html`
    <h2>Prebuilt messages</h2>
    <div class="stack" style="margin:12px 0">
      ${[...state.templates].sort(byOrder).map((t) => html`<div class="card mist row">
        <div class="grow"><div class="bold">${t.label}</div><div class="small muted">${t.text}</div></div>
        <button class="linkbtn" style="color:#b3261e" data-action="template.delete" data-id="${t.id}" aria-label="Delete ${t.label}">Delete</button></div>`)}
    </div>
    <form data-form="template.save" class="stack" autocomplete="off">
      <label class="field"><span>Label</span><input name="label" required maxlength="40"></label>
      <label class="field"><span>Message</span><textarea name="text" required maxlength="500"></textarea></label>
      <button class="btn block" type="submit">Add message</button>
    </form>`, 'Prebuilt messages');
};

forms['template.save'] = async (data) => {
  await upsert('templates', { label: String(data.get('label')).trim(), text: String(data.get('text')).trim(), sortOrder: state.templates.length });
  actions['template.manage']();
};

actions['template.delete'] = async (el) => {
  await remove('templates', el.dataset.id);
  actions['template.manage']();
};
