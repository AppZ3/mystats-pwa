import { esc } from './db.js';
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, getSessions, saveSessions, getWeekSessions, saveWeekSessions, BLOCK_TYPES, MAX_PROGRAMMES } from './programmes.js';
import { icon } from './icons.js';

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

let expandedId = null; // which programme's block builder is open, if any
let editorWeek = 1; // 1-4 — which stored week the block builder is currently viewing/editing
let editorDay = 1; // 1=Mon .. 6=Sat, 0=Sun — matches the rest of the app's day numbering
let editingBlocks = []; // working copy of the open day's blocks array
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export async function renderProgrammeManager(container) {
  const list = await listProgrammes();
  const mount = container.querySelector('#programme-manager-mount');
  if (!mount) return;
  mount.innerHTML = `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Manage your training programmes (up to ${MAX_PROGRAMMES}). The active one is picked on the Today tab.</p>
    <div class="prog-mgr-list">
      ${list.map(progMgrRow).join('')}
    </div>
    <button class="btn-primary" id="add-programme-btn" ${list.length >= MAX_PROGRAMMES ? 'disabled' : ''}>+ Add Programme</button>
    <div id="block-editor-mount"></div>
  `;
  setupManagerEvents(container);
  if (expandedId && list.some(p => p.id === expandedId)) {
    await renderBlockEditor(container, expandedId);
  }
}

function progMgrRow(p) {
  return `
    <div class="prog-mgr-row" data-id="${p.id}">
      <div class="prog-mgr-id">${esc(p.id)}</div>
      <div class="prog-mgr-info">
        <div class="prog-mgr-name">${esc(p.name)}</div>
        <div class="prog-mgr-badge">${esc(p.source)}</div>
      </div>
      <div class="prog-mgr-actions">
        <button class="btn-secondary btn-sm rename-prog-btn" data-id="${p.id}">Rename</button>
        <button class="btn-secondary btn-sm edit-blocks-btn" data-id="${p.id}">${expandedId === p.id ? 'Close' : 'Edit'}</button>
        <button class="btn-icon delete-prog-btn" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">${icon('x', 14)}</button>
      </div>
    </div>`;
}

