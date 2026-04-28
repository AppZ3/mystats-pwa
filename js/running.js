import { dbAdd, dbPut, dbGetAll, dbDelete } from './db.js';

let editingRun = null; // null = new, object = editing

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function calcPace(distKm, secs) {
  if (!distKm || !secs) return null;
  const spk = secs / distKm;
  return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2,'0')} /km`;
}

function calcSpeed(distKm, secs) {
  if (!distKm || !secs) return null;
  return ((distKm / secs) * 3600).toFixed(1);
}

export async function renderRunning(container) {
  const allRuns = await dbGetAll('runs');
  const sorted = allRuns.sort((a, b) => b.date.localeCompare(a.date));

  const totalKm = allRuns.reduce((s, r) => s + (r.distance || 0), 0);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const thisWeekKm = allRuns.filter(r => new Date(r.date) >= startOfWeek).reduce((s, r) => s + (r.distance || 0), 0);

  const er = editingRun;

  container.innerHTML = `
    <div class="section-header"><h2>Run Logger</h2></div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-val">${thisWeekKm.toFixed(1)}<span class="stat-unit">km</span></div><div class="stat-label">This Week</div></div>
      <div class="stat-card"><div class="stat-val">${totalKm.toFixed(1)}<span class="stat-unit">km</span></div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-val">${allRuns.length}</div><div class="stat-label">Sessions</div></div>
    </div>

    <div class="card" id="run-form-card">
      ${er ? `<div class="editing-banner">✏️ Editing run from ${formatDate(er.date)} <button id="cancel-run-edit" class="btn-cancel">Cancel</button></div>` : ''}
      <div class="card-label">${er ? 'Edit Run' : 'Log a Run'}</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="run-date" value="${er?.date || todayStr()}" class="input-field">
        </div>
        <div class="form-group">
          <label>Distance (km)</label>
          <input type="number" id="run-dist" placeholder="8.5" value="${er?.distance || ''}" min="0" step="0.01" class="input-field">
        </div>
        <div class="form-group">
          <label>Duration</label>
          <input type="text" id="run-dur" placeholder="42:30 or 1:02:00" value="${er?.duration || ''}" class="input-field">
        </div>
        <div class="form-group">
          <label>Avg BPM</label>
          <input type="number" id="run-bpm" placeholder="155" value="${er?.avgBPM || ''}" min="0" class="input-field">
        </div>
        <div class="form-group">
          <label>Max BPM</label>
          <input type="number" id="run-maxbpm" placeholder="178" value="${er?.maxBPM || ''}" min="0" class="input-field">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="run-type" class="input-field">
            ${['Easy run','Tempo run','Long run','Interval (800m)','Interval (1km)','Hill run','Race'].map(t =>
              `<option ${er?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full-width">
          <label>Notes</label>
          <input type="text" id="run-notes" placeholder="How did it feel?" value="${er?.notes || ''}" class="input-field">
        </div>
      </div>
      <div id="run-preview" class="run-preview hidden"></div>
      <button id="save-run" class="btn-primary">${er ? 'Update Run' : 'Save Run'}</button>
    </div>

    <div class="card">
      <div class="card-label">Run History</div>
      <div id="run-history">
        ${sorted.length === 0 ? '<p class="muted">No runs logged yet.</p>' : sorted.map(r => renderRunCard(r)).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-label">Running Targets</div>
      <div class="target-list">
        <div class="target-row"><span>Month 1-2 volume</span><span class="badge info">25-30 km/week</span></div>
        <div class="target-row"><span>Month 3-4 volume</span><span class="badge info">30-35 km/week</span></div>
        <div class="target-row"><span>Month 5-6 volume</span><span class="badge info">35-40 km/week</span></div>
        <div class="target-row"><span>Key session</span><span class="badge info">6×800m → 8×800m</span></div>
        <div class="target-row"><span>Tempo run</span><span class="badge info">4km tempo</span></div>
        <div class="target-row"><span>Long run month 1-2</span><span class="badge info">60 min</span></div>
        <div class="target-row"><span>Long run month 3-4</span><span class="badge info">70 min</span></div>
      </div>
    </div>
  `;

  setupRunEvents(container, allRuns);
}

function renderRunCard(r) {
  const secs = parseDuration(r.duration || '0');
  const pace = calcPace(r.distance, secs);
  const speed = calcSpeed(r.distance, secs);
  return `
    <div class="run-card">
      <div class="run-card-header">
        <span>${formatDate(r.date)}</span>
        <span class="badge info">${r.type || 'Run'}</span>
        <div style="margin-left:auto;display:flex;gap:.25rem">
          <button class="btn-icon edit-run" data-id="${r.id}" title="Edit">✏️</button>
          <button class="btn-icon delete-run" data-id="${r.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="run-stats">
        <div class="run-stat"><span class="run-stat-val">${r.distance || '–'}</span><span class="run-stat-lbl">km</span></div>
        <div class="run-stat"><span class="run-stat-val">${r.duration || '–'}</span><span class="run-stat-lbl">time</span></div>
        <div class="run-stat"><span class="run-stat-val">${pace || '–'}</span><span class="run-stat-lbl">pace</span></div>
        <div class="run-stat"><span class="run-stat-val">${r.avgBPM || '–'}</span><span class="run-stat-lbl">avg BPM</span></div>
        <div class="run-stat"><span class="run-stat-val">${r.maxBPM || '–'}</span><span class="run-stat-lbl">max BPM</span></div>
        <div class="run-stat"><span class="run-stat-val">${speed || '–'}</span><span class="run-stat-lbl">km/h</span></div>
      </div>
      ${r.notes ? `<p class="run-notes muted">${r.notes}</p>` : ''}
    </div>
  `;
}

function updatePreview(container) {
  const dist = parseFloat(container.querySelector('#run-dist')?.value);
  const durStr = container.querySelector('#run-dur')?.value;
  const bpm = container.querySelector('#run-bpm')?.value;
  const preview = container.querySelector('#run-preview');
  if (!preview || (!dist && !durStr)) { preview?.classList.add('hidden'); return; }
  const secs = parseDuration(durStr || '0');
  const pace = calcPace(dist, secs);
  const speed = calcSpeed(dist, secs);
  preview.classList.remove('hidden');
  preview.innerHTML = `<div class="preview-row">
    ${dist ? `<span>📏 ${dist} km</span>` : ''}
    ${secs ? `<span>⏱ ${formatDuration(secs)}</span>` : ''}
    ${pace ? `<span>🏃 ${pace}</span>` : ''}
    ${speed ? `<span>💨 ${speed} km/h</span>` : ''}
    ${bpm ? `<span>❤️ ${bpm} BPM</span>` : ''}
  </div>`;
}

function setupRunEvents(container, allRuns) {
  ['run-dist','run-dur','run-bpm'].forEach(id =>
    container.querySelector(`#${id}`)?.addEventListener('input', () => updatePreview(container)));

  container.querySelector('#cancel-run-edit')?.addEventListener('click', () => {
    editingRun = null; renderRunning(container);
  });

  container.querySelector('#save-run')?.addEventListener('click', async () => {
    const date = container.querySelector('#run-date').value;
    const distance = parseFloat(container.querySelector('#run-dist').value) || null;
    const duration = container.querySelector('#run-dur').value || null;
    const avgBPM = parseInt(container.querySelector('#run-bpm').value) || null;
    const maxBPM = parseInt(container.querySelector('#run-maxbpm').value) || null;
    const type = container.querySelector('#run-type').value;
    const notes = container.querySelector('#run-notes').value;
    if (!distance && !duration) { showToast('Enter distance or duration'); return; }
    const secs = parseDuration(duration || '0');
    const pace = calcPace(distance, secs);
    const data = { date, distance, duration, avgBPM, maxBPM, type, notes, pace };

    if (editingRun) {
      await dbPut('runs', { id: editingRun.id, ...data });
      editingRun = null;
      showToast('Run updated!');
    } else {
      await dbAdd('runs', data);
      showToast('Run saved!');
    }
    renderRunning(container);
  });

  container.querySelector('#run-history')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-run');
    if (editBtn) {
      editingRun = allRuns.find(r => r.id === +editBtn.dataset.id) || null;
      renderRunning(container);
      container.querySelector('#run-form-card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const delBtn = e.target.closest('.delete-run');
    if (delBtn && confirm('Delete this run?')) {
      await dbDelete('runs', +delBtn.dataset.id);
      renderRunning(container);
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
