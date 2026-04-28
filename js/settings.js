import { dbGet, dbPut, dbAdd, dbGetAll, dbDelete, dbClear } from './db.js';
import { MORNING_ROUTINE, SUPPLEMENTS, PROGRAMME_A, PROGRAMME_B, TARGETS, DEFAULT_CHECKLIST_ITEMS, ALL_EXERCISES, SCAN_HISTORY } from './profile.js';
import { getChecklistItems, getMorningRoutine, getSupplements, getProgrammeSchedule, getTargets, getUserProfile } from './config.js';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMING_OPTIONS = ['Morning fasted','Morning','Morning with food','Morning with fat','Morning or pre-training','Pre-training','Post-training','With meals','With meals with fat','With lunch','With lunch with fat','Evening','Evening with food','Before bed'];

const BLOOD_MARKERS = [
  { id: 'vitD',              label: 'Vitamin D3 (25-OH)',       unit: 'ng/mL',  ref: '60-80' },
  { id: 'totalTestosterone', label: 'Total Testosterone',       unit: 'ng/dL',  ref: '600-900' },
  { id: 'freeTestosterone',  label: 'Free Testosterone',        unit: 'pg/mL',  ref: '15-25' },
  { id: 'shbg',              label: 'SHBG',                     unit: 'nmol/L', ref: '20-40' },
  { id: 'cortisol',          label: 'Morning Cortisol (fasted)',unit: 'mcg/dL', ref: '10-20' },
  { id: 'igf1',              label: 'IGF-1',                    unit: 'ng/mL',  ref: '200-300' },
  { id: 'zinc',              label: 'Zinc (serum)',              unit: 'mcg/dL', ref: '80-120' },
  { id: 'copper',            label: 'Copper (serum)',           unit: 'mcg/dL', ref: '70-140' },
  { id: 'magnesiumRBC',      label: 'Magnesium (RBC)',          unit: 'mg/dL',  ref: '5.0-6.5' },
  { id: 'ferritin',          label: 'Ferritin',                 unit: 'ng/mL',  ref: '50-150' },
  { id: 'b12',               label: 'Vitamin B12',              unit: 'pg/mL',  ref: '400-900' },
  { id: 'alt',               label: 'ALT',                      unit: 'U/L',    ref: '<40' },
  { id: 'ast',               label: 'AST',                      unit: 'U/L',    ref: '<40' },
  { id: 'fastingGlucose',    label: 'Fasting Glucose',          unit: 'mg/dL',  ref: '70-85' },
  { id: 'hba1c',             label: 'HbA1c',                    unit: '%',      ref: '<5.4' },
  { id: 'omega3Index',       label: 'Omega-3 Index',            unit: '%',      ref: '8-12' },
  { id: 'hdl',               label: 'HDL Cholesterol',          unit: 'mg/dL',  ref: '>50' },
  { id: 'ldl',               label: 'LDL Cholesterol',          unit: 'mg/dL',  ref: '<100' },
  { id: 'triglycerides',     label: 'Triglycerides',            unit: 'mg/dL',  ref: '<100' },
];

const TARGET_ROWS = [
  { key: 'inbodyScore', label: 'InBody Score',  unit: '/100' },
  { key: 'bodyFatPct',  label: 'Body Fat %',    unit: '%' },
  { key: 'smm',         label: 'SMM',           unit: 'kg' },
  { key: 'vfl',         label: 'VFL',           unit: '' },
  { key: 'phaseAngle',  label: 'Phase Angle',   unit: '°' },
  { key: 'bmr',         label: 'BMR',           unit: 'kcal' },
  { key: 'proteinMass', label: 'Protein Mass',  unit: 'kg' },
];

let openSections = new Set(['profile']);