function setupManagerEvents(container) {
  container.querySelector('#add-programme-btn')?.addEventListener('click', async () => {
    const name = prompt('Name for the new programme:', '');
    if (name === null) return; // cancelled
    try {
      const entry = await createProgramme(name.trim());
      expandedId = entry.id;
      showToast(`Programme ${entry.id} created`);
      await renderProgrammeManager(container);
    } catch (err) {
      showToast(err.message);
    }
  });

  container.querySelectorAll('.rename-prog-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.prog-mgr-row');
      const current = row.querySelector('.prog-mgr-name').textContent;
      const name = prompt('Rename programme:', current);
      if (name === null || !name.trim()) return;
      await renameProgramme(btn.dataset.id, name.trim());
      showToast('Renamed');
      await renderProgrammeManager(container);
    });
  });

  container.querySelectorAll('.edit-blocks-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      expandedId = expandedId === btn.dataset.id ? null : btn.dataset.id;
      await renderProgrammeManager(container);
    });
  });

  container.querySelectorAll('.delete-prog-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.prog-mgr-row');
      const name = row.querySelector('.prog-mgr-name').textContent;
      if (!confirm(`Delete "${name}"? Past workouts/journal/PR entries logged under it are kept, but it will no longer appear on the Today tab.`)) return;
      try {
        await deleteProgramme(btn.dataset.id);
        if (expandedId === btn.dataset.id) expandedId = null;
        showToast('Deleted');
        await renderProgrammeManager(container);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function defaultBlockFor(type) {
  switch (type) {
    case 'warmup':   return { type, items: [] };
    case 'core':     return { type, items: [] };
    case 'skill':    return { type, name: '', note: '', exercises: [] };
    case 'strength': return { type, label: '', exercises: [] };
    case 'circuit':  return { type, label: '', exercises: [] };
    case 'cardio':   return { type, label: '', target: '', bpmTarget: '', note: '' };
    case 'mobility': return { type, label: '' };
    default: throw new Error(`Unknown block type: ${type}`);
  }
}

export async function renderBlockEditor(container, progId) {
  const mount = container.querySelector('#block-editor-mount');
  if (!mount) return;
  const weekSessions = await getWeekSessions(progId, editorWeek);
  const day = weekSessions[editorDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  editingBlocks = day.blocks.map(b => JSON.parse(JSON.stringify(b)));

  mount.innerHTML = `
    <div class="block-day-tabs">
      ${[1,2,3,4].map(w => `
        <button class="ctrl-pill week-pill ${editorWeek === w ? 'active' : ''}" data-edweek="${w}">W${w}</button>
      `).join('')}
    </div>
    <div class="form-grid" style="margin-bottom:.5rem">
      <div class="form-group"><label>Week Label</label>
        <input type="text" id="ed-week-label" class="input-field" value="${(weekSessions.weekLabel || '').replace(/"/g, '&quot;')}" placeholder="e.g. Skill Acquisition + Strength Foundation"></div>
      <div class="form-group"><label>Week Hint</label>
        <input type="text" id="ed-week-hint" class="input-field" value="${(weekSessions.weekHint || '').replace(/"/g, '&quot;')}" placeholder="e.g. Base sets and reps as written"></div>
    </div>
    <div class="block-day-tabs">
      ${[1,2,3,4,5,6,0].map(d => `
        <button class="ctrl-pill day-pill ${editorDay === d ? 'active' : ''}" data-edday="${d}">${DAY_LABELS[d]}</button>
      `).join('')}
    </div>
    <div class="form-grid" style="margin-bottom:.5rem">
      <div class="form-group"><label>Day Label</label>
        <input type="text" id="ed-day-label" class="input-field" value="${day.label ? day.label.replace(/"/g, '&quot;') : ''}" placeholder="e.g. Pull Skill + Vertical Strength"></div>
      <div class="form-group"><label>Focus</label>
        <input type="text" id="ed-day-focus" class="input-field" value="${day.focus ? day.focus.replace(/"/g, '&quot;') : ''}" placeholder="e.g. Front Lever · Muscle-Up · Back"></div>
    </div>
    <div class="block-list" id="block-list">
      ${editingBlocks.map((b, bi) => blockCardHTML(b, bi)).join('') || '<p class="muted" style="font-size:.8rem">No blocks yet — Rest day, or add one below.</p>'}
    </div>
    <div class="block-add-row">
      <select id="add-block-type" class="input-field">
        ${BLOCK_TYPES.map(t => `<option value="${t.type}">${t.label}</option>`).join('')}
      </select>
      <button class="btn-secondary" id="add-block-btn">+ Add Block</button>
    </div>
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching weeks or days without saving discards unsaved edits.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUploadSection(progId)}
  `;
  setupBlockEditorEvents(container, progId);
  setupUploadEvents(container, progId, () => renderBlockEditor(container, progId));
}

function blockCardHTML(b, bi) {
  const cfg = BLOCK_TYPES.find(t => t.type === b.type);
  return `
    <div class="block-card" data-bi="${bi}">
      <div class="block-card-header">
        <span class="block-type-badge">${cfg.label}</span>
        <div class="block-card-actions">
          <button class="btn-icon move-block-up" data-bi="${bi}" aria-label="Move up">↑</button>
          <button class="btn-icon move-block-down" data-bi="${bi}" aria-label="Move down">↓</button>
          <button class="btn-icon remove-block" data-bi="${bi}" aria-label="Remove block">${icon('x', 14)}</button>
        </div>
      </div>
      ${blockBodyHTML(b, bi, cfg.kind)}
    </div>`;
}

function blockBodyHTML(b, bi, kind) {
  if (kind === 'items') return itemsBlockHTML(b, bi);
  if (kind === 'mobility') return mobilityBlockHTML(b, bi);
  if (kind === 'cardio') return cardioBlockHTML(b, bi);
  return exerciseBlockHTML(b, bi, kind); // 'skill' | 'strength' | 'circuit' — Task 8
}

function itemsBlockHTML(b, bi) {
  const items = b.items || [];
  return `
    <div class="edit-list" id="block-${bi}-items">
      ${items.map((item, xi) => `
        <div class="edit-list-item" data-bi="${bi}" data-xi="${xi}">
          <input type="text" class="input-field blk-item-in" value="${item.replace(/"/g, '&quot;')}" data-bi="${bi}" data-xi="${xi}">
          <button class="btn-icon rem-blk-item" data-bi="${bi}" data-xi="${xi}" aria-label="Remove item">${icon('x', 14)}</button>
        </div>`).join('')}
    </div>
    <button class="btn-secondary btn-sm add-blk-item" data-bi="${bi}">+ Add Item</button>`;
}

