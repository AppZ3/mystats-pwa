import { esc } from './db.js';
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, getSessions, saveSessions, BLOCK_TYPES, MAX_PROGRAMMES } from './programmes.js';

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
        <button class="btn-icon delete-prog-btn" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">✕</button>
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
  const sessions = await getSessions(progId);
  const day = sessions[editorDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  editingBlocks = day.blocks.map(b => JSON.parse(JSON.stringify(b)));

  mount.innerHTML = `
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
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching days without saving discards unsaved edits on this day.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
  `;
  setupBlockEditorEvents(container, progId);
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
          <button class="btn-icon remove-block" data-bi="${bi}" aria-label="Remove block">✕</button>
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
          <button class="btn-icon rem-blk-item" data-bi="${bi}" data-xi="${xi}" aria-label="Remove item">✕</button>
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
    const sessions = await getSessions(progId);
    const label = container.querySelector('#ed-day-label')?.value || '';
    const focus = container.querySelector('#ed-day-focus')?.value || '';
    sessions[editorDay] = { label, focus, blocks: editingBlocks };
    await saveSessions(progId, sessions);
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
      <button class="btn-icon rem-blk-exercise" data-bi="${bi}" data-xi="${xi}" aria-label="Remove exercise">✕</button>
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
