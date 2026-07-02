import { dbAdd, dbGetAll, dbDelete, esc, todayStr } from './db.js';
import { icon } from './icons.js';

const TYPE_CONFIG = {
  weight: { label: 'Weight',    unit: 'kg',   icon: 'dumbbell' },
  reps:   { label: 'Max Reps',  unit: 'reps', icon: 'repeat' },
  hold:   { label: 'Hold Time', unit: 'sec',  icon: 'clock' },
  skill:  { label: 'Skill',     unit: '',     icon: 'person-standing' },
};

// Gold/silver/bronze medal emoji are kept deliberately (not swapped for monochrome
// icons) — the color itself is the information (rank), and gold fits the app's own
// accent palette already.
const MEDAL = ['🥇','🥈','🥉'];

function formatDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }); }

export async function renderPRBoard(container) {
  const allPRs = await dbGetAll('prs');

  const byExercise = {};
  allPRs.forEach(pr => {
    if (!byExercise[pr.exercise]) byExercise[pr.exercise] = [];
    byExercise[pr.exercise].push(pr);
  });

  const boards = Object.entries(byExercise)
    .map(([exercise, prs]) => {
      const sorted = [...prs].sort((a, b) => b.value - a.value || b.date.localeCompare(a.date));
      return { exercise, best: sorted[0], all: sorted };
    })
    .sort((a, b) => a.exercise.localeCompare(b.exercise));

  container.innerHTML = `
    <div class="section-header">
      <h2>PRs</h2>
      <button class="btn-primary btn-sm" id="add-pr-btn">+ Add PR</button>
    </div>

    <div class="card pr-form-card hidden" id="pr-form-card">
      <div class="card-label">New Personal Record</div>
      <div class="pr-type-tabs" id="pr-type-tabs">
        ${Object.entries(TYPE_CONFIG).map(([k, v]) => `
          <button class="pr-type-tab ${k === 'weight' ? 'active' : ''}" data-type="${k}">${icon(v.icon, 15)} ${v.label}</button>
        `).join('')}
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Exercise / Skill</label>
          <input type="text" id="pr-exercise" class="input-field" placeholder="e.g. Pull-up, Planche hold">
        </div>
        <div class="form-group">
          <label id="pr-value-label">Weight (kg)</label>
          <input type="number" id="pr-value" class="input-field" step="0.5" min="0" placeholder="0">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="pr-date" class="input-field" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <input type="text" id="pr-notes" class="input-field" placeholder="Context, conditions…">
        </div>
      </div>
      <button id="save-pr-btn" class="btn-primary" style="margin-top:.5rem">Save PR</button>
    </div>

    ${boards.length === 0
      ? `<div class="card"><p class="muted">No PRs yet. Tap + Add PR to log your first one.</p></div>`
      : boards.map(b => renderPRCard(b, 0)).join('')
    }
  `;

  setupPREvents(container, boards);
}

