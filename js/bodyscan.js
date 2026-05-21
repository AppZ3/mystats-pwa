import { SCAN_HISTORY, TARGETS } from './profile.js';
import { dbAdd, dbPut, dbGet, dbGetAll, dbDelete } from './db.js';

let editingScan = null;

// ── File → text extraction ─────────────────────────────────────────────────

async function loadPdfJsForScan() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load PDF parser — check internet connection'));
    document.head.appendChild(s);
  });
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Could not load image reader — check internet connection'));
    document.head.appendChild(s);
  });
}

async function extractScanText(file, setStatus) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.heic') || name.endsWith('.heif')) {
    throw new Error('HEIC/HEIF images are not supported — export as JPEG or PNG from Photos and try again');
  }

  if (file.size > 30 * 1024 * 1024) {
    throw new Error('File too large (max 30 MB) — try a lower-resolution image');
  }

  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';

  if (isPdf) {
    setStatus('loading', 'Loading PDF reader…', 0);
    const pdfjsLib = await loadPdfJsForScan();
    const data = await file.arrayBuffer();
    setStatus('loading', 'Reading PDF…', 30);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      setStatus('loading', `Reading page ${p} of ${pdf.numPages}…`, 30 + Math.round((p / pdf.numPages) * 65));
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const byY = {};
      for (const item of content.items) {
        const y = Math.round(item.transform[5] / 4) * 4;
        (byY[y] = byY[y] || []).push(item);
      }
      const lines = Object.keys(byY).map(Number).sort((a, b) => b - a)
        .map(y => byY[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim())
        .filter(Boolean);
      pages.push(lines.join('\n'));
    }
    setStatus('loading', 'Parsing values…', 95);
    return pages.join('\n');
  }

  // Image — OCR via Tesseract
  setStatus('loading', 'Loading OCR engine… (first use ~10 sec)', 5);
  const Tesseract = await loadTesseract();
  setStatus('loading', 'Starting OCR…', 15);
  const { data: { text } } = await Tesseract.recognize(file, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        setStatus('loading', `Reading text… ${Math.round(m.progress * 100)}%`, 15 + Math.round(m.progress * 80));
      } else if (m.status === 'loading tesseract core') {
        setStatus('loading', 'Loading OCR engine…', 5);
      } else if (m.status === 'initializing tesseract') {
        setStatus('loading', 'Initialising OCR…', 10);
      }
    },
  });
  setStatus('loading', 'Parsing values…', 97);
  return text;
}

// ── InBody text parser ─────────────────────────────────────────────────────