function mobilityBlockHTML(b, bi) {
  return `
    <div class="block-card-fields">
      <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="e.g. Mobility Session 1 — Upper body (~45 min)">
    </div>`;
}

function cardioBlockHTML(b, bi) {
  return `
    <div class="block-card-fields">
      <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="Label, e.g. Zone 2 Run">
      <input type="text" class="input-field blk-target-in" data-bi="${bi}" value="${(b.target || '').replace(/"/g, '&quot;')}" placeholder="Target, e.g. 35-40 min">
      <input type="text" class="input-field blk-bpm-in" data-bi="${bi}" value="${(b.bpmTarget || '').replace(/"/g, '&quot;')}" placeholder="BPM target, e.g. 130-145">
      <input type="text" class="input-field blk-note-in" data-bi="${bi}" value="${(b.note || '').replace(/"/g, '&quot;')}" placeholder="Note (optional)">
    </div>`;
}

// Persistent elements (day tabs, add-block row, save button) are bound ONCE per
// renderBlockEditor call. Only #block-list is replaced by refreshBlockList, so its
// handlers live in bindBlockListEvents and are the only ones re-bound on every
// add/remove/move — re-running this whole function from refreshBlockList would
// duplicate-bind the persistent elements and make them fire multiple times per click.
function setupBlockEditorEvents(container, progId) {
  container.querySelectorAll('[data-edweek]').forEach(btn => {
    btn.addEventListener('click', async () => {
      editorWeek = +btn.dataset.edweek;
      await renderBlockEditor(container, progId);
    });
  });

  container.querySelectorAll('[data-edday]').forEach(btn => {
    btn.addEventListener('click', async () => {
      editorDay = +btn.dataset.edday;
      await renderBlockEditor(container, progId);
    });
  });

  container.querySelector('#add-block-btn')?.addEventListener('click', () => {
    const type = container.querySelector('#add-block-type').value;
    editingBlocks.push(defaultBlockFor(type));
    refreshBlockList(container, progId);
  });

  container.querySelector('#save-day-btn')?.addEventListener('click', async () => {
    readBlocksFromDom(container);
    const weekSessions = await getWeekSessions(progId, editorWeek);
    const label = container.querySelector('#ed-day-label')?.value || '';
    const focus = container.querySelector('#ed-day-focus')?.value || '';
    weekSessions[editorDay] = { label, focus, blocks: editingBlocks };
    weekSessions.weekLabel = container.querySelector('#ed-week-label')?.value || '';
    weekSessions.weekHint = container.querySelector('#ed-week-hint')?.value || '';
    await saveWeekSessions(progId, editorWeek, weekSessions);
    showToast('Day saved');
  });

  bindBlockListEvents(container, progId);
}

// Scoped to elements inside #block-list only — safe to call repeatedly (refreshBlockList
// calls this after every mutation, never the full setupBlockEditorEvents above).
function bindBlockListEvents(container, progId) {
  container.querySelectorAll('.remove-block').forEach(btn => {
    btn.addEventListener('click', () => {
      editingBlocks.splice(+btn.dataset.bi, 1);
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.move-block-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.bi;
      if (i === 0) return;
      [editingBlocks[i - 1], editingBlocks[i]] = [editingBlocks[i], editingBlocks[i - 1]];
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.move-block-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.bi;
      if (i === editingBlocks.length - 1) return;
      [editingBlocks[i + 1], editingBlocks[i]] = [editingBlocks[i], editingBlocks[i + 1]];
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.add-blk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container); // capture any in-progress edits before mutating
      const bi = +btn.dataset.bi;
      (editingBlocks[bi].items ||= []).push('');
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.rem-blk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      editingBlocks[+btn.dataset.bi].items.splice(+btn.dataset.xi, 1);
      refreshBlockList(container, progId);
    });
  });

  setupExerciseBlockEvents(container, progId); // Task 8 — also scoped to #block-list
}

