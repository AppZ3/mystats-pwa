import { dbAdd, dbPut, dbGetAll, dbDelete, esc } from './db.js';

const ENERGY_LABELS = ['', '😴', '😐', '🙂', '💪', '🔥'];

export function renderJournalPrompt(container, workoutId, date) {
  let el = container.querySelector('#journal-prompt-wrap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'journal-prompt-wrap';
    container.querySelector('#save-today-log')?.after(el);
  }
  el.innerHTML = `
    <div class="journal-prompt">
      <div class="journal-prompt-title">📓 How was the session?</div>
      <div class="energy-row">
        <span class="energy-label">Energy</span>
        ${[1,2,3,4,5].map(n => `
          <button class="energy-btn" data-energy="${n}" title="${ENERGY_LABELS[n]}">${ENERGY_LABELS[n]}</button>
        `).join('')}
      </div>
      <textarea id="journal-notes" class="input-field" rows="2"
        placeholder="How did it feel? Any PRs, niggles, wins…" style="resize:none;margin-bottom:.5rem"></textarea>
      <button id="save-journal" class="btn-secondary btn-sm">Save Note</button>
      <div id="journal-saved" class="journal-saved-badge hidden">✓ Saved</div>
    </div>
  `;

  let selectedEnergy = 0;
  el.querySelectorAll('.energy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedEnergy = +btn.dataset.energy;
      el.querySelectorAll('.energy-btn').forEach(b => b.classList.toggle('selected', b.dataset.energy === btn.dataset.energy));
    });
  });

  el.querySelector('#save-journal')?.addEventListener('click', async () => {
    const notes = el.querySelector('#journal-notes')?.value?.trim() || '';
    if (!notes && !selectedEnergy) return;
    const existing = await getJournalForDate(date);
    if (existing) {
      await dbPut('journal', { ...existing, energy: selectedEnergy || existing.energy, notes: notes || existing.notes, workoutId });
    } else {
      await dbAdd('journal', { date, workoutId, energy: selectedEnergy, notes });
    }
    const badge = el.querySelector('#journal-saved');
    badge?.classList.remove('hidden');
    setTimeout(() => badge?.classList.add('hidden'), 2000);
  });
}

async function getJournalForDate(date) {
  const all = await dbGetAll('journal');
  return all.find(j => j.date === date) || null;
}

export async function renderJournalSection(container) {
  const entries = (await dbGetAll('journal')).sort((a, b) => b.date.localeCompare(a.date));
  container.innerHTML = `
    <div class="card-label">Training Journal</div>
    ${entries.length === 0
      ? '<p class="muted" style="padding:.5rem 0">Notes will appear here after you add one from Today\'s session.</p>'
      : entries.map(renderJournalEntry).join('')
    }
  `;
}

function renderJournalEntry(e) {
  const energyLabel = e.energy ? ENERGY_LABELS[e.energy] : '';
  const date = new Date(e.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
  return `
    <div class="journal-entry">
      <div class="journal-entry-header">
        <span class="journal-date">${date}</span>
        <span class="journal-energy">${energyLabel}</span>
        <button class="btn-icon delete-journal-entry" data-id="${e.id}" title="Delete">✕</button>
      </div>
      ${e.notes ? `<div class="journal-notes-text">${esc(e.notes)}</div>` : ''}
    </div>
  `;
}

export function setupJournalEvents(container) {
  container.addEventListener('click', async e => {
    const btn = e.target.closest('.delete-journal-entry');
    if (btn && confirm('Delete this journal entry?')) {
      await dbDelete('journal', +btn.dataset.id);
      const wrap = container.querySelector('#journal-section-wrap');
      if (wrap) await renderJournalSection(wrap);
    }
  });
}
