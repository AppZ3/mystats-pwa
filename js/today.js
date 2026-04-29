import { PROGRAMME_A, PROGRAMME_B, PRE_TRAINING, MOBILITY_SESSIONS } from './profile.js';
import { dbGet, dbPut, dbGetByIndex, dbAdd } from './db.js';
import { getChecklistItems, getMorningRoutine, getSupplements, getProgrammeSchedule, getProgrammeTargets } from './config.js';

// ── Module state ───────────────────────────────────────────────────────────
let sessionLog = {};
let openExercises = new Set();
let todayWorkoutId = null;
let sessionExercises = [];
let selectedDay = new Date().getDay();
let progTargets = {};

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEK_LABELS = ['','Foundation','Intensification','Volume','Deload'];

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Settings helpers ───────────────────────────────────────────────────────
async function getCurrentProgramme() {
  const s = await dbGet('settings', 'programme');
  return s?.value ?? 'A';
}
async function setCurrentProgramme(p) { await dbPut('settings', { key: 'programme', value: p }); }

async function getCurrentWeek() {
  const s = await dbGet('settings', 'current_week');
  if (s?.value) return s.value;
  // fallback: auto from date
  const day = new Date().getDate();
  if (day <= 7) return 1; if (day <= 14) return 2; if (day <= 21) return 3; return 4;
}
async function setCurrentWeek(w) { await dbPut('settings', { key: 'current_week', value: w }); }

async function getSession(programme, day) {
  const schedule = await getProgrammeSchedule(programme);
  const progName = programme === 'A' ? PROGRAMME_A.name : PROGRAMME_B.name;
  return { ...(schedule[day] ?? { label: 'Rest', exercises: [] }), programme: progName };
}

function getMobilityForDay(day) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return MOBILITY_SESSIONS.find(s => s.day === days[day]) || null;
}

// ── DB helpers ─────────────────────────────────────────────────────────────
async function loadTodayLog() {
  const workouts = await dbGetByIndex('workouts', 'date', todayStr());
  const wk = workouts.find(w => w.source === 'today-log');
  if (wk) {
    todayWorkoutId = wk.id;
    sessionLog = {};
    wk.exercises.forEach(ex => {
      sessionLog[ex.name] = { sets: ex.sets || [], notes: ex.notes || '', run: ex.run || null };
    });
  } else {
    todayWorkoutId = null;
    sessionLog = {};
  }
}

async function getTodayChecklist() {
  const saved = await dbGet('checklist', todayStr());
  const items = await getChecklistItems();
  const defaults = Object.fromEntries(items.map(i => [i.key, false]));
  return saved ? { ...defaults, ...saved.items } : defaults;
}
async function saveTodayChecklist(items) { await dbPut('checklist', { date: todayStr(), items }); }

// ── Collect DOM → sessionLog ───────────────────────────────────────────────
function collectSessionLog(container) {
  sessionExercises.forEach((ex, i) => {
    const body = container.querySelector(`#ex-log-body-${i}`);
    if (!body) return;
    if (ex.toLowerCase() === 'run') {
      sessionLog[ex] = { sets: [], notes: '', run: {
        distance: parseFloat(body.querySelector('.run-dist-in')?.value) || null,
        duration: body.querySelector('.run-dur-in')?.value || null,
        avgBPM: parseInt(body.querySelector('.run-bpm-in')?.value) || null,
        notes: body.querySelector('.run-notes-in')?.value || '',
      }};
    } else {
      const sets = [];
      body.querySelectorAll('.actual-set-row').forEach(row => {
        sets.push({
          weight: parseFloat(row.querySelector('.weight-in')?.value) || null,
          reps:   parseInt(row.querySelector('.reps-in')?.value)    || null,
          note:   row.querySelector('.note-in')?.value              || '',
        });
      });
      sessionLog[ex] = { sets, notes: body.querySelector('.actual-ex-notes')?.value || '', run: null };
    }
  });
}

