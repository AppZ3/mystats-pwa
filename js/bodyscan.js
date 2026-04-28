import { SCAN_HISTORY, TARGETS } from './profile.js';
import { dbAdd, dbPut, dbGetAll, dbDelete } from './db.js';

let editingScan = null; // null = new, object = editing

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

function delta(curr, prev) {
  if (prev == null || curr == null) return '';
  const d = (curr - prev).toFixed(2);
  const cls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero';
  return `<span class="delta ${cls}">${d > 0 ? '+' : ''}${d}</span>`;
}

function progressBar(current, baseline, target, lowerIsBetter = false) {
  let pct = lowerIsBetter
    ? Math.max(0, Math.min(100, ((baseline - current) / (baseline - target)) * 100))
    : Math.max(0, Math.min(100, ((current - baseline) / (target - baseline)) * 100));
  const cls = pct >= 100 ? 'complete' : pct >= 50 ? 'halfway' : 'early';
  return `<div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${pct}%"></div></div><span class="progress-pct">${Math.round(pct)}%</span>`;
}

async function getAllScans() {
  const userScans = await dbGetAll('bodyscans');
  const seedScans = SCAN_HISTORY.map((s, i) => ({ ...s, id: `seed-${i}`, seeded: true }));
  return [...seedScans, ...userScans].sort((a, b) => a.date.localeCompare(b.date));
}

