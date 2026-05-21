import { SCAN_HISTORY, TARGETS } from './profile.js';
import { dbGetAll } from './db.js';

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatMonth(monthStr) {
  return new Date(monthStr + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

async function getAllScans() {
  const userScans = await dbGetAll('bodyscans');
  const seedScans = SCAN_HISTORY.map((s, i) => ({ ...s, id: `seed-${i}`, seeded: true }));
  return [...seedScans, ...userScans].sort((a, b) => a.date.localeCompare(b.date));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStrengthExercises(workouts) {
  const names = new Set();
  workouts.forEach(w => {
    (w.exercises || []).forEach(e => {
      if (!e.name.startsWith('_') && (e.sets || []).some(s => s.weight != null && s.weight !== '')) {
        names.add(e.name);
      }
    });
  });
  return [...names].sort();
}

function buildStrengthPoints(workouts, exerciseName) {
  return workouts
    .filter(w => (w.exercises || []).some(e => e.name === exerciseName))
    .map(w => {
      const ex = w.exercises.find(e => e.name === exerciseName);
      const sets = (ex.sets || []).filter(s => s.weight != null && s.weight !== '');
      if (!sets.length) return null;
      const bestSet = sets.reduce((b, s) => parseFloat(s.weight) > parseFloat(b.weight) ? s : b, sets[0]);
      return { date: w.date, weight: parseFloat(bestSet.weight), reps: bestSet.reps || '' };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Render ─────────────────────────────────────────────────────────────────

export async function renderProgress(container) {
  const [scans, runs, workouts] = await Promise.all([getAllScans(), dbGetAll('runs'), dbGetAll('workouts')]);
  const sortedRuns     = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const sortedWorkouts = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const strengthExercises = getStrengthExercises(sortedWorkouts);
  const firstStrEx = strengthExercises[0] || '';

  container.innerHTML = `
    <div class="section-header"><h2>Progress</h2></div>

    ${renderSummaryCards(scans, runs, workouts)}

    <div class="card">
      <div class="card-label">Body Composition</div>
      <div class="chart-tabs">
        <button class="chart-tab active" data-chart="weight">Weight</button>
        <button class="chart-tab" data-chart="smm">SMM</button>
        <button class="chart-tab" data-chart="bf">Body Fat %</button>
        <button class="chart-tab" data-chart="score">InBody Score</button>
        <button class="chart-tab" data-chart="phase">Phase Angle</button>
      </div>
      <div class="chart-wrap"><canvas id="body-chart"></canvas></div>
    </div>

    <div class="card">
      <div class="card-label">Running Progress</div>
      <div class="chart-tabs">
        <button class="chart-tab active" data-run-chart="pace">Pace</button>
        <button class="chart-tab" data-run-chart="distance">Distance</button>
        <button class="chart-tab" data-run-chart="bpm">Heart Rate</button>
      </div>
      <div class="chart-wrap"><canvas id="run-chart"></canvas></div>
    </div>

    <div class="card">
      <div class="card-label">Workout Volume (Sets per Week)</div>
      <div class="chart-wrap"><canvas id="volume-chart"></canvas></div>
    </div>

    <div class="card">
      <div class="card-label">Strength Progression</div>
      ${strengthExercises.length ? `
        <select id="strength-ex-select" class="input-field" style="margin-bottom:.75rem;">
          ${strengthExercises.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
        <div class="chart-wrap"><canvas id="strength-chart"></canvas></div>
        <div id="strength-pr" class="strength-pr-row"></div>
      ` : `<p class="muted" style="padding:.5rem 0">Log sessions with weights to see your strength progression here.</p>`}
    </div>

    <div class="card">
      <div class="card-label">Session History</div>
      <div id="session-history">${renderSessionHistory(sortedWorkouts)}</div>
    </div>

    <div class="card">
      <div class="card-label">Segmental Muscle Balance</div>
      <div class="chart-wrap"><canvas id="segment-chart"></canvas></div>
    </div>
  `;

  if (typeof Chart === 'undefined') {
    container.querySelectorAll('.chart-wrap').forEach(w => {
      w.innerHTML = '<p class="muted" style="text-align:center;padding:2rem">Charts require internet connection to load Chart.js</p>';
    });
    return;
  }

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { labels: { color: '#e8e8e8', font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: '#606070' }, grid: { color: '#303038' } },
      y: { ticks: { color: '#606070' }, grid: { color: '#303038' } },
    },
  };

  let bodyChart = initBodyChart(scans, 'weight', chartDefaults);
  let runChart  = initRunChart(sortedRuns, 'pace', chartDefaults);
  let strengthChart = firstStrEx ? initStrengthChart(sortedWorkouts, firstStrEx, chartDefaults) : null;
  if (firstStrEx) renderStrengthPR(sortedWorkouts, firstStrEx);

  container.querySelectorAll('.chart-tab[data-chart]').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.chart-tab[data-chart]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      bodyChart.destroy();
      bodyChart = initBodyChart(scans, tab.dataset.chart, chartDefaults);
    });
  });

  container.querySelectorAll('.chart-tab[data-run-chart]').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.chart-tab[data-run-chart]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      runChart.destroy();
      runChart = initRunChart(sortedRuns, tab.dataset.runChart, chartDefaults);
    });
  });

  container.querySelector('#strength-ex-select')?.addEventListener('change', e => {
    if (strengthChart) strengthChart.destroy();
    strengthChart = initStrengthChart(sortedWorkouts, e.target.value, chartDefaults);
    renderStrengthPR(sortedWorkouts, e.target.value);
  });

  // Session history expand/collapse
  container.addEventListener('click', e => {
    const btn = e.target.closest('.hist-toggle');
    if (!btn) return;
    const id = btn.dataset.id;
    const detail = container.querySelector(`#hist-detail-${id}`);
    if (!detail) return;
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    btn.textContent = open ? '▾' : '▴';
  });

  initVolumeChart(sortedWorkouts, chartDefaults);
  initSegmentChart(scans, chartDefaults);
}