// ── Public API ─────────────────────────────────────────────────────────────
export async function renderSettings(container) {
  const [checklistItems, routineSteps, supplements, schedA, schedB, targets, profile, bloodwork] = await Promise.all([
    getChecklistItems(), getMorningRoutine(), getSupplements(),
    getProgrammeSchedule('A'), getProgrammeSchedule('B'),
    getTargets(), getUserProfile(), dbGetAll('bloodwork'),
  ]);

  container.innerHTML = `
    <div class="section-header">
      <h2>Settings & Calibrate</h2>
      <p class="muted">Customise everything · Changes save immediately</p>
    </div>
    ${section('profile',     '⚙️ Profile',             renderProfile(profile))}
    ${section('checklist',   '☑️ Daily Checklist',      renderChecklist(checklistItems))}
    ${section('routine',     '🌅 Morning Routine',      renderRoutine(routineSteps))}
    ${section('supplements', '💊 Supplement Stack',     renderSupplements(supplements))}
    ${section('progA',       '💪 Programme A Schedule', renderProgramme('A', schedA))}
    ${section('progB',       '💪 Programme B Schedule', renderProgramme('B', schedB))}
    ${section('targets',     '🎯 Body Targets',         renderTargets(targets))}
    ${section('bloodwork',   '🩸 Blood Work',           renderBloodwork(bloodwork))}
    ${section('data',        '📤 Data & Export',        renderData())}
  `;

  setupEvents(container, { checklistItems, routineSteps, supplements, schedA, schedB, targets, profile, bloodwork });
}

// ── Accordion wrapper ─────────────────────────────────────────────────────
function section(id, title, content) {
  const open = openSections.has(id);
  return `
    <div class="settings-section card" data-section="${id}">
      <div class="settings-section-header" data-toggle="${id}">
        <span class="settings-section-title">${title}</span>
        <span class="settings-section-arrow">${open ? '▲' : '▼'}</span>
      </div>
      <div class="settings-section-body ${open ? '' : 'hidden'}" id="ssec-${id}">
        ${content}
      </div>
    </div>`;
}

// ── Section renderers ─────────────────────────────────────────────────────
const GOAL_OPTIONS = [
  { id: 'muscle',      label: 'Build Muscle' },
  { id: 'fat',         label: 'Lose Fat' },
  { id: 'performance', label: 'Performance' },
  { id: 'health',      label: 'General Health' },
];

function renderProfile(p) {
  return `
    <div class="form-grid">
      <div class="form-group" style="grid-column:1/-1"><label>Name</label>
        <input type="text" id="p-name" class="input-field" value="${p.name||''}" placeholder="Your name"></div>
      <div class="form-group"><label>Age</label>
        <input type="number" id="p-age" class="input-field" value="${p.age||''}" min="1" max="120" placeholder="25"></div>
      <div class="form-group"><label>Sex</label>
        <select id="p-sex" class="input-field">
          <option value="M" ${p.sex==='M'?'selected':''}>Male</option>
          <option value="F" ${p.sex==='F'?'selected':''}>Female</option>
          <option value="" ${!p.sex||p.sex===''?'selected':''}>Prefer not to say</option>
        </select></div>
      <div class="form-group"><label>Height (cm)</label>
        <input type="number" id="p-height" class="input-field" value="${p.height||''}" step="0.5" placeholder="175"></div>
      <div class="form-group"><label>Weight (kg)</label>
        <input type="number" id="p-weight" class="input-field" value="${p.startWeight||''}" step="0.1" placeholder="70"></div>
      <div class="form-group"><label>Daily Protein Target (g)</label>
        <input type="number" id="p-protein" class="input-field" value="${p.proteinTarget||150}" step="1"></div>
      <div class="form-group"><label>Primary Goal</label>
        <select id="p-goal" class="input-field">
          ${GOAL_OPTIONS.map(g => `<option value="${g.id}" ${p.goal===g.id?'selected':''}>${g.label}</option>`).join('')}
        </select></div>
    </div>
    <button class="btn-primary" id="save-profile" style="margin-top:.75rem">Save Profile</button>`;
}