export async function renderBodyScan(container) {
  const scans = await getAllScans();
  const latest = scans[scans.length - 1];
  const prev = scans.length > 1 ? scans[scans.length - 2] : null;
  const es = editingScan;

  container.innerHTML = `
    <div class="section-header">
      <h2>Body Scans</h2>
      <button class="btn-primary btn-sm" id="add-scan-btn">${es ? '✕ Cancel Edit' : '+ Add Scan'}</button>
    </div>

    ${latest && !es ? renderLatestCard(latest, prev) : ''}
    ${latest && !es ? renderTargetsCard(latest) : ''}

    <div class="card" id="scan-form-card" style="${es ? '' : 'display:none'}">
      ${es ? `<div class="editing-banner">✏️ Editing scan from ${formatDate(es.date)} <button id="cancel-scan-edit" class="btn-cancel">Cancel</button></div>` : ''}
      <div class="card-label">${es ? 'Edit Scan' : 'New InBody Scan'}</div>
      ${renderScanForm(es)}
      <button id="save-scan" class="btn-primary">${es ? 'Update Scan' : 'Save Scan'}</button>
    </div>

    <div class="card">
      <div class="card-label">All Scans</div>
      <div class="scan-history">
        ${scans.length === 0 ? '<p class="muted">No scans yet.</p>' : [...scans].reverse().map(s => renderScanHistoryCard(s)).join('')}
      </div>
    </div>
  `;

  setupBodyScanEvents(container);

  if (es) {
    container.querySelector('#scan-form-card')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderLatestCard(latest, prev) {
  return `
    <div class="card scan-latest">
      <div class="card-label">Latest Scan — ${formatDate(latest.date)}</div>
      <div class="scan-grid">
        ${scanRow('Weight', latest.weight, prev?.weight, 'kg')}
        ${scanRow('SMM', latest.smm, prev?.smm, 'kg')}
        ${scanRow('Body Fat %', latest.pbf, prev?.pbf, '%')}
        ${scanRow('InBody Score', latest.inbodyScore, prev?.inbodyScore, '/100')}
        ${scanRow('Body Fat Mass', latest.bodyFatMass, prev?.bodyFatMass, 'kg')}
        ${scanRow('BMR', latest.bmr, prev?.bmr, 'kcal')}
        ${scanRow('BMI', latest.bmi, prev?.bmi, '')}
        ${scanRow('VFL', latest.vfl, prev?.vfl, '')}
        ${scanRow('Phase Angle', latest.phaseAngle, prev?.phaseAngle, '°')}
        ${scanRow('WHR', latest.whr, prev?.whr, '')}
        ${scanRow('Protein', latest.protein, prev?.protein, 'kg')}
        ${scanRow('Minerals', latest.minerals, prev?.minerals, 'kg')}
      </div>
      ${latest.rightArm != null ? `
        <div class="card-label" style="margin-top:1rem">Segmental SMM</div>
        <div class="scan-grid">
          ${scanRow('Right Arm', latest.rightArm, prev?.rightArm, 'kg')}
          ${scanRow('Left Arm', latest.leftArm, prev?.leftArm, 'kg')}
          ${scanRow('Trunk', latest.trunk, prev?.trunk, 'kg')}
          ${scanRow('Right Leg', latest.rightLeg, prev?.rightLeg, 'kg')}
          ${scanRow('Left Leg', latest.leftLeg, prev?.leftLeg, 'kg')}
        </div>` : ''}
      ${latest.notes ? `<p class="muted" style="margin-top:.5rem;font-size:.82rem">📝 ${latest.notes}</p>` : ''}
    </div>
  `;
}

function scanRow(label, curr, prev, unit) {
  return `
    <div class="scan-row">
      <span class="scan-label">${label}</span>
      <span class="scan-val">${curr != null ? curr + unit : '–'} ${delta(curr, prev)}</span>
    </div>`;
}

function renderTargetsCard(latest) {
  if (!latest) return '';
  return `
    <div class="card">
      <div class="card-label">Progress to Elite Targets</div>
      <div class="targets-list">
        ${targetRow('InBody Score', latest.inbodyScore, TARGETS.inbodyScore, '/100', false)}
        ${targetRow('SMM', latest.smm, TARGETS.smm, 'kg', false)}
        ${targetRow('Body Fat %', latest.pbf, TARGETS.bodyFatPct, '%', true)}
        ${targetRow('Phase Angle', latest.phaseAngle, TARGETS.phaseAngle, '°', false)}
        ${targetRow('Protein Mass', latest.protein, TARGETS.proteinMass, 'kg', false)}
        ${targetRow('BMR', latest.bmr, TARGETS.bmr, 'kcal', false)}
        ${targetRow('VFL', latest.vfl, TARGETS.vfl, '', true)}
      </div>
    </div>
  `;
}

function targetRow(label, current, target, unit, lowerIsBetter) {
  if (current == null) return '';
  return `
    <div class="target-item">
      <div class="target-header">
        <span class="target-label">${label}</span>
        <div class="target-values">
          <span class="current">${current}${unit}</span>
          <span class="muted">→ Above avg: ${lowerIsBetter ? target.aboveAvg : target.aboveAvg}${unit}</span>
          <span class="elite-tag">Elite: ${target.elite}${unit}</span>
        </div>
      </div>
      <div class="target-progress">${progressBar(current, target.current, target.elite, lowerIsBetter)}</div>
    </div>
  `;
}

const SCAN_FIELDS = [
  { id: 'weight', label: 'Weight (kg)', step: '0.1' },
  { id: 'tbw', label: 'Total Body Water (L)', step: '0.1' },
  { id: 'protein', label: 'Protein (kg)', step: '0.01' },
  { id: 'minerals', label: 'Minerals (kg)', step: '0.01' },
  { id: 'bodyFatMass', label: 'Body Fat Mass (kg)', step: '0.1' },
  { id: 'smm', label: 'Skeletal Muscle Mass (kg)', step: '0.1' },
  { id: 'pbf', label: 'Body Fat % (PBF)', step: '0.1' },
  { id: 'bmi', label: 'BMI', step: '0.1' },
  { id: 'vfl', label: 'Visceral Fat Level', step: '1' },
  { id: 'vfa', label: 'Visceral Fat Area (cm²)', step: '0.1' },
  { id: 'inbodyScore', label: 'InBody Score (/100)', step: '1' },
  { id: 'bmr', label: 'BMR (kcal)', step: '1' },
  { id: 'ecwRatio', label: 'ECW Ratio', step: '0.001' },
  { id: 'phaseAngle', label: 'Phase Angle (°)', step: '0.1' },
  { id: 'ffmi', label: 'FFMI', step: '0.1' },
  { id: 'whr', label: 'Waist-Hip Ratio', step: '0.01' },
  { id: 'bmc', label: 'Bone Mineral Content (kg)', step: '0.01' },
];
const SEG_FIELDS = [
  { id: 'rightArm', label: 'Right Arm SMM (kg)' },
  { id: 'leftArm', label: 'Left Arm SMM (kg)' },
  { id: 'trunk', label: 'Trunk SMM (kg)' },
  { id: 'rightLeg', label: 'Right Leg SMM (kg)' },
  { id: 'leftLeg', label: 'Left Leg SMM (kg)' },
];

function renderScanForm(prefill) {
  const v = (id) => prefill?.[id] != null ? prefill[id] : '';
  return `
    <div class="form-grid">
      <div class="form-group">
        <label>Scan Date</label>
        <input type="date" id="scan-date" value="${prefill?.date || todayStr()}" class="input-field">
      </div>
      ${SCAN_FIELDS.map(f => `
        <div class="form-group">
          <label>${f.label}</label>
          <input type="number" id="scan-${f.id}" class="input-field" step="${f.step || '0.1'}" min="0" value="${v(f.id)}">
        </div>`).join('')}
    </div>
    <div class="card-label" style="margin-top:1rem">Segmental Muscle Mass</div>
    <div class="form-grid">
      ${SEG_FIELDS.map(f => `
        <div class="form-group">
          <label>${f.label}</label>
          <input type="number" id="scan-${f.id}" class="input-field" step="0.01" min="0" value="${v(f.id)}">
        </div>`).join('')}
    </div>
    <div class="form-group" style="margin-top:.5rem">
      <label>Conditions / Notes</label>
      <input type="text" id="scan-notes" class="input-field" placeholder="e.g. fasted, morning, pre-training" value="${prefill?.notes || ''}">
    </div>
  `;
}

function renderScanHistoryCard(s) {
  return `
    <div class="scan-hist-card">
      <div class="scan-hist-header">
        <strong>${formatDate(s.date)}</strong>
        <div class="scan-hist-badges">
          ${s.weight != null ? `<span class="badge info">${s.weight}kg</span>` : ''}
          ${s.smm != null ? `<span class="badge info">SMM ${s.smm}kg</span>` : ''}
          ${s.pbf != null ? `<span class="badge info">BF ${s.pbf}%</span>` : ''}
          ${s.inbodyScore != null ? `<span class="badge info">Score ${s.inbodyScore}</span>` : ''}
        </div>
        <div style="margin-left:auto;display:flex;gap:.25rem">
          ${!s.seeded ? `<button class="btn-icon edit-scan" data-id="${s.id}" title="Edit">✏️</button>` : '<span class="muted" style="font-size:.7rem">baseline</span>'}
          ${!s.seeded ? `<button class="btn-icon delete-scan" data-id="${s.id}" title="Delete">✕</button>` : ''}
        </div>
      </div>
      ${s.notes ? `<p class="muted" style="font-size:.78rem;margin-top:.25rem">📝 ${s.notes}</p>` : ''}
    </div>
  `;
}

function getNum(id) {
  const v = document.getElementById(id)?.value;
  return v ? parseFloat(v) : null;
}

function setupBodyScanEvents(container) {
  const formEl = container.querySelector('#scan-form-card');
  const addBtn = container.querySelector('#add-scan-btn');

  addBtn?.addEventListener('click', () => {
    if (editingScan) {
      editingScan = null;
      renderBodyScan(container);
      return;
    }
    formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
    addBtn.textContent = formEl.style.display === 'none' ? '+ Add Scan' : '✕ Cancel';
  });

  container.querySelector('#cancel-scan-edit')?.addEventListener('click', () => {
    editingScan = null; renderBodyScan(container);
  });

  container.querySelector('#save-scan')?.addEventListener('click', async () => {
    const scan = {
      date: document.getElementById('scan-date').value,
      notes: document.getElementById('scan-notes')?.value || '',
    };
    [...SCAN_FIELDS, ...SEG_FIELDS].forEach(f => { scan[f.id] = getNum(`scan-${f.id}`); });

    if (!scan.weight && !scan.smm) { showToast('Enter at least weight or SMM'); return; }

    if (editingScan) {
      await dbPut('bodyscans', { id: editingScan.id, ...scan });
      editingScan = null;
      showToast('Scan updated!');
    } else {
      await dbAdd('bodyscans', scan);
      showToast('Scan saved!');
    }
    renderBodyScan(container);
  });

  container.querySelector('.scan-history')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-scan');
    if (editBtn) {
      const allScans = await dbGetAll('bodyscans');
      const scan = allScans.find(s => s.id === +editBtn.dataset.id);
      if (scan) {
        editingScan = scan;
        renderBodyScan(container);
      }
      return;
    }
    const delBtn = e.target.closest('.delete-scan');
    if (delBtn && confirm('Delete this scan?')) {
      await dbDelete('bodyscans', +delBtn.dataset.id);
      renderBodyScan(container);
    }
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