// ── Summary cards ──────────────────────────────────────────────────────────

function renderSummaryCards(scans, runs, workouts) {
  const latest = scans[scans.length - 1];
  const first  = scans[0];
  const weightChange = latest && first ? (latest.weight - first.weight).toFixed(1) : null;
  const smmChange    = latest && first ? (latest.smm - first.smm).toFixed(1) : null;
  const totalKm      = runs.reduce((s, r) => s + (r.distance || 0), 0);

  return `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-val">${latest?.weight ?? '–'}<span class="stat-unit">kg</span></div>
        <div class="stat-label">Current Weight</div>
        ${weightChange != null ? `<div class="stat-delta ${weightChange > 0 ? 'pos' : 'neg'}">${weightChange > 0 ? '+' : ''}${weightChange}kg</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-val">${latest?.smm ?? '–'}<span class="stat-unit">kg</span></div>
        <div class="stat-label">Muscle Mass</div>
        ${smmChange != null && !isNaN(smmChange) ? `<div class="stat-delta ${+smmChange >= 0 ? 'pos' : 'neg'}">${+smmChange > 0 ? '+' : ''}${smmChange}kg</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-val">${latest?.pbf ?? '–'}<span class="stat-unit">%</span></div>
        <div class="stat-label">Body Fat</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${totalKm.toFixed(0)}<span class="stat-unit">km</span></div>
        <div class="stat-label">Total Running</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${workouts.length}</div>
        <div class="stat-label">Sessions Logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${latest?.inbodyScore ?? '–'}</div>
        <div class="stat-label">InBody Score</div>
      </div>
    </div>
  `;
}

// ── Strength progression ───────────────────────────────────────────────────

function initStrengthChart(workouts, exerciseName, defaults) {
  const points = buildStrengthPoints(workouts, exerciseName);
  const canvas = document.getElementById('strength-chart');
  if (!canvas) return null;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  if (!points.length) {
    canvas.parentElement.innerHTML = '<p class="muted" style="text-align:center;padding:1.5rem">No weight data for this exercise yet.</p>';
    return null;
  }

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => formatDate(p.date)),
      datasets: [{
        label: `${exerciseName} — Best Set (kg)`,
        data: points.map(p => p.weight),
        borderColor: '#ff8c42',
        backgroundColor: '#ff8c4222',
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: { ...defaults, spanGaps: true },
  });
}

function renderStrengthPR(workouts, exerciseName) {
  const prEl = document.getElementById('strength-pr');
  if (!prEl) return;
  const points = buildStrengthPoints(workouts, exerciseName);
  if (!points.length) { prEl.innerHTML = ''; return; }
  const pr = points.reduce((best, p) => p.weight > best.weight ? p : best, points[0]);
  const first = points[0];
  const latest = points[points.length - 1];
  const gain = (latest.weight - first.weight).toFixed(1);
  prEl.innerHTML = `
    <div class="pr-chip">🏆 PR <strong>${pr.weight}kg</strong> on ${formatDate(pr.date)}</div>
    <div class="pr-chip ${+gain >= 0 ? 'pos' : 'neg'}">${+gain >= 0 ? '▲' : '▼'} ${Math.abs(gain)}kg since first log</div>
  `;
}

