import { html, isoDay, toInt, formatMoney, sum } from '../util.js';
import { actions, forms, openSheet, closeSheet, toast } from '../ui.js';
import { state, upsert, moodOn, categorySpent, isQuietNow } from '../store.js';

export function openQuickAdd() {
  openSheet(html`
    <h2>Quick add</h2>
    <div class="tiles">
      <button class="tile" data-action="qa.expense">Expense</button>
      <button class="tile" data-action="qa.income">Income</button>
      <button class="tile mist" data-action="qa.mood" style="grid-column: span 2">Mood</button>
    </div>`, 'Quick add');
}

export function openTransactionSheet(type) {
  const isExpense = type === 'expense';
  openSheet(html`
    <h2>${isExpense ? 'New expense' : 'New income'}</h2>
    <form data-form="tx.save" class="stack" style="margin-top:12px" autocomplete="off">
      <input type="hidden" name="type" value="${type}">
      <label class="field"><span>Amount (${state.settings.currency})</span>
        <input name="amount" inputmode="numeric" pattern="[0-9.,\\s]*" required placeholder="0"></label>
      ${isExpense ? html`<label class="field"><span>Category</span>
        <select name="categoryId"><option value="">None</option>
          ${[...state.categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => html`<option value="${c.id}">${c.name}</option>`)}
        </select></label>` : ''}
      <label class="field"><span>Note (optional)</span><input name="note" maxlength="120"></label>
      <label class="field"><span>Date</span><input type="date" name="day" value="${isoDay()}" required></label>
      <button class="btn block" type="submit">Save</button>
    </form>`, isExpense ? 'New expense' : 'New income');
}

export function openMoodSheet() {
  const existing = moodOn(isoDay());
  openSheet(html`
    <h2>How are you feeling?</h2>
    <p class="lead">1 is very low, 5 is great.</p>
    <form data-form="mood.save" class="stack" autocomplete="off">
      <fieldset style="border:0;padding:0;margin:0">
        <legend class="sr">Mood from 1 to 5</legend>
        <div class="rating">
          ${[1, 2, 3, 4, 5].map((n) => html`<label><input type="radio" name="rating" value="${n}" ${existing?.rating === n ? 'checked' : ''} ${n === 1 ? 'required' : ''}><span>${n}</span></label>`)}
        </div>
      </fieldset>
      <label class="field" style="margin-top:14px"><span>What went well today? (optional)</span>
        <textarea name="journal" maxlength="2000">${existing?.journal || ''}</textarea></label>
      <button class="btn block" type="submit">Save</button>
    </form>`, 'Mood check-in');
}

actions['qa.open'] = () => openQuickAdd();
actions['qa.expense'] = () => openTransactionSheet('expense');
actions['qa.income'] = () => openTransactionSheet('income');
actions['qa.mood'] = () => openMoodSheet();

/** Warns when an expense takes a category past 80% or 100% of its monthly budget. */
function budgetAlert(transaction) {
  const { settings } = state;
  const category = state.categories.find((c) => c.id === transaction.categoryId);
  if (!settings.budgetAlerts || transaction.type !== 'expense' || !category || !(category.budget > 0)) return;
  const month = new Date();
  if (transaction.day.slice(0, 7) !== isoDay(month).slice(0, 7)) return;

  const after = categorySpent(category.id);
  const before = after - transaction.amount;
  let message = '';
  if (before < category.budget && after >= category.budget) message = `${category.name} budget is used up for the month`;
  else if (before < category.budget * 0.8 && after >= category.budget * 0.8) message = `${category.name} budget is at 80% for the month`;
  if (message && !isQuietNow()) toast(message, 6000);
}

forms['tx.save'] = async (data) => {
  const amount = toInt(data.get('amount'));
  if (amount <= 0) return toast('Enter an amount above zero');
  const transaction = {
    type: data.get('type') === 'income' ? 'income' : 'expense',
    amount,
    categoryId: data.get('categoryId') || null,
    note: String(data.get('note') || '').trim(),
    day: data.get('day') || isoDay()
  };
  await upsert('transactions', transaction);
  closeSheet();
  toast(transaction.type === 'income' ? 'Income saved' : 'Expense saved');
  budgetAlert(transaction);
};

forms['mood.save'] = async (data) => {
  const rating = Number(data.get('rating'));
  if (!(rating >= 1 && rating <= 5)) return toast('Pick a mood from 1 to 5');
  const day = isoDay();
  const existing = moodOn(day);
  await upsert('moods', { id: existing?.id, day, rating, journal: String(data.get('journal') || '').trim(), ts: Date.now() });
  closeSheet();
  toast('Mood saved');
};