function renderChecklist(items) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Add, remove or rename checklist items. Changes apply on the Today tab.</p>
    <div class="edit-list" id="checklist-list">
      ${items.map((item, i) => checklistRow(item, i)).join('')}
    </div>
    <div class="add-item-row">
      <input type="text" id="new-cl-icon" class="set-input" placeholder="🔥" style="width:3rem;text-align:center">
      <input type="text" id="new-cl-label" class="input-field" placeholder="New item..." style="flex:1">
      <button class="btn-primary btn-sm" id="add-cl-item">Add</button>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn-primary" id="save-checklist" style="flex:1">Save Checklist</button>
      <button class="btn-secondary" id="reset-checklist" style="flex:1">Reset to Default</button>
    </div>`;
}

function checklistRow(item, i) {
  return `
    <div class="edit-list-item" data-idx="${i}">
      <input type="text" class="set-input cl-icon-in" value="${item.icon||''}" placeholder="🏃" style="width:3rem;text-align:center">
      <input type="text" class="input-field cl-label-in" value="${item.label}" style="flex:1" placeholder="Label">
      <button class="btn-icon rem-cl" data-idx="${i}">✕</button>
    </div>`;
}

function renderRoutine(steps) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Morning CARs routine steps shown on the Today tab.</p>
    <div class="edit-list" id="routine-list">
      ${steps.map((step, i) => routineRow(step, i)).join('')}
    </div>
    <div class="add-item-row">
      <input type="text" id="new-routine-step" class="input-field" placeholder="New step..." style="flex:1">
      <button class="btn-primary btn-sm" id="add-routine-step">Add</button>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn-primary" id="save-routine" style="flex:1">Save Routine</button>
      <button class="btn-secondary" id="reset-routine" style="flex:1">Reset to Default</button>
    </div>`;
}

function routineRow(step, i) {
  return `
    <div class="edit-list-item" data-idx="${i}">
      <span class="drag-handle">⠿</span>
      <input type="text" class="input-field routine-step-in" value="${step}" style="flex:1">
      <button class="btn-icon rem-routine" data-idx="${i}">✕</button>
    </div>`;
}