function refreshBlockList(container, progId) {
  const list = container.querySelector('#block-list');
  if (list) list.innerHTML = editingBlocks.map((b, bi) => blockCardHTML(b, bi)).join('') || '<p class="muted" style="font-size:.8rem">No blocks yet — Rest day, or add one below.</p>';
  bindBlockListEvents(container, progId); // re-bind ONLY block-list-scoped handlers
}

// Reads every block-level + sub-row field currently in the DOM back into `editingBlocks`,
// so in-progress keystrokes survive add/remove/move actions on OTHER blocks.
function readBlocksFromDom(container) {
  container.querySelectorAll('.block-card').forEach(card => {
    const bi = +card.dataset.bi;
    const b = editingBlocks[bi];
    if (!b) return;
    if (b.items) {
      b.items = [...card.querySelectorAll('.blk-item-in')].map(i => i.value);
    }
    const labelIn = card.querySelector('.blk-label-in');
    if (labelIn) b.label = labelIn.value;
    const targetIn = card.querySelector('.blk-target-in');
    if (targetIn) b.target = targetIn.value;
    const bpmIn = card.querySelector('.blk-bpm-in');
    if (bpmIn) b.bpmTarget = bpmIn.value;
    const noteIn = card.querySelector('.blk-note-in');
    if (noteIn && b.type === 'cardio') b.note = noteIn.value;
    const nameIn = card.querySelector('.blk-skill-name-in');
    if (nameIn) b.name = nameIn.value;
    const skillNoteIn = card.querySelector('.blk-skill-note-in');
    if (skillNoteIn) b.note = skillNoteIn.value;
    if (b.exercises) {
      readExerciseRows(card, b); // Task 8
    }
  });
}

// Field configs per exercise-bearing block kind — drives both rendering and DOM-read-on-save.
const EXERCISE_FIELDS = {
  skill:    [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'sets', placeholder: 'sets', cls: 'blk-ex-sets blk-ex-num', type: 'number' },
             { key: 'target', placeholder: 'target e.g. 8s', cls: 'blk-ex-target' },
             { key: 'note', placeholder: 'note (optional)', cls: 'blk-ex-note' }],
  strength: [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'sets', placeholder: 'sets', cls: 'blk-ex-sets blk-ex-num', type: 'number' },
             { key: 'reps', placeholder: 'reps e.g. 8 or 10e', cls: 'blk-ex-reps' },
             { key: 'note', placeholder: 'note (optional)', cls: 'blk-ex-note' }],
  circuit:  [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'reps', placeholder: 'reps e.g. 8', cls: 'blk-ex-reps' }],
};

function exerciseBlockHTML(b, bi, kind) {
  const fields = EXERCISE_FIELDS[kind];
  const exercises = b.exercises || [];
  const header = kind === 'skill'
    ? `<div class="block-card-fields">
        <input type="text" class="input-field blk-skill-name-in" data-bi="${bi}" value="${(b.name || '').replace(/"/g, '&quot;')}" placeholder="Skill name, e.g. Front Lever">
        <input type="text" class="input-field blk-skill-note-in" data-bi="${bi}" value="${(b.note || '').replace(/"/g, '&quot;')}" placeholder="Note (optional)">
      </div>`
    : `<div class="block-card-fields">
        <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="Label (optional)">
      </div>`;
  return `
    ${header}
    <div id="block-${bi}-exercises">
      ${exercises.map((ex, xi) => exerciseRowHTML(ex, bi, xi, fields)).join('')}
    </div>
    <button class="btn-secondary btn-sm add-blk-exercise" data-bi="${bi}">+ Add Exercise</button>`;
}

