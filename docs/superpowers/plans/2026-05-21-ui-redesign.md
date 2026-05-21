# UI Redesign — Carbon Theme + Frictionless Logging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign MyStats PWA with a Carbon colour theme, inner-tab Today layout (Session / Checklist / Supps), and tile-based strength set logging with a one-tap tick circle.

**Architecture:** CSS variable swap for the theme; `renderToday` split into three panel-rendering helpers switched by a `todaySubTab` module var; `renderStrengthBlock` rewritten to emit `.str-set-tile` divs; the session control card replaced by a compact `.session-ctrl-bar`. No new files — all changes are in `style.css`, `js/app.js`, `js/today.js`, and `sw.js`.

**Tech Stack:** Vanilla JS ES modules, IndexedDB (custom `db.js`), plain CSS custom properties, Python `http.server` for local preview.

---

## Files

| File | Change |
|---|---|
| `style.css` | Theme token swap + new component classes |
| `js/app.js` | Reorder TABS array |
| `js/today.js` | Inner tabs, compressed ctrl bar, tile strength renderer |
| `sw.js` | Bump cache version to `mystats-v19` |

---

## Task 1 — Carbon theme tokens

**Files:**
- Modify: `style.css` (lines 4–21, `:root` block)

- [ ] **Step 1: Replace `:root` token block in `style.css`**

Find the existing `:root { ... }` block (lines 4–21) and replace it entirely:

```css
:root {
  --bg: #111114;
  --bg2: #18181c;
  --bg3: #222228;
  --card: #1a1a1f;
  --border: #303038;
  --accent: #ff8c42;
  --accent2: #ffd166;
  --danger: #ff6b6b;
  --warn: #ffd700;
  --text: #e8e8e8;
  --muted: #606070;
  --success: #ffd166;
  --nav-h: 64px;
  --header-h: 56px;
  --radius: 14px;
  --radius-sm: 8px;
}
```

- [ ] **Step 2: Also update `meta theme-color` in `index.html`**

Change:
```html
<meta name="theme-color" content="#0a0a0f">
```
To:
```html
<meta name="theme-color" content="#111114">
```

- [ ] **Step 3: Smoke-test in browser**

```bash
# terminal A (already running or restart)
cd /home/z/Projects/mystats-pwa && python3 -m http.server 4321
```

Open http://localhost:4321 — header, cards, buttons and nav should all render in orange/gold instead of purple/teal. No JS errors in console.

- [ ] **Step 4: Commit**

```bash
cd /home/z/Projects/mystats-pwa
git add style.css index.html
git commit -m "feat: carbon theme — swap purple/teal tokens to orange/gold"
```

---

## Task 2 — Nav tab reorder

**Files:**
- Modify: `js/app.js` (TABS array, lines 10–18)

- [ ] **Step 1: Reorder TABS in `js/app.js`**

Replace the existing `const TABS = [...]` with:

```js
const TABS = [
  { id: 'today',    label: '🏠', title: 'Today',    render: renderToday },
  { id: 'workout',  label: '💪', title: 'Train',    render: renderWorkout },
  { id: 'run',      label: '🏃', title: 'Run',      render: renderRunning },
  { id: 'body',     label: '📊', title: 'Body',     render: renderBodyScan },
  { id: 'progress', label: '📈', title: 'Progress', render: renderProgress },
  { id: 'reminders',label: '🔔', title: 'Alerts',   render: renderReminders },
  { id: 'settings', label: '⚙️', title: 'Setup',    render: renderSettings },
];
```

(No change in content — this is already the right order. Verify that Train, Run sit at positions 1 and 2.)

- [ ] **Step 2: Verify in browser**

