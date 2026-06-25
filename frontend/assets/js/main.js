// =============================================
// State
// =============================================
const state = {
  currentSession:     null,
  currentDevice:      null,
  authToken:          localStorage.getItem('zd_token')           || null,
  currentUser:        JSON.parse(localStorage.getItem('zd_user') || 'null'),
  detectedDevice:     null,
  grantedPermissions: {},
  sessionId:          null,
};

// =============================================
// Utils
// =============================================
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =============================================
// Router
// =============================================
function parseHash() {
  const raw = window.location.hash.slice(1) || 'home';
  const [page, qs = ''] = raw.split('?');
  const params = qs
    ? Object.fromEntries(
        qs.split('&')
          .filter(Boolean)
          .map(p => { const [k, v = ''] = p.split('='); return [decodeURIComponent(k), decodeURIComponent(v)]; })
      )
    : {};
  return { page: page || 'home', params };
}

function navigateTo(hash) {
  window.location.hash = '#' + hash;
}

function renderPage(page, params) {
  updateHeader();
  const app = document.getElementById('app');
  switch (page) {
    case 'home':          renderHome(app);                    break;
    case 'select-device': renderSelectDevice(app);            break;
    case 'check':         renderCheck(app, params);           break;
    case 'history':
      if (!requireLogin('Login required to view history')) return;
      renderHistory(app);
      break;
    case 'admin':
      if (!requireSuperAdmin()) return;
      renderAdmin(app);
      break;
    case 'login':         renderLogin(app);                   break;
    default:              renderHome(app);
  }
  markActiveNavLink(page);
}

function requireLogin(redirectMsg) {
  if (!state.authToken) {
    if (redirectMsg) sessionStorage.setItem('zd_redirect_msg', redirectMsg);
    navigateTo('login');
    return false;
  }
  return true;
}

function requireSuperAdmin() {
  if (!state.authToken) {
    navigateTo('login');
    return false;
  }
  if (state.currentUser?.role !== 'superadmin') {
    navigateTo('home');
    return false;
  }
  return true;
}