function exerciseRowHTML(ex, bi, xi, fields) {
  return `
    <div class="blk-ex-row" data-bi="${bi}" data-xi="${xi}">
      ${fields.map(f => `<input type="${f.type || 'text'}" class="input-field ${f.cls}" data-bi="${bi}" data-xi="${xi}" data-field="${f.key}" value="${String(ex[f.key] ?? '').replace(/"/g, '&quot;')}" placeholder="${f.placeholder}">`).join('')}
      <button class="btn-icon rem-blk-exercise" data-bi="${bi}" data-xi="${xi}" aria-label="Remove exercise">${icon('x', 14)}</button>
    </div>`;
}

function readExerciseRows(card, b) {
  const kind = b.type;
  const fields = EXERCISE_FIELDS[kind];
  if (!fields) return;
  b.exercises = [...card.querySelectorAll('.blk-ex-row')].map(row => {
    const ex = {};
    fields.forEach(f => {
      const input = row.querySelector(`[data-field="${f.key}"]`);
      const val = input?.value ?? '';
      if (f.type === 'number') { if (val !== '') ex[f.key] = parseInt(val, 10); }
      else if (val !== '') ex[f.key] = val;
    });
    return ex;
  });
}

function setupExerciseBlockEvents(container, progId) {
  container.querySelectorAll('.add-blk-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      const bi = +btn.dataset.bi;
      (editingBlocks[bi].exercises ||= []).push({});
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.rem-blk-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      editingBlocks[+btn.dataset.bi].exercises.splice(+btn.dataset.xi, 1);
      refreshBlockList(container, progId);
    });
  });
}

function renderUploadSection(progId) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.5rem">
      Upload a <strong>PDF</strong>, <strong>Word</strong>, or <strong>JSON</strong> file to fill this programme.
      PDF/Word and simple JSON (a <code>days</code> field) produce one Strength block per day, copied across
      all 4 weeks — refine with the block builder above. JSON with a <code>weeks</code> field (each week its
      own <code>days</code>, optionally full <code>blocks</code> arrays) gives every week genuinely distinct
      content in one upload — see the template.
    </p>
    <div class="add-item-row" style="margin-bottom:.5rem">
      <button class="btn-primary" id="upload-prog-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:.4rem">${icon('clipboard', 16)}<span>Upload Programme</span></button>
      <button class="btn-secondary" id="download-prog-template" style="display:flex;align-items:center;justify-content:center;gap:.4rem">${icon('download', 16)}<span>Template</span></button>
    </div>
    <input type="file" id="upload-prog-input" accept=".pdf,.doc,.docx,.json" style="display:none">
    <div id="upload-prog-status" style="font-size:.85rem"></div>
  `;
}

const PROG_DAY_MAP = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

// Simple flat shape: { name, description, days: { Monday: { label, exercises: [{name,sets,reps}|string] } } }
// — applied to Week 1, then flat-copied to weeks 2-4 (no legacy scaling — that replay is
// specific to the pre-existing A/B migration, not a rule for new uploads).
// Advanced shape: { name, description, weeks: { "1": { weekLabel?, weekHint?, days: {...} }, "2": {...}, ... } }
// — each week's `days` may use `blocks: [...]` instead of `exercises` for full control.
// Both shapes merge into the programme's existing 4-week data — only days actually
// present in the file are touched; everything else is left as-is.
const VALID_BLOCK_TYPES = new Set(BLOCK_TYPES.map(t => t.type));

function parseUploadedDay(dayData) {
  if (Array.isArray(dayData.blocks)) {
    const blocks = dayData.blocks
      .filter(b => b && VALID_BLOCK_TYPES.has(b.type))
      .map(b => {
        if (b.type === 'warmup' || b.type === 'core') return { ...b, items: Array.isArray(b.items) ? b.items : [] };
        if (b.type === 'skill' || b.type === 'strength' || b.type === 'circuit') return { ...b, exercises: Array.isArray(b.exercises) ? b.exercises : [] };
        return b; // cardio/mobility have no array field to coerce
      });
    return { label: dayData.label || '', focus: dayData.focus || '', blocks };
  }
  const exercises = (dayData.exercises || []).map(ex =>
    typeof ex === 'string' ? { name: ex } : { name: ex.name, sets: ex.sets, reps: ex.reps ? String(ex.reps) : undefined }
  );
  return { label: dayData.label || '', focus: '', blocks: exercises.length ? [{ type: 'strength', exercises }] : [] };
}