function renderSupplements(supplements) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Full supplement stack. Phase 1 = Foundation, 2 = Hormone/Cognition, 3 = Longevity.</p>
    <div class="edit-list" id="supp-list">
      ${supplements.map((s, i) => suppRow(s, i)).join('')}
    </div>
    <div class="add-item-row" style="flex-wrap:wrap;gap:.35rem">
      <input type="text" id="new-supp-name" class="input-field" placeholder="Supplement name..." style="flex:2;min-width:160px">
      <select id="new-supp-timing" class="input-field" style="flex:1;min-width:120px;font-size:.82rem">
        ${TIMING_OPTIONS.map(t => `<option>${t}</option>`).join('')}
      </select>
      <button class="btn-primary btn-sm" id="add-supp">Add</button>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn-primary" id="save-supps" style="flex:1">Save Stack</button>
      <button class="btn-secondary" id="reset-supps" style="flex:1">Reset to Default</button>
    </div>`;
}

function suppRow(s, i) {
  return `
    <div class="edit-list-item supp-edit-item" data-idx="${i}">
      <div class="supp-edit-main">
        <input type="text" class="input-field supp-name-in" value="${s.name||''}" placeholder="Name" data-idx="${i}">
        <select class="input-field supp-timing-in" data-idx="${i}" style="font-size:.82rem">
          ${TIMING_OPTIONS.map(t => `<option ${s.timing===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="supp-edit-meta">
        <label class="meta-label">Phase</label>
        <select class="set-input supp-phase-in" data-idx="${i}" style="width:3.5rem">
          ${[1,2,3].map(n => `<option ${s.phase===n?'selected':''}>${n}</option>`).join('')}
        </select>
        <label class="meta-label">+fat</label>
        <input type="checkbox" class="supp-fat-in" data-idx="${i}" ${s.withFat?'checked':''}>
        <button class="btn-icon rem-supp" data-idx="${i}">✕</button>
      </div>
    </div>`;
}

function renderProgramme(prog, schedule) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Edit session labels and exercises for each day of Programme ${prog}.</p>
    <div id="prog-${prog}-days">
      ${[1,2,3,4,5,6,0].map(day => {
        const s = schedule[day] || { label: '', exercises: [] };
        return `
          <div class="prog-day-block" data-day="${day}" data-prog="${prog}">
            <div class="prog-day-name">${DAY_NAMES[day]}</div>
            <input type="text" class="input-field prog-label-in" value="${s.label||''}" placeholder="Session label (or leave blank for Rest)" data-day="${day}" data-prog="${prog}">
            <div class="edit-list prog-ex-list" id="prog-${prog}-ex-${day}" style="margin:.3rem 0">
              ${(s.exercises||[]).map((ex, ei) => progExRow(ex, ei, day, prog)).join('')}
            </div>
            <div class="add-item-row" style="position:relative">
              <input type="text" class="input-field prog-ex-search" placeholder="Search or type exercise to add..." data-day="${day}" data-prog="${prog}" style="flex:1" autocomplete="off">
              <div class="dropdown hidden prog-ex-dd" data-day="${day}" data-prog="${prog}"></div>
            </div>
          </div>`;
      }).join('')}
    </div>
    <button class="btn-primary save-prog-btn" data-prog="${prog}" style="margin-top:.75rem">Save Programme ${prog}</button>`;
}

function progExRow(ex, ei, day, prog) {
  return `
    <div class="edit-list-item prog-ex-item" data-day="${day}" data-prog="${prog}" data-ei="${ei}">
      <span class="prog-ex-name" style="flex:1">${ex}</span>
      <button class="btn-icon rem-prog-ex" data-day="${day}" data-prog="${prog}" data-ei="${ei}">✕</button>
    </div>`;
}

function renderTargets(targets) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Set your baseline and goals. Use <strong>Sync from Latest Scan</strong> to auto-update baselines after a new InBody.</p>
    <div class="targets-edit-table">
      <div class="targets-edit-header">
        <span>Metric</span><span>Baseline</span><span>Above Avg</span><span>Elite Goal</span>
      </div>
      ${TARGET_ROWS.map(r => {
        const t = targets[r.key] || {};
        return `
          <div class="targets-edit-row" data-key="${r.key}">
            <span class="targets-edit-label">${r.label}<small class="muted"> ${r.unit}</small></span>
            <input type="number" class="set-input t-curr" value="${t.current??''}" step="0.1" data-key="${r.key}" placeholder="now">
            <input type="number" class="set-input t-avg"  value="${t.aboveAvg??''}" step="0.1" data-key="${r.key}" placeholder="avg">
            <input type="number" class="set-input t-elite" value="${t.elite??''}" step="0.1" data-key="${r.key}" placeholder="goal">
          </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
      <button class="btn-primary" id="save-targets" style="flex:1">Save Targets</button>
      <button class="btn-secondary" id="sync-from-scan" style="flex:1">↺ Sync from Latest Scan</button>
    </div>`;
}

function renderBloodwork(bloodwork) {
  const sorted = [...bloodwork].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
      <p class="muted" style="font-size:.8rem">Log blood panels with your target reference ranges.</p>
      <button class="btn-primary btn-sm" id="toggle-blood-form">+ Log Results</button>
    </div>

    <div id="blood-form" style="display:none;margin-bottom:.75rem">
      <div class="form-grid" style="margin-bottom:.5rem">
        <div class="form-group"><label>Test Date</label>
          <input type="date" id="blood-date" class="input-field" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Lab / Notes</label>
          <input type="text" id="blood-notes" class="input-field" placeholder="e.g. Laverty, fasted 12h"></div>
      </div>
      <div class="blood-markers-grid">
        ${BLOOD_MARKERS.map(m => `
          <div class="blood-marker-row">
            <label class="blood-marker-label">${m.label}</label>
            <div class="blood-input-wrap">
              <input type="number" id="bm-${m.id}" class="input-field" step="0.01" placeholder="${m.ref}">
              <span class="blood-unit muted">${m.unit}</span>
              <span class="blood-ref">${m.ref}</span>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn-primary" id="save-bloodwork" style="margin-top:.75rem">Save Blood Work</button>
    </div>

    ${latest ? `
      <div class="card-label">Latest — ${fmtDate(latest.date)}${latest.notes ? ' · ' + latest.notes : ''}</div>
      <div class="blood-results-list">
        ${BLOOD_MARKERS.filter(m => latest.markers?.[m.id] != null).map(m => {
          const val = latest.markers[m.id];
          const status = bloodStatus(m, val);
          return `
            <div class="blood-result-row">
              <span class="blood-result-label">${m.label}</span>
              <span class="blood-result-val ${status}">${val}<small> ${m.unit}</small></span>
              <span class="blood-result-ref muted">${m.ref}</span>
            </div>`;
        }).join('')}
      </div>
    ` : '<p class="muted">No blood work logged yet.</p>'}

    ${sorted.length > 1 ? `
      <div class="card-label" style="margin-top:.75rem">Previous Panels</div>
      <div class="blood-history-list">
        ${sorted.slice(1).map(b => `
          <div class="blood-hist-row">
            <span>${fmtDate(b.date)}</span>
            <span class="muted">${b.notes||''}</span>
            <span class="muted">${Object.keys(b.markers||{}).length} markers</span>
            <button class="btn-icon delete-blood" data-id="${b.id}">✕</button>
          </div>`).join('')}
      </div>` : ''}`;
}

function renderData() {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.75rem">Export your data as a JSON backup, or import a backup from another device.</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="btn-primary" id="export-data" style="flex:1">📤 Export All Data</button>
      <button class="btn-secondary" id="import-data-btn" style="flex:1">📥 Import Backup</button>
    </div>
    <input type="file" id="import-file-input" accept=".json" style="display:none">
    <div id="import-status" style="margin-top:.5rem;font-size:.85rem"></div>
    <div class="card-label" style="margin-top:1rem;color:var(--danger)">Danger Zone</div>
    <button class="btn-danger" id="reset-app">⚠️ Reset All App Data</button>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function bloodStatus(marker, val) {
  const ref = marker.ref;
  if (ref.startsWith('<')) { return val < parseFloat(ref.slice(1)) ? 'blood-ok' : 'blood-high'; }
  if (ref.startsWith('>')) { return val > parseFloat(ref.slice(1)) ? 'blood-ok' : 'blood-low'; }
  const [lo, hi] = ref.split('-').map(Number);
  if (!isNaN(lo) && !isNaN(hi)) return val >= lo && val <= hi ? 'blood-ok' : val < lo ? 'blood-low' : 'blood-high';
  return '';
}

// ── Event setup ────────────────────────────────────────────────────────────
function setupEvents(container, data) {
  // Accordion toggles
  container.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const id = hdr.dataset.toggle;
      openSections.has(id) ? openSections.delete(id) : openSections.add(id);
      container.querySelector(`#ssec-${id}`)?.classList.toggle('hidden', !openSections.has(id));
      hdr.querySelector('.settings-section-arrow').textContent = openSections.has(id) ? '▲' : '▼';
    });
  });

  setupProfileEvents(container);
  setupChecklistEvents(container, data.checklistItems);
  setupRoutineEvents(container, data.routineSteps);
  setupSuppEvents(container, data.supplements);
  setupProgEvents(container, 'A', data.schedA);
  setupProgEvents(container, 'B', data.schedB);
  setupTargetEvents(container, data.targets);
  setupBloodworkEvents(container, data.bloodwork);
  setupDataEvents(container);
}

