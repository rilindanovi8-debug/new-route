import { html, formatMoney, toInt, parseDay, fmtShortDate } from '../util.js';
import { actions, forms, header, bar, openSheet, closeSheet, toast } from '../ui.js';
import { state, categorySpent, monthSpent, totalBudget, categoryName, byOrder, upsert, remove } from '../store.js';

const money = (n) => formatMoney(n, state.settings.currency);

function txRow(t) {
  const label = t.note || (t.type === 'income' ? 'Income' : 'Expense');
  const cat = t.type === 'income' ? 'Income' : categoryName(t.categoryId) || 'Uncategorized';
  return html`<button class="li" data-action="tx.open" data-id="${t.id}">
    <span class="grow"><span class="title">${label}</span><br><span class="muted small">${cat} · ${fmtShortDate(parseDay(t.day))}</span></span>
    <span class="end">${t.type === 'income' ? '+' : '-'}${money(t.amount)}</span></button>`;
}

const recent = () => [...state.transactions].sort((a, b) => (b.day + b.id).localeCompare(a.day + a.id));

export function moneyView() {
  const budget = totalBudget();
  const spent = monthSpent();
  const left = budget - spent;
  const month = new Date().toLocaleDateString([], { month: 'long', year: 'numeric' });
  const list = recent();

  return {
    tab: 'money',
    fab: true,
    html: html`
      ${header({ title: 'Money', subtitle: month, variant: 'sky' })}
      <div class="pad stack gap-lg overlap">
        <div class="card float stack" style="gap:6px">
          <span class="small bold muted">Left to spend this month</span>
          <span style="font-size:32px; font-weight:800">${budget > 0 ? money(left) : 'Set your budgets'}</span>
          ${bar(budget ? spent / budget : 0, { onMist: true, thick: true })}
          <div class="row between small bold muted"><span>${money(spent)} spent</span><span>${money(budget)} budget</span></div>
          ${state.settings.income > 0 ? html`<span class="small bold muted">Monthly income ${money(state.settings.income)}</span>` : ''}
        </div>

        <section class="stack">
          <span class="label">Categories</span>
          ${[...state.categories].sort(byOrder).map((c) => {
            const used = categorySpent(c.id);
            const ratio = c.budget > 0 ? used / c.budget : 0;
            return html`<button class="card stack" style="gap:8px" data-action="budget.edit" data-id="${c.id}">
              <span class="row between"><span class="bold">${c.name}</span>
                <span class="small bold" style="color:${ratio >= 0.8 ? 'var(--clay-deep)' : 'var(--muted)'}">${c.budget > 0 ? `${money(used)} of ${money(c.budget)}` : 'Set budget'}</span></span>
              ${bar(ratio)}</button>`;
          })}
        </section>

        <section class="stack">
          <span class="label">Recent</span>
          <div class="list">${list.length ? list.slice(0, 8).map(txRow) : html`<div class="empty">Nothing logged yet. Tap + to add an expense or income.</div>`}</div>
          ${list.length > 8 ? html`<a class="linkbtn" href="#/money/all">See all ${list.length}</a>` : ''}
          <button class="linkbtn" data-action="csv.export">Export transactions as CSV</button>
        </section>
      </div>`
  };
}

export function allTransactionsView() {
  const list = recent();
  return {
    tab: 'money',
    subpage: true,
    html: html`
      ${header({ title: 'All transactions', back: 'Money', variant: 'sky short' })}
      <div class="pad" style="margin-top:14px"><div class="list">${list.length ? list.map(txRow) : html`<div class="empty">Nothing logged yet.</div>`}</div></div>`
  };
}

actions['budget.edit'] = (el) => {
  const c = state.categories.find((x) => x.id === el.dataset.id);
  if (!c) return;
  openSheet(html`
    <h2>${c.name}</h2>
    <p class="lead">Monthly budget in ${state.settings.currency}. Leave 0 for no budget.</p>
    <form data-form="budget.save" class="stack" autocomplete="off">
      <input type="hidden" name="id" value="${c.id}">
      <label class="field"><span>Monthly budget</span><input name="budget" inputmode="numeric" value="${c.budget || ''}" placeholder="0"></label>
      <button class="btn block" type="submit">Save</button>
    </form>`, 'Budget');
};

forms['budget.save'] = async (data) => {
  const c = state.categories.find((x) => x.id === data.get('id'));
  if (!c) return;
  await upsert('categories', { ...c, budget: toInt(data.get('budget')) });
  closeSheet();
};

actions['tx.open'] = (el) => {
  const t = state.transactions.find((x) => x.id === el.dataset.id);
  if (!t) return;
  openSheet(html`
    <h2>${t.note || (t.type === 'income' ? 'Income' : 'Expense')}</h2>
    <p class="lead">${t.type === 'income' ? '+' : '-'}${money(t.amount)} · ${fmtShortDate(parseDay(t.day))}${t.type === 'expense' ? ' · ' + (categoryName(t.categoryId) || 'Uncategorized') : ''}</p>
    <button class="btn danger block" data-action="tx.delete" data-id="${t.id}">Delete</button>
    <button class="btn ghost block" style="margin-top:8px" data-action="sheet.close">Close</button>`, 'Transaction');
};

actions['tx.delete'] = async (el) => {
  await remove('transactions', el.dataset.id);
  closeSheet();
  toast('Deleted');
};