// ── Exercise log row renderers ─────────────────────────────────────────────
function renderExerciseLogRow(ex, i) {
  const isRun = ex.toLowerCase() === 'run';
  const log = sessionLog[ex];
  const hasLog = log && (isRun ? (log.run?.distance || log.run?.duration) : log.sets?.some(s => s.reps || s.weight));
  const isOpen = openExercises.has(i);
  const summary = hasLog
    ? (isRun
        ? [log.run?.distance && log.run.distance + 'km', log.run?.duration, log.run?.avgBPM && log.run.avgBPM + 'bpm'].filter(Boolean).join(' · ')
        : log.sets.filter(s => s.reps || s.weight).length + ' sets')
    : '';

  const target = !isRun ? progTargets[ex] : null;
  const targetStr = target ? `${target.sets || '?'}×${target.reps || '?'}` : '';
  const accuracy = hasLog && target ? getAccuracy(log, target) : null;

  return `
    <div class="ex-log-row" data-idx="${i}">
      <div class="ex-log-header">
        <div class="ex-log-info">
          <span class="plan-tag">Plan</span>
          <span class="ex-log-name">${ex}</span>
          ${targetStr ? `<span class="plan-target">${targetStr}</span>` : ''}
        </div>
        <div class="ex-log-status">
          ${hasLog ? `<span class="badge info">✓ ${summary}</span>` : ''}
          ${accuracy === 'hit'    ? '<span class="badge success">On plan</span>'    : ''}
          ${accuracy === 'close'  ? '<span class="badge warning">Close</span>'       : ''}
          ${accuracy === 'missed' ? '<span class="badge danger">Below plan</span>'   : ''}
          <button class="toggle-ex-log" data-idx="${i}">${isOpen ? 'Close ▲' : 'Log ▼'}</button>
        </div>
      </div>
      ${targetStr && isOpen ? `<div class="plan-target-bar">Target: ${targetStr}</div>` : ''}
      <div class="ex-log-body ${isOpen ? '' : 'hidden'}" id="ex-log-body-${i}">
        ${isRun ? renderRunLog(log?.run || {}) : renderSetsLog(log?.sets || [], log?.notes || '')}
      </div>
    </div>`;
}

function getAccuracy(log, target) {
  const setsLogged = (log.sets || []).filter(s => s.reps || s.weight).length;
  const setsTarget = target.sets || 0;
  if (!setsTarget) return null;

  let minReps = null;
  const repsStr = target.reps || '';
  if (repsStr.includes('-')) {
    minReps = parseInt(repsStr.split('-')[0]);
  } else if (/^\d+$/.test(repsStr)) {
    minReps = parseInt(repsStr);
  }

  const loggedWithReps = (log.sets || []).filter(s => s.reps);
  const avgReps = loggedWithReps.length
    ? loggedWithReps.reduce((sum, s) => sum + s.reps, 0) / loggedWithReps.length
    : null;

  const setsOk = setsLogged >= setsTarget;
  const repsOk = !minReps || avgReps == null || avgReps >= minReps * 0.9;

  if (setsOk && repsOk) return 'hit';
  if (setsLogged >= setsTarget - 1 && (!minReps || avgReps == null || avgReps >= minReps * 0.75)) return 'close';
  return 'missed';
}

function renderSetsLog(sets, notes) {
  if (!sets.length) sets = [{ weight: null, reps: null, note: '' }];
  return `
    <div class="actual-log-area">
      <div class="actual-vs-label"><span class="actual-tag">Actual</span></div>
      <div class="actual-sets-list">
        ${sets.map((s, si) => `
          <div class="actual-set-row" data-si="${si}">
            <span class="set-num">Set ${si + 1}</span>
            <input type="number" class="set-input weight-in" placeholder="kg"   value="${s.weight || ''}" step="0.5" min="0">
            <span class="set-sep">×</span>
            <input type="number" class="set-input reps-in"   placeholder="reps" value="${s.reps   || ''}" min="1">
            <input type="text"   class="set-input note-in"   placeholder="note" value="${s.note   || ''}">
            <button class="btn-icon rem-actual-set" data-si="${si}">−</button>
          </div>`).join('')}
      </div>
      <button class="btn-add-set add-actual-set">+ Add Set</button>
      <input type="text" class="input-field actual-ex-notes" placeholder="Exercise notes..." value="${notes}" style="margin-top:.4rem">
    </div>`;
}

function renderRunLog(run) {
  return `
    <div class="actual-log-area">
      <div class="actual-vs-label"><span class="actual-tag">Actual</span></div>
      <div class="form-grid" style="margin-top:.4rem">
        <div class="form-group"><label>Distance (km)</label><input type="number" class="input-field run-dist-in" placeholder="8.5" value="${run.distance || ''}" step="0.01"></div>
        <div class="form-group"><label>Duration</label><input type="text" class="input-field run-dur-in" placeholder="42:30" value="${run.duration || ''}"></div>
        <div class="form-group"><label>Avg BPM</label><input type="number" class="input-field run-bpm-in" placeholder="155" value="${run.avgBPM || ''}"></div>
        <div class="form-group"><label>Notes</label><input type="text" class="input-field run-notes-in" placeholder="How did it feel?" value="${run.notes || ''}"></div>
      </div>
    </div>`;
}

function renderCheckItem(key, label, icon, checked) {
  return `
    <label class="check-item ${checked ? 'done' : ''}">
      <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
      <span>${icon} ${label}</span>
    </label>`;
}