// Profile
function setupProfileEvents(container) {
  container.querySelector('#save-profile')?.addEventListener('click', async () => {
    const value = {
      name:          container.querySelector('#p-name')?.value.trim() || '',
      age:           parseInt(container.querySelector('#p-age')?.value)     || null,
      sex:           container.querySelector('#p-sex')?.value               || '',
      height:        parseFloat(container.querySelector('#p-height')?.value) || null,
      startWeight:   parseFloat(container.querySelector('#p-weight')?.value) || null,
      proteinTarget: parseInt(container.querySelector('#p-protein')?.value)  || 150,
      goal:          container.querySelector('#p-goal')?.value              || 'health',
    };
    await dbPut('settings', { key: 'user_profile', value });
    showToast('Profile saved!');
  });
}

// Checklist
function setupChecklistEvents(container, initial) {
  let items = [...initial];

  const refresh = () => {
    const list = container.querySelector('#checklist-list');
    if (list) list.innerHTML = items.map((item, i) => checklistRow(item, i)).join('');
    attachClRemove();
  };
  const attachClRemove = () => {
    container.querySelectorAll('.rem-cl').forEach(btn => {
      btn.onclick = () => { items.splice(+btn.dataset.idx, 1); refresh(); };
    });
  };
  attachClRemove();

  container.querySelector('#add-cl-item')?.addEventListener('click', () => {
    const icon = container.querySelector('#new-cl-icon').value.trim() || '•';
    const label = container.querySelector('#new-cl-label').value.trim();
    if (!label) { showToast('Enter a label'); return; }
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    items.push({ key, label, icon });
    container.querySelector('#new-cl-icon').value = '';
    container.querySelector('#new-cl-label').value = '';
    refresh();
  });

  container.querySelector('#save-checklist')?.addEventListener('click', async () => {
    items = [...container.querySelectorAll('#checklist-list .edit-list-item')].map((row, i) => ({
      key: items[i]?.key || `item_${i}`,
      icon: row.querySelector('.cl-icon-in')?.value || '',
      label: row.querySelector('.cl-label-in')?.value || '',
    }));
    await dbPut('settings', { key: 'checklist_items', value: items });
    showToast('Checklist saved!');
  });

  container.querySelector('#reset-checklist')?.addEventListener('click', async () => {
    if (!confirm('Reset checklist to defaults?')) return;
    await dbPut('settings', { key: 'checklist_items', value: DEFAULT_CHECKLIST_ITEMS });
    items = [...DEFAULT_CHECKLIST_ITEMS];
    refresh();
    showToast('Checklist reset!');
  });
}

