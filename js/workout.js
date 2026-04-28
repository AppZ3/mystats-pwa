import { ALL_EXERCISES, SKILL_PROGRESSIONS } from './profile.js';
import { dbAdd, dbPut, dbGetAll, dbDelete } from './db.js';

let currentSession = { date: '', exercises: [] };
let editingWorkoutId = null;

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

export async function renderWorkout(container) {
  if (!editingWorkoutId) {
    currentSession = { date: todayStr(), exercises: [] };
  }

  const allWorkouts = await dbGetAll('workouts');
  const recent = allWorkouts
    .filter(w => w.source !== 'today-log')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  container.innerHTML = `
    <div class="section-header"><h2>Workout Logger</h2></div>

    <div class="card" id="workout-form-card">
      ${editingWorkoutId ? `
        <div class="editing-banner">
          ✏️ Editing session from ${formatDate(currentSession.date)}
          <button id="cancel-edit" class="btn-cancel">Cancel</button>
        </div>
      ` : ''}
      <div class="card-label">${editingWorkoutId ? 'Edit Session' : 'Log a Session'}</div>
      <div class="date-row">
        <input type="date" id="workout-date" value="${currentSession.date || todayStr()}" class="input-field">
      </div>
      <div class="search-wrap">
        <input type="text" id="exercise-search" placeholder="Search or add exercise..." class="input-field" autocomplete="off">
        <div id="exercise-dropdown" class="dropdown hidden"></div>
      </div>
      <div id="session-exercises"></div>
      <button id="save-workout" class="btn-primary" style="margin-top:1rem">
        ${editingWorkoutId ? 'Update Session' : 'Save Session'}
      </button>
    </div>

    <div class="card">
      <div class="card-label">Skill Progressions</div>
      <div class="skill-grid">
        ${Object.entries(SKILL_PROGRESSIONS).map(([skill, steps]) => `
          <div class="skill-item">
            <div class="skill-name">${skill}</div>
            <div class="skill-steps">${steps.map((s, i) => `<div class="skill-step">${i + 1}. ${s}</div>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-label">Session History</div>
      <div id="workout-history">
        ${recent.length === 0 ? '<p class="muted">No sessions logged yet.</p>' : recent.map(w => renderWorkoutCard(w)).join('')}
      </div>
    </div>
  `;

  setupWorkoutEvents(container, allWorkouts);
}

function renderWorkoutCard(w) {
  const totalSets = w.exercises.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);
  return `
    <div class="workout-card" data-id="${w.id}">
      <div class="workout-card-header">
        <span class="workout-date">${formatDate(w.date)}</span>
        <span class="badge info">${w.exercises.length} ex · ${totalSets} sets</span>
        <div style="margin-left:auto;display:flex;gap:.25rem">
          <button class="btn-icon edit-workout" data-id="${w.id}" title="Edit">✏️</button>
          <button class="btn-icon delete-workout" data-id="${w.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="workout-exercises">
        ${w.exercises.map(ex => `
          <div class="ex-summary">
            <strong>${ex.name}</strong>
            <span class="muted">${(ex.sets || []).map(s => s.reps ? `${s.weight ? s.weight + 'kg×' : ''}${s.reps}` : s.note || '').filter(Boolean).join(' | ') || ex.notes || ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSessionExercises() {
  const el = document.getElementById('session-exercises');
  if (!el) return;
  if (currentSession.exercises.length === 0) {
    el.innerHTML = '<p class="muted" style="margin:.5rem 0">Search above to add exercises</p>';
    return;
  }
  el.innerHTML = currentSession.exercises.map((ex, ei) => `
    <div class="session-ex" data-ei="${ei}">
      <div class="session-ex-header">
        <strong>${ex.name}</strong>
        <button class="btn-icon remove-ex" data-ei="${ei}">✕</button>
      </div>
      <div class="sets-list">
        ${ex.sets.map((s, si) => `
          <div class="set-row" data-si="${si}" data-ei="${ei}">
            <span class="set-num">Set ${si + 1}</span>
            <input type="number" class="set-input weight-in" placeholder="kg" value="${s.weight || ''}" min="0" step="0.5" data-field="weight" data-ei="${ei}" data-si="${si}">
            <span class="set-sep">×</span>
            <input type="number" class="set-input reps-in" placeholder="reps" value="${s.reps || ''}" min="1" data-field="reps" data-ei="${ei}" data-si="${si}">
            <input type="text" class="set-input note-in" placeholder="note" value="${s.note || ''}" data-field="note" data-ei="${ei}" data-si="${si}">
            <button class="btn-icon remove-set" data-ei="${ei}" data-si="${si}">−</button>
          </div>
        `).join('')}
        <button class="btn-add-set" data-ei="${ei}">+ Add Set</button>
      </div>
      <input type="text" class="input-field" style="margin-top:.35rem;font-size:.83rem" placeholder="Exercise notes..." value="${ex.notes || ''}" data-ei="${ei}" id="ex-notes-${ei}">
    </div>
  `).join('');

  el.querySelectorAll('.set-input').forEach(input => {
    input.addEventListener('input', () => {
      const { field, ei, si } = input.dataset;
      currentSession.exercises[+ei].sets[+si][field] = input.type === 'number' ? (parseFloat(input.value) || null) : input.value;
    });
  });

  el.querySelectorAll('[id^="ex-notes-"]').forEach(input => {
    input.addEventListener('input', () => {
      currentSession.exercises[+input.dataset.ei].notes = input.value;
    });
  });

  el.querySelectorAll('.btn-add-set').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSession.exercises[+btn.dataset.ei].sets.push({ weight: null, reps: null, note: '' });
      renderSessionExercises();
    });
  });

  el.querySelectorAll('.remove-set').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = currentSession.exercises[+btn.dataset.ei];
      if (ex.sets.length > 1) ex.sets.splice(+btn.dataset.si, 1);
      renderSessionExercises();
    });
  });

  el.querySelectorAll('.remove-ex').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSession.exercises.splice(+btn.dataset.ei, 1);
      renderSessionExercises();
    });
  });
}