// ── Session history ────────────────────────────────────────────────────────

function renderSessionHistory(workouts) {
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return '<p class="muted" style="padding:.5rem 0">No sessions logged yet.</p>';

  const byMonth = {};
  sorted.forEach(w => {
    const m = w.date.substring(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(w);
  });

  return Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, sessions]) => `
      <div class="hist-month-group">
        <div class="hist-month-label">
          ${formatMonth(month)}
          <span class="hist-month-count">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</span>
        </div>
        ${sessions.map(renderHistoryEntry).join('')}
      </div>
    `).join('');
}

function renderHistoryEntry(w) {
  const dayLabel = DAY_LABELS[w.day] ?? '';
  const strengthExs = (w.exercises || []).filter(e => !e.name.startsWith('_') && (e.sets || []).some(s => s.weight || s.reps));
  const runEntry    = (w.exercises || []).find(e => e.name === '_run');
  const hasRun      = runEntry?.run?.distance || runEntry?.run?.duration;

  const tags = strengthExs.map(e => {
    const sets = (e.sets || []).filter(s => s.weight);
    const best = sets.length ? sets.reduce((b, s) => parseFloat(s.weight) > parseFloat(b.weight) ? s : b, sets[0]) : null;
    return `<span class="hist-ex-tag">${e.name}${best ? ` <strong>${best.weight}kg</strong>` : ''}</span>`;
  });
  if (hasRun) tags.push(`<span class="hist-ex-tag run-tag">🏃 ${runEntry.run.distance ? runEntry.run.distance + 'km' : runEntry.run.duration}</span>`);

  return `
    <div class="hist-entry">
      <div class="hist-entry-header">
        <div>
          <span class="hist-date">${formatDate(w.date)}</span>
          <span class="hist-prog-badge">Prog ${w.programme || '?'} · ${dayLabel}</span>
        </div>
        <button class="hist-toggle" data-id="${w.id}">▾</button>
      </div>
      <div class="hist-ex-tags">
        ${tags.join('') || '<span class="muted" style="font-size:.8rem">Rest / mobility</span>'}
      </div>
      <div class="hist-detail hidden" id="hist-detail-${w.id}">
        ${renderHistoryDetail(w)}
      </div>
    </div>
  `;
}

function renderHistoryDetail(w) {
  const strengthExs = (w.exercises || []).filter(e => !e.name.startsWith('_') && (e.sets || []).length > 0);
  const runEntry    = (w.exercises || []).find(e => e.name === '_run');
  let html = '';

  strengthExs.forEach(e => {
    const sets = (e.sets || []).filter(s => s.weight || s.reps);
    if (!sets.length) return;
    html += `
      <div class="hist-ex-row">
        <div class="hist-ex-name">${e.name}</div>
        <div class="hist-sets">
          ${sets.map((s, i) => `
            <span class="hist-set-chip">
              S${i + 1}${s.weight ? ` ${s.weight}kg` : ''}${s.weight && s.reps ? ' ×' : ''}${s.reps ? ` ${s.reps}` : ''}
            </span>`).join('')}
        </div>
      </div>`;
  });

  if (runEntry?.run) {
    const r = runEntry.run;
    html += `
      <div class="hist-ex-row">
        <div class="hist-ex-name">Run</div>
        <div class="hist-sets">
          ${r.distance ? `<span class="hist-set-chip">${r.distance}km</span>` : ''}
          ${r.duration  ? `<span class="hist-set-chip">${r.duration}</span>` : ''}
          ${r.avgBPM    ? `<span class="hist-set-chip">${r.avgBPM}bpm</span>` : ''}
          ${r.notes     ? `<span class="hist-set-chip muted">${r.notes}</span>` : ''}
        </div>
      </div>`;
  }

  return html || '<p class="muted" style="font-size:.8rem;padding:.25rem 0">No sets recorded</p>';
}

// ── Charts ─────────────────────────────────────────────────────────────────