async function importJsonProgramme(file, progId) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
  if (!data.weeks && !data.days) throw new Error('Missing "weeks" or "days" field — see template for format');

  const sessions = await getSessions(progId); // full 4-week object — merge into it

  if (data.weeks) {
    for (const [weekKey, weekData] of Object.entries(data.weeks)) {
      const weekNum = parseInt(weekKey, 10);
      if (![1, 2, 3, 4].includes(weekNum)) throw new Error(`Invalid week "${weekKey}" — use 1, 2, 3, or 4`);
      if (weekData.weekLabel) sessions[weekNum].weekLabel = weekData.weekLabel;
      if (weekData.weekHint) sessions[weekNum].weekHint = weekData.weekHint;
      for (const [dayName, dayData] of Object.entries(weekData.days || {})) {
        const dayNum = PROG_DAY_MAP[dayName.toLowerCase()];
        if (dayNum === undefined) throw new Error(`Unknown day "${dayName}" — use Monday, Tuesday, etc.`);
        sessions[weekNum][dayNum] = parseUploadedDay(dayData);
      }
    }
  } else {
    for (const [dayName, dayData] of Object.entries(data.days)) {
      const dayNum = PROG_DAY_MAP[dayName.toLowerCase()];
      if (dayNum === undefined) throw new Error(`Unknown day "${dayName}" — use Monday, Tuesday, etc.`);
      const parsed = parseUploadedDay(dayData);
      sessions[1][dayNum] = parsed;
      for (const w of [2, 3, 4]) sessions[w][dayNum] = JSON.parse(JSON.stringify(parsed));
    }
  }

  await saveSessions(progId, sessions);
}

function wrapParsedDaysAsBlocks(parsedDays) {
  // parsedDays: { [dayNum]: { label, exercises: [{name, sets?, reps?}] } } — from PDF/Word text parsing
  const sessions = {};
  for (const [day, data] of Object.entries(parsedDays)) {
    sessions[day] = {
      label: data.label || '',
      focus: '',
      blocks: data.exercises.length ? [{ type: 'strength', exercises: data.exercises }] : [],
    };
  }
  return sessions;
}

async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => reject(new Error('Could not load Word parser — check internet connection'));
    document.head.appendChild(s);
  });
}

async function extractDocxText(file) {
  if (file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('Old .doc format is not supported — please save as .docx in Word and try again');
  }
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (!result.value?.trim()) throw new Error('Could not read Word document — make sure it is a .docx file');
  return result.value;
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load PDF parser — check internet connection'));
    document.head.appendChild(s);
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5] / 4) * 4;
      (byY[y] = byY[y] || []).push(item);
    }
    const lines = Object.keys(byY).map(Number).sort((a, b) => b - a)
      .map(y => byY[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim())
      .filter(Boolean);
    pageTexts.push(lines.join('\n'));
  }
  return pageTexts.join('\n');
}

function parseProgrammeText(text) {
  const DAY_MAP = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const days = {};
  let currentDay = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const dayKey = Object.keys(DAY_MAP).find(d => lower.startsWith(d) && (lower.length === d.length || /[\s:–\-,\/]/.test(lower[d.length])));
    if (dayKey) {
      const dayNum = DAY_MAP[dayKey];
      const rest = line.substring(dayKey.length).replace(/^[\s:–\-]+/, '').trim();
      currentDay = dayNum;
      if (!days[dayNum]) days[dayNum] = { label: rest || '', exercises: [] };
      else if (rest && !days[dayNum].label) days[dayNum].label = rest;
      continue;
    }
    const dayNumMatch = line.match(/^day\s+([1-7])\b/i);
    if (dayNumMatch) {
      const n = parseInt(dayNumMatch[1]);
      const dayNum = [1, 2, 3, 4, 5, 6, 0][(n - 1) % 7];
      const rest = line.substring(dayNumMatch[0].length).replace(/^[\s:–\-]+/, '').trim();
      currentDay = dayNum;
      if (!days[dayNum]) days[dayNum] = { label: rest || `Day ${n}`, exercises: [] };
      continue;
    }
    if (currentDay === null) continue;
    if (/^(sets?|reps?|weight|exercise|week|phase|notes?|tempo|rest)\s*$/i.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;

    const srPatterns = [
      /(\d+)\s*[x×X]\s*([\d]+[\-–][\d]+|\d+)/,
      /(\d+)\s+sets?\s+(?:of\s+)?([\d]+[\-–][\d]+|\d+)\s*reps?/i,
      /(\d+)\s*sets?[,\s]+([\d]+[\-–][\d]+|\d+)\s*reps?/i,
    ];
    let sets = null, reps = null, exerciseName = line;
    for (const pat of srPatterns) {
      const m = line.match(pat);
      if (m) {
        sets = parseInt(m[1]);
        reps = m[2].replace('–', '-');
        exerciseName = (line.slice(0, m.index) + line.slice(m.index + m[0].length)).replace(/[-–:,]+$/, '').trim();
        break;
      }
    }
    exerciseName = exerciseName.replace(/^[-•*·◦▪▸\d.)\s]+/, '').trim();
    if (exerciseName.length >= 3 && exerciseName.length <= 60 && !/^\d+(\.\d+)?$/.test(exerciseName)) {
      const ex = { name: exerciseName };
      if (sets) ex.sets = sets;
      if (reps) ex.reps = reps;
      days[currentDay].exercises.push(ex);
    }
  }
  return days;
}

