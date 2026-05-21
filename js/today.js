import { PROGRAMME_A, PROGRAMME_B, PRE_TRAINING, MOBILITY_SESSIONS } from './profile.js';
import { dbGet, dbPut, dbGetByIndex, dbAdd, esc } from './db.js';
import { getChecklistItems, getMorningRoutine, getSupplements, getProgrammeSchedule, getProgrammeTargets, getProgrammeSession } from './config.js';

// ── Module state ───────────────────────────────────────────────────────────
let blockLog = {};       // {exerciseName: {sets:[{weight,reps,note}], hold, level}, _warmup:bool, '_core:...':bool, _run:{...}, '_circuit:N':bool}
let currentBlocks = [];  // active session blocks
let selectedDay = new Date().getDay();
let todayWorkoutId = null;

// Pending control state — committed on Apply
let pendingProg = null;   // null = use saved value
let pendingWeek = null;
let pendingDay  = null;

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEK_LABELS = ['','Foundation','Intensification','Volume','Deload'];
const WEEK_HINTS  = ['','Base sets and reps as written','Heavier loads, lower reps, advance skill level or +2s to holds','Add 1 extra set to all skill work, moderate weight','Reduce all loads 40-50% — quality skill focus only'];

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
  const day = new Date().getDate();
  if (day <= 7) return 1; if (day <= 14) return 2; if (day <= 21) return 3; return 4;
}
async function setCurrentWeek(w) { await dbPut('settings', { key: 'current_week', value: w }); }

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
    blockLog = {};
    wk.exercises.forEach(ex => {
      if (ex.name === '_warmup')        { blockLog._warmup = ex.done ?? true; }
      else if (ex.name === '_run')      { blockLog._run = ex.run ?? {}; }
      else if (ex.name.startsWith('_circuit:')) { blockLog[ex.name] = ex.done ?? false; }
      else if (ex.name.startsWith('_core:'))    { blockLog[ex.name] = ex.done ?? false; }
      else { blockLog[ex.name] = { sets: ex.sets || [], hold: ex.hold || '', level: ex.level || '' }; }
    });
  } else {
    todayWorkoutId = null;
    blockLog = {};
  }
}

async function getTodayChecklist() {
  const saved = await dbGet('checklist', todayStr());
  const items = await getChecklistItems();
  const defaults = Object.fromEntries(items.map(i => [i.key, false]));
  return saved ? { ...defaults, ...saved.items } : defaults;
}
async function saveTodayChecklist(items) { await dbPut('checklist', { date: todayStr(), items }); }

// ── Serialize blockLog → exercises array for DB ────────────────────────────
function serializeBlockLog() {
  const exercises = [];
  if (blockLog._warmup) exercises.push({ name: '_warmup', done: true, sets: [], notes: '' });
  if (blockLog._run)    exercises.push({ name: '_run', run: blockLog._run, sets: [], notes: '' });
  Object.entries(blockLog).forEach(([key, val]) => {
    if (key === '_warmup' || key === '_run') return;
    if (key.startsWith('_core:') || key.startsWith('_circuit:')) {
      if (val) exercises.push({ name: key, done: true, sets: [], notes: '' });
      return;
    }
    const sets = (val.sets || []).filter(s => s.weight != null || s.reps != null || s.note);
    if (sets.length > 0 || val.hold || val.level) {
      exercises.push({ name: key, sets, notes: '', hold: val.hold || '', level: val.level || '' });
    }
  });
  return exercises;
}

