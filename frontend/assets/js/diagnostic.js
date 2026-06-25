// =============================================
// Diagnostic runner state
// =============================================
let DR = null; // active diagnostic run

// =============================================
// Entry point
// =============================================
async function renderDiagnostic(app) {
  const device = DEVICES.find(d => d.type === state.currentDevice);
  const tests  = getTestsForDevice(state.currentDevice);

  // Clear leftover session data from any previous incomplete run
  const _prevId = localStorage.getItem('zd_session_id');
  if (_prevId) {
    api.post(`/sessions/${_prevId}/end`, {}).catch(() => {});
    localStorage.removeItem('zd_session_id');
    localStorage.removeItem('zd_device');
    localStorage.removeItem('zd_session_results');
  }

  // Start backend session (non-fatal if offline)
  let sessionId = null;
  try {
    const s = await api.post('/sessions/start', { device_type: state.currentDevice });
    sessionId = s.session_id;
    state.sessionId = sessionId;
    localStorage.setItem('zd_session_id', sessionId);
    localStorage.setItem('zd_device', state.currentDevice);
  } catch {
    state.sessionId = null;
  }

  DR = { tests, results: [], idx: 0, sessionId, device };

  app.innerHTML = `
    <div class="page" style="max-width:100%">
      <div class="diag-layout">
        <!-- Sidebar -->
        <div class="diag-sidebar">
          <div class="diag-sidebar-hdr">${escHtml(device.name)}</div>
          <div class="diag-progress-wrap">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" id="pg-fill" style="width:0%"></div>
            </div>
            <div class="progress-text" id="pg-txt">0 / ${tests.length}</div>
          </div>
          <div class="test-list" id="test-list">
            ${renderSidebarItems(tests)}
          </div>
        </div>
        <!-- Content -->
        <div class="diag-content" id="diag-content">
          <div id="test-heading-area">
            <div class="test-heading" id="test-heading">—</div>
            <div class="test-key-lbl" id="test-key-lbl"></div>
          </div>
          <div class="test-terminal" id="test-terminal"></div>
          <div id="test-ui"></div>
          <div class="test-actions" id="test-actions"></div>
        </div>
      </div>
    </div>
  `;

  runNextTest();
}

function renderSidebarItems(tests) {
  const groups = {};
  for (const t of tests) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }
  return Object.entries(groups).map(([g, items]) => `
    <div class="test-group-hdr">${escHtml(g)}</div>
    ${items.map(t => `
      <div class="test-item" id="si-${t.key.replace(/\./g, '_')}">
        <span class="test-status-icon">[ ]</span>
        <span>${escHtml(t.label.replace(/^[^—]+— /, ''))}</span>
      </div>
    `).join('')}
  `).join('');
}

// =============================================
// Test runner
// =============================================
async function runNextTest() {
  if (!DR) return;
  const { tests, idx } = DR;

  if (idx >= tests.length) {
    await finishSession();
    return;
  }

  const test = tests[idx];
  setSidebarStatus(test.key, 'running');
  scrollToActive(test.key);
  updateProgress(idx, tests.length);

  // Update content header
  document.getElementById('test-heading').textContent = test.label;
  document.getElementById('test-key-lbl').textContent  = test.key;
  document.getElementById('test-terminal').innerHTML   = '';
  document.getElementById('test-ui').innerHTML         = '';
  document.getElementById('test-actions').innerHTML    = '';

  const ctx = makeCtx();
  ctx.log(`Running: ${test.label}`);

  let result;
  try {
    result = await test.run(ctx);
  } catch (err) {
    result = { status: 'error', detail: `${err.name}: ${err.message}` };
  }

  result.status  = result.status  || 'error';
  result.detail  = result.detail  || null;

  setSidebarStatus(test.key, result.status);
  DR.results.push({ key: test.key, label: test.label, ...result });

  // POST result to backend
  if (DR.sessionId) {
    api.post(`/sessions/${DR.sessionId}/results`, [{
      test_key:   test.key,
      test_label: test.label,
      status:     result.status,
      detail:     result.detail,
    }]).catch(() => {});
  }

  DR.idx++;
  updateProgress(DR.idx, tests.length);

  // Clear actions, small pause, next
  document.getElementById('test-actions').innerHTML = '';
  await delay(200);
  runNextTest();
}

// =============================================
// Context object passed to each test run()
// =============================================
function makeCtx() {
  return {
    log(msg) {
      const t = document.getElementById('test-terminal');
      if (!t) return;
      const d = document.createElement('div');
      d.className  = 'terminal-line';
      d.textContent = msg;
      t.appendChild(d);
      t.scrollTop = t.scrollHeight;
    },
    setUI(html) {
      const el = document.getElementById('test-ui');
      if (el) el.innerHTML = html;
    },
    clearUI() {
      const el = document.getElementById('test-ui');
      if (el) el.innerHTML = '';
    },
    perm(name) {
      return state.grantedPermissions[name] === 'granted';
    },
    waitForJudgment(opts = {}) {
      return new Promise(resolve => {
        const el = document.getElementById('test-actions');
        if (!el) { resolve({ status: 'skip', detail: 'UI unavailable' }); return; }

        const skip = opts.noSkip ? '' :
          `<button class="btn btn-skip-t" onclick="_jr('skip')">SKIP</button>`;
        const fail = `<button class="btn btn-fail" onclick="_jr('fail')">FAIL</button>`;
        const pass = opts.noPass ? '' :
          `<button class="btn btn-pass" onclick="_jr('pass')">PASS</button>`;

        el.innerHTML = `${pass}${fail}${skip}`;

        window._jr = (status) => {
          window._jr = null;
          if (opts.cleanup) opts.cleanup();
          resolve({ status, detail: opts.detail || null });
        };
      });
    },
  };
}