// ── Main render ────────────────────────────────────────────────────────────
export async function renderToday(container) {
  // Only reload from DB if we have no in-memory data (preserves unsaved sets on tab switch)
  if (Object.keys(sessionLog).length === 0) {
    await loadTodayLog();
  }

  const [prog, week, checklistItems, routineSteps, allSupplements] = await Promise.all([
    getCurrentProgramme(),
    getCurrentWeek(),
    getChecklistItems(),
    getMorningRoutine(),
    getSupplements(),
  ]);

  progTargets = await getProgrammeTargets(prog);
  const session = await getSession(prog, selectedDay);
  sessionExercises = session.exercises || [];
  const checklist = await getTodayChecklist();
  const mobility = getMobilityForDay(selectedDay);
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const morningSupps = allSupplements.filter(s => s.timing?.toLowerCase().startsWith('morning'));
  const eveningSupps = allSupplements.filter(s => s.timing?.toLowerCase().includes('evening') || s.timing?.toLowerCase().includes('bed'));

  container.innerHTML = `
    <div class="section-header">
      <h2>${dateStr}</h2>
    </div>

    <!-- Session Control Card -->
    <div class="card session-control-card">
      <div class="card-label">Session Control</div>

      <div class="control-row">
        <span class="control-label">Programme</span>
        <div class="toggle-group compact">
          <button class="toggle-btn ${prog === 'A' ? 'active' : ''}" data-prog="A">A <small>Calisthenics</small></button>
          <button class="toggle-btn ${prog === 'B' ? 'active' : ''}" data-prog="B">B <small>Power & Strength</small></button>
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">Week</span>
        <div class="toggle-group compact">
          ${[1,2,3,4].map(w => `
            <button class="toggle-btn ${week === w ? 'active' : ''}" data-week="${w}">
              ${w} <small>${WEEK_LABELS[w]}</small>
            </button>`).join('')}
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">Day</span>
        <div class="day-selector">
          ${DAY_LABELS.map((label, i) => `
            <button class="day-sel-btn ${selectedDay === i ? 'active' : ''} ${i === new Date().getDay() ? 'today' : ''}" data-day="${i}">
              ${label}
            </button>`).join('')}
        </div>
      </div>

      <div class="week-context-bar">
        <span class="week-badge">Week ${week} — ${WEEK_LABELS[week]}</span>
        <span class="muted">${DAY_LABELS[selectedDay]}, ${session.programme}</span>
      </div>
    </div>

    <!-- Session Card -->
    <div class="card session-card ${sessionExercises.length === 0 ? 'rest-day' : ''}">
      <div class="card-header-row">
        <div class="card-label">Today's Session</div>
        ${todayWorkoutId ? '<span class="badge info">✓ Saved</span>' : ''}
      </div>
      <h3>${session.label || 'Rest Day'}</h3>

      ${sessionExercises.length > 0 ? `
        <div class="ex-log-hint">Tap <strong>Log ▼</strong> next to each exercise to record actual vs plan.</div>
        <div id="exercises-log-list">
          ${sessionExercises.map((ex, i) => renderExerciseLogRow(ex, i)).join('')}
        </div>
        <div class="pre-training-note" style="margin-top:.75rem">
          <span class="badge warning">⚡ Pre-training</span>
          ${PRE_TRAINING.map(p => `<div class="note-item">${p}</div>`).join('')}
        </div>
        <button id="save-today-log" class="btn-primary" style="margin-top:.75rem">
          ${todayWorkoutId ? '✓ Update Session' : 'Save Session'}
        </button>
      ` : '<p class="muted">Rest day. Recover well — gains happen during rest.</p>'}
    </div>

    ${mobility ? `
    <div class="card mobility-card">
      <div class="card-label">Mobility — ${DAY_LABELS[selectedDay]}</div>
      <h3>${mobility.label}</h3>
      <p class="muted">${mobility.duration} · ${mobility.focus}</p>
    </div>` : ''}

    <div class="card">
      <div class="card-label">Daily Checklist</div>
      <div class="checklist" id="today-checklist">
        ${checklistItems.map(item => renderCheckItem(item.key, item.label, item.icon || '', checklist[item.key] || false)).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-label">Morning CARs Routine</div>
      <ul class="routine-list">${routineSteps.map(r => `<li>${r}</li>`).join('')}</ul>
    </div>

    <div class="card">
      <div class="card-label">Morning Supplements</div>
      <ul class="supp-list">
        ${morningSupps.map(s => `
          <li>
            <span>${s.name}</span>
            <span class="badge ${s.withFat ? 'warning' : 'info'}">${s.withFat ? '+ fat' : (s.timing || '').replace(/morning ?/i, '') || 'morning'}</span>
          </li>`).join('')}
      </ul>
    </div>

    <div class="card">
      <div class="card-label">Evening Supplements</div>
      <ul class="supp-list">
        ${eveningSupps.map(s => `
          <li><span>${s.name}</span><span class="badge info">${s.timing || ''}</span></li>`).join('')}
      </ul>
    </div>
  `;

  setupTodayEvents(container);
}