// ── Collect DOM inputs into blockLog ──────────────────────────────────────
function collectBlockLog(container) {
  // Warmup
  blockLog._warmup = container.querySelector('.warmup-done-btn')?.dataset.done === '1';

  // Run/cardio
  const runBlock = container.querySelector('.cardio-block');
  if (runBlock) {
    blockLog._run = {
      distance: parseFloat(runBlock.querySelector('.run-dist-in')?.value) || null,
      duration: runBlock.querySelector('.run-dur-in')?.value || '',
      avgBPM:   parseInt(runBlock.querySelector('.run-bpm-in')?.value) || null,
      notes:    runBlock.querySelector('.run-notes-in')?.value || '',
    };
  }

  // Strength and skill exercises
  container.querySelectorAll('.str-exercise, .skill-exercise').forEach(el => {
    const name = el.dataset.ex;
    if (!name) return;
    const sets = [];
    el.querySelectorAll('.str-set-row').forEach(row => {
      sets.push({
        weight: parseFloat(row.querySelector('.weight-in')?.value) || null,
        reps:   row.querySelector('.reps-in')?.value?.trim() || null,
        note:   row.querySelector('.note-in')?.value || '',
      });
    });
    const hold  = el.querySelector('.skill-hold-in')?.value || '';
    const level = el.querySelector('.skill-level-sel')?.value || '';
    if (sets.length > 0 || hold || level) {
      blockLog[name] = { sets, hold, level };
    }
  });

  // Core items
  container.querySelectorAll('.core-check-item input').forEach(cb => {
    blockLog[`_core:${cb.dataset.item}`] = cb.checked;
  });

  // Circuit rounds
  container.querySelectorAll('.circuit-round-btn').forEach(btn => {
    blockLog[`_circuit:${btn.dataset.round}`] = btn.dataset.done === '1';
  });
}

// ── Block renderers ────────────────────────────────────────────────────────
function renderWarmupBlock(block) {
  const done = !!blockLog._warmup;
  return `
    <div class="session-block warmup-block">
      <div class="block-type-tag type-warmup">Warm-Up</div>
      <ul class="warmup-list">
        ${block.items.map(item => `<li>${esc(item)}</li>`).join('')}
      </ul>
      <button class="warmup-done-btn ${done ? 'is-done' : ''}" data-done="${done ? 1 : 0}">
        ${done ? '✓ Done' : 'Mark Done'}
      </button>
    </div>`;
}

