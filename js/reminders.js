import { dbAdd, dbPut, dbGetAll, dbDelete } from './db.js';

let editingReminder = null;

const DEFAULT_REMINDERS = [
  { name: 'Morning CARs', time: '07:00', days: [1,2,3,4,5,6,0], enabled: true },
  { name: 'Pre-training Collagen (30 min before)', time: '09:30', days: [1,2,3,5,6], enabled: true },
  { name: 'Morning Supplements', time: '08:00', days: [1,2,3,4,5,6,0], enabled: true },
  { name: 'Peptide Injection (BPC+TB+GHK)', time: '08:30', days: [1,2,3,4,5,6,0], enabled: true },
  { name: 'Pre-training window', time: '10:00', days: [1,2,3,5,6], enabled: true },
  { name: 'Evening Supplements', time: '20:00', days: [1,2,3,4,5,6,0], enabled: true },
  { name: 'GHK-Cu Scalp (PM)', time: '21:00', days: [1,2,3,4,5,6,0], enabled: true },
  { name: 'Wrist Rehab Exercises', time: '19:00', days: [1,2,3,4,5], enabled: true },
  { name: 'Mobility Session', time: '18:00', days: [1,2,4,6], enabled: true },
  { name: 'Magnesium + Evening Stack', time: '21:30', days: [1,2,3,4,5,6,0], enabled: true },
];

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export async function renderReminders(container) {
  const reminders = await dbGetAll('reminders');
  const notifSupported = 'Notification' in window;
  const notifGranted = notifSupported && Notification.permission === 'granted';
  const er = editingReminder;

  const todayDay = new Date().getDay();
  const todayRem = reminders.filter(r => r.enabled && r.days.includes(todayDay)).sort((a,b) => a.time.localeCompare(b.time));

  container.innerHTML = `
    <div class="section-header"><h2>Reminders</h2></div>

    ${!notifSupported ? '<div class="card"><p class="muted">Notifications not supported in this browser.</p></div>' : ''}
    ${notifSupported && !notifGranted ? `<div class="card notif-prompt"><p>Enable browser notifications to get supplement and training reminders.</p><button id="enable-notif" class="btn-primary" style="margin-top:.5rem">Enable Notifications</button></div>` : ''}
    ${notifGranted ? '<div class="card notif-ok"><p class="success">✓ Notifications enabled</p></div>' : ''}

    <div class="card" id="reminder-form-card">
      ${er ? `<div class="editing-banner">✏️ Editing: ${er.name} <button id="cancel-rem-edit" class="btn-cancel">Cancel</button></div>` : ''}
      <div class="card-label">${er ? 'Edit Reminder' : 'Add Reminder'}</div>
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Name</label>
          <input type="text" id="rem-name" class="input-field" placeholder="e.g. Evening Zinc + Ashwagandha" value="${er?.name || ''}">
        </div>
        <div class="form-group">
          <label>Time</label>
          <input type="time" id="rem-time" class="input-field" value="${er?.time || '08:00'}">
        </div>
        <div class="form-group full-width">
          <label>Days</label>
          <div class="day-picker" id="day-picker">
            ${DAY_LABELS.map((d, i) => `
              <button class="day-btn ${(er ? er.days : [0,1,2,3,4,5,6]).includes(i) ? 'active' : ''}" data-day="${i}">${d}</button>
            `).join('')}
          </div>
        </div>
      </div>
      <button id="save-reminder" class="btn-primary">${er ? 'Update Reminder' : 'Add Reminder'}</button>
    </div>

    <div class="card">
      <div class="card-label">Active Reminders</div>
      <div id="reminder-list">
        ${reminders.length === 0 ? '<p class="muted">No reminders yet.</p>' : reminders.map(r => renderReminderItem(r)).join('')}
      </div>
      ${reminders.length === 0 ? `<button id="load-defaults" class="btn-secondary" style="margin-top:.75rem">Load Recommended Reminders</button>` : ''}
    </div>

    <div class="card">
      <div class="card-label">Today's Schedule</div>
      ${todayRem.length === 0 ? '<p class="muted">No reminders for today.</p>' : todayRem.map(r => `
        <div class="schedule-item">
          <span class="schedule-time">${r.time}</span>
          <span>${r.name}</span>
        </div>`).join('')}
    </div>
  `;

  setupReminderEvents(container, reminders);
}