function setupUploadEvents(container, progId, onDone) {
  container.querySelector('#upload-prog-btn')?.addEventListener('click', () => {
    container.querySelector('#upload-prog-input')?.click();
  });

  container.querySelector('#upload-prog-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = container.querySelector('#upload-prog-status');
    e.target.value = '';

    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    const isWord = name.endsWith('.docx') || name.endsWith('.doc') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/msword';

    try {
      if (isPdf || isWord) {
        status.textContent = isPdf ? 'Parsing PDF…' : 'Parsing Word document…';
        status.style.color = 'var(--muted)';
        const text = isPdf ? await extractPdfText(file) : await extractDocxText(file);
        const parsedDays = parseProgrammeText(text);
        const totalEx = Object.values(parsedDays).reduce((n, d) => n + d.exercises.length, 0);
        if (totalEx === 0) {
          status.textContent = '⚠ No exercises detected. Make sure your document has day names (Monday, Tuesday…) followed by exercise lines.';
          status.style.color = 'var(--warning, #ffd700)';
          return;
        }
        const sessions = await getSessions(progId);
        const parsedWeek1 = wrapParsedDaysAsBlocks(parsedDays);
        Object.assign(sessions[1], parsedWeek1);
        for (const dayNum of Object.keys(parsedWeek1)) {
          for (const w of [2, 3, 4]) sessions[w][dayNum] = JSON.parse(JSON.stringify(sessions[1][dayNum]));
        }
        await saveSessions(progId, sessions);
        status.textContent = `✓ Parsed ${totalEx} exercises into Strength blocks (Week 1, copied to weeks 2-4) — refine with the block builder above.`;
        status.style.color = 'var(--success)';
        setTimeout(onDone, 1000);
      } else {
        status.textContent = 'Reading…';
        status.style.color = 'var(--muted)';
        await importJsonProgramme(file, progId);
        status.textContent = '✓ Programme loaded';
        status.style.color = 'var(--success)';
        setTimeout(onDone, 1000);
      }
    } catch (err) {
      status.textContent = '✕ ' + err.message;
      status.style.color = 'var(--danger)';
    }
  });

  container.querySelector('#download-prog-template')?.addEventListener('click', () => {
    const template = {
      name: 'My Programme',
      description: 'Optional — e.g. 4-day upper/lower split',
      weeks: {
        1: {
          weekLabel: 'Foundation', weekHint: 'Base sets and reps as written',
          days: {
            Monday: { label: 'Push', exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8' }, { name: 'Overhead Press', sets: 3, reps: '8-10' }] },
            Tuesday: { label: 'Pull', exercises: [{ name: 'Pull-up', sets: 4, reps: '6-8' }, { name: 'Barbell Row', sets: 3, reps: '8-10' }] },
            Wednesday: { label: 'Rest', exercises: [] },
            Thursday: { label: 'Legs', exercises: [{ name: 'Back Squat', sets: 4, reps: '6-8' }] },
            Friday: { label: 'Upper', exercises: [{ name: 'Incline Bench Press', sets: 3, reps: '8-10' }] },
            Saturday: { label: 'Rest', exercises: [] },
            Sunday: {
              label: 'Advanced example — full block control', focus: 'Optional',
              blocks: [
                { type: 'warmup', items: ['Light walk — 5 min', 'Dynamic stretches — 5 min'] },
                { type: 'skill', name: 'Example Skill', exercises: [{ name: 'Hold progression', sets: 5, target: '10s' }] },
              ],
            },
          },
        },
        2: {
          weekLabel: 'Intensification', weekHint: 'Heavier loads, lower reps',
          days: {
            Monday: { label: 'Push — Heavy', exercises: [{ name: 'Bench Press', sets: 5, reps: '4-6' }] },
          },
        },
      },
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mystats-programme-template.json';
    a.click();
    showToast('Template downloaded!');
  });
}