Open http://localhost:4321 — bottom nav shows: 🏠 Today · 💪 Train · 🏃 Run · 📊 Body · 📈 Progress · 🔔 Alerts · ⚙️ Setup (left to right).

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: reorder nav — Train and Run adjacent to Today"
```

---

## Task 3 — Today inner tabs + compressed control bar

**Files:**
- Modify: `js/today.js` (module state + `renderToday` + new helper functions)
- Modify: `style.css` (new component classes appended at end)

### 3a — Module state

- [ ] **Step 1: Add `todaySubTab` to module-level state in `today.js`**

After the existing state declarations (around line 8), add:

```js
let todaySubTab = 'session'; // 'session' | 'checklist' | 'supps'
```

### 3b — Three panel helpers

- [ ] **Step 2: Add `renderSessionPanel`, `renderChecklistPanel`, `renderSuppsPanel` before `renderToday`**

Insert these three functions immediately before `export async function renderToday(container)`:

```js
function renderSessionPanel(session, isRest, progress, mobility) {
  return `
    <div class="card session-card ${isRest ? 'rest-day' : ''}">
      <div class="card-header-row">
        <div>
          <h3>${esc(session.label || 'Rest Day')}</h3>
          ${session.focus ? `<div class="session-focus">${esc(session.focus)}</div>` : ''}
        </div>
        <div class="session-status-col">
          ${todayWorkoutId ? '<span class="badge info">✓ Saved</span>' : ''}
          ${progress && progress.total > 0 ? `
            <div class="session-progress">
              <div class="prog-bar-track"><div class="prog-bar-fill" style="width:${progress.pct}%"></div></div>
              <span class="prog-pct">${progress.pct}%</span>
            </div>` : ''}
        </div>
      </div>
      ${isRest ? `
        <p class="muted" style="margin-top:.75rem">Rest day. Recover well — gains happen during rest.</p>
      ` : `
        <div class="pre-training-nudge">
          <span class="badge warning">⚡ Pre-training:</span>
          ${PRE_TRAINING.map(p => `<span class="pre-item">${esc(p)}</span>`).join('')}
        </div>
        <div id="session-blocks">
          ${currentBlocks.map(renderBlock).join('')}
        </div>
        <button id="save-today-log" class="btn-primary" style="margin-top:1rem">
          ${todayWorkoutId ? '✓ Update Session' : 'Save Session'}
        </button>
      `}
    </div>
    ${mobility ? `
    <div class="card mobility-card">
      <div class="card-label">Mobility — ${DAY_LABELS[selectedDay]}</div>
      <h3>${esc(mobility.label)}</h3>
      <p class="muted">${esc(mobility.duration)} · ${esc(mobility.focus)}</p>
    </div>` : ''}
  `;
}