// Morning Routine
function setupRoutineEvents(container, initial) {
  let steps = [...initial];

  const refresh = () => {
    const list = container.querySelector('#routine-list');
    if (list) list.innerHTML = steps.map((s, i) => routineRow(s, i)).join('');
    attachRemove();
  };
  const attachRemove = () => {
    container.querySelectorAll('.rem-routine').forEach(btn => {
      btn.onclick = () => { steps.splice(+btn.dataset.idx, 1); refresh(); };
    });
  };
  attachRemove();

  container.querySelector('#add-routine-step')?.addEventListener('click', () => {
    const val = container.querySelector('#new-routine-step').value.trim();
    if (!val) { showToast('Enter a step'); return; }
    steps.push(val); container.querySelector('#new-routine-step').value = '';
    refresh();
  });

  container.querySelector('#save-routine')?.addEventListener('click', async () => {
    const updated = [...container.querySelectorAll('.routine-step-in')].map(i => i.value).filter(Boolean);
    await dbPut('settings', { key: 'morning_routine', value: updated });
    showToast('Routine saved!');
  });

  container.querySelector('#reset-routine')?.addEventListener('click', async () => {
    if (!confirm('Reset morning routine to defaults?')) return;
    await dbPut('settings', { key: 'morning_routine', value: MORNING_ROUTINE });
    steps = [...MORNING_ROUTINE]; refresh();
    showToast('Routine reset!');
  });
}

// Supplements
function setupSuppEvents(container, initial) {
  let supps = JSON.parse(JSON.stringify(initial));

  const refresh = () => {
    const list = container.querySelector('#supp-list');
    if (list) list.innerHTML = supps.map((s, i) => suppRow(s, i)).join('');
    attachRemove();
  };
  const attachRemove = () => {
    container.querySelectorAll('.rem-supp').forEach(btn => {
      btn.onclick = () => { supps.splice(+btn.dataset.idx, 1); refresh(); };
    });
  };
  attachRemove();

  container.querySelector('#add-supp')?.addEventListener('click', () => {
    const name = container.querySelector('#new-supp-name').value.trim();
    const timing = container.querySelector('#new-supp-timing').value;
    if (!name) { showToast('Enter supplement name'); return; }
    supps.push({ name, timing, phase: 1, withFat: false });
    container.querySelector('#new-supp-name').value = '';
    refresh();
  });

  container.querySelector('#save-supps')?.addEventListener('click', async () => {
    const rows = [...container.querySelectorAll('#supp-list .supp-edit-item')];
    const updated = rows.map((row, i) => ({
      name: row.querySelector('.supp-name-in')?.value || supps[i]?.name || '',
      timing: row.querySelector('.supp-timing-in')?.value || supps[i]?.timing || '',
      phase: parseInt(row.querySelector('.supp-phase-in')?.value) || 1,
      withFat: row.querySelector('.supp-fat-in')?.checked || false,
    }));
    await dbPut('settings', { key: 'supplements', value: updated });
    showToast('Supplement stack saved!');
  });

  container.querySelector('#reset-supps')?.addEventListener('click', async () => {
    if (!confirm('Reset supplements to defaults?')) return;
    await dbPut('settings', { key: 'supplements', value: SUPPLEMENTS });
    supps = JSON.parse(JSON.stringify(SUPPLEMENTS)); refresh();
    showToast('Supplements reset!');
  });
}

