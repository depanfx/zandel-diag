// =============================================
// Admin Page
// =============================================
function renderAdmin(app) {
  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Admin Panel</h1>
        <p>Manajemen pengguna dan statistik sesi</p>
      </div>

      <div class="admin-section">
        <div class="section-hdr">
          <h2>User Management</h2>
          <button class="btn btn-sm btn-primary" onclick="adminShowAddUser()">+ Tambah Teknisi</button>
        </div>
        <div id="admin-success"></div>
        <div id="admin-users-content">
          <div class="loading-state">Loading users...</div>
        </div>
      </div>

      <div class="admin-section">
        <div class="section-hdr">
          <h2>Session Statistics</h2>
          <button class="btn btn-sm btn-ghost" onclick="adminLoadStats()">Refresh</button>
        </div>
        <div id="admin-stats-content">
          <div class="loading-state">Loading stats...</div>
        </div>
      </div>
    </div>
  `;

  adminLoadUsers();
  adminLoadStats();
}

// =============================================
// User Management — load & render
// =============================================
async function adminLoadUsers() {
  const el = document.getElementById('admin-users-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-state">Loading users...</div>';
  try {
    const users = await api.get('/users');
    adminRenderUserTable(users);
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
  }
}

function adminRenderUserTable(users) {
  const el = document.getElementById('admin-users-content');
  if (!el) return;

  if (!users || users.length === 0) {
    el.innerHTML = '<div class="empty-state">No users found</div>';
    return;
  }

  const me = state.currentUser;

  el.innerHTML = `
    <div class="table-wrap">
      <table class="data-table" id="admin-user-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Created At</th>
            <th>Last Login</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => _adminUserRow(u, me)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _adminUserRow(u, me) {
  const isSelf = u.id === me?.id;
  const roleClass = u.role === 'superadmin' ? 'badge-role-sa' : 'badge-skip';
  const statusTag = u.is_active
    ? '<span class="tag tag-active">Active</span>'
    : '<span class="tag tag-inactive">Inactive</span>';

  const actions = isSelf
    ? `<span class="text-muted" style="font-size:11px;padding:2px 0">(akun Anda)</span>`
    : `<button class="btn btn-sm btn-ghost"
         onclick='adminShowEditUser(${JSON.stringify({ id: u.id, username: u.username })})'>Edit</button>
       <button class="btn btn-sm ${u.is_active ? 'btn-fail' : 'btn-pass'}"
         onclick="adminToggleActive('${escHtml(u.id)}','${escHtml(u.username)}',${!u.is_active})">
         ${u.is_active ? 'Deactivate' : 'Activate'}
       </button>`;

  return `
    <tr>
      <td class="text-mono">${escHtml(u.username)}</td>
      <td><span class="badge ${roleClass}">${escHtml(u.role)}</span></td>
      <td>${escHtml(fmtDate(u.created_at))}</td>
      <td>${u.last_login ? escHtml(fmtDate(u.last_login)) : '<span class="text-muted">Never</span>'}</td>
      <td>${statusTag}</td>
      <td><div style="display:flex;gap:6px;align-items:center">${actions}</div></td>
    </tr>
  `;
}

// =============================================
// Add User Modal
// =============================================
function adminShowAddUser() {
  _closeAdminModal('admin-modal');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'admin-modal';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">Tambah Teknisi</div>
      <div class="form-group">
        <label for="am-user">Username</label>
        <input id="am-user" class="form-input" type="text" placeholder="min 3 karakter" autocomplete="off">
      </div>
      <div class="form-group">
        <label for="am-pass">Password</label>
        <input id="am-pass" class="form-input" type="password" placeholder="min 8 karakter">
      </div>
      <div class="form-group">
        <label for="am-pass2">Confirm Password</label>
        <input id="am-pass2" class="form-input" type="password" placeholder="ulangi password">
      </div>
      <div id="am-err" class="form-error" style="display:none"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="_closeAdminModal('admin-modal')">Batal</button>
        <button class="btn btn-primary" onclick="adminSubmitAddUser()">Tambah</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeAdminModal('admin-modal'); });
  setTimeout(() => document.getElementById('am-user')?.focus(), 50);
}

async function adminSubmitAddUser() {
  const username  = document.getElementById('am-user')?.value?.trim();
  const password  = document.getElementById('am-pass')?.value;
  const password2 = document.getElementById('am-pass2')?.value;
  const errEl     = document.getElementById('am-err');
  const showErr   = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!username || username.length < 3) { showErr('Username minimal 3 karakter'); return; }
  if (!password || password.length < 8)  { showErr('Password minimal 8 karakter'); return; }
  if (password !== password2)             { showErr('Konfirmasi password tidak sama'); return; }

  const btn = document.querySelector('#admin-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    await api.post('/users', { username, password });
    _closeAdminModal('admin-modal');
    await adminLoadUsers();
    _adminSuccess('Teknisi berhasil ditambahkan');
  } catch (err) {
    showErr(err.message || 'Gagal menambah teknisi');
    if (btn) { btn.disabled = false; btn.textContent = 'Tambah'; }
  }
}