function markActiveNavLink(page) {
  document.querySelectorAll('.header-nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

window.addEventListener('hashchange', () => {
  const { page, params } = parseHash();
  renderPage(page, params);
});

window.addEventListener('DOMContentLoaded', () => {
  state.detectedDevice = detectDevice();

  window.addEventListener('zd:unauthorized', () => {
    state.authToken  = null;
    state.currentUser = null;
    navigateTo('login');
  });

  const { page, params } = parseHash();
  renderPage(page, params);
});

// =============================================
// Header
// =============================================
function updateHeader() {
  const right = document.getElementById('header-right');
  if (!right) return;
  if (state.currentUser) {
    const isSuperAdmin = state.currentUser.role === 'superadmin';
    right.innerHTML = `
      <nav class="header-nav">
        <span class="header-nav-link" data-page="history" onclick="navigateTo('history')">History</span>
        ${isSuperAdmin
          ? `<span class="header-nav-link" data-page="admin" onclick="navigateTo('admin')">Admin</span>`
          : ''}
      </nav>
      <span class="header-username">${escHtml(state.currentUser.username)}</span>
      <button class="btn btn-ghost btn-sm" onclick="handleLogout()">Logout</button>
    `;
  } else {
    right.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigateTo('login')">Login</button>
    `;
  }
}

function handleLogout() {
  state.authToken  = null;
  state.currentUser = null;
  localStorage.removeItem('zd_token');
  localStorage.removeItem('zd_user');
  navigateTo('home');
}

// =============================================
// Device Detection
// =============================================
function detectDevice() {
  const ua    = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  if (/iPhone|iPod/.test(ua))                       return 'iphone';
  if (/iPad/.test(ua))                              return 'ipad';
  if (/Macintosh/.test(ua) && touch)                return 'ipad';   // iPad with desktop UA
  if (/Android/.test(ua))                           return 'android';
  if (/Macintosh|Mac OS X/.test(ua))                return 'macbook';
  if (/Windows NT/.test(ua))                        return 'laptop_windows';
  if (/Linux/.test(ua) && !/Android/.test(ua))      return 'laptop_linux';
  return null;
}

// =============================================
// Home Page
// =============================================
const TYPING_LINES = [
  'Initializing diagnostic suite...',
  'Loading test modules...',
  'System ready.',
];

function renderHome(app) {
  app.innerHTML = `
    <div class="page">
      <div class="home-hero">
        <div class="home-title">ZANDEL DIAG</div>
        <div class="home-subtitle">Device Diagnostic Tool &mdash; Zandel Service</div>
        <div class="home-terminal" id="terminal-lines"></div>
        <div class="home-actions">
          <button class="btn btn-primary" onclick="navigateTo('select-device')">Mulai Diagnosa</button>
          ${state.currentUser
            ? `<button class="btn btn-ghost" onclick="navigateTo('history')">Lihat History</button>`
            : ''}
        </div>
      </div>
    </div>
  `;
  typeLines(document.getElementById('terminal-lines'));
}

async function typeLines(container) {
  if (!container) return;
  let aborted = false;
  const onAbort = () => { aborted = true; };

  document.addEventListener('click',      onAbort, { once: true });
  document.addEventListener('touchstart', onAbort, { once: true, passive: true });

  for (const text of TYPING_LINES) {
    if (!container.isConnected) break;

    const el = document.createElement('div');
    el.className = 'terminal-line typing';
    container.appendChild(el);

    if (aborted) {
      el.textContent = text;
    } else {
      for (const char of text) {
        if (aborted || !container.isConnected) { el.textContent = text; break; }
        el.textContent += char;
        await delay(28);
      }
      if (!aborted && container.isConnected) await delay(200);
    }

    el.classList.remove('typing');
  }

  document.removeEventListener('click',      onAbort);
  document.removeEventListener('touchstart', onAbort);

  // Persistent blinking cursor on last typed line
  if (container.isConnected) {
    const last = container.lastElementChild;
    if (last) last.classList.add('typed-done');
  }
}

// =============================================
// Select Device Page
// =============================================
const DEVICES = [
  { type: 'android',        name: 'Android',          desc: 'Android 8.0+' },
  { type: 'iphone',         name: 'iPhone',           desc: 'iOS 14+' },
  { type: 'ipad',           name: 'iPad',             desc: 'iPadOS 14+' },
  { type: 'laptop_windows', name: 'Laptop (Windows)', desc: 'Windows 10+' },
  { type: 'laptop_linux',   name: 'Laptop (Linux)',   desc: 'Ubuntu / Debian / Arch' },
  { type: 'macbook',        name: 'MacBook',          desc: 'macOS 11+' },
];

function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (/Edg\/(\d+)/.test(ua))                   browser = `Edge ${RegExp.$1}`;
  else if (/OPR\/(\d+)/.test(ua))              browser = `Opera ${RegExp.$1}`;
  else if (/Chrome\/(\d+)/.test(ua))           browser = `Chrome ${RegExp.$1}`;
  else if (/Firefox\/(\d+)/.test(ua))          browser = `Firefox ${RegExp.$1}`;
  else if (/Version\/[\d.]+ Safari/.test(ua))  browser = 'Safari';
  let os = 'OS';
  if (/Windows NT/.test(ua))       os = 'Windows';
  else if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua))        os = 'iPadOS';
  else if (/Android/.test(ua))     os = 'Android';
  else if (/Macintosh/.test(ua))   os = 'macOS';
  else if (/Linux/.test(ua))       os = 'Linux';
  return `${browser} / ${os}`;
}

function renderSelectDevice(app) {
  const cards = DEVICES.map(d => {
    const detected = d.type === state.detectedDevice;
    return `
      <div class="device-card${detected ? ' detected' : ''}" onclick="onDeviceSelect('${d.type}')">
        ${detected ? '<span class="device-badge-detected">Device ini</span>' : ''}
        <div class="device-card-name">${escHtml(d.name)}</div>
        <div class="device-card-desc">${escHtml(d.desc)}</div>
      </div>
    `;
  }).join('');

  const detectedLabel = DEVICES.find(d => d.type === state.detectedDevice)?.name || state.detectedDevice;
  const detectInfo = state.detectedDevice ? `
    <div class="device-detect-info">
      <div class="terminal-line">Auto-detected: <strong>${escHtml(detectedLabel)}</strong> &mdash; ${escHtml(getBrowserInfo())}</div>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Select Device</h1>
        <p>Pilih jenis perangkat yang akan didiagnosa</p>
      </div>
      <div class="device-grid">${cards}</div>
      ${detectInfo}
    </div>
  `;
}

function onDeviceSelect(deviceType) {
  state.currentDevice = deviceType;
  const same = !state.detectedDevice || deviceType === state.detectedDevice;
  if (same) {
    navigateTo('check');
  } else {
    showQRModal(deviceType);
  }
}

// =============================================
// QR Code Modal
// =============================================
function showQRModal(deviceType) {
  const device = DEVICES.find(d => d.type === deviceType);
  const url    = `https://apotekz.my.id/#check?device=${deviceType}`;

  closeQRModal(); // safety: remove any existing modal

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'qr-modal';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">Open on Target Device</div>
      <div class="modal-message">
        Scan QR code ini di perangkat <strong>${escHtml(device.name)}</strong>
        untuk menjalankan diagnostik langsung di device tersebut.
      </div>
      <div class="modal-qr" id="qr-container"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeQRModal()">Tutup</button>
        <button class="btn btn-primary" onclick="closeQRModal(); navigateTo('check')">Lanjut di sini saja</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const qrEl = document.getElementById('qr-container');
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(qrEl, {
        text:       url,
        width:      180,
        height:     180,
        colorDark:  '#1A1A1A',
        colorLight: '#FFFFFF',
      });
    } catch {
      qrEl.innerHTML = qrFallback(url);
    }
  } else {
    qrEl.innerHTML = qrFallback(url);
  }
}

function qrFallback(url) {
  return `<div style="padding:12px;font-size:11px;color:#7A7A7A;text-align:center;word-break:break-all;">
    QR code tidak tersedia.<br><br>${escHtml(url)}
  </div>`;
}

function closeQRModal() {
  const m = document.getElementById('qr-modal');
  if (m) m.remove();
}

// =============================================
// Check Page → permission flow → diagnostic
// =============================================
function renderCheck(app, params) {
  if (params && params.device && DEVICES.some(d => d.type === params.device)) {
    state.currentDevice = params.device;
  }
  if (!state.currentDevice) { navigateTo('select-device'); return; }
  state.grantedPermissions = {};
  renderPermissionFlow(app);   // defined in permissions.js
}

// =============================================
// Login Page
// =============================================
function renderLogin(app) {
  const notice = sessionStorage.getItem('zd_redirect_msg');
  if (notice) sessionStorage.removeItem('zd_redirect_msg');

  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Login</h1>
        <p>Masuk sebagai teknisi atau superadmin</p>
      </div>
      ${notice ? `<div class="login-notice">${escHtml(notice)}</div>` : ''}
      <div class="login-form">
        <div class="form-group">
          <label for="l-user">Username</label>
          <input id="l-user" class="form-input" type="text" placeholder="username" autocomplete="username">
        </div>
        <div class="form-group">
          <label for="l-pass">Password</label>
          <input id="l-pass" class="form-input" type="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <div id="l-err" class="form-error" style="display:none"></div>
        <button id="l-btn" class="btn btn-primary" onclick="handleLogin()">Login</button>
      </div>
    </div>
  `;
  const u = document.getElementById('l-user');
  const p = document.getElementById('l-pass');
  if (u) u.focus();
  if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const username = document.getElementById('l-user')?.value?.trim();
  const password = document.getElementById('l-pass')?.value;
  const errEl    = document.getElementById('l-err');
  const btn      = document.getElementById('l-btn');

  if (!username || !password) {
    if (errEl) { errEl.textContent = 'Username dan password wajib diisi'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    const data = await api.post('/auth/login', { username, password });
    state.authToken  = data.token;
    state.currentUser = data.user;
    localStorage.setItem('zd_token', data.token);
    localStorage.setItem('zd_user', JSON.stringify(data.user));
    updateHeader();
    navigateTo('home');
  } catch (err) {
    const isCredErr = /salah|invalid|credentials|401/i.test(err.message);
    const msg = isCredErr ? 'Invalid credentials' : 'Connection error — backend offline';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (btn)   { btn.disabled = false; btn.textContent = 'Login'; }
  }
}