// Programme schedule
function setupProgEvents(container, prog, schedule) {
  // Exercise search dropdowns
  container.querySelectorAll(`.prog-ex-search[data-prog="${prog}"]`).forEach(input => {
    const day = +input.dataset.day;
    const dd = container.querySelector(`.prog-ex-dd[data-day="${day}"][data-prog="${prog}"]`);
    if (!dd) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      if (!q) { dd.classList.add('hidden'); return; }
      const matches = ALL_EXERCISES.filter(e => e.toLowerCase().includes(q)).slice(0, 6);
      const custom = input.value.trim();
      const hasExact = matches.some(m => m.toLowerCase() === custom.toLowerCase());
      dd.innerHTML = matches.map(e => `<div class="dropdown-item" data-name="${e}">${e}</div>`).join('') +
        (!hasExact && custom ? `<div class="dropdown-item" data-name="${custom}">+ Add "${custom}"</div>` : '');
      dd.classList.remove('hidden');
      dd.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          addProgExercise(container, prog, day, item.dataset.name);
          input.value = ''; dd.classList.add('hidden');
        });
      });
    });
    document.addEventListener('click', e => {
      if (!input.parentElement?.contains(e.target)) dd.classList.add('hidden');
    });
  });

  // Remove exercise (delegated)
  container.querySelector(`#prog-${prog}-days`)?.addEventListener('click', e => {
    const btn = e.target.closest('.rem-prog-ex');
    if (btn) btn.closest('.prog-ex-item')?.remove();
  });

  // Save programme
  container.querySelector(`.save-prog-btn[data-prog="${prog}"]`)?.addEventListener('click', async () => {
    const newSchedule = {};
    [1,2,3,4,5,6,0].forEach(day => {
      const label = container.querySelector(`.prog-label-in[data-day="${day}"][data-prog="${prog}"]`)?.value || '';
      const exercises = [...container.querySelectorAll(`#prog-${prog}-ex-${day} .prog-ex-name`)].map(el => el.textContent.trim());
      newSchedule[day] = { label, exercises };
    });
    await dbPut('settings', { key: `programme_${prog.toLowerCase()}_schedule`, value: newSchedule });
    showToast(`Programme ${prog} saved!`);
  });
}

function addProgExercise(container, prog, day, name) {
  const list = container.querySelector(`#prog-${prog}-ex-${day}`);
  if (!list) return;
  const ei = list.querySelectorAll('.prog-ex-item').length;
  list.insertAdjacentHTML('beforeend', progExRow(name, ei, day, prog));
}

// Targets
function setupTargetEvents(container, targets) {
  container.querySelector('#save-targets')?.addEventListener('click', async () => {
    const newTargets = JSON.parse(JSON.stringify(targets));
    container.querySelectorAll('.targets-edit-row').forEach(row => {
      const key = row.dataset.key;
      if (!newTargets[key]) newTargets[key] = {};
      newTargets[key].current  = parseFloat(row.querySelector('.t-curr')?.value) || 0;
      newTargets[key].aboveAvg = parseFloat(row.querySelector('.t-avg')?.value) || 0;
      newTargets[key].elite    = parseFloat(row.querySelector('.t-elite')?.value) || 0;
    });
    await dbPut('settings', { key: 'targets', value: newTargets });
    showToast('Targets saved! Progress bars update on next visit.');
  });

  container.querySelector('#sync-from-scan')?.addEventListener('click', async () => {
    const userScans = await dbGetAll('bodyscans');
    const allScans = [...SCAN_HISTORY.map((s,i) => ({...s, id:`seed-${i}`})), ...userScans]
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = allScans[allScans.length - 1];
    if (!latest) { showToast('No scan data found'); return; }

    const saved = await dbGet('settings', 'targets');
    const current = JSON.parse(JSON.stringify(saved?.value || targets));
    const map = { inbodyScore:'inbodyScore', pbf:'bodyFatPct', smm:'smm', vfl:'vfl', phaseAngle:'phaseAngle', bmr:'bmr', protein:'proteinMass' };
    Object.entries(map).forEach(([scanKey, tKey]) => {
      if (latest[scanKey] != null && current[tKey]) current[tKey].current = latest[scanKey];
    });
    await dbPut('settings', { key: 'targets', value: current });
    showToast(`Baselines synced from scan on ${fmtDate(latest.date)}`);
    // Refresh the target inputs
    Object.entries(map).forEach(([, tKey]) => {
      const row = container.querySelector(`.targets-edit-row[data-key="${tKey}"]`);
      if (row && current[tKey]) row.querySelector('.t-curr').value = current[tKey].current;
    });
  });
}