// =============================================
// Edit User Modal
// =============================================
function adminShowEditUser({ id, username }) {
  _closeAdminModal('admin-modal');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'admin-modal';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">Edit Teknisi</div>
      <div class="form-group">
        <label for="am-user">Username</label>
        <input id="am-user" class="form-input" type="text" value="${escHtml(username)}" autocomplete="off">
      </div>
      <div class="form-group">
        <label for="am-pass">Password Baru
          <span style="color:var(--color-text-muted);font-weight:400">(kosong = tidak ganti)</span>
        </label>
        <input id="am-pass" class="form-input" type="password" placeholder="opsional, min 8 karakter">
      </div>
      <div id="am-err" class="form-error" style="display:none"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="_closeAdminModal('admin-modal')">Batal</button>
        <button class="btn btn-primary" onclick="adminSubmitEditUser('${escHtml(id)}')">Simpan</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeAdminModal('admin-modal'); });
  setTimeout(() => document.getElementById('am-user')?.focus(), 50);
}

async function adminSubmitEditUser(id) {
  const username = document.getElementById('am-user')?.value?.trim();
  const password = document.getElementById('am-pass')?.value;
  const errEl    = document.getElementById('am-err');
  const showErr  = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (!username || username.length < 3) { showErr('Username minimal 3 karakter'); return; }
  if (password && password.length < 8)  { showErr('Password minimal 8 karakter'); return; }

  const body = { username };
  if (password) body.password = password;

  const btn = document.querySelector('#admin-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    await api.patch(`/users/${id}`, body);
    _closeAdminModal('admin-modal');
    await adminLoadUsers();
    _adminSuccess('Data teknisi berhasil diupdate');
  } catch (err) {
    showErr(err.message || 'Gagal mengupdate teknisi');
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
  }
}

// =============================================
// Activate / Deactivate
// =============================================
function adminToggleActive(id, username, activate) {
  _closeAdminModal('admin-confirm-modal');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'admin-confirm-modal';
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:380px">
      <div class="modal-title">${activate ? 'Aktifkan' : 'Nonaktifkan'} Akun?</div>
      <div class="modal-message">
        ${activate
          ? `Aktifkan akun <strong>${escHtml(username)}</strong>? Teknisi akan bisa login kembali.`
          : `Nonaktifkan akun <strong>${escHtml(username)}</strong>? Teknisi tidak dapat login sampai diaktifkan kembali.`
        }
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="_closeAdminModal('admin-confirm-modal')">Batal</button>
        <button class="btn ${activate ? 'btn-pass' : 'btn-fail'}"
          onclick="adminConfirmToggle('${escHtml(id)}', ${activate})">
          ${activate ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeAdminModal('admin-confirm-modal'); });
}

async function adminConfirmToggle(id, activate) {
  _closeAdminModal('admin-confirm-modal');
  try {
    await api.patch(`/users/${id}`, { is_active: activate });
    await adminLoadUsers();
    _adminSuccess(activate ? 'Akun berhasil diaktifkan' : 'Akun berhasil dinonaktifkan');
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

// =============================================
// Statistics
// =============================================
async function adminLoadStats() {
  const el = document.getElementById('admin-stats-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-state">Loading stats...</div>';
  try {
    const stats = await api.get('/sessions/stats');
    adminRenderStats(stats);
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
  }
}

function adminRenderStats(stats) {
  const el = document.getElementById('admin-stats-content');
  if (!el) return;

  const byDevice = stats.by_device || [];

  el.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-card-val">${stats.total}</div>
        <div class="stat-card-lbl">Total Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${stats.completed}</div>
        <div class="stat-card-lbl">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${stats.guest}</div>
        <div class="stat-card-lbl">Guest Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${stats.authenticated}</div>
        <div class="stat-card-lbl">Authenticated</div>
      </div>
    </div>
    ${byDevice.length > 0 ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Total Sessions</th>
              <th>Avg Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            ${byDevice.map(d => `
              <tr>
                <td>${escHtml(DEVICE_LABELS_FE[d.device_type] || d.device_type)}</td>
                <td>${d.count}</td>
                <td>${d.avg_pass_rate !== null ? d.avg_pass_rate + '%' : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state" style="padding:16px 0">No session data yet</div>'}
  `;
}

// =============================================
// Helpers
// =============================================
function _closeAdminModal(id) {
  document.getElementById(id)?.remove();
}

function _adminSuccess(msg) {
  const el = document.getElementById('admin-success');
  if (!el) return;
  el.innerHTML = `<div class="form-success">${escHtml(msg)}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 3000);
}