function parseInBodyText(rawText) {
  const t = rawText.replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ');

  const find = (...pats) => {
    for (const p of pats) {
      const m = t.match(p);
      if (m) { const v = parseFloat(m[1].replace(/,/g, '')); return isNaN(v) ? null : v; }
    }
    return null;
  };

  return {
    weight:      find(/weight\s*[:\-]?\s*([\d,]+\.?\d*)\s*kg/i),
    smm:         find(/skeletal\s*muscle\s*mass\s*[:\-]?\s*([\d,]+\.?\d*)/i, /\bsmm\b\s*[:\-]?\s*([\d,]+\.?\d*)/i),
    pbf:         find(/body\s*fat\s*[%\s][:\-]?\s*([\d,]+\.?\d*)/i, /\bpbf\b\s*[:\-]?\s*([\d,]+\.?\d*)/i, /percent\s*body\s*fat\s*[:\-]?\s*([\d,]+\.?\d*)/i),
    bodyFatMass: find(/body\s*fat\s*mass\s*[:\-]?\s*([\d,]+\.?\d*)\s*kg/i),
    bmi:         find(/\bbmi\b\s*[:\-]?\s*([\d,]+\.?\d*)/i),
    vfl:         find(/visceral\s*fat\s*level\s*[:\-]?\s*([\d,]+\.?\d*)/i, /\bvfl\b\s*[:\-]?\s*([\d,]+)/i),
    vfa:         find(/visceral\s*fat\s*area\s*[:\-]?\s*([\d,]+\.?\d*)\s*cm/i),
    phaseAngle:  find(/phase\s*angle\s*[:\-]?\s*([\d,]+\.?\d*)/i),
    bmr:         find(/\bbmr\b\s*[:\-]?\s*([\d,]+\.?\d*)/i, /basal\s*metabolic\s*rate\s*[:\-]?\s*([\d,]+)/i),
    inbodyScore: find(/inbody\s*score\s*[:\-]?\s*(\d+)/i),
    tbw:         find(/total\s*body\s*water\s*[:\-]?\s*([\d,]+\.?\d*)/i, /\btbw\b\s*[:\-]?\s*([\d,]+\.?\d*)/i),
    protein:     find(/\bprotein\b\s*[:\-]?\s*([\d,]+\.?\d*)\s*kg/i),
    minerals:    find(/\bminerals?\b\s*[:\-]?\s*([\d,]+\.?\d*)\s*kg/i),
    ecwRatio:    find(/ecw\s*[\/\.]\s*tbw\s*[:\-]?\s*([\d.]+)/i, /ecw\s*ratio\s*[:\-]?\s*([\d.]+)/i),
    ffmi:        find(/\bffmi\b\s*[:\-]?\s*([\d.]+)/i),
    whr:         find(/waist.hip\s*(?:ratio)?\s*[:\-]?\s*([\d.]+)/i, /\bwhr\b\s*[:\-]?\s*([\d.]+)/i),
    bmc:         find(/bone\s*mineral\s*(?:content|density)\s*[:\-]?\s*([\d.]+)\s*kg/i, /\bbmc\b\s*[:\-]?\s*([\d.]+)/i),
    rightArm:    find(/right\s*arm\s*[:\-]?\s*([\d.]+)\s*kg/i),
    leftArm:     find(/left\s*arm\s*[:\-]?\s*([\d.]+)\s*kg/i),
    trunk:       find(/\btrunk\b\s*[:\-]?\s*([\d.]+)\s*kg/i),
    rightLeg:    find(/right\s*leg\s*[:\-]?\s*([\d.]+)\s*kg/i),
    leftLeg:     find(/left\s*leg\s*[:\-]?\s*([\d.]+)\s*kg/i),
  };
}