function renderReminderItem(r) {
  return `
    <div class="reminder-item ${r.enabled ? '' : 'disabled'}">
      <div class="reminder-info">
        <strong>${r.name}</strong>
        <div class="reminder-meta">
          <span class="badge info">${r.time}</span>
          <span class="muted">${r.days.map(d => DAY_LABELS[d]).join(', ')}</span>
        </div>
      </div>
      <div class="reminder-actions">
        <label class="toggle">
          <input type="checkbox" class="toggle-rem" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-icon edit-rem" data-id="${r.id}" title="Edit">✏️</button>
        <button class="btn-icon delete-rem" data-id="${r.id}" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function setupReminderEvents(container, reminders) {
  const selectedDays = new Set(editingReminder ? editingReminder.days : [0,1,2,3,4,5,6]);

  container.querySelector('#enable-notif')?.addEventListener('click', async () => {
    if (await Notification.requestPermission() === 'granted') renderReminders(container);
  });

  container.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = +btn.dataset.day;
      selectedDays.has(d) ? selectedDays.delete(d) : selectedDays.add(d);
      btn.classList.toggle('active', selectedDays.has(d));
    });
  });

  container.querySelector('#cancel-rem-edit')?.addEventListener('click', () => {
    editingReminder = null; renderReminders(container);
  });

  container.querySelector('#save-reminder')?.addEventListener('click', async () => {
    const name = container.querySelector('#rem-name').value.trim();
    const time = container.querySelector('#rem-time').value;
    if (!name) { showToast('Enter a reminder name'); return; }
    const days = [...selectedDays].sort();

    if (editingReminder) {
      await dbPut('reminders', { id: editingReminder.id, name, time, days, enabled: editingReminder.enabled });
      editingReminder = null;
      showToast('Reminder updated!');
    } else {
      await dbAdd('reminders', { name, time, days, enabled: true });
      if (Notification.permission === 'granted') scheduleNotification(name, time, days);
      showToast('Reminder added!');
    }
    renderReminders(container);
  });

  container.querySelector('#load-defaults')?.addEventListener('click', async () => {
    for (const r of DEFAULT_REMINDERS) await dbAdd('reminders', r);
    showToast('Default reminders loaded!');
    renderReminders(container);
  });

  container.querySelector('#reminder-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-rem');
    if (editBtn) {
      editingReminder = reminders.find(r => r.id === +editBtn.dataset.id) || null;
      renderReminders(container);
      container.querySelector('#reminder-form-card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const delBtn = e.target.closest('.delete-rem');
    if (delBtn && confirm('Delete this reminder?')) {
      await dbDelete('reminders', +delBtn.dataset.id);
      renderReminders(container);
    }
  });

  container.querySelector('#reminder-list')?.addEventListener('change', async e => {
    const input = e.target.closest('.toggle-rem');
    if (input) {
      const rem = reminders.find(r => r.id === +input.dataset.id);
      if (rem) await dbPut('reminders', { ...rem, enabled: input.checked });
      const item = input.closest('.reminder-item');
      item?.classList.toggle('disabled', !input.checked);
    }
  });
}

function scheduleNotification(name, time, days) {
  if (Notification.permission !== 'granted') return;
  const [h, m] = time.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= new Date()) target.setDate(target.getDate() + 1);
  setTimeout(() => {
    if (days.includes(new Date().getDay())) new Notification('MyStats', { body: name, icon: '/icon-192.png' });
    setInterval(() => {
      if (days.includes(new Date().getDay())) new Notification('MyStats', { body: name, icon: '/icon-192.png' });
    }, 24 * 60 * 60 * 1000);
  }, target - new Date());
}

export function scheduleAllReminders(reminders) {
  reminders.filter(r => r.enabled).forEach(r => scheduleNotification(r.name, r.time, r.days));
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
