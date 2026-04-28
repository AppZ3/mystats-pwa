import { SCAN_HISTORY, TARGETS } from './profile.js';
import { dbGetAll } from './db.js';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

export async function renderProgress(container) {
  const [scans, runs, workouts] = await Promise.all([getAllScans(), dbGetAll('runs'), dbGetAll('workouts')]);
  const sortedRuns = runs.sort((a, b) => a.date.localeCompare(b.date));
  const sortedWorkouts = workouts.sort((a, b) => a.date.localeCompare(b.date));

  container.innerHTML = `
    <div class="section-header">
      <h2>Progress</h2>
    </div>

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
    plugins: { legend: { labels: { color: '#a0a0c0', font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: '#a0a0c0' }, grid: { color: '#1e1e2e' } },
      y: { ticks: { color: '#a0a0c0' }, grid: { color: '#1e1e2e' } },
    },
  };

  let bodyChart = initBodyChart(scans, 'weight', chartDefaults);
  let runChart = initRunChart(sortedRuns, 'pace', chartDefaults);

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

  initVolumeChart(sortedWorkouts, chartDefaults);
  initSegmentChart(scans, chartDefaults);
}

function renderSummaryCards(scans, runs, workouts) {
  const latest = scans[scans.length - 1];
  const first = scans[0];
  const weightChange = latest && first ? (latest.weight - first.weight).toFixed(1) : null;
  const smmChange = latest && first ? (latest.smm - first.smm).toFixed(1) : null;
  const totalKm = runs.reduce((s, r) => s + (r.distance || 0), 0);
  const totalSessions = workouts.length;

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
        ${smmChange != null ? `<div class="stat-delta pos">+${smmChange}kg</div>` : ''}
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
        <div class="stat-val">${totalSessions}</div>
        <div class="stat-label">Sessions Logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${latest?.inbodyScore ?? '–'}</div>
        <div class="stat-label">InBody Score</div>
      </div>
    </div>
  `;
}

function initBodyChart(scans, metric, defaults) {
  const labels = scans.map(s => formatDate(s.date));
  const metricMap = {
    weight: { key: 'weight', label: 'Weight (kg)', color: '#6c63ff', target: null },
    smm: { key: 'smm', label: 'SMM (kg)', color: '#00d4aa', target: TARGETS.smm.elite },
    bf: { key: 'pbf', label: 'Body Fat %', color: '#ff6b6b', target: TARGETS.bodyFatPct.elite },
    score: { key: 'inbodyScore', label: 'InBody Score', color: '#ffd700', target: TARGETS.inbodyScore.elite },
    phase: { key: 'phaseAngle', label: 'Phase Angle (°)', color: '#a8edea', target: TARGETS.phaseAngle.elite },
  };
  const m = metricMap[metric];
  const data = scans.map(s => s[m.key] ?? null);

  const datasets = [{ label: m.label, data, borderColor: m.color, backgroundColor: m.color + '22', tension: 0.4, pointRadius: 5 }];
  if (m.target) {
    datasets.push({ label: 'Elite Target', data: scans.map(() => m.target), borderColor: '#ffffff44', borderDash: [6, 3], pointRadius: 0, tension: 0 });
  }

  return new Chart(document.getElementById('body-chart'), {
    type: 'line', data: { labels, datasets },
    options: { ...defaults, spanGaps: true },
  });
}

function initRunChart(runs, metric, defaults) {
  const labels = runs.map(r => formatDate(r.date));
  let data, label, color;

  if (metric === 'pace') {
    data = runs.map(r => {
      if (!r.distance || !r.duration) return null;
      const secs = parseDuration(r.duration);
      return secs ? parseFloat((secs / 60 / r.distance).toFixed(2)) : null;
    });
    label = 'Pace (min/km)';
    color = '#6c63ff';
  } else if (metric === 'distance') {
    data = runs.map(r => r.distance || null);
    label = 'Distance (km)';
    color = '#00d4aa';
  } else {
    data = runs.map(r => r.avgBPM || null);
    label = 'Avg BPM';
    color = '#ff6b6b';
  }

  return new Chart(document.getElementById('run-chart'), {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', tension: 0.4, pointRadius: 4, spanGaps: true }] },
    options: { ...defaults, scales: { ...defaults.scales, y: { ...defaults.scales.y, reverse: metric === 'pace' } } },
  });
}

function initVolumeChart(workouts, defaults) {
  const weekMap = {};
  workouts.forEach(w => {
    const d = new Date(w.date);
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay() + 1);
    const key = startOfWeek.toISOString().split('T')[0];
    if (!weekMap[key]) weekMap[key] = 0;
    weekMap[key] += w.exercises.reduce((s, e) => s + e.sets.length, 0);
  });
  const weeks = Object.keys(weekMap).sort();
  const data = weeks.map(w => weekMap[w]);

  new Chart(document.getElementById('volume-chart'), {
    type: 'bar',
    data: { labels: weeks.map(formatDate), datasets: [{ label: 'Total Sets', data, backgroundColor: '#6c63ff88', borderColor: '#6c63ff', borderWidth: 1 }] },
    options: defaults,
  });
}

function initSegmentChart(scans, defaults) {
  const latest = scans[scans.length - 1];
  if (!latest || !latest.rightArm) {
    document.getElementById('segment-chart').parentElement.innerHTML = '<p class="muted" style="text-align:center;padding:1rem">No segmental data yet</p>';
    return;
  }

  const labels = ['Right Arm', 'Left Arm', 'Trunk', 'Right Leg', 'Left Leg'];
  const current = [latest.rightArm, latest.leftArm, latest.trunk, latest.rightLeg, latest.leftLeg];
  const first = scans[0];
  const baseline = first ? [first.rightArm, first.leftArm, first.trunk, first.rightLeg, first.leftLeg] : current;

  new Chart(document.getElementById('segment-chart'), {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: 'Current', data: current, borderColor: '#6c63ff', backgroundColor: '#6c63ff33', pointBackgroundColor: '#6c63ff' },
        { label: 'Baseline', data: baseline, borderColor: '#ffffff44', backgroundColor: '#ffffff11', pointBackgroundColor: '#ffffff44', borderDash: [4, 2] },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#a0a0c0' } } },
      scales: { r: { ticks: { color: '#a0a0c0', backdropColor: 'transparent' }, grid: { color: '#2a2a3e' }, pointLabels: { color: '#a0a0c0' } } },
    },
  });
}