function renderChecklistPanel(checklistItems, checklist) {
  const total = checklistItems.length;
  const done  = checklistItems.filter(i => checklist[i.key]).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="card">
      <div class="card-header-row" style="margin-bottom:.5rem;">
        <span class="card-label" style="margin-bottom:0;">Daily Checklist</span>
        <span class="prog-pct" style="font-size:.8rem;">${done}/${total}</span>
      </div>
      <div class="prog-bar-track" style="width:100%;margin-bottom:.75rem;">
        <div class="prog-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="checklist" id="today-checklist">
        ${checklistItems.map(item => renderCheckItem(item.key, item.label, item.icon || '', checklist[item.key] || false)).join('')}
      </div>
    </div>
  `;
}

function renderSuppsPanel(allSupplements) {
  const groups = [
    { label: 'Morning — fasted',    filter: s => /^morning/i.test(s.timing) && !s.withFat },
    { label: 'Morning — with fat',  filter: s => /^morning/i.test(s.timing) && s.withFat },
    { label: 'Pre-training',        filter: s => /pre.?train|pre.?workout/i.test(s.timing) },
    { label: 'With meals',          filter: s => /meal|lunch/i.test(s.timing) && !/morning|evening|bed/i.test(s.timing) },
    { label: 'Evening',             filter: s => /evening/i.test(s.timing) },
    { label: 'Before bed',          filter: s => /bed/i.test(s.timing) },
    { label: 'Post-training',       filter: s => /post.?train/i.test(s.timing) },
  ];
  const seen = new Set();
  return groups.map(g => {
    const items = allSupplements.filter(s => !seen.has(s.name) && g.filter(s));
    items.forEach(s => seen.add(s.name));
    if (!items.length) return '';
    return `
      <div class="card">
        <div class="card-label">${esc(g.label)}</div>
        <ul class="supp-list">
          ${items.map(s => `
            <li>
              <span>${esc(s.name)}</span>
              <span class="badge ${s.phase === 1 ? 'success' : s.phase === 2 ? 'info' : 'warning'}">Ph${s.phase}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  }).join('');
}
```

### 3c — Rewrite `renderToday`

- [ ] **Step 3: Replace `renderToday` body with the new three-panel structure**

Replace the entire `export async function renderToday(container) { ... }` function:

```js
export async function renderToday(container) {
  if (Object.keys(blockLog).length === 0) await loadTodayLog();

  const [savedProg, savedWeek, checklistItems, allSupplements] = await Promise.all([
    getCurrentProgramme(), getCurrentWeek(), getChecklistItems(), getSupplements(),
  ]);
  const prog = pendingProg ?? savedProg;
  const week = pendingWeek ?? savedWeek;
  if (pendingDay !== null) selectedDay = pendingDay;

  const session  = getProgrammeSession(prog, selectedDay);
  currentBlocks  = session.blocks || [];
  const checklist = await getTodayChecklist();
  const mobility  = getMobilityForDay(selectedDay);
  const dateStr   = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const progress  = sessionProgress();
  const isRest    = currentBlocks.length === 0;

  container.innerHTML = `
    <div class="today-date-row">
      <span class="today-date">${esc(dateStr)}</span>
      <span class="today-prog-badge">Prog ${esc(prog)} · W${week}</span>
    </div>

    <div class="session-ctrl-bar">
      <div class="ctrl-group">
        <button class="ctrl-pill prog-pill ${prog === 'A' ? 'active' : ''}" data-prog="A">A</button>
        <button class="ctrl-pill prog-pill ${prog === 'B' ? 'active' : ''}" data-prog="B">B</button>
      </div>
      <div class="ctrl-group">
        ${[1,2,3,4].map(w => `
          <button class="ctrl-pill week-pill ${week === w ? 'active' : ''}" data-week="${w}">W${w}</button>
        `).join('')}
      </div>
      <div class="ctrl-group">
        ${DAY_LABELS.map((label, i) => `
          <button class="ctrl-pill day-pill ${selectedDay === i ? 'active' : ''} ${i === new Date().getDay() ? 'is-today' : ''}" data-day="${i}">
            ${label}
          </button>`).join('')}
      </div>
      <button id="apply-session" class="ctrl-apply hidden">Apply</button>
    </div>

    <div class="today-tabs">
      <button class="today-tab ${todaySubTab === 'session'   ? 'active' : ''}" data-subtab="session">Session</button>
      <button class="today-tab ${todaySubTab === 'checklist' ? 'active' : ''}" data-subtab="checklist">Checklist</button>
      <button class="today-tab ${todaySubTab === 'supps'     ? 'active' : ''}" data-subtab="supps">Supps</button>
    </div>

    <div id="today-panel-session"   class="${todaySubTab !== 'session'   ? 'hidden' : ''}">
      ${renderSessionPanel(session, isRest, progress, mobility)}
    </div>
    <div id="today-panel-checklist" class="${todaySubTab !== 'checklist' ? 'hidden' : ''}">
      ${renderChecklistPanel(checklistItems, checklist)}
    </div>
    <div id="today-panel-supps"     class="${todaySubTab !== 'supps'     ? 'hidden' : ''}">
      ${renderSuppsPanel(allSupplements)}
    </div>
  `;

  setupTodayEvents(container);
}
```

### 3d — Update `setupTodayEvents` for the new structure

- [ ] **Step 4: Update programme/week/day selectors in `setupTodayEvents`**

The existing handlers target `.toggle-btn[data-prog]`, `.toggle-btn[data-week]`, and `.day-sel-btn`. The new ctrl bar uses `.ctrl-pill` with the same `data-prog`, `data-week`, `data-day` attributes. Replace those three handler blocks:

```js
// Programme toggle — visual only, committed on Apply
container.querySelectorAll('[data-prog]').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingProg = btn.dataset.prog;
    container.querySelectorAll('[data-prog]').forEach(b => b.classList.toggle('active', b === btn));
    markApplyPending(container);
  });
});

// Week toggle — visual only
container.querySelectorAll('[data-week]').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingWeek = +btn.dataset.week;
    container.querySelectorAll('[data-week]').forEach(b => b.classList.toggle('active', b === btn));
    markApplyPending(container);
  });
});

// Day selector — visual only
container.querySelectorAll('[data-day]').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingDay = +btn.dataset.day;
    container.querySelectorAll('[data-day]').forEach(b => b.classList.toggle('active', b === btn));
    markApplyPending(container);
  });
});
```

(The Apply click handler below these is unchanged — it still commits pending state and calls `renderToday(container)`.)

- [ ] **Step 6: Add inner-tab switching handler at the top of `setupTodayEvents`**

Insert at the very start of `setupTodayEvents(container)`:

```js
// Inner tab switching
container.querySelectorAll('.today-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    todaySubTab = btn.dataset.subtab;
    container.querySelectorAll('.today-tab').forEach(b => b.classList.toggle('active', b === btn));
    ['session', 'checklist', 'supps'].forEach(id => {
      const panel = container.querySelector(`#today-panel-${id}`);
      if (panel) panel.classList.toggle('hidden', id !== todaySubTab);
    });
  });
});
```

- [ ] **Step 7: Update the Apply button handler to use `ctrl-apply hidden` pattern**

Find `markApplyPending` at the bottom of `today.js` and replace it:

```js
function markApplyPending(container) {
  container.querySelector('#apply-session')?.classList.remove('hidden');
}
```

The existing Apply click handler inside `setupTodayEvents` is unchanged — it still commits pending state and calls `renderToday(container)`.

- [ ] **Step 8: Remove the `routineSteps` and old supplement fetches from `renderToday`**

In the new `renderToday` we no longer call `getMorningRoutine()` or separately filter `morningSupps`/`eveningSupps`. Confirm the `Promise.all` line only has four items: `getCurrentProgramme, getCurrentWeek, getChecklistItems, getSupplements`.

- [ ] **Step 9: Syntax check**

```bash
node --check js/today.js
```

Expected: no output (clean).

### 3e — CSS for new components

- [ ] **Step 10: Append new CSS to the end of `style.css`**

```css
/* ── Today date row ── */
.today-date-row {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: .65rem;
}
.today-date { font-size: .88rem; color: var(--muted); }
.today-prog-badge { font-size: .75rem; font-weight: 700; color: var(--accent); }