// Blood work
function setupBloodworkEvents(container, bloodwork) {
  container.querySelector('#toggle-blood-form')?.addEventListener('click', () => {
    const form = container.querySelector('#blood-form');
    if (!form) return;
    const showing = form.style.display !== 'none';
    form.style.display = showing ? 'none' : 'block';
    container.querySelector('#toggle-blood-form').textContent = showing ? '+ Log Results' : '✕ Cancel';
  });

  container.querySelector('#save-bloodwork')?.addEventListener('click', async () => {
    const date = container.querySelector('#blood-date')?.value;
    const notes = container.querySelector('#blood-notes')?.value || '';
    const markers = {};
    BLOOD_MARKERS.forEach(m => {
      const v = container.querySelector(`#bm-${m.id}`)?.value;
      if (v) markers[m.id] = parseFloat(v);
    });
    if (!Object.keys(markers).length) { showToast('Enter at least one marker value'); return; }
    await dbAdd('bloodwork', { date, notes, markers });
    showToast('Blood work saved!');
    renderSettings(container);
  });

  container.querySelector('#ssec-bloodwork')?.addEventListener('click', async e => {
    const btn = e.target.closest('.delete-blood');
    if (btn && confirm('Delete this blood work entry?')) {
      await dbDelete('bloodwork', +btn.dataset.id);
      renderSettings(container);
    }
  });
}

// Data export/reset
function setupDataEvents(container) {
  container.querySelector('#export-data')?.addEventListener('click', async () => {
    const [workouts, runs, scans, checklists, reminders, bloodwork, settings] = await Promise.all([
      dbGetAll('workouts'), dbGetAll('runs'), dbGetAll('bodyscans'), dbGetAll('checklist'),
      dbGetAll('reminders'), dbGetAll('bloodwork'), dbGetAll('settings'),
    ]);
    const data = { exported: new Date().toISOString(), workouts, runs, bodyscans: scans, checklists, reminders, bloodwork, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mystats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Data exported!');
  });

  container.querySelector('#import-data-btn')?.addEventListener('click', () => {
    container.querySelector('#import-file-input')?.click();
  });

  container.querySelector('#import-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = container.querySelector('#import-status');
    status.textContent = 'Reading file…';
    status.style.color = 'var(--muted)';
    try {
      await importBackup(file);
      status.textContent = '✓ Import complete — reloading…';
      status.style.color = 'var(--success)';
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      status.textContent = '✕ Import failed: ' + err.message;
      status.style.color = 'var(--danger)';
    }
  });

  container.querySelector('#reset-app')?.addEventListener('click', async () => {
    if (!confirm('⚠️ Delete ALL data? This cannot be undone.')) return;
    if (!confirm('Final confirmation: wipe everything?')) return;
    indexedDB.deleteDatabase('mystats');
    showToast('Data cleared — reloading…');
    setTimeout(() => location.reload(), 1500);
  });
}

export async function importBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.exported) throw new Error('Not a valid MyStats backup file');

  // Settings: upsert (keyPath = key)
  for (const s of (data.settings || [])) await dbPut('settings', s);

  // Auto-increment stores: clear then re-add without old IDs
  const autoStores = [
    { name: 'workouts',  records: data.workouts  },
    { name: 'runs',      records: data.runs      },
    { name: 'bodyscans', records: data.bodyscans },
    { name: 'reminders', records: data.reminders },
    { name: 'bloodwork', records: data.bloodwork },
  ];
  for (const { name, records } of autoStores) {
    await dbClear(name);
    for (const r of (records || [])) {
      const { id, ...rest } = r;
      await dbAdd(name, rest);
    }
  }

  // Checklist: keyed by date, use put
  await dbClear('checklist');
  for (const c of (data.checklists || [])) await dbPut('checklist', c);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}
