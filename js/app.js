import { initDB, dbGetAll, dbGet, dbPut } from './db.js';
import { ensureSeeded } from './programmes.js';
import { ensurePRBackfill } from './pr-detect.js';
import { icon } from './icons.js';
import { renderToday } from './today.js';
import { renderWorkout } from './workout.js';
import { renderRunning } from './running.js';
import { renderBodyScan } from './bodyscan.js';
import { renderProgress } from './progress.js';
import { renderPRBoard } from './prs.js';
import { renderReminders, scheduleAllReminders } from './reminders.js';
import { renderSettings } from './settings.js';

const TABS = [
  { id: 'today',    label: 'home',        title: 'Today',    render: renderToday },
  { id: 'workout',  label: 'dumbbell',    title: 'Train',    render: renderWorkout },
  { id: 'run',      label: 'footprints',  title: 'Run',      render: renderRunning },
  { id: 'body',     label: 'scan',        title: 'Body',     render: renderBodyScan },
  { id: 'progress', label: 'trending-up', title: 'Progress', render: renderProgress },
  { id: 'prs',      label: 'trophy',      title: 'PRs',      render: renderPRBoard },
  { id: 'reminders',label: 'bell',        title: 'Alerts',   render: renderReminders },
  { id: 'settings', label: 'settings',    title: 'Setup',    render: renderSettings },
];

let activeTab = 'today';

async function init() {
  try {
  await initDB();
  await ensureSeeded();
  await ensurePRBackfill();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // When a new SW takes control (after skipWaiting + clients.claim), reload to
    // pick up fresh cached assets. Only reload if there was a previous controller
    // (i.e. this is an update, not a first-time install).
    const prevController = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (prevController) window.location.reload();
    });
  }

  const reminders = await dbGetAll('reminders');
  if (reminders.length) scheduleAllReminders(reminders);

  buildNav();

  const setupDone = await dbGet('settings', 'setup_complete');
  const hasExistingData = (await dbGetAll('workouts')).length > 0 || (await dbGetAll('bodyscans')).length > 0;

  if (!setupDone && !hasExistingData) {
    const { showOnboarding } = await import('./onboarding.js');
    showOnboarding(() => switchTab('today'));
  } else {
    if (!setupDone) await dbPut('settings', { key: 'setup_complete', value: true });
    switchTab('today');
  }
  } catch (err) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="margin-top:2rem;text-align:center">
        <p style="color:var(--danger);margin-bottom:.75rem">Failed to start: ${err.message}</p>
        <button class="btn-primary" onclick="location.reload()">Reload</button>
      </div>`;
    console.error(err);
  }
}

function buildNav() {
  const nav = document.getElementById('main-nav');
  nav.innerHTML = TABS.map(t => `
    <button class="nav-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
      <span class="nav-icon-svg">${icon(t.label)}</span>
      <span class="nav-label">${t.title}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));

  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Loading...</div>';

  document.getElementById('header-title').textContent = tab.title === 'Today' ? 'MyStats' : tab.title;

  tab.render(content).catch(err => {
    content.innerHTML = `<div class="card"><p class="muted">Error: ${err.message}</p></div>`;
    console.error(err);
  });
}

init();