function renderPRCard({ exercise, best, all }, rank) {
  const cfg = TYPE_CONFIG[best.type] || TYPE_CONFIG.weight;
  const medal = MEDAL[rank] || '🏅';
  const prevBest = all[1];
  const gain = prevBest ? (best.value - prevBest.value).toFixed(1) : null;

  return `
    <div class="card" id="pr-card-${esc(exercise)}" style="margin-bottom:.5rem">
      <div class="pr-card">
        <div class="pr-medal">${medal}</div>
        <div class="pr-info">
          <div class="pr-exercise">${esc(exercise)}</div>
          <div class="pr-value">${best.value}${best.unit || cfg.unit ? ` ${best.unit || cfg.unit}` : ''}</div>
          <div class="pr-meta">
            ${formatDate(best.date)}
            ${gain != null ? ` · +${gain} from prev` : ''}
            ${best.notes ? ` · ${esc(best.notes)}` : ''}
          </div>
        </div>
        <div class="pr-actions">
          <button class="btn-icon toggle-pr-history" data-exercise="${esc(exercise)}" title="History">▾</button>
          <button class="btn-icon delete-pr" data-id="${best.id}" data-exercise="${esc(exercise)}" title="Delete best">${icon('x', 14)}</button>
        </div>
      </div>
      <div class="pr-history-list hidden" id="pr-hist-${esc(exercise)}">
        ${all.map((pr, i) => `
          <div class="pr-history-entry">
            <span>${i === 0 ? '🏆 ' : ''}${formatDate(pr.date)}</span>
            <span class="pr-h-val">${pr.value}${pr.unit ? ` ${pr.unit}` : ''}</span>
            <button class="btn-icon delete-pr-entry" data-id="${pr.id}" data-exercise="${esc(exercise)}" title="Delete">${icon('x', 14)}</button>
          </div>
        `).join('')}
        <button class="btn-secondary btn-sm add-pr-for-exercise" data-exercise="${esc(exercise)}" style="margin-top:.4rem;width:100%">
          + Add attempt for ${esc(exercise)}
        </button>
      </div>
    </div>
  `;
}

function setupPREvents(container, boards) {
  let activeType = 'weight';

  container.querySelector('#add-pr-btn')?.addEventListener('click', () => {
    const form = container.querySelector('#pr-form-card');
    form?.classList.toggle('hidden');
    if (!form?.classList.contains('hidden')) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  container.querySelector('#pr-type-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.pr-type-tab');
    if (!tab) return;
    activeType = tab.dataset.type;
    container.querySelectorAll('.pr-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === activeType));
    const cfg = TYPE_CONFIG[activeType];
    const lbl = container.querySelector('#pr-value-label');
    if (lbl) lbl.textContent = `${cfg.label}${cfg.unit ? ` (${cfg.unit})` : ''}`;
  });

  container.addEventListener('click', e => {
    const addBtn = e.target.closest('.add-pr-for-exercise');
    if (addBtn) {
      const form = container.querySelector('#pr-form-card');
      form?.classList.remove('hidden');
      const exInput = container.querySelector('#pr-exercise');
      if (exInput) exInput.value = addBtn.dataset.exercise;
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  container.querySelector('#save-pr-btn')?.addEventListener('click', async () => {
    const exercise = container.querySelector('#pr-exercise')?.value?.trim();
    const value    = parseFloat(container.querySelector('#pr-value')?.value);
    const date     = container.querySelector('#pr-date')?.value;
    const notes    = container.querySelector('#pr-notes')?.value?.trim() || '';

    if (!exercise) { showToast('Enter an exercise name'); return; }
    if (isNaN(value) || value <= 0) { showToast('Enter a valid value'); return; }
    if (!date) { showToast('Enter a date'); return; }

    const cfg = TYPE_CONFIG[activeType];
    await dbAdd('prs', { exercise, type: activeType, value, unit: cfg.unit, date, notes });
    container.querySelector('#pr-form-card')?.classList.add('hidden');
    ['#pr-exercise','#pr-value','#pr-notes'].forEach(id => { const el = container.querySelector(id); if (el) el.value = ''; });
    container.querySelector('#pr-date').value = todayStr();
    await renderPRBoard(container);
  });

  container.addEventListener('click', e => {
    const btn = e.target.closest('.toggle-pr-history');
    if (!btn) return;
    const hist = container.querySelector(`#pr-hist-${btn.dataset.exercise}`);
    if (!hist) return;
    hist.classList.toggle('hidden');
    btn.textContent = hist.classList.contains('hidden') ? '▾' : '▴';
  });

  container.addEventListener('click', async e => {
    const btn = e.target.closest('.delete-pr-entry') || e.target.closest('.delete-pr');
    if (!btn) return;
    if (!confirm('Delete this PR entry?')) return;
    await dbDelete('prs', +btn.dataset.id);
    await renderPRBoard(container);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
