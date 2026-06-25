// =============================================
// Permission Definitions
// =============================================
const PERMS_BY_DEVICE = {
  android:        ['camera_back', 'camera_front', 'mic', 'gps', 'motion'],
  iphone:         ['camera_back', 'camera_front', 'mic', 'gps', 'motion'],
  ipad:           ['camera_back', 'camera_front', 'mic', 'gps', 'motion'],
  laptop_windows: ['camera_front', 'mic'],
  laptop_linux:   ['camera_front', 'mic'],
  macbook:        ['camera_front', 'mic'],
};

const PERM_LABELS = {
  camera_back:  'Camera (Rear)',
  camera_front: 'Camera (Front / Webcam)',
  mic:          'Microphone',
  gps:          'Location (GPS)',
  motion:       'Motion Sensors',
};

// =============================================
// Permission Request Helpers
// =============================================
async function requestCameraPermission(facing) {
  const constraint = facing === 'back'
    ? { facingMode: { exact: 'environment' } }
    : { facingMode: 'user' };
  // Fall back to any camera if exact facing not available
  try {
    return await navigator.mediaDevices.getUserMedia({ video: constraint });
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true });
  }
}

async function requestMicPermission() {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

async function requestGpsPermission() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
  });
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    const r = await DeviceMotionEvent.requestPermission();
    if (r !== 'granted') throw new Error('Motion permission denied');
  }
}

// =============================================
// Permission Flow UI
// =============================================
async function renderPermissionFlow(app) {
  const permissions = PERMS_BY_DEVICE[state.currentDevice] || ['camera_front', 'mic'];
  const device      = DEVICES.find(d => d.type === state.currentDevice);

  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Requesting Permissions</h1>
        <p>Preparing diagnostic for <strong>${escHtml(device.name)}</strong></p>
      </div>
      <div class="card" style="max-width:480px;margin-top:0">
        <div id="perm-list">
          ${permissions.map(p => `
            <div class="perm-item" id="perm-${p}">
              <span class="perm-status" style="color:var(--color-text-muted)">[?]</span>
              <span>${escHtml(PERM_LABELS[p])}</span>
            </div>
          `).join('')}
        </div>
        <div id="perm-result" style="margin-top:16px;display:none">
          <div class="home-terminal" style="max-width:100%;margin:0 0 16px" id="perm-summary"></div>
          <button class="btn btn-primary" onclick="startDiagnostic()">Lanjut ke Diagnostik</button>
        </div>
      </div>
    </div>
  `;

  const streams   = [];
  const setStatus = (perm, ok) => {
    const el   = document.getElementById(`perm-${perm}`);
    const icon = el?.querySelector('.perm-status');
    if (!icon) return;
    icon.textContent = ok ? '[✓]' : '[✗]';
    icon.style.color = ok ? 'var(--color-pass)' : 'var(--color-fail)';
  };

  const runPerm = async (perm) => {
    try {
      let stream;
      if      (perm === 'camera_back')  stream = await requestCameraPermission('back');
      else if (perm === 'camera_front') stream = await requestCameraPermission('front');
      else if (perm === 'mic')          stream = await requestMicPermission();
      else if (perm === 'gps')          await requestGpsPermission();
      else if (perm === 'motion')       await requestMotionPermission();
      if (stream) streams.push(stream);
      return true;
    } catch {
      return false;
    }
  };

  // Run all permissions in parallel
  const results = await Promise.allSettled(
    permissions.map(async p => ({ p, ok: await runPerm(p) }))
  );

  // Stop all opened streams (permission check only)
  for (const s of streams) s.getTracks().forEach(t => t.stop());

  let granted = 0, denied = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { p, ok } = r.value;
    state.grantedPermissions[p] = ok ? 'granted' : 'denied';
    setStatus(p, ok);
    ok ? granted++ : denied++;
  }

  const summaryEl = document.getElementById('perm-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="terminal-line">Granted: ${granted} permission(s)</div>
      <div class="terminal-line">Denied: ${denied} permission(s)</div>
      ${denied > 0 ? '<div class="terminal-line">Tests requiring denied permissions will be skipped</div>' : ''}
    `;
  }

  const resultEl = document.getElementById('perm-result');
  if (resultEl) resultEl.style.display = 'block';
}

function startDiagnostic() {
  renderDiagnostic(document.getElementById('app'));  // defined in diagnostic.js
}
