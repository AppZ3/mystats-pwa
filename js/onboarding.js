import { dbPut } from './db.js';
import { importBackup } from './settings.js';

const GOALS = [
  { id: 'muscle',      label: '💪 Build Muscle' },
  { id: 'fat',         label: '🔥 Lose Fat' },
  { id: 'performance', label: '⚡ Performance' },
  { id: 'health',      label: '❤️ General Health' },
];

export async function showOnboarding(onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'ob-overlay';
  overlay.innerHTML = `
    <div class="ob-card">
      <div class="ob-logo">🏋️</div>
      <h1 class="ob-title">Welcome to MyStats</h1>
      <p class="ob-sub">Your personal fitness tracker. Fill in a few details to get started — you can change everything later in Settings.</p>

      <div class="ob-form">
        <div class="form-group">
          <label>Your Name *</label>
          <input type="text" id="ob-name" class="input-field" placeholder="e.g. Alex" autocomplete="given-name">
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Age</label>
            <input type="number" id="ob-age" class="input-field" placeholder="25" min="1" max="120">
          </div>
          <div class="form-group">
            <label>Sex</label>
            <select id="ob-sex" class="input-field">
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="">Prefer not to say</option>
            </select>
          </div>
          <div class="form-group">
            <label>Height (cm)</label>
            <input type="number" id="ob-height" class="input-field" placeholder="175" step="0.5">
          </div>
          <div class="form-group">
            <label>Weight (kg)</label>
            <input type="number" id="ob-weight" class="input-field" placeholder="70" step="0.1">
          </div>
        </div>

        <div class="form-group">
          <label>Daily Protein Target (g)</label>
          <input type="number" id="ob-protein" class="input-field" placeholder="150" step="5">
          <p class="muted ob-hint">Tip: 1.6–2.2× your bodyweight in kg is a good starting point</p>
        </div>

        <div class="form-group">
          <label>Primary Goal</label>
          <div class="ob-goal-grid">
            ${GOALS.map((g, i) => `
              <button class="ob-goal-btn ${i === 0 ? 'active' : ''}" data-goal="${g.id}">${g.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="ob-error hidden" id="ob-error">Please enter your name to continue.</div>

        <button class="btn-primary ob-submit" id="ob-submit">Get Started →</button>
        <p class="muted ob-hint" style="text-align:center;margin-top:.5rem">All data stays on your device</p>

        <div class="ob-divider">or</div>

        <div style="text-align:center">
          <p class="muted ob-hint" style="margin-bottom:.6rem">Already have a MyStats backup? Load it instead.</p>
          <button class="btn-secondary" id="ob-import-btn" style="width:100%">📥 Import Existing Backup</button>
          <input type="file" id="ob-import-input" accept=".json" style="display:none">
          <div id="ob-import-status" style="margin-top:.4rem;font-size:.85rem"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedGoal = 'muscle';

  overlay.querySelectorAll('.ob-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.ob-goal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGoal = btn.dataset.goal;
    });
  });

  overlay.querySelector('#ob-weight').addEventListener('input', e => {
    const proteinEl = overlay.querySelector('#ob-protein');
    const w = parseFloat(e.target.value);
    if (w > 0 && !proteinEl.value) {
      proteinEl.value = Math.round(w * 1.8);
    }
  });

  overlay.querySelector('#ob-import-btn').addEventListener('click', () => {
    overlay.querySelector('#ob-import-input').click();
  });

  overlay.querySelector('#ob-import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = overlay.querySelector('#ob-import-status');
    status.textContent = 'Importing…';
    status.style.color = 'var(--muted)';
    try {
      await importBackup(file);
      status.textContent = '✓ Done! Loading your data…';
      status.style.color = 'var(--success)';
      setTimeout(() => { overlay.remove(); onComplete(); }, 1000);
    } catch (err) {
      status.textContent = '✕ ' + err.message;
      status.style.color = 'var(--danger)';
    }
  });

  overlay.querySelector('#ob-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#ob-name').value.trim();
    const errEl = overlay.querySelector('#ob-error');
    if (!name) {
      errEl.classList.remove('hidden');
      overlay.querySelector('#ob-name').focus();
      return;
    }
    errEl.classList.add('hidden');

    const profile = {
      name,
      age:           parseInt(overlay.querySelector('#ob-age').value)     || null,
      sex:           overlay.querySelector('#ob-sex').value               || '',
      height:        parseFloat(overlay.querySelector('#ob-height').value) || null,
      startWeight:   parseFloat(overlay.querySelector('#ob-weight').value) || null,
      proteinTarget: parseInt(overlay.querySelector('#ob-protein').value)  || 150,
      goal:          selectedGoal,
    };

    await Promise.all([
      dbPut('settings', { key: 'user_profile', value: profile }),
      dbPut('settings', { key: 'setup_complete', value: true }),
    ]);

    overlay.classList.add('ob-exit');
    setTimeout(() => { overlay.remove(); onComplete(); }, 350);
  });
}