// ── Events ─────────────────────────────────────────────────────────────────
function setupTodayEvents(container) {
  // Programme toggle
  container.querySelectorAll('[data-prog]').forEach(btn => {
    btn.addEventListener('click', async () => {
      openExercises.clear(); sessionLog = {};
      await setCurrentProgramme(btn.dataset.prog);
      renderToday(container);
    });
  });

  // Week selector
  container.querySelectorAll('[data-week]').forEach(btn => {
    btn.addEventListener('click', async () => {
      openExercises.clear(); sessionLog = {};
      await setCurrentWeek(+btn.dataset.week);
      renderToday(container);
    });
  });

  // Day selector — changes which session is shown, no page reload needed
  container.querySelectorAll('.day-sel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newDay = +btn.dataset.day;
      if (newDay === selectedDay) return;
      collectSessionLog(container); // save what we have before switching
      selectedDay = newDay;
      openExercises.clear();
      sessionLog = {};
      renderToday(container);
    });
  });

  // Checklist
  container.querySelectorAll('.check-item input').forEach(input => {
    input.addEventListener('change', async () => {
      const updated = {};
      container.querySelectorAll('.check-item input').forEach(i => { updated[i.dataset.key] = i.checked; });
      await saveTodayChecklist(updated);
      container.querySelectorAll('.check-item').forEach(label => {
        label.classList.toggle('done', label.querySelector('input').checked);
      });
    });
  });

  // Exercise log delegation — use onclick so re-renders replace rather than stack this handler
  container.onclick = e => {
    const toggleBtn = e.target.closest('.toggle-ex-log');
    if (toggleBtn) {
      collectSessionLog(container);
      const idx = +toggleBtn.dataset.idx;
      openExercises.has(idx) ? openExercises.delete(idx) : openExercises.add(idx);
      refreshExerciseList(container);
      return;
    }
    const addSetBtn = e.target.closest('.add-actual-set');
    if (addSetBtn) {
      const row = addSetBtn.closest('.ex-log-row');
      const idx = +row.dataset.idx;
      collectSessionLog(container);
      const ex = sessionExercises[idx];
      if (!sessionLog[ex]) sessionLog[ex] = { sets: [], notes: '', run: null };
      sessionLog[ex].sets.push({ weight: null, reps: null, note: '' });
      openExercises.add(idx);
      refreshExerciseList(container);
      return;
    }
    const remBtn = e.target.closest('.rem-actual-set');
    if (remBtn) {
      const si = +remBtn.dataset.si;
      const row = remBtn.closest('.ex-log-row');
      const idx = +row.dataset.idx;
      collectSessionLog(container);
      const ex = sessionExercises[idx];
      if (sessionLog[ex]?.sets.length > 1) sessionLog[ex].sets.splice(si, 1);
      else if (sessionLog[ex]) sessionLog[ex].sets = [{ weight: null, reps: null, note: '' }];
      openExercises.add(idx);
      refreshExerciseList(container);
      return;
    }
  };

  // Save session
  container.querySelector('#save-today-log')?.addEventListener('click', async () => {
    collectSessionLog(container);
    const exercises = sessionExercises
      .map(name => ({
        name,
        sets: (sessionLog[name]?.sets || []).filter(s => s.weight != null || s.reps != null || s.note),
        notes: sessionLog[name]?.notes || '',
        run: sessionLog[name]?.run || null,
      }))
      .filter(ex => ex.sets.length > 0 || ex.run?.distance || ex.run?.duration || ex.notes);

    const workoutData = { date: todayStr(), source: 'today-log', programme: (await getCurrentProgramme()), day: selectedDay, exercises };
    if (todayWorkoutId) {
      await dbPut('workouts', { id: todayWorkoutId, ...workoutData });
      showToast('Session updated!');
    } else {
      todayWorkoutId = await dbAdd('workouts', workoutData);
      showToast('Session saved!');
    }
    // Sync in-memory state with what was saved
    await loadTodayLog();
    const btn = container.querySelector('#save-today-log');
    if (btn) btn.textContent = '✓ Update Session';
    const headerRow = container.querySelector('.card-header-row');
    if (headerRow && !headerRow.querySelector('.badge')) {
      headerRow.insertAdjacentHTML('beforeend', '<span class="badge info">✓ Saved</span>');
    }
  });
}

function refreshExerciseList(container) {
  const list = container.querySelector('#exercises-log-list');
  if (list) list.innerHTML = sessionExercises.map((ex, i) => renderExerciseLogRow(ex, i)).join('');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