function initBodyChart(scans, metric, defaults) {
  const metricMap = {
    weight: { key: 'weight',      label: 'Weight (kg)',      color: '#ff8c42', target: null },
    smm:    { key: 'smm',         label: 'SMM (kg)',          color: '#ffd166', target: TARGETS.smm.elite },
    bf:     { key: 'pbf',         label: 'Body Fat %',        color: '#ff6b6b', target: TARGETS.bodyFatPct.elite },
    score:  { key: 'inbodyScore', label: 'InBody Score',      color: '#ffd700', target: TARGETS.inbodyScore.elite },
    phase:  { key: 'phaseAngle',  label: 'Phase Angle (°)',   color: '#a8edea', target: TARGETS.phaseAngle.elite },
  };
  const m = metricMap[metric];
  const datasets = [{
    label: m.label,
    data: scans.map(s => s[m.key] ?? null),
    borderColor: m.color, backgroundColor: m.color + '22', tension: 0.4, pointRadius: 5,
  }];
  if (m.target) {
    datasets.push({ label: 'Elite Target', data: scans.map(() => m.target), borderColor: '#ffffff44', borderDash: [6, 3], pointRadius: 0, tension: 0 });
  }
  return new Chart(document.getElementById('body-chart'), {
    type: 'line',
    data: { labels: scans.map(s => formatDate(s.date)), datasets },
    options: { ...defaults, spanGaps: true },
  });
}

function initRunChart(runs, metric, defaults) {
  const configs = {
    pace:     { data: runs.map(r => { if (!r.distance || !r.duration) return null; const s = parseDuration(r.duration); return s ? parseFloat((s / 60 / r.distance).toFixed(2)) : null; }), label: 'Pace (min/km)', color: '#ff8c42' },
    distance: { data: runs.map(r => r.distance || null), label: 'Distance (km)', color: '#ffd166' },
    bpm:      { data: runs.map(r => r.avgBPM || null),   label: 'Avg BPM',       color: '#ff6b6b' },
  };
  const c = configs[metric];
  return new Chart(document.getElementById('run-chart'), {
    type: 'line',
    data: { labels: runs.map(r => formatDate(r.date)), datasets: [{ label: c.label, data: c.data, borderColor: c.color, backgroundColor: c.color + '22', tension: 0.4, pointRadius: 4, spanGaps: true }] },
    options: { ...defaults, scales: { ...defaults.scales, y: { ...defaults.scales.y, reverse: metric === 'pace' } } },
  });
}

function initVolumeChart(workouts, defaults) {
  const weekMap = {};
  workouts.forEach(w => {
    const d = new Date(w.date + 'T00:00:00');
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay() + 1);
    const key = start.toISOString().split('T')[0];
    if (!weekMap[key]) weekMap[key] = 0;
    weekMap[key] += (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
  });
  const weeks = Object.keys(weekMap).sort();
  new Chart(document.getElementById('volume-chart'), {
    type: 'bar',
    data: { labels: weeks.map(formatDate), datasets: [{ label: 'Total Sets', data: weeks.map(w => weekMap[w]), backgroundColor: '#ff8c4244', borderColor: '#ff8c42', borderWidth: 1 }] },
    options: defaults,
  });
}

function initSegmentChart(scans, defaults) {
  const latest = scans[scans.length - 1];
  if (!latest?.rightArm) {
    document.getElementById('segment-chart').parentElement.innerHTML = '<p class="muted" style="text-align:center;padding:1rem">No segmental data yet</p>';
    return;
  }
  const labels   = ['Right Arm', 'Left Arm', 'Trunk', 'Right Leg', 'Left Leg'];
  const current  = [latest.rightArm, latest.leftArm, latest.trunk, latest.rightLeg, latest.leftLeg];
  const first    = scans[0];
  const baseline = first ? [first.rightArm, first.leftArm, first.trunk, first.rightLeg, first.leftLeg] : current;
  new Chart(document.getElementById('segment-chart'), {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: 'Current',  data: current,  borderColor: '#ff8c42', backgroundColor: '#ff8c4233', pointBackgroundColor: '#ff8c42' },
        { label: 'Baseline', data: baseline, borderColor: '#ffffff44', backgroundColor: '#ffffff11', pointBackgroundColor: '#ffffff44', borderDash: [4, 2] },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e8e8e8' } } },
      scales: { r: { ticks: { color: '#606070', backdropColor: 'transparent' }, grid: { color: '#303038' }, pointLabels: { color: '#e8e8e8' } } },
    },
  });
}