/* ── Today inner tabs ── */
.today-tabs { display: flex; gap: .35rem; margin-bottom: .85rem; }
.today-tab {
  flex: 1; text-align: center; background: var(--bg3); border: 1px solid var(--border);
  color: var(--muted); border-radius: 20px; padding: .45rem .5rem; font-size: .82rem;
  font-weight: 600; cursor: pointer; transition: all .15s;
}
.today-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }

/* ── Session control bar ── */
.session-ctrl-bar {
  display: flex; align-items: center; gap: .35rem; flex-wrap: wrap;
  margin-bottom: .75rem; padding: .45rem .6rem;
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.ctrl-group { display: flex; gap: .2rem; }
.ctrl-pill {
  background: var(--bg3); border: 1px solid var(--border); color: var(--muted);
  border-radius: 20px; padding: .18rem .55rem; font-size: .72rem; font-weight: 600;
  cursor: pointer; transition: all .15s;
}
.ctrl-pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.ctrl-pill.is-today { border-style: dashed; }
.ctrl-apply {
  margin-left: auto; background: var(--accent2); color: #111114; border: none;
  border-radius: 20px; padding: .2rem .75rem; font-size: .72rem; font-weight: 700;
  cursor: pointer; transition: opacity .15s;
}
.ctrl-apply:hover { opacity: .85; }
.ctrl-apply.hidden { display: none; }
```

- [ ] **Step 11: Verify in browser**

Open http://localhost:4321 → Today tab.
- Date + "Prog A · W1" row at top
- Compact orange ctrl bar with A/B, W1–W4, day pills
- Three inner tab pills: Session / Checklist / Supps
- Clicking each tab switches panels without full re-render
- Apply button hidden by default, appears when you tap a different programme/week/day

- [ ] **Step 12: Commit**

```bash
git add js/today.js style.css
git commit -m "feat: today tab inner panels (session/checklist/supps) + compact ctrl bar"
```

---

## Task 4 — Strength set tile renderer + tick handler

**Files:**
- Modify: `js/today.js` (`renderStrengthBlock`, `collectBlockLog`, `setupTodayEvents`)
- Modify: `style.css` (new `.str-set-tile` classes appended)

### 4a — Rewrite `renderStrengthBlock`

- [ ] **Step 1: Replace `renderStrengthBlock` in `today.js`**

```js
function renderStrengthBlock(block) {
  const label = block.label || 'Strength';
  return `
    <div class="session-block strength-block">
      <div class="block-type-tag type-strength">${esc(label)}</div>
      ${(block.exercises || []).map(ex => {
        const log       = blockLog[ex.name] || {};
        const existing  = log.sets || [];
        const targetN   = ex.sets || 3;
        const rows      = [];
        for (let i = 0; i < Math.max(targetN, existing.length); i++) {
          const s = existing[i] || {};
          rows.push({ weight: s.weight ?? '', reps: s.reps ?? '', done: !!(s.weight || s.reps) });
        }
        return `
          <div class="str-exercise" data-ex="${esc(ex.name)}">
            <div class="str-ex-header">
              <span class="str-ex-name">${esc(ex.name)}</span>
              <span class="str-ex-target">${ex.sets} × ${esc(ex.reps)}</span>
            </div>
            ${ex.note ? `<div class="str-ex-note">${esc(ex.note)}</div>` : ''}
            <div class="str-tiles">
              ${rows.map((s, i) => `
                <div class="str-set-tile ${s.done ? 'is-done' : ''}">
                  <span class="str-snum">S${i + 1}</span>
                  <input type="number" class="str-tile-inp weight-in" inputmode="decimal"
                    placeholder="kg" value="${esc(String(s.weight))}" step="0.5" min="0">
                  <span class="str-tile-sep">×</span>
                  <input type="text" class="str-tile-inp reps-in"
                    placeholder="${esc(ex.reps)}" value="${esc(String(s.reps))}">
                  <button class="str-tick-btn ${s.done ? 'is-done' : ''}"
                    data-ex="${esc(ex.name)}" data-idx="${i}" data-done="${s.done ? '1' : '0'}">
                    ${s.done ? '✓' : ''}
                  </button>
                </div>`).join('')}
            </div>
            <button class="btn-add-set str-add-set" data-ex="${esc(ex.name)}">+ Set</button>
          </div>`;
      }).join('')}
    </div>`;
}
```

### 4b — Update `collectBlockLog`

- [ ] **Step 2: Change `.str-set-row` → `.str-set-tile` in `collectBlockLog`**

In the strength/skill section of `collectBlockLog` (around line 106–122), change:

```js
el.querySelectorAll('.str-set-row').forEach(row => {
  sets.push({
    weight: parseFloat(row.querySelector('.weight-in')?.value) || null,
    reps:   row.querySelector('.reps-in')?.value?.trim() || null,
    note:   row.querySelector('.note-in')?.value || '',
  });
});
```

To:

```js
el.querySelectorAll('.str-set-tile').forEach(tile => {
  sets.push({
    weight: parseFloat(tile.querySelector('.weight-in')?.value) || null,
    reps:   tile.querySelector('.reps-in')?.value?.trim() || null,
    note:   '',
  });
});
```

### 4c — Tick button event handler

- [ ] **Step 3: Add the tick handler inside `container.onclick` in `setupTodayEvents`**

In `container.onclick = e => { ... }`, insert this block **before** the warmup handler (as the first branch):

```js
// Strength tile tick
const tickBtn = e.target.closest('.str-tick-btn');
if (tickBtn) {
  const tile    = tickBtn.closest('.str-set-tile');
  const exEl    = tile.closest('.str-exercise');
  const exName  = exEl?.dataset.ex;
  const idx     = parseInt(tickBtn.dataset.idx);
  const wIn     = tile.querySelector('.weight-in');
  const rIn     = tile.querySelector('.reps-in');
  const isDone  = tickBtn.dataset.done === '1';

  if (!isDone) {
    // Auto-fill from previous tile if both inputs are empty
    if (!wIn.value && !rIn.value) {
      const prev = tile.previousElementSibling;
      if (prev?.classList.contains('str-set-tile')) {
        wIn.value = prev.querySelector('.weight-in')?.value || '';
        rIn.value = prev.querySelector('.reps-in')?.value  || '';
      }
    }
    // Write to blockLog immediately so progress bar updates
    if (exName) {
      if (!blockLog[exName]) blockLog[exName] = { sets: [], hold: '', level: '' };
      blockLog[exName].sets[idx] = {
        weight: parseFloat(wIn.value) || null,
        reps:   rIn.value.trim() || null,
        note:   '',
      };
    }
    tile.classList.add('is-done');
    tickBtn.classList.add('is-done');
    tickBtn.dataset.done = '1';
    tickBtn.textContent  = '✓';
  } else {
    // Un-tick
    if (exName && blockLog[exName]?.sets?.[idx]) {
      blockLog[exName].sets[idx] = { weight: null, reps: null, note: '' };
    }
    tile.classList.remove('is-done');
    tickBtn.classList.remove('is-done');
    tickBtn.dataset.done = '0';
    tickBtn.textContent  = '';
  }
  refreshProgress(container);
  return;
}
```

### 4d — CSS for tiles

- [ ] **Step 4: Append tile CSS to end of `style.css`**

```css
/* ── Strength set tiles ── */
.str-tiles { display: flex; flex-direction: column; gap: .35rem; margin: .35rem 0; }

.str-set-tile {
  display: flex; align-items: center; gap: .4rem;
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: .5rem .65rem;
  transition: background .15s, border-color .15s;
}
.str-set-tile.is-done {
  background: #ffd16608; border-color: #ffd16633;
}
.str-snum {
  font-size: .72rem; color: var(--muted); min-width: 1.5rem;
  flex-shrink: 0; font-weight: 600;
}
.str-tile-inp {
  background: var(--bg2); border: 1px solid var(--border); color: var(--text);
  border-radius: 6px; padding: .35rem .4rem; font-size: .9rem; font-weight: 700;
  text-align: center; outline: none; transition: border-color .15s;
}
.str-tile-inp.weight-in { width: 4.2rem; }
.str-tile-inp.reps-in   { width: 3.6rem; }
.str-tile-inp:focus { border-color: var(--accent); }
.str-set-tile.is-done .str-tile-inp {
  border-color: #ffd16644; color: var(--accent2);
}
.str-tile-sep { color: var(--muted); font-size: .85rem; flex-shrink: 0; }

.str-tick-btn {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid var(--border); background: transparent;
  color: transparent; cursor: pointer; flex-shrink: 0; margin-left: auto;
  font-size: .85rem; font-weight: 800; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.str-tick-btn.is-done { background: var(--accent); border-color: var(--accent); color: #fff; }
.str-tick-btn:active { transform: scale(.92); }
```

- [ ] **Step 5: Syntax check + browser test**

```bash
node --check js/today.js
```

Open http://localhost:4321 → Today → Session tab → navigate to a strength day.

- Strength block shows tiles (not rows)
- Tapping the circle on a tile with empty inputs: copies from the set above (if any), marks orange ✓, tile gets gold tint
- Progress bar updates on tick
- "+ Set" still appends a new tile
- Save Session writes data correctly (check IndexedDB → workouts in DevTools Application tab)

- [ ] **Step 6: Commit**

```bash
git add js/today.js style.css
git commit -m "feat: strength set tiles with tick-to-complete + auto-copy from prev set"
```

---

## Task 5 — SW cache bump + deploy

**Files:**
- Modify: `sw.js` (cache version string)

- [ ] **Step 1: Bump cache version in `sw.js`**

Change line 1:

```js
const CACHE = 'mystats-v19';
```

- [ ] **Step 2: Syntax check**

```bash
node --check sw.js && node --check js/today.js && node --check js/app.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW cache to v19 for UI redesign"
```

- [ ] **Step 4: Deploy to production**

```bash
cd /home/z/Projects/mystats-pwa
vercel --prod
```

- [ ] **Step 5: Verify live**

Open the Vercel URL. Hard-refresh (Cmd+Shift+R / Ctrl+Shift+R) to bust the old SW. Confirm:
- Orange/gold Carbon theme
- Today tab has Session / Checklist / Supps inner tabs
- Strength sets render as tiles with tick circles
- Prog A/B and Week pills are in the compact ctrl bar
- No console errors