// =============================================
// Sidebar helpers
// =============================================
const STATUS_ICONS = {
  pending: '[ ]',
  running: '[~]',
  pass:    '[✓]',
  fail:    '[✗]',
  skip:    '[-]',
  error:   '[!]',
};

function setSidebarStatus(key, status) {
  const id = 'si-' + key.replace(/\./g, '_');
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `test-item is-${status}`;
  const icon = el.querySelector('.test-status-icon');
  if (icon) icon.textContent = STATUS_ICONS[status] || '[ ]';
}

function scrollToActive(key) {
  const id = 'si-' + key.replace(/\./g, '_');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function updateProgress(done, total) {
  const fill = document.getElementById('pg-fill');
  const txt  = document.getElementById('pg-txt');
  const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (txt)  txt.textContent  = `${done} / ${total}`;
}

// =============================================
// Finish & Summary
// =============================================
async function finishSession() {
  if (DR.sessionId) {
    api.post(`/sessions/${DR.sessionId}/end`, {}).catch(() => {});
  }

  const results = DR.results;
  const cnt     = { pass: 0, fail: 0, skip: 0, error: 0 };
  for (const r of results) if (cnt[r.status] !== undefined) cnt[r.status]++;

  const resultRows = results.map(r => {
    const colors = { pass: 'var(--color-pass)', fail: 'var(--color-fail)', skip: 'var(--color-text-muted)', error: 'var(--color-error)' };
    const icons  = { pass: '[✓]', fail: '[✗]', skip: '[-]', error: '[!]' };
    return `
      <div class="result-row">
        <span style="color:${colors[r.status]||'inherit'};min-width:28px;font-size:12px">${icons[r.status]||'[?]'}</span>
        <span style="flex:1;font-size:12px">${escHtml(r.label)}</span>
        ${r.detail ? `<span style="font-size:11px;color:var(--color-text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.detail)}</span>` : ''}
      </div>
    `;
  }).join('');

  const content = document.getElementById('diag-content');
  if (!content) return;
  content.innerHTML = `
    <div class="test-heading">Diagnostic Complete</div>
    <div class="test-key-lbl">${escHtml(DR.device.name)}</div>
    <div class="summary-grid">
      <div class="summary-cell s-pass">
        <span class="summary-count">${cnt.pass}</span>
        <span class="summary-lbl">PASS</span>
      </div>
      <div class="summary-cell s-fail">
        <span class="summary-count">${cnt.fail}</span>
        <span class="summary-lbl">FAIL</span>
      </div>
      <div class="summary-cell s-skip">
        <span class="summary-count">${cnt.skip}</span>
        <span class="summary-lbl">SKIP</span>
      </div>
      <div class="summary-cell s-error">
        <span class="summary-count">${cnt.error}</span>
        <span class="summary-lbl">ERROR</span>
      </div>
    </div>
    <div class="result-list">${resultRows}</div>
    <div class="test-actions" style="flex-wrap:wrap;gap:8px;margin-top:16px">
      ${DR.sessionId
        ? `<button class="btn btn-primary" onclick="showReport()">Generate Report</button>`
        : ''}
      <button class="btn btn-ghost" onclick="endSession()">End Session</button>
    </div>
  `;
}

async function showReport() {
  if (!DR.sessionId) return;
  try {
    const { report } = await api.get(`/sessions/${DR.sessionId}/report`);
    const overlay = document.createElement('div');
    overlay.className = 'rpt-overlay';
    overlay.id        = 'rpt-modal';
    overlay.innerHTML = `
      <div class="rpt-card">
        <div class="modal-title">Service Report</div>
        <pre class="rpt-text" id="rpt-text">${escHtml(report)}</pre>
        <div class="rpt-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('rpt-modal').remove()">Tutup</button>
          <button class="btn btn-primary" onclick="copyReport()">Salin ke Clipboard</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    window._reportText = report;
  } catch (err) {
    alert('Gagal generate report: ' + err.message);
  }
}

function copyReport() {
  if (!window._reportText) return;
  navigator.clipboard.writeText(window._reportText).then(() => {
    const btn = document.querySelector('.rpt-card .btn-primary');
    if (btn) { btn.textContent = 'Tersalin!'; setTimeout(() => { btn.textContent = 'Salin ke Clipboard'; }, 2000); }
  }).catch(() => {
    alert('Salin manual:\n\n' + window._reportText);
  });
}

function endSession() {
  localStorage.removeItem('zd_session_id');
  localStorage.removeItem('zd_device');
  localStorage.removeItem('zd_session_results');
  state.sessionId          = null;
  state.currentDevice      = null;
  state.currentSession     = null;
  state.grantedPermissions = {};
  DR = null;
  navigateTo('home');
}