function setupWorkoutEvents(container, allWorkouts) {
  const searchInput = container.querySelector('#exercise-search');
  const dropdown = container.querySelector('#exercise-dropdown');
  const dateInput = container.querySelector('#workout-date');

  dateInput?.addEventListener('change', () => { currentSession.date = dateInput.value; });

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) { dropdown.classList.add('hidden'); return; }
    const matches = ALL_EXERCISES.filter(e => e.toLowerCase().includes(q)).slice(0, 8);
    // Allow adding custom exercise if no exact match
    if (!matches.length) {
      dropdown.innerHTML = `<div class="dropdown-item add-custom" data-name="${searchInput.value}">+ Add "${searchInput.value}"</div>`;
      dropdown.classList.remove('hidden');
    } else {
      dropdown.innerHTML = matches.map(e => `<div class="dropdown-item" data-name="${e}">${e}</div>`).join('') +
        `<div class="dropdown-item add-custom" data-name="${searchInput.value}">+ Add "${searchInput.value}"</div>`;
      dropdown.classList.remove('hidden');
    }
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        currentSession.exercises.push({ name: item.dataset.name, sets: [{ weight: null, reps: null, note: '' }], notes: '' });
        searchInput.value = '';
        dropdown.classList.add('hidden');
        renderSessionExercises();
      });
    });
  });

  document.addEventListener('click', e => {
    if (!container.querySelector('.search-wrap')?.contains(e.target)) dropdown?.classList.add('hidden');
  });

  container.querySelector('#cancel-edit')?.addEventListener('click', () => {
    editingWorkoutId = null;
    currentSession = { date: todayStr(), exercises: [] };
    renderWorkout(container);
  });

  container.querySelector('#save-workout')?.addEventListener('click', async () => {
    if (currentSession.exercises.length === 0) { showToast('Add at least one exercise'); return; }
    if (editingWorkoutId) {
      await dbPut('workouts', { id: editingWorkoutId, ...currentSession });
      editingWorkoutId = null;
      showToast('Session updated!');
    } else {
      await dbAdd('workouts', { ...currentSession });
      showToast('Session saved!');
    }
    currentSession = { date: todayStr(), exercises: [] };
    renderWorkout(container);
  });

  container.querySelector('#workout-history')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-workout');
    if (editBtn) {
      const w = allWorkouts.find(x => x.id === +editBtn.dataset.id);
      if (w) {
        editingWorkoutId = w.id;
        currentSession = { date: w.date, exercises: JSON.parse(JSON.stringify(w.exercises || [])) };
        renderWorkout(container);
        container.querySelector('#workout-form-card')?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    const delBtn = e.target.closest('.delete-workout');
    if (delBtn && confirm('Delete this session?')) {
      await dbDelete('workouts', +delBtn.dataset.id);
      renderWorkout(container);
    }
  });

  renderSessionExercises();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