function renderSkillBlock(block) {
  const exercises = block.exercises || [];
  return `
    <div class="session-block skill-block">
      <div class="block-header-row">
        <span class="block-type-tag type-skill">Skill — ${esc(block.name)}</span>
        ${block.note ? `<span class="block-note">${esc(block.note)}</span>` : ''}
      </div>
      ${exercises.map(ex => {
        const log = blockLog[ex.name] || {};
        const setsCount = log.sets?.length || 0;
        return `
          <div class="skill-exercise" data-ex="${esc(ex.name)}">
            <div class="skill-ex-header">
              <span class="skill-ex-name">${esc(ex.name)}</span>
              <span class="skill-ex-target">${esc(String(ex.sets))} × ${esc(ex.target)}${ex.note ? ` <span class="type-note">· ${esc(ex.note)}</span>` : ''}</span>
            </div>
            <div class="skill-ex-inputs">
              <div class="skill-field">
                <label class="skill-lbl">Sets done</label>
                <div class="set-counter">
                  <button class="sc-btn sc-minus" data-ex="${esc(ex.name)}">−</button>
                  <span class="sc-val" data-ex="${esc(ex.name)}">${setsCount}</span>
                  <span class="sc-of">/ ${ex.sets}</span>
                  <button class="sc-btn sc-plus" data-ex="${esc(ex.name)}" data-target="${ex.sets}">+</button>
                </div>
              </div>
              <div class="skill-field">
                <label class="skill-lbl">Best ${ex.target.includes('s') && !ex.target.includes('rep') ? 'hold' : 'result'}</label>
                <input type="text" class="skill-hold-in input-field" placeholder="${esc(ex.target)}" value="${esc(log.hold || '')}" data-ex="${esc(ex.name)}">
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderStrengthBlock(block) {
  const label = block.label || 'Strength';
  const exercises = block.exercises || [];
  return `
    <div class="session-block strength-block">
      <div class="block-type-tag type-strength">${esc(label)}</div>
      ${exercises.map(ex => {
        const log = blockLog[ex.name] || {};
        const existingSets = log.sets || [];
        const targetSets = ex.sets || 3;
        // Build set rows: fill from logged data, pad to target count
        const rows = [];
        for (let i = 0; i < Math.max(targetSets, existingSets.length); i++) {
          const s = existingSets[i] || {};
          rows.push({ weight: s.weight ?? '', reps: s.reps ?? ex.reps ?? '', note: s.note ?? '' });
        }
        return `
          <div class="str-exercise" data-ex="${esc(ex.name)}">
            <div class="str-ex-header">
              <span class="str-ex-name">${esc(ex.name)}</span>
              <span class="str-ex-target">${ex.sets} × ${esc(ex.reps)}</span>
            </div>
            ${ex.note ? `<div class="str-ex-note">${esc(ex.note)}</div>` : ''}
            <div class="str-sets">
              ${rows.map((s, i) => `
                <div class="str-set-row">
                  <span class="set-lbl">S${i + 1}</span>
                  <input type="number" class="set-input weight-in" placeholder="kg" value="${esc(String(s.weight))}" step="0.5" min="0">
                  <span class="set-sep">×</span>
                  <input type="text" class="set-input reps-in" placeholder="${esc(ex.reps)}" value="${esc(String(s.reps))}">
                  <input type="text" class="set-input note-in" placeholder="note" value="${esc(s.note)}">
                </div>`).join('')}
            </div>
            <button class="btn-add-set str-add-set" data-ex="${esc(ex.name)}">+ Set</button>
          </div>`;
      }).join('')}
    </div>`;
}

function renderCoreBlock(block) {
  const items = block.items || [];
  return `
    <div class="session-block core-block">
      <div class="block-type-tag type-core">Core</div>
      <div class="core-checklist">
        ${items.map(item => {
          const done = !!blockLog[`_core:${item}`];
          return `
            <label class="core-check-item ${done ? 'is-done' : ''}">
              <input type="checkbox" data-item="${esc(item)}" ${done ? 'checked' : ''}>
              <span>${esc(item)}</span>
            </label>`;
        }).join('')}
      </div>
    </div>`;
}

function renderCardioBlock(block) {
  const run = blockLog._run || {};
  return `
    <div class="session-block cardio-block">
      <div class="block-header-row">
        <span class="block-type-tag type-cardio">${esc(block.label)}</span>
        <span class="block-note">Target: ${esc(block.target)} · ${esc(block.bpmTarget)} bpm</span>
      </div>
      ${block.note ? `<div class="cardio-note">${esc(block.note)}</div>` : ''}
      <div class="run-inputs">
        <div class="run-field"><label>Distance (km)</label><input type="number" class="input-field run-dist-in" placeholder="8.5" value="${run.distance || ''}" step="0.01"></div>
        <div class="run-field"><label>Duration</label><input type="text" class="input-field run-dur-in" placeholder="42:30" value="${esc(run.duration || '')}"></div>
        <div class="run-field"><label>Avg BPM</label><input type="number" class="input-field run-bpm-in" placeholder="138" value="${run.avgBPM || ''}"></div>
        <div class="run-field"><label>Notes</label><input type="text" class="input-field run-notes-in" placeholder="How did it feel?" value="${esc(run.notes || '')}"></div>
      </div>
    </div>`;
}

function renderCircuitBlock(block) {
  const exercises = block.exercises || [];
  const rounds = parseInt((block.label || '').match(/\d+/)?.[0]) || 3;
  return `
    <div class="session-block circuit-block">
      <div class="block-header-row">
        <span class="block-type-tag type-circuit">Circuit</span>
        <span class="block-note">${esc(block.label)}</span>
      </div>
      <ul class="circuit-ex-list">
        ${exercises.map(ex => `<li>${esc(ex.name)} × ${esc(ex.reps)}</li>`).join('')}
      </ul>
      <div class="circuit-rounds">
        ${Array.from({length: rounds}, (_, i) => {
          const done = !!blockLog[`_circuit:${i + 1}`];
          return `<button class="circuit-round-btn ${done ? 'is-done' : ''}" data-round="${i + 1}" data-done="${done ? 1 : 0}">
            ${done ? '✓' : ''} Round ${i + 1}
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function renderMobilityBlock(block) {
  return `
    <div class="session-block mobility-ref-block">
      <span class="block-type-tag type-mobility">Mobility</span>
      <span class="block-note">${esc(block.label)}</span>
    </div>`;
}

function renderBlock(block) {
  switch (block.type) {
    case 'warmup':   return renderWarmupBlock(block);
    case 'skill':    return renderSkillBlock(block);
    case 'strength': return renderStrengthBlock(block);
    case 'core':     return renderCoreBlock(block);
    case 'cardio':   return renderCardioBlock(block);
    case 'circuit':  return renderCircuitBlock(block);
    case 'mobility': return renderMobilityBlock(block);
    default:         return '';
  }
}

function sessionProgress() {
  if (!currentBlocks.length) return null;
  let total = 0, done = 0;
  currentBlocks.forEach(block => {
    if (block.type === 'warmup')  { total++; if (blockLog._warmup) done++; }
    if (block.type === 'core')    { block.items.forEach(item => { total++; if (blockLog[`_core:${item}`]) done++; }); }
    if (block.type === 'circuit') {
      const rounds = parseInt((block.label || '').match(/\d+/)?.[0]) || 3;
      Array.from({length: rounds}, (_, i) => { total++; if (blockLog[`_circuit:${i + 1}`]) done++; });
    }
    if (block.type === 'strength') { block.exercises.forEach(ex => { total++; if ((blockLog[ex.name]?.sets || []).some(s => s.reps || s.weight)) done++; }); }
    if (block.type === 'skill')    { block.exercises.forEach(ex => { total++; if ((blockLog[ex.name]?.sets?.length || 0) > 0 || blockLog[ex.name]?.hold) done++; }); }
    if (block.type === 'cardio')   { total++; if (blockLog._run?.distance || blockLog._run?.duration) done++; }
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function renderCheckItem(key, label, icon, checked) {
  return `
    <label class="check-item ${checked ? 'done' : ''}">
      <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
      <span>${esc(icon)} ${esc(label)}</span>
    </label>`;
}

// ── Main render ────────────────────────────────────────────────────────────
export async function renderToday(container) {
  if (Object.keys(blockLog).length === 0) await loadTodayLog();

  const [savedProg, savedWeek, checklistItems, routineSteps, allSupplements] = await Promise.all([
    getCurrentProgramme(), getCurrentWeek(), getChecklistItems(), getMorningRoutine(), getSupplements(),
  ]);
  const prog = pendingProg ?? savedProg;
  const week = pendingWeek ?? savedWeek;
  if (pendingDay !== null) selectedDay = pendingDay;

  const session = getProgrammeSession(prog, selectedDay);
  currentBlocks = session.blocks || [];
  const checklist = await getTodayChecklist();
  const mobility = getMobilityForDay(selectedDay);
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const morningSupps = allSupplements.filter(s => s.timing?.toLowerCase().startsWith('morning'));
  const eveningSupps = allSupplements.filter(s => s.timing?.toLowerCase().includes('evening') || s.timing?.toLowerCase().includes('bed'));
  const progress = sessionProgress();
  const isRest = currentBlocks.length === 0;

  container.innerHTML = `
    <div class="section-header">
      <h2>${esc(dateStr)}</h2>
    </div>

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
        <span class="muted" style="font-size:.78rem">${WEEK_HINTS[week]}</span>
      </div>
      <button id="apply-session" class="btn-primary" style="width:100%;margin-top:.65rem">Load Session</button>
    </div>

    <div class="card session-card ${isRest ? 'rest-day' : ''}">
      <div class="card-header-row">
        <div>
          <div class="card-label">Today's Session</div>
          <h3>${esc(session.label || 'Rest Day')}</h3>
          ${session.focus ? `<div class="session-focus">${esc(session.focus)}</div>` : ''}
        </div>
        <div class="session-status-col">
          ${todayWorkoutId ? '<span class="badge info">✓ Saved</span>' : ''}
          ${progress && progress.total > 0 ? `
            <div class="session-progress">
              <div class="prog-bar-track"><div class="prog-bar-fill" style="width:${progress.pct}%"></div></div>
              <span class="prog-pct">${progress.pct}%</span>
            </div>` : ''}
        </div>
      </div>

      ${isRest ? `
        <p class="muted" style="margin-top:.75rem">Rest day. Recover well — gains happen during rest.</p>
      ` : `
        <div class="pre-training-nudge">
          <span class="badge warning">⚡ Pre-training:</span>
          ${PRE_TRAINING.map(p => `<span class="pre-item">${esc(p)}</span>`).join('')}
        </div>
        <div id="session-blocks">
          ${currentBlocks.map(renderBlock).join('')}
        </div>
        <button id="save-today-log" class="btn-primary" style="margin-top:1rem">
          ${todayWorkoutId ? '✓ Update Session' : 'Save Session'}
        </button>
      `}
    </div>

    ${mobility ? `
    <div class="card mobility-card">
      <div class="card-label">Mobility — ${DAY_LABELS[selectedDay]}</div>
      <h3>${esc(mobility.label)}</h3>
      <p class="muted">${esc(mobility.duration)} · ${esc(mobility.focus)}</p>
    </div>` : ''}

    <div class="card">
      <div class="card-label">Daily Checklist</div>
      <div class="checklist" id="today-checklist">
        ${checklistItems.map(item => renderCheckItem(item.key, item.label, item.icon || '', checklist[item.key] || false)).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-label">Morning CARs Routine</div>
      <ul class="routine-list">${routineSteps.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>

    <div class="card">
      <div class="card-label">Morning Supplements</div>
      <ul class="supp-list">
        ${morningSupps.map(s => `
          <li>
            <span>${esc(s.name)}</span>
            <span class="badge ${s.withFat ? 'warning' : 'info'}">${s.withFat ? '+ fat' : (s.timing || '').replace(/morning ?/i, '') || 'morning'}</span>
          </li>`).join('')}
      </ul>
    </div>

    <div class="card">
      <div class="card-label">Evening Supplements</div>
      <ul class="supp-list">
        ${eveningSupps.map(s => `
          <li><span>${esc(s.name)}</span><span class="badge info">${esc(s.timing || '')}</span></li>`).join('')}
      </ul>
    </div>
  `;

  setupTodayEvents(container);
}

// ── Events ─────────────────────────────────────────────────────────────────
function setupTodayEvents(container) {
  // Programme toggle — visual only, committed on Apply
  container.querySelectorAll('[data-prog]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingProg = btn.dataset.prog;
      container.querySelectorAll('[data-prog]').forEach(b => b.classList.toggle('active', b === btn));
      markApplyPending(container);
    });
  });

  // Week toggle — visual only
  container.querySelectorAll('[data-week]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingWeek = +btn.dataset.week;
      container.querySelectorAll('[data-week]').forEach(b => b.classList.toggle('active', b === btn));
      const bar = container.querySelector('.week-context-bar');
      if (bar) bar.querySelector('.week-badge').textContent = `Week ${pendingWeek} — ${WEEK_LABELS[pendingWeek]}`;
      markApplyPending(container);
    });
  });

  // Day selector — visual only
  container.querySelectorAll('.day-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDay = +btn.dataset.day;
      container.querySelectorAll('.day-sel-btn').forEach(b => b.classList.toggle('active', b === btn));
      markApplyPending(container);
    });
  });

  // Apply — commit all pending changes and reload session
  container.querySelector('#apply-session')?.addEventListener('click', async () => {
    if (pendingProg !== null) await setCurrentProgramme(pendingProg);
    if (pendingWeek !== null) await setCurrentWeek(pendingWeek);
    pendingProg = null;
    pendingWeek = null;
    pendingDay = null;
    blockLog = {};
    renderToday(container);
  });

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

  container.onclick = e => {
    // Warmup done toggle
    const warmupBtn = e.target.closest('.warmup-done-btn');
    if (warmupBtn) {
      const isDone = warmupBtn.dataset.done !== '1';
      warmupBtn.dataset.done = isDone ? '1' : '0';
      warmupBtn.textContent = isDone ? '✓ Done' : 'Mark Done';
      warmupBtn.classList.toggle('is-done', isDone);
      blockLog._warmup = isDone;
      refreshProgress(container);
      return;
    }

    // Circuit round toggle
    const circuitBtn = e.target.closest('.circuit-round-btn');
    if (circuitBtn) {
      const isDone = circuitBtn.dataset.done !== '1';
      circuitBtn.dataset.done = isDone ? '1' : '0';
      circuitBtn.textContent = (isDone ? '✓ ' : '') + `Round ${circuitBtn.dataset.round}`;
      circuitBtn.classList.toggle('is-done', isDone);
      blockLog[`_circuit:${circuitBtn.dataset.round}`] = isDone;
      refreshProgress(container);
      return;
    }

    // Skill set counter
    const scPlus = e.target.closest('.sc-plus');
    if (scPlus) {
      const name = scPlus.dataset.ex;
      const target = +scPlus.dataset.target;
      if (!blockLog[name]) blockLog[name] = { sets: [], hold: '', level: '' };
      const current = blockLog[name].sets.length;
      if (current < target * 2) {
        blockLog[name].sets.push({ weight: null, reps: null, note: '' });
        const valEl = container.querySelector(`.sc-val[data-ex="${CSS.escape(name)}"]`);
        if (valEl) valEl.textContent = blockLog[name].sets.length;
        refreshProgress(container);
      }
      return;
    }
    const scMinus = e.target.closest('.sc-minus');
    if (scMinus) {
      const name = scMinus.dataset.ex;
      if (!blockLog[name]) blockLog[name] = { sets: [], hold: '', level: '' };
      if (blockLog[name].sets.length > 0) {
        blockLog[name].sets.pop();
        const valEl = container.querySelector(`.sc-val[data-ex="${CSS.escape(name)}"]`);
        if (valEl) valEl.textContent = blockLog[name].sets.length;
        refreshProgress(container);
      }
      return;
    }

    // Strength add set
    const addSetBtn = e.target.closest('.str-add-set');
    if (addSetBtn) {
      collectBlockLog(container);
      const name = addSetBtn.dataset.ex;
      if (!blockLog[name]) blockLog[name] = { sets: [], hold: '', level: '' };
      blockLog[name].sets.push({ weight: null, reps: null, note: '' });
      refreshBlocksPanel(container);
      return;
    }
  };

  // Core checkbox — update done state and label immediately
  container.addEventListener('change', e => {
    const cb = e.target.closest('.core-check-item input');
    if (cb) {
      const key = `_core:${cb.dataset.item}`;
      blockLog[key] = cb.checked;
      cb.closest('.core-check-item')?.classList.toggle('is-done', cb.checked);
      refreshProgress(container);
    }
  });

  container.querySelector('#save-today-log')?.addEventListener('click', async () => {
    collectBlockLog(container);
    const exercises = serializeBlockLog();
    const workoutData = { date: todayStr(), source: 'today-log', programme: await getCurrentProgramme(), day: selectedDay, exercises };
    if (todayWorkoutId) {
      await dbPut('workouts', { id: todayWorkoutId, ...workoutData });
      showToast('Session updated!');
    } else {
      todayWorkoutId = await dbAdd('workouts', workoutData);
      showToast('Session saved!');
    }
    await loadTodayLog();
    const btn = container.querySelector('#save-today-log');
    if (btn) btn.textContent = '✓ Update Session';
    const headerRow = container.querySelector('.card-header-row');
    if (headerRow && !headerRow.querySelector('.badge.info')) {
      headerRow.insertAdjacentHTML('beforeend', '<span class="badge info" style="align-self:flex-start">✓ Saved</span>');
    }
  });
}

function markApplyPending(container) {
  const btn = container.querySelector('#apply-session');
  if (btn) {
    btn.textContent = 'Apply Changes →';
    btn.style.background = 'var(--accent2)';
  }
}

function refreshProgress(container) {
  const progress = sessionProgress();
  if (!progress || progress.total === 0) return;
  const fill = container.querySelector('.prog-bar-fill');
  const pct = container.querySelector('.prog-pct');
  if (fill) fill.style.width = progress.pct + '%';
  if (pct)  pct.textContent = progress.pct + '%';
}

function refreshBlocksPanel(container) {
  const panel = container.querySelector('#session-blocks');
  if (panel) panel.innerHTML = currentBlocks.map(renderBlock).join('');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