function extractDateFromText(text) {
  // YYYY/MM/DD or YYYY-MM-DD
  const m1 = text.match(/\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`;
  // DD/MM/YYYY
  const m2 = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return null;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

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

  const [apiKeyRecord, insightsRecord, progRecord] = await Promise.all([
    dbGet('settings', 'anthropic_api_key'),
    dbGet('settings', 'scan_insights'),
    dbGet('settings', 'programme'),
  ]);
  const hasApiKey = !!(apiKeyRecord?.value);
  const storedInsights = insightsRecord?.value;
  const programme = progRecord?.value ?? 'A';

  const insightsHtml = renderInsightsSectionHtml(latest, storedInsights, hasApiKey);

  container.innerHTML = `
    <div class="section-header">
      <h2>Body Scans</h2>
      <div style="display:flex;gap:.4rem">
        <button class="btn-secondary btn-sm" id="upload-scan-btn">📄 From File</button>
        <button class="btn-primary btn-sm" id="add-scan-btn">${es ? '✕ Cancel' : '+ Add Scan'}</button>
      </div>
    </div>
    <input type="file" id="scan-file-input" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" style="display:none">
    <div id="scan-upload-status" style="font-size:.85rem;padding:.1rem 0;min-height:1.2rem"></div>

    ${latest && !es ? renderLatestCard(latest, prev) : ''}
    ${latest && !es ? renderTargetsCard(latest) : ''}

    <div class="card insights-card" id="insights-card">
      ${insightsHtml}
    </div>

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
  setupInsightsEvents(container, scans, latest, programme);

  if (es) {
    container.querySelector('#scan-form-card')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderInsightsSectionHtml(latestScan, storedInsights, hasApiKey) {
  if (!hasApiKey) {
    return `
      <div class="card-label">Monthly Programme Insights</div>
      <div class="insights-setup">
        <p>Add your <strong>Anthropic API key</strong> in Settings to get AI-generated monthly programme recommendations after each scan.</p>
        <p class="muted" style="font-size:.78rem;margin-top:.3rem">Your key is stored only on this device and calls go directly to the Anthropic API. Cost is typically &lt;$0.01 per analysis.</p>
      </div>`;
  }
  if (!latestScan) {
    return `
      <div class="card-label">Monthly Programme Insights</div>
      <p class="muted">Add your first InBody scan to generate AI programme recommendations.</p>`;
  }
  if (!storedInsights || storedInsights.scanDate !== latestScan.date) {
    return `
      <div class="card-label">Monthly Programme Insights</div>
      <div class="insights-cta">
        <p>Latest scan data is ready. Generate your personalised programme recommendations for the next 30 days.</p>
        <button class="btn-primary" id="generate-insights-btn">Generate Insights</button>
      </div>`;
  }
  return renderInsightsCardHtml(storedInsights.insights, storedInsights.scanDate);
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

  // Upload from file
  container.querySelector('#upload-scan-btn')?.addEventListener('click', () => {
    container.querySelector('#scan-file-input')?.click();
  });

  container.querySelector('#scan-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const statusEl = container.querySelector('#scan-upload-status');

    const setStatus = (type, msg, pct = 0) => {
      if (type === 'loading') {
        statusEl.innerHTML = `
          <div class="scan-upload-progress">
            <div style="display:flex;align-items:center;gap:.6rem;">
              <div class="scan-upload-spinner"></div>
              <span class="scan-upload-msg">${msg}</span>
            </div>
            <div class="scan-upload-bar-wrap">
              <div class="scan-upload-bar" style="width:${pct}%"></div>
            </div>
          </div>`;
      } else if (type === 'success') {
        statusEl.innerHTML = `<div class="scan-upload-result success">✓ ${msg}</div>`;
      } else if (type === 'warn') {
        statusEl.innerHTML = `<div class="scan-upload-result warn">⚠ ${msg}</div>`;
      } else if (type === 'error') {
        statusEl.innerHTML = `<div class="scan-upload-result error">✕ ${msg}</div>`;
      }
    };

    // Disable upload button while processing
    const uploadBtn = container.querySelector('#upload-scan-btn');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '⏳ Reading…'; }

    try {
      const rawText = await extractScanText(file, setStatus);
      const parsed  = parseInBodyText(rawText);
      const date    = extractDateFromText(rawText);

      const allFields = [...SCAN_FIELDS, ...SEG_FIELDS];
      const detected  = allFields.filter(f => parsed[f.id] != null).length;

      if (detected === 0) {
        setStatus('warn', 'No InBody values detected — make sure the file is a clear InBody printout (PDF or photo).');
        return;
      }

      // Show and populate the form
      formEl.style.display = 'block';
      addBtn.textContent = '✕ Cancel';

      if (date) {
        const dateEl = container.querySelector('#scan-date');
        if (dateEl) dateEl.value = date;
      }
      allFields.forEach(f => {
        if (parsed[f.id] != null) {
          const el = container.querySelector(`#scan-${f.id}`);
          if (el) el.value = parsed[f.id];
        }
      });

      setStatus('success', `Detected ${detected} of ${allFields.length} fields — review below and tap Save Scan.`);
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setStatus('error', err.message);
    } finally {
      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '📄 From File'; }
    }
  });

  addBtn?.addEventListener('click', () => {
    if (editingScan) {
      editingScan = null;
      renderBodyScan(container);
      return;
    }
    const isShowing = formEl.style.display !== 'none';
    formEl.style.display = isShowing ? 'none' : 'block';
    addBtn.textContent = isShowing ? '+ Add Scan' : '✕ Cancel';
    if (isShowing) {
      // Clear all form fields when cancelling
      container.querySelectorAll('#scan-form-card input').forEach(el => { el.value = ''; });
      container.querySelector('#scan-upload-status').textContent = '';
    }
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

    // Refresh page and auto-generate insights if API key is set
    await renderBodyScan(container);
    const allScans = await getAllScans();
    const progRecord = await dbGet('settings', 'programme');
    const programme = progRecord?.value ?? 'A';
    generateAndStoreInsights(allScans[allScans.length - 1], allScans, programme, container);
  });

  // Manual generate button (shown when insights are stale or missing)
  container.querySelector('#generate-insights-btn')?.addEventListener('click', async () => {
    const allScans = await getAllScans();
    const progRecord = await dbGet('settings', 'programme');
    const programme = progRecord?.value ?? 'A';
    generateAndStoreInsights(allScans[allScans.length - 1], allScans, programme, container);
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

// ── AI Insights engine ─────────────────────────────────────────────────────

async function getApiKey() {
  const s = await dbGet('settings', 'anthropic_api_key');
  return s?.value || null;
}

function buildInsightsPrompt(scan, prevScan, allScans, programme) {
  const df = v => v != null ? v : 'not measured';
  const dlt = (c, p) => c != null && p != null ? ` (${c > p ? '+' : ''}${(c - p).toFixed(2)})` : '';

  const segImbalance = (a, b) => a != null && b != null
    ? ` · ${Math.abs(((a - b) / Math.max(a, b)) * 100).toFixed(1)}% imbalance` : '';

  const trendLines = allScans.slice(-4).map(s =>
    `  ${s.date}: ${s.weight}kg, SMM ${s.smm}kg, BF ${s.pbf}%, score ${s.inbodyScore}`
  ).join('\n');

  return `You are an elite fitness analyst for a calisthenics and strength athlete. Analyze the InBody scan and produce specific, honest programme recommendations for the next 30 days. Be direct — don't pad weaknesses.

CURRENT SCAN (${scan.date}):
Weight: ${df(scan.weight)}kg${dlt(scan.weight, prevScan?.weight)}
SMM (Skeletal Muscle Mass): ${df(scan.smm)}kg${dlt(scan.smm, prevScan?.smm)}
Body Fat %: ${df(scan.pbf)}%${dlt(scan.pbf, prevScan?.pbf)}
Body Fat Mass: ${df(scan.bodyFatMass)}kg${dlt(scan.bodyFatMass, prevScan?.bodyFatMass)}
InBody Score: ${df(scan.inbodyScore)}/100${dlt(scan.inbodyScore, prevScan?.inbodyScore)}
BMR: ${df(scan.bmr)} kcal${dlt(scan.bmr, prevScan?.bmr)}
Phase Angle: ${df(scan.phaseAngle)}°${dlt(scan.phaseAngle, prevScan?.phaseAngle)} (above 7.0 = excellent cellular health)
ECW Ratio: ${df(scan.ecwRatio)} (above 0.390 = elevated inflammation/water retention)
VFL: ${df(scan.vfl)} (above 10 = visceral fat concern)
Protein Mass: ${df(scan.protein)}kg${dlt(scan.protein, prevScan?.protein)}
BMI: ${df(scan.bmi)}

Segmental Lean (SMM by body part):
Right Arm: ${df(scan.rightArm)}kg | Left Arm: ${df(scan.leftArm)}kg${segImbalance(scan.rightArm, scan.leftArm)}
Trunk: ${df(scan.trunk)}kg${dlt(scan.trunk, prevScan?.trunk)}
Right Leg: ${df(scan.rightLeg)}kg | Left Leg: ${df(scan.leftLeg)}kg${segImbalance(scan.rightLeg, scan.leftLeg)}

${allScans.length >= 2 ? `SCAN HISTORY (last ${Math.min(allScans.length, 4)} scans):\n${trendLines}` : 'FIRST SCAN — no historical comparison available'}

CURRENT PROGRAMME: Programme ${programme} — calisthenics + strength hybrid (planche, front lever, muscle-up, handstand, pistol squat skill work, plus weighted strength and conditioning)

ELITE TARGETS:
InBody Score: 93 | SMM: 42kg | Body Fat: 9% | Phase Angle: 8.0° | BMR: 2000 kcal | Protein Mass: 15kg

Based on this data, identify the weakest links holding back progress, what's working, and exactly what to adjust in training and nutrition for the next 30 days. Be specific — name exercises and protocols where possible.

Respond with ONLY valid JSON (no markdown, no preamble), exactly this structure:
{
  "summary": "2-3 sentence honest assessment of current state and recent trajectory",
  "key_findings": [
    { "type": "strength", "label": "Short label", "detail": "One sentence" },
    { "type": "weakness", "label": "Short label", "detail": "One sentence" },
    { "type": "warning", "label": "Short label", "detail": "One sentence" },
    { "type": "trend", "label": "Short label", "detail": "One sentence" }
  ],
  "priority_areas": [
    { "area": "Area name", "why": "One sentence referencing a specific metric", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"] }
  ],
  "programme_adjustments": [
    { "change": "Specific training change", "rationale": "Why this addresses the scan findings" }
  ],
  "nutrition_notes": "Specific protein target, caloric approach, and timing based on current body composition and BMR",
  "month_goal": "Single measurable target for next scan (e.g. SMM +0.5kg, BF -1.5%, score +3)"
}`;
}

async function callClaude(prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.content[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON returned from model');
  return JSON.parse(m[0]);
}

async function generateAndStoreInsights(scan, allScans, programme, container) {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  const prevScan = allScans.length > 1 ? allScans[allScans.length - 2] : null;

  // Show loading state in insights card
  const card = container?.querySelector('#insights-card');
  if (card) {
    card.innerHTML = `
      <div class="card-label">Monthly Programme Insights</div>
      <div class="insights-loading">
        <div class="insights-spinner"></div>
        <span>Analysing scan with Claude…</span>
      </div>`;
  }

  try {
    const prompt = buildInsightsPrompt(scan, prevScan, allScans, programme);
    const insights = await callClaude(prompt, apiKey);
    await dbPut('settings', { key: 'scan_insights', value: { insights, scanDate: scan.date, generatedAt: new Date().toISOString() } });
    if (card) card.innerHTML = renderInsightsCardHtml(insights, scan.date);
    setupInsightsEvents(container, allScans, scan, programme);
  } catch (err) {
    if (card) {
      card.innerHTML = `
        <div class="card-label">Monthly Programme Insights</div>
        <div class="insights-error">
          <span class="badge danger">Error</span>
          <span>${esc(err.message)}</span>
          <button class="btn-secondary btn-sm" id="retry-insights">Retry</button>
        </div>`;
      container?.querySelector('#retry-insights')?.addEventListener('click', () => {
        generateAndStoreInsights(scan, allScans, programme, container);
      });
    }
  }
}

function renderInsightsCardHtml(insights, scanDate) {
  if (!insights) return '';
  const typeIcon = { strength: '✓', weakness: '↓', warning: '⚠', trend: '→' };
  const typeCls  = { strength: 'success', weakness: 'danger', warning: 'warning', trend: 'info' };

  return `
    <div class="insights-header">
      <div class="card-label">Monthly Programme Insights</div>
      <div style="display:flex;align-items:center;gap:.5rem">
        <span class="muted" style="font-size:.72rem">Based on scan ${scanDate}</span>
        <button class="btn-secondary btn-sm" id="regenerate-insights">↺ Regenerate</button>
      </div>
    </div>

    <p class="insights-summary">${esc(insights.summary)}</p>

    ${insights.key_findings?.length ? `
      <div class="insights-findings">
        ${insights.key_findings.map(f => `
          <div class="insight-finding type-${esc(f.type)}">
            <span class="finding-icon badge ${typeCls[f.type] || 'info'}">${typeIcon[f.type] || '·'} ${esc(f.label)}</span>
            <span class="finding-detail">${esc(f.detail)}</span>
          </div>`).join('')}
      </div>` : ''}

    ${insights.priority_areas?.length ? `
      <div class="insights-block">
        <div class="insights-block-title">Next 30 Days — Priority Areas</div>
        ${insights.priority_areas.map((p, i) => `
          <div class="priority-area">
            <div class="priority-area-header">
              <span class="priority-num">${i + 1}</span>
              <div>
                <strong>${esc(p.area)}</strong>
                <div class="priority-why">${esc(p.why)}</div>
              </div>
            </div>
            <ul class="priority-actions">
              ${(p.actions || []).map(a => `<li>${esc(a)}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>` : ''}

    ${insights.programme_adjustments?.length ? `
      <div class="insights-block">
        <div class="insights-block-title">Programme Adjustments</div>
        ${insights.programme_adjustments.map(a => `
          <div class="prog-adjustment">
            <span class="adj-change">${esc(a.change)}</span>
            <span class="adj-rationale">${esc(a.rationale)}</span>
          </div>`).join('')}
      </div>` : ''}

    ${insights.nutrition_notes ? `
      <div class="insights-block">
        <div class="insights-block-title">Nutrition</div>
        <p class="insights-nutrition">${esc(insights.nutrition_notes)}</p>
      </div>` : ''}

    ${insights.month_goal ? `
      <div class="insights-goal">
        <span class="insights-goal-label">Goal for next scan</span>
        <strong>${esc(insights.month_goal)}</strong>
      </div>` : ''}`;
}

function setupInsightsEvents(container, allScans, latestScan, programme) {
  container?.querySelector('#regenerate-insights')?.addEventListener('click', () => {
    generateAndStoreInsights(latestScan, allScans, programme, container);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
