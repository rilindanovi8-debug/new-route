import { html, isoDay, parseDay } from '../util.js';
import { actions, changes, forms, header, openSheet, closeSheet, toast, saveFile } from '../ui.js';
import { state, exportData, restoreData, setSettings, validateBackup, categoryName } from '../store.js';
import { encryptJson, decryptJson } from '../crypto.js';

let readyFile = null;   // { name, bytes } waiting for the "Save file" tap
let restoreBytes = null; // encrypted file picked for restore
let restoreData_ = null; // decrypted payload waiting for confirmation

const lastBackupText = () =>
  state.settings.lastBackup ? new Date(state.settings.lastBackup).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

export function backupView() {
  return {
    tab: 'wellbeing',
    subpage: true,
    html: html`
      ${header({ title: 'Backup and restore', back: 'Settings', variant: 'short' })}
      <div class="pad stack gap-lg" style="margin-top:14px">
        <section class="stack">
          <span class="label">Encrypted backup</span>
          <div class="list">
            <div class="setting"><span>Last backup</span><span class="muted">${lastBackupText()}</span></div>
            <div class="setting"><button class="plain" data-action="backup.export">Export encrypted backup</button></div>
            <div class="setting"><button class="plain" data-action="backup.import">Restore from a backup</button></div>
          </div>
          <input type="file" id="restore-file" hidden data-change="backup.file" aria-label="Backup file">
          <p class="foot">Includes habits, mood and journal, money, Care appointments and notes, emergency contacts, prebuilt messages and settings. It is protected by a passphrase you choose. If you forget the passphrase the backup cannot be opened, and nobody can recover it for you. Your PIN is never exported.</p>
        </section>

        <section class="stack">
          <span class="label">Spreadsheet</span>
          <div class="list"><div class="setting"><button class="plain" data-action="csv.export">Export transactions as CSV</button></div></div>
          <p class="foot">A plain CSV of your income and expenses. It is not encrypted, so keep it somewhere private.</p>
        </section>

        <section class="stack">
          <span class="label">Keep your data safe</span>
          <p class="foot" style="padding:0">Data lives only in this browser's storage on your phone. Add New Route to your Home Screen so iOS treats it as an app and doesn't clear it, and save a backup file to iCloud Drive regularly.</p>
        </section>
      </div>`
  };
}

// ---------- Export ----------
actions['backup.export'] = () => {
  openSheet(html`
    <h2>Protect your backup</h2>
    <p class="lead">Choose a passphrase of at least 8 characters. Write it down somewhere safe: without it the backup cannot be opened.</p>
    <form data-form="backup.make" class="stack" autocomplete="off">
      <label class="field"><span>Passphrase</span><input type="password" name="pass" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Repeat passphrase</span><input type="password" name="pass2" minlength="8" required autocomplete="new-password"></label>
      <p class="red small" id="backup-error" role="alert"></p>
      <button class="btn block" type="submit">Create backup</button>
    </form>`, 'Create backup');
};

forms['backup.make'] = async (data, form) => {
  const error = document.getElementById('backup-error');
  const pass = String(data.get('pass'));
  if (pass !== String(data.get('pass2'))) { error.textContent = 'The passphrases do not match.'; return; }
  if (pass.length < 8) { error.textContent = 'Use at least 8 characters.'; return; }

  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  button.textContent = 'Encrypting…';
  try {
    const bytes = await encryptJson(exportData(), pass);
    readyFile = { name: `NewRoute-backup-${isoDay()}.newroute`, bytes };
    openSheet(html`
      <h2>Backup ready</h2>
      <p class="lead">Tap Save and choose "Save to Files" (iCloud Drive is a good place). Keep the file and your passphrase safe.</p>
      <button class="btn block" data-action="backup.save">Save file</button>
      <button class="btn ghost block" style="margin-top:8px" data-action="sheet.close">Close</button>`, 'Backup ready');
  } catch (e) {
    error.textContent = 'Could not create the backup. ' + (e.message || '');
    button.disabled = false;
    button.textContent = 'Create backup';
  }
};

actions['backup.save'] = async () => {
  if (!readyFile) return;
  const saved = await saveFile(readyFile.name, 'application/octet-stream', readyFile.bytes);
  if (saved) {
    await setSettings({ lastBackup: Date.now() });
    readyFile = null;
    closeSheet();
    toast('Backup saved');
  }
};

// ---------- Restore ----------
actions['backup.import'] = () => document.getElementById('restore-file')?.click();

changes['backup.file'] = async (el) => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  restoreBytes = await file.arrayBuffer();
  openSheet(html`
    <h2>Open backup</h2>
    <p class="lead">Enter the passphrase you chose when you made this backup.</p>
    <form data-form="backup.open" class="stack" autocomplete="off">
      <label class="field"><span>Passphrase</span><input type="password" name="pass" required autocomplete="current-password"></label>
      <p class="red small" id="backup-error" role="alert"></p>
      <button class="btn block" type="submit">Open</button>
    </form>`, 'Open backup');
};

forms['backup.open'] = async (data, form) => {
  const error = document.getElementById('backup-error');
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  button.textContent = 'Opening…';
  try {
    const payload = await decryptJson(restoreBytes, String(data.get('pass')));
    validateBackup(payload);
    restoreData_ = payload;
    const d = payload.data;
    const when = new Date(payload.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    openSheet(html`
      <h2>Replace all data?</h2>
      <p class="lead">Backup from ${when}: ${(d.habits || []).length} habits, ${(d.moods || []).length} mood entries,
        ${(d.transactions || []).length} transactions, ${(d.appointments || []).length} appointments.
        Everything currently in New Route on this phone will be deleted and replaced.</p>
      <button class="btn danger block" data-action="backup.apply">Replace everything</button>
      <button class="btn ghost block" style="margin-top:8px" data-action="sheet.close">Cancel</button>`, 'Confirm restore');
  } catch (e) {
    error.textContent = e.message || 'Could not open the backup.';
    button.disabled = false;
    button.textContent = 'Open';
  }
};

actions['backup.apply'] = async () => {
  if (!restoreData_) return;
  try {
    await restoreData(restoreData_);
    restoreData_ = null;
    restoreBytes = null;
    closeSheet();
    toast('Restore complete');
  } catch (e) {
    closeSheet();
    toast('Restore failed. Nothing was changed.');
  }
};

// ---------- CSV ----------
const csvCell = (value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function transactionsCsv() {
  const rows = [...state.transactions].sort((a, b) => a.day.localeCompare(b.day));
  const lines = ['date,type,category,amount,note'];
  rows.forEach((t) => {
    lines.push([t.day, t.type, t.type === 'income' ? '' : categoryName(t.categoryId) || '', String(t.amount), t.note || ''].map(csvCell).join(','));
  });
  return lines.join('\n') + '\n';
}

actions['csv.export'] = () => saveFile(`NewRoute-transactions-${isoDay()}.csv`, 'text/csv', transactionsCsv());
