import { PRE_TRAINING, MOBILITY_SESSIONS } from './profile.js';
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { getChecklistItems, getSupplements } from './config.js';
import { listProgrammes, getWeekSessions, WEEK_LABELS, WEEK_HINTS } from './programmes.js';
import { scanForPRs, formatPRToast } from './pr-detect.js';
import { icon } from './icons.js';

// ── Module state ───────────────────────────────────────────────────────────
let blockLog = {};       // {exerciseName: {sets:[{weight,reps,note}], hold, level}, _warmup:bool, '_core:...':bool, _run:{...}, '_circuit:N':bool}
let currentBlocks = [];  // active session blocks
let selectedDay = new Date().getDay();
let todayWorkoutId = null;
let cachedAllWorkouts = [];
let activeProg = 'A';
let activeWeek = 1;

// Pending control state — committed on Apply
let pendingProg = null;   // null = use saved value
let pendingWeek = null;
let pendingDay  = null;

let todaySubTab = 'session'; // 'session' | 'checklist' | 'supps'

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getPrevExercise(name) {
  const sorted = cachedAllWorkouts
    .filter(w => {
      if (w.id === todayWorkoutId || w.source !== 'today-log') return false;
      if (w.day !== selectedDay) return false;
      // New data has programme+week — require exact match
      // Old data missing those fields — match by day only (graceful fallback)
      if (w.programme !== undefined && w.week !== undefined) {
        return w.programme === activeProg && w.week === activeWeek;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const ex = w.exercises?.find(e => e.name === name);
    if (ex && (ex.sets?.some(s => s.weight || s.reps) || ex.hold)) {
      return { date: w.date, sets: ex.sets || [], hold: ex.hold || '', setsCount: ex.sets?.length || 0 };
    }
  }
  return null;
}

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
    el.querySelectorAll('.str-set-tile').forEach(tile => {
      sets.push({
        weight: parseFloat(tile.querySelector('.weight-in')?.value) || null,
        reps:   tile.querySelector('.reps-in')?.value?.trim() || null,
        note:   '',
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
        ${done ? `${icon('check', 14)} Done` : 'Mark Done'}
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
              ${(() => {
                const p = getPrevExercise(ex.name);
                return `
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
              <div class="skill-prev-bar">
                <span class="skill-prev-lbl">prev</span>
                <input type="text" class="str-prev-ref" placeholder="sets" value="${esc(p ? String(p.setsCount) : '')}" tabindex="-1" autocomplete="off">
                <span class="skill-prev-sep">sets</span>
                <input type="text" class="str-prev-ref" placeholder="hold" value="${esc(p?.hold || '')}" tabindex="-1" autocomplete="off">
              </div>`;
              })()}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderStrengthBlock(block) {
  const label = block.label || 'Strength';
  return `
    <div class="session-block strength-block">
      <div class="block-header-row">
        <span class="block-type-tag type-strength">${esc(label)}</span>
        ${block.note ? `<span class="block-note">${esc(block.note)}</span>` : ''}
      </div>
      ${(block.exercises || []).map(ex => {
        const log       = blockLog[ex.name] || {};
        const existing  = log.sets || [];
        const targetN   = ex.sets || 3;
        const rows      = [];
        for (let i = 0; i < Math.max(targetN, existing.length); i++) {
          const s = existing[i] || {};
          rows.push({ weight: s.weight ?? '', reps: s.reps ?? '', done: !!(s.weight || s.reps) });
        }
        const prev = getPrevExercise(ex.name);
        return `
          <div class="str-exercise" data-ex="${esc(ex.name)}">
            <div class="str-ex-header">
              <span class="str-ex-name">${esc(ex.name)}</span>
              <span class="str-ex-target">${targetN} × ${esc(ex.reps)}</span>
            </div>
            ${ex.note ? `<div class="str-ex-note">${esc(ex.note)}</div>` : ''}
            <div class="str-tiles">
              ${rows.map((s, i) => {
                const ps = prev?.sets[i];
                const prevStr = ps ? (ps.weight ? `${ps.weight}×${ps.reps || '?'}` : ps.reps ? `${ps.reps}r` : '') : '';
                return `
                <div class="str-set-tile ${s.done ? 'is-done' : ''}">
                  <span class="str-snum">S${i + 1}</span>
                  <input type="number" class="str-tile-inp weight-in" inputmode="decimal"
                    placeholder="kg" value="${esc(String(s.weight))}" step="0.5" min="0">
                  <span class="str-tile-sep">×</span>
                  <input type="text" class="str-tile-inp reps-in"
                    placeholder="${esc(ex.reps)}" value="${esc(String(s.reps))}">
                  <input type="text" class="str-prev-ref" placeholder="prev" value="${esc(prevStr)}" tabindex="-1" autocomplete="off">
                  <button class="str-tick-btn ${s.done ? 'is-done' : ''}"
                    data-ex="${esc(ex.name)}" data-idx="${i}" data-done="${s.done ? '1' : '0'}">
                    ${s.done ? icon('check', 14) : ''}
                  </button>
                </div>`;
              }).join('')}
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
            ${done ? icon('check', 13) : ''} Round ${i + 1}
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function renderMobilityBlock(block) {
  const hasItems = block.items && block.items.length > 0;
  return `
    <div class="session-block mobility-ref-block ${hasItems ? 'is-expandable' : ''}">
      <div class="mobility-header ${hasItems ? 'mobility-toggle' : ''}">
        <div class="block-header-row" style="margin-bottom:.25rem;">
          <span class="block-type-tag type-mobility">Mobility</span>
          ${block.duration ? `<span class="block-note">${esc(block.duration)}</span>` : ''}
          ${hasItems ? `<span class="mobility-chevron">▾</span>` : ''}
        </div>
        <div class="mobility-label">${esc(block.label)}</div>
        ${block.focus ? `<div class="mobility-focus muted">${esc(block.focus)}</div>` : ''}
      </div>
      ${hasItems ? `
        <ul class="mobility-items hidden">
          ${block.items.map(item => `<li>${esc(item)}</li>`).join('')}
        </ul>` : ''}
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
    if (block.type === 'core')    { (block.items || []).forEach(item => { total++; if (blockLog[`_core:${item}`]) done++; }); }
    if (block.type === 'circuit') {
      const rounds = parseInt((block.label || '').match(/\d+/)?.[0]) || 3;
      Array.from({length: rounds}, (_, i) => { total++; if (blockLog[`_circuit:${i + 1}`]) done++; });
    }
    if (block.type === 'strength') { (block.exercises || []).forEach(ex => { total++; if ((blockLog[ex.name]?.sets || []).some(s => s.reps || s.weight)) done++; }); }
    if (block.type === 'skill')    { (block.exercises || []).forEach(ex => { total++; if ((blockLog[ex.name]?.sets?.length || 0) > 0 || blockLog[ex.name]?.hold) done++; }); }
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

// ── Panel helpers ──────────────────────────────────────────────────────────
function renderSessionPanel(session, isRest, progress, mobility, week, weekLabel, weekHint) {
  const weekName = weekLabel || WEEK_LABELS[week] || '';
  const weekHintText = weekHint || WEEK_HINTS[week] || '';
  return `
    <div class="card session-card ${isRest ? 'rest-day' : ''}">
      <div class="card-header-row">
        <div>
          <div class="session-title">${esc(session.label || 'Rest Day')}</div>
          ${session.focus ? `<div class="session-focus">${esc(session.focus)}</div>` : ''}
          ${weekName ? `<div class="session-week-hint"><span class="week-phase-badge">W${week} ${esc(weekName)}</span> <span class="week-hint-text">${esc(weekHintText)}</span></div>` : ''}
        </div>
        ${progress && progress.total > 0 ? `
          <div class="session-progress">
            <div class="prog-bar-track"><div class="prog-bar-fill" style="width:${progress.pct}%"></div></div>
            <span class="prog-pct">${progress.pct}%</span>
          </div>` : todayWorkoutId ? `<span class="badge info icon-inline">${icon('check', 12)} Saved</span>` : ''}
      </div>
      ${isRest ? `
        <div class="rest-day-icon">${icon('moon', 32)}</div>
        <p class="muted rest-day-msg">Rest day. Recover well — gains happen during rest.</p>
        ${mobility ? renderMobilityBlock({ ...mobility, type: 'mobility' }) : ''}
      ` : `
        <div id="session-blocks">
          ${currentBlocks.map(renderBlock).join('')}
        </div>
        ${mobility && !currentBlocks.some(b => b.type === 'mobility') ? renderMobilityBlock({ ...mobility, type: 'mobility' }) : ''}
        <button id="save-today-log" class="btn-primary" style="margin-top:1rem">
          ${todayWorkoutId ? `${icon('check', 15)} Update Session` : 'Save Session'}
        </button>
      `}
    </div>
  `;
}

function renderChecklistPanel(checklistItems, checklist) {
  const total = checklistItems.length;
  const done  = checklistItems.filter(i => checklist[i.key]).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="card">
      <div class="card-header-row" style="margin-bottom:.5rem;">
        <span class="card-label" style="margin-bottom:0;">Daily Checklist</span>
        <span class="prog-pct" style="font-size:.8rem;">${done}/${total}</span>
      </div>
      <div class="prog-bar-track" style="width:100%;margin-bottom:.75rem;">
        <div class="prog-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="checklist" id="today-checklist">
        ${checklistItems.map(item => renderCheckItem(item.key, item.label, item.icon || '', checklist[item.key] || false)).join('')}
      </div>
    </div>
  `;
}

function renderSuppsPanel(allSupplements) {
  const groups = [
    { label: 'Pre-training',        filter: s => /pre.?train|pre.?workout/i.test(s.timing) },
    { label: 'Morning — fasted',    filter: s => /^morning/i.test(s.timing) && !s.withFat },
    { label: 'Morning — with fat',  filter: s => /^morning/i.test(s.timing) && s.withFat },
    { label: 'With meals',          filter: s => /meal|lunch/i.test(s.timing) && !/morning|evening|bed/i.test(s.timing) },
    { label: 'Evening',             filter: s => /evening/i.test(s.timing) },
    { label: 'Before bed',          filter: s => /bed/i.test(s.timing) },
    { label: 'Post-training',       filter: s => /post.?train/i.test(s.timing) },
  ];
  const seen = new Set();
  return groups.map(g => {
    const items = allSupplements.filter(s => !seen.has(s.name) && g.filter(s));
    items.forEach(s => seen.add(s.name));
    if (!items.length) return '';
    return `
      <div class="card">
        <div class="card-label">${esc(g.label)}</div>
        <ul class="supp-list">
          ${items.map(s => `
            <li>
              <span>${esc(s.name)}</span>
              <span class="badge ${s.phase === 1 ? 'success' : s.phase === 2 ? 'info' : 'warning'}">Ph${s.phase}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  }).join('');
}

// ── Main render ────────────────────────────────────────────────────────────
export async function renderToday(container) {
  if (Object.keys(blockLog).length === 0) await loadTodayLog();

  const [savedProg, savedWeek, checklistItems, allSupplements, allWorkouts, programmes] = await Promise.all([
    getCurrentProgramme(), getCurrentWeek(), getChecklistItems(), getSupplements(), dbGetAll('workouts'), listProgrammes(),
  ]);
  cachedAllWorkouts = allWorkouts;
  const validIds = new Set(programmes.map(p => p.id));
  const prog = validIds.has(pendingProg) ? pendingProg : (validIds.has(savedProg) ? savedProg : programmes[0].id);
  const week = pendingWeek ?? savedWeek;
  activeProg = prog;
  activeWeek = week;
  if (pendingDay !== null) selectedDay = pendingDay;

  // Fetched once (not via getProgrammeSession) since we need both this day's blocks
  // AND the week's own weekLabel/weekHint from the same object — two separate reads
  // would duplicate the same underlying getSessions() call for no benefit.
  const weekSessions = await getWeekSessions(prog, week);
  const session  = weekSessions[selectedDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  currentBlocks  = session.blocks || [];
  const checklist = await getTodayChecklist();
  const mobility  = getMobilityForDay(selectedDay);
  const dateStr   = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const progress  = sessionProgress();
  const isRest    = currentBlocks.length === 0;

  container.innerHTML = `
    <div class="today-date-row">
      <span class="today-date">${esc(dateStr)}</span>
      <span class="today-prog-badge">Prog ${esc(prog)} · W${week}</span>
    </div>

    <div class="session-ctrl-bar">
      <div class="ctrl-group">
        ${programmes.map(p => `
          <button class="ctrl-pill prog-pill ${prog === p.id ? 'active' : ''}" data-prog="${p.id}" title="${esc(p.name)}">${esc(p.id)}</button>
        `).join('')}
      </div>
      <div class="ctrl-group">
        ${[1,2,3,4].map(w => `
          <button class="ctrl-pill week-pill ${week === w ? 'active' : ''}" data-week="${w}">W${w}</button>
        `).join('')}
      </div>
      <div class="ctrl-group">
        ${DAY_LABELS.map((label, i) => `
          <button class="ctrl-pill day-pill ${selectedDay === i ? 'active' : ''} ${i === new Date().getDay() ? 'is-today' : ''}" data-day="${i}">
            ${label}
          </button>`).join('')}
      </div>
      <button id="apply-session" class="ctrl-apply hidden">Apply</button>
    </div>

    <div class="today-tabs">
      <button class="today-tab ${todaySubTab === 'session'   ? 'active' : ''}" data-subtab="session">Session</button>
      <button class="today-tab ${todaySubTab === 'checklist' ? 'active' : ''}" data-subtab="checklist">Checklist</button>
      <button class="today-tab ${todaySubTab === 'supps'     ? 'active' : ''}" data-subtab="supps">Supps</button>
    </div>

    <div id="today-panel-session"   class="${todaySubTab !== 'session'   ? 'hidden' : ''}">
      ${renderSessionPanel(session, isRest, progress, mobility, week, weekSessions.weekLabel, weekSessions.weekHint)}
    </div>
    <div id="today-panel-checklist" class="${todaySubTab !== 'checklist' ? 'hidden' : ''}">
      ${renderChecklistPanel(checklistItems, checklist)}
    </div>
    <div id="today-panel-supps"     class="${todaySubTab !== 'supps'     ? 'hidden' : ''}">
      ${renderSuppsPanel(allSupplements)}
    </div>
  `;

  setupTodayEvents(container);
}

// ── Events ─────────────────────────────────────────────────────────────────
function setupTodayEvents(container) {
  // Inner tab switching
  container.querySelectorAll('.today-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      todaySubTab = btn.dataset.subtab;
      container.querySelectorAll('.today-tab').forEach(b => b.classList.toggle('active', b === btn));
      ['session', 'checklist', 'supps'].forEach(id => {
        const panel = container.querySelector(`#today-panel-${id}`);
        if (panel) panel.classList.toggle('hidden', id !== todaySubTab);
      });
    });
  });

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
      markApplyPending(container);
    });
  });

  // Day selector — visual only
  container.querySelectorAll('[data-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDay = +btn.dataset.day;
      container.querySelectorAll('[data-day]').forEach(b => b.classList.toggle('active', b === btn));
      markApplyPending(container);
    });
  });

  // Apply — commit all pending changes and reload session
  container.querySelector('#apply-session')?.addEventListener('click', async () => {
    if (pendingProg !== null) await setCurrentProgramme(pendingProg);
    if (pendingWeek !== null) await setCurrentWeek(pendingWeek);
    if (pendingDay  !== null) selectedDay = pendingDay;
    pendingDay = null;
    blockLog = {};
    // Keep pendingProg/pendingWeek set so renderToday reads them via ?? fallback,
    // then clear them after the render completes.
    await renderToday(container);
    pendingProg = null;
    pendingWeek = null;
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
    // Mobility expand/collapse
    const mobilityToggle = e.target.closest('.mobility-toggle');
    if (mobilityToggle) {
      const block = mobilityToggle.closest('.mobility-ref-block');
      const items = block?.querySelector('.mobility-items');
      const chevron = block?.querySelector('.mobility-chevron');
      if (items) {
        items.classList.toggle('hidden');
        if (chevron) chevron.textContent = items.classList.contains('hidden') ? '▾' : '▴';
      }
      return;
    }

    // Strength tile tick
    const tickBtn = e.target.closest('.str-tick-btn');
    if (tickBtn) {
      const tile   = tickBtn.closest('.str-set-tile');
      const exEl   = tile.closest('.str-exercise');
      const exName = exEl?.dataset.ex;
      const idx    = parseInt(tickBtn.dataset.idx);
      const wIn    = tile.querySelector('.weight-in');
      const rIn    = tile.querySelector('.reps-in');
      const isDone = tickBtn.dataset.done === '1';

      if (!isDone) {
        // Auto-fill from previous tile if both inputs are empty
        if (!wIn.value && !rIn.value) {
          const prev = tile.previousElementSibling;
          if (prev?.classList.contains('str-set-tile')) {
            wIn.value = prev.querySelector('.weight-in')?.value || '';
            rIn.value = prev.querySelector('.reps-in')?.value  || '';
          }
        }
        // Write to blockLog immediately so progress bar updates
        if (exName) {
          if (!blockLog[exName]) blockLog[exName] = { sets: [], hold: '', level: '' };
          blockLog[exName].sets[idx] = {
            weight: parseFloat(wIn.value) || null,
            reps:   rIn.value.trim() || null,
            note:   '',
          };
        }
        tile.classList.add('is-done');
        tickBtn.classList.add('is-done');
        tickBtn.dataset.done = '1';
        tickBtn.innerHTML    = icon('check', 14);
      } else {
        // Un-tick — zero blockLog and clear DOM inputs
        if (exName && blockLog[exName]?.sets?.[idx]) {
          blockLog[exName].sets[idx] = { weight: null, reps: null, note: '' };
        }
        wIn.value = '';
        rIn.value = '';
        tile.classList.remove('is-done');
        tickBtn.classList.remove('is-done');
        tickBtn.dataset.done = '0';
        tickBtn.textContent  = '';
      }
      refreshProgress(container);
      return;
    }

    // Warmup done toggle
    const warmupBtn = e.target.closest('.warmup-done-btn');
    if (warmupBtn) {
      const isDone = warmupBtn.dataset.done !== '1';
      warmupBtn.dataset.done = isDone ? '1' : '0';
      warmupBtn.innerHTML = isDone ? `${icon('check', 14)} Done` : 'Mark Done';
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
      circuitBtn.innerHTML = (isDone ? icon('check', 13) + ' ' : '') + `Round ${circuitBtn.dataset.round}`;
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
    const workoutData = { date: todayStr(), source: 'today-log', programme: await getCurrentProgramme(), week: await getCurrentWeek(), day: selectedDay, exercises };
    if (todayWorkoutId) {
      await dbPut('workouts', { id: todayWorkoutId, ...workoutData });
      showToast('Session updated!');
    } else {
      todayWorkoutId = await dbAdd('workouts', workoutData);
      showToast('Session saved!');
    }
    const newPRs = await scanForPRs(workoutData.exercises, workoutData.date);
    const prToast = formatPRToast(newPRs);
    if (prToast) showToast(prToast);
    await loadTodayLog();
    const btn = container.querySelector('#save-today-log');
    if (btn) btn.innerHTML = `${icon('check', 15)} Update Session`;
    const headerRow = container.querySelector('.card-header-row');
    if (headerRow && !headerRow.querySelector('.badge.info')) {
      headerRow.insertAdjacentHTML('beforeend', `<span class="badge info icon-inline" style="align-self:flex-start">${icon('check', 12)} Saved</span>`);
    }
    renderJournalPrompt(container, todayWorkoutId, todayStr());
  });
}

function markApplyPending(container) {
  container.querySelector('#apply-session')?.classList.remove('hidden');
}

function refreshProgress(container) {
  const progress = sessionProgress();
  if (!progress || progress.total === 0) return;
  const panel = container.querySelector('#today-panel-session');
  const fill = panel?.querySelector('.prog-bar-fill');
  const pct  = panel?.querySelector('.prog-pct');
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
