// =============================================
// History Page — state
// =============================================
let _histPage    = 0;
let _histFilters = { device_type: '', is_guest: 'all' };
const HIST_PAGE_SIZE = 20;

const DEVICE_LABELS_FE = {
  android:        'Android',
  iphone:         'iPhone',
  ipad:           'iPad',
  laptop_windows: 'Laptop (Windows)',
  laptop_linux:   'Laptop (Linux)',
  macbook:        'MacBook',
};

// =============================================
// Shared date / duration formatters
// =============================================
function fmtDate(d) {
  if (!d) return '—';
  const dt  = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fmtDuration(start, end) {
  if (!end) return 'In Progress';
  const ms  = new Date(end) - new Date(start);
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s   = sec % 60;
  return min === 0 ? `${s}s` : `${min}m ${s}s`;
}

// =============================================
// Main render
// =============================================
function renderHistory(app) {
  _histPage    = 0;
  _histFilters = { device_type: '', is_guest: 'all' };

  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Session History</h1>
        <p>Riwayat sesi diagnostik perangkat</p>
      </div>
      <div class="filter-bar">
        <select class="filter-select" id="hist-device" onchange="histApplyFilters()">
          <option value="">All Devices</option>
          <option value="android">Android</option>
          <option value="iphone">iPhone</option>
          <option value="ipad">iPad</option>
          <option value="laptop_windows">Laptop (Windows)</option>
          <option value="laptop_linux">Laptop (Linux)</option>
          <option value="macbook">MacBook</option>
        </select>
        <div class="filter-toggle" id="hist-guest-toggle">
          <button class="filter-toggle-btn active" data-guest="all"
            onclick="histSetGuest('all')">All Sessions</button>
          <button class="filter-toggle-btn" data-guest="true"
            onclick="histSetGuest('true')">Guest Only</button>
          <button class="filter-toggle-btn" data-guest="false"
            onclick="histSetGuest('false')">Authenticated Only</button>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="histRefresh()">Refresh</button>
      </div>
      <div id="hist-content"></div>
      <div id="hist-pagination"></div>
    </div>
  `;

  histLoadSessions();
}

// =============================================
// Filter actions
// =============================================
function histApplyFilters() {
  const sel = document.getElementById('hist-device');
  if (sel) _histFilters.device_type = sel.value;
  _histPage = 0;
  histLoadSessions();
}

function histSetGuest(val) {
  _histFilters.is_guest = val;
  _histPage = 0;
  document.querySelectorAll('#hist-guest-toggle .filter-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.guest === val);
  });
  histLoadSessions();
}

function histRefresh() { histLoadSessions(); }

// =============================================
// Load & render sessions
// =============================================
async function histLoadSessions() {
  const content = document.getElementById('hist-content');
  if (!content) return;
  content.innerHTML = '<div class="loading-state">Loading sessions...</div>';

  const params = new URLSearchParams({
    limit:  String(HIST_PAGE_SIZE),
    offset: String(_histPage * HIST_PAGE_SIZE),
  });
  if (_histFilters.device_type) params.set('device_type', _histFilters.device_type);
  if (_histFilters.is_guest !== 'all') params.set('is_guest', _histFilters.is_guest);

  try {
    const sessions = await api.get(`/sessions?${params.toString()}`);

    if (!sessions || sessions.length === 0) {
      content.innerHTML = '<div class="empty-state">No sessions found</div>';
      const pagEl = document.getElementById('hist-pagination');
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    content.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Device</th>
              <th>Started At</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Technician</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map(s => _histRow(s)).join('')}
          </tbody>
        </table>
      </div>
    `;

    _histRenderPagination(sessions.length);
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Error loading sessions: ${escHtml(err.message)}</div>`;
    const pagEl = document.getElementById('hist-pagination');
    if (pagEl) pagEl.innerHTML = '';
  }
}

function _histRow(s) {
  const id       = escHtml(s.id.slice(0, 8));
  const device   = escHtml(DEVICE_LABELS_FE[s.device_type] || s.device_type);
  const started  = escHtml(fmtDate(s.started_at));
  const dur      = s.ended_at
    ? escHtml(fmtDuration(s.started_at, s.ended_at))
    : '<span class="dur-blink">In Progress</span>';
  const statusEl = s.ended_at
    ? '<span class="tag tag-completed">Completed</span>'
    : '<span class="tag tag-progress">In Progress</span>';
  const tech = s.is_guest
    ? '<span class="text-muted">Guest</span>'
    : escHtml(s.technician || '—');

  return `
    <tr>
      <td class="text-mono">${id}</td>
      <td>${device}</td>
      <td>${started}</td>
      <td>${dur}</td>
      <td>${statusEl}</td>
      <td>${tech}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="histShowDetail('${escHtml(s.id)}')">Detail</button>
      </td>
    </tr>
  `;
}

function _histRenderPagination(count) {
  const pagEl = document.getElementById('hist-pagination');
  if (!pagEl) return;
  const hasMore = count === HIST_PAGE_SIZE;
  pagEl.innerHTML = `
    <div class="pagination">
      <button class="btn btn-sm btn-ghost" onclick="histPrev()" ${_histPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="pagination-info">Page ${_histPage + 1}</span>
      <button class="btn btn-sm btn-ghost" onclick="histNext()" ${!hasMore ? 'disabled' : ''}>Next →</button>
    </div>
  `;
}

function histPrev() { if (_histPage > 0) { _histPage--; histLoadSessions(); } }
function histNext() { _histPage++; histLoadSessions(); }

// =============================================
// Session Detail Modal
// =============================================
async function histShowDetail(sessionId) {
  document.getElementById('hist-detail-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'hist-detail-modal';
  overlay.innerHTML = `
    <div class="modal-card modal-card-wide">
      <div class="loading-state">Loading session details...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  try {
    const { session, results, summary } = await api.get(`/sessions/${sessionId}`);
    const device = escHtml(DEVICE_LABELS_FE[session.device_type] || session.device_type);

    overlay.querySelector('.modal-card').innerHTML = `
      <div class="modal-title">${escHtml(session.id.slice(0, 8))} &mdash; ${device}</div>
      <div class="modal-sub">
        ${escHtml(fmtDate(session.started_at))}
        &nbsp;&middot;&nbsp;
        ${session.is_guest ? 'Guest' : escHtml(session.technician || '—')}
        &nbsp;&middot;&nbsp;
        ${fmtDuration(session.started_at, session.ended_at)}
      </div>

      <div class="detail-summary">
        <span class="status-pass">${summary.pass}&thinsp;PASS</span>
        <span class="status-fail">${summary.fail}&thinsp;FAIL</span>
        <span class="status-skip">${summary.skip}&thinsp;SKIP</span>
        <span class="status-error">${summary.error}&thinsp;ERROR</span>
      </div>

      ${results.length > 0 ? `
        <div class="detail-table-wrap table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Test</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              ${results.map(r => `
                <tr>
                  <td>${escHtml(r.test_label)}</td>
                  <td><span class="badge badge-${r.status}">${r.status.toUpperCase()}</span></td>
                  <td style="font-size:11px;color:var(--color-text-muted);max-width:220px;
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${escHtml(r.detail || '—')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding:16px 0">No test results recorded</div>'}

      <div id="hist-report-area"></div>

      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-ghost btn-sm"
          onclick="document.getElementById('hist-detail-modal').remove()">Tutup</button>
        ${session.ended_at
          ? `<button class="btn btn-ghost btn-sm" id="hist-rpt-btn"
               onclick="histGenerateReport('${escHtml(sessionId)}')">Generate Report</button>`
          : ''}
      </div>
    `;
  } catch (err) {
    overlay.querySelector('.modal-card').innerHTML = `
      <div class="empty-state">Error: ${escHtml(err.message)}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm"
          onclick="document.getElementById('hist-detail-modal').remove()">Tutup</button>
      </div>
    `;
  }
}

async function histGenerateReport(sessionId) {
  const btn = document.getElementById('hist-rpt-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

  try {
    const { report } = await api.get(`/sessions/${sessionId}/report`);
    const area = document.getElementById('hist-report-area');
    if (area) {
      area.innerHTML = `
        <textarea class="report-textarea" readonly>${escHtml(report)}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button class="btn btn-sm btn-primary" onclick="histCopyReport()">Salin Report</button>
        </div>
      `;
      window._histReport = report;
    }
    if (btn) { btn.textContent = 'Report Generated'; }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
    alert('Gagal generate report: ' + err.message);
  }
}

function histCopyReport() {
  if (!window._histReport) return;
  const btn = event?.target;
  navigator.clipboard.writeText(window._histReport).then(() => {
    if (btn) { btn.textContent = 'Tersalin!'; setTimeout(() => { btn.textContent = 'Salin Report'; }, 2000); }
  }).catch(() => {
    alert('Salin manual:\n\n' + window._histReport);
  });
}
