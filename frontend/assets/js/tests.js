// =============================================
// Manual test helper
// =============================================
function makeManual(label, group, instr) {
  return {
    label, group,
    run: async (ctx) => {
      ctx.log('Manual inspection required.');
      ctx.setUI(`<div class="test-instructions">${instr}</div>`);
      return ctx.waitForJudgment();
    },
  };
}

// =============================================
// Auto test helpers
// =============================================
function skipIfNoApi(check, fn) {
  return async (ctx) => {
    if (!check()) return { status: 'skip', detail: 'API not supported on this browser/device' };
    return fn(ctx);
  };
}

// =============================================
// TEST LIBRARY
// =============================================
const TEST_LIB = {

  // ── Display ─────────────────────────────────

  'display.dead_pixel': {
    label: 'Display — Dead Pixel Check', group: 'Display',
    run(ctx) {
      const colors = [
        { bg: '#FFFFFF', txt: '#888', name: 'White' },
        { bg: '#000000', txt: '#888', name: 'Black' },
        { bg: '#FF0000', txt: '#fff', name: 'Red' },
        { bg: '#00CC00', txt: '#fff', name: 'Green' },
        { bg: '#0000FF', txt: '#fff', name: 'Blue' },
        { bg: '#00FFFF', txt: '#000', name: 'Cyan' },
        { bg: '#FF00FF', txt: '#fff', name: 'Magenta' },
      ];
      let i = 0;

      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'dp-overlay';
        overlay.style.backgroundColor = colors[0].bg;
        overlay.innerHTML = `<div class="dp-hint">${colors[0].name} (1/${colors.length}) — Ketuk/klik untuk ganti warna</div>`;
        document.body.appendChild(overlay);

        const advance = () => {
          i++;
          if (i < colors.length) {
            overlay.style.backgroundColor = colors[i].bg;
            overlay.querySelector('.dp-hint').textContent =
              `${colors[i].name} (${i+1}/${colors.length}) — Ketuk/klik untuk ganti warna`;
          } else {
            // Show judgment buttons
            overlay.removeEventListener('click', advance);
            overlay.innerHTML = '';
            const btns = document.createElement('div');
            btns.className = 'dp-btns';
            btns.innerHTML = `
              <button class="btn btn-pass" onclick="event.stopPropagation()">PASS — Tidak ada dead pixel</button>
              <button class="btn btn-fail" onclick="event.stopPropagation()">FAIL — Ada dead pixel</button>
            `;
            document.body.appendChild(btns);
            btns.querySelectorAll('button')[0].onclick = (e) => {
              e.stopPropagation(); overlay.remove(); btns.remove();
              resolve({ status: 'pass', detail: 'No dead pixels detected' });
            };
            btns.querySelectorAll('button')[1].onclick = (e) => {
              e.stopPropagation(); overlay.remove(); btns.remove();
              resolve({ status: 'fail', detail: 'Dead pixels reported by technician' });
            };
          }
        };
        overlay.addEventListener('click', advance);
      });
    },
  },

  'display.touch': {
    label: 'Display — Touch Responsiveness', group: 'Display',
    run(ctx) {
      if (!navigator.maxTouchPoints) {
        return { status: 'skip', detail: 'No touch screen detected' };
      }
      ctx.log('Usap seluruh layar. PASS otomatis jika >80% area ter-cover dalam 30 detik.');
      ctx.setUI(`<canvas class="touch-cvs" id="tc-cvs"></canvas><div id="tc-pct" style="font-size:12px;color:var(--color-text-muted)">0% covered</div>`);

      return new Promise(resolve => {
        const cvs = document.getElementById('tc-cvs');
        if (!cvs) { resolve({ status: 'skip', detail: 'Canvas not available' }); return; }

        const COLS = 10, ROWS = 8;
        const hit  = new Set();
        const ctx2 = cvs.getContext('2d');
        const W    = cvs.offsetWidth, H = cvs.offsetHeight;
        cvs.width  = W; cvs.height = H;
        const cw   = W / COLS, ch = H / ROWS;

        ctx2.fillStyle = 'var(--color-bg-secondary)';
        ctx2.fillRect(0, 0, W, H);

        const mark = (x, y) => {
          const col = Math.floor(x / cw), row = Math.floor(y / ch);
          const key = `${col},${row}`;
          if (!hit.has(key)) {
            hit.add(key);
            ctx2.fillStyle = '#D4620A44';
            ctx2.fillRect(col * cw + 1, row * ch + 1, cw - 2, ch - 2);
          }
          const pct = Math.round(hit.size / (COLS * ROWS) * 100);
          const el  = document.getElementById('tc-pct');
          if (el) el.textContent = `${pct}% covered`;
          if (pct >= 80) { done('pass', `${pct}% area covered`); }
        };

        const onPointer = (e) => {
          e.preventDefault();
          const r = cvs.getBoundingClientRect();
          if (e.touches) {
            for (const t of e.touches) mark(t.clientX - r.left, t.clientY - r.top);
          } else {
            mark(e.clientX - r.left, e.clientY - r.top);
          }
        };

        cvs.addEventListener('pointermove', onPointer);
        cvs.addEventListener('touchmove',   onPointer, { passive: false });
        cvs.addEventListener('pointerdown', onPointer);

        let timer;
        const done = (status, detail) => {
          clearTimeout(timer);
          cvs.removeEventListener('pointermove', onPointer);
          cvs.removeEventListener('touchmove',   onPointer);
          cvs.removeEventListener('pointerdown', onPointer);
          resolve({ status, detail });
        };

        timer = setTimeout(() => {
          const pct = Math.round(hit.size / (COLS * ROWS) * 100);
          done(pct >= 50 ? 'pass' : 'fail', `${pct}% area covered after 30s`);
        }, 30000);
      });
    },
  },

  'display.multitouch': {
    label: 'Display — Multi-touch (≥5 points)', group: 'Display',
    run(ctx) {
      if (!navigator.maxTouchPoints) return { status: 'skip', detail: 'No touch screen' };
      ctx.log('Tekan 5 jari sekaligus ke layar.');
      ctx.setUI(`<div class="test-instructions">Letakkan minimal 5 jari secara bersamaan di layar. Deteksi terjadi otomatis.</div>
        <div id="mt-count" style="font-size:32px;font-weight:700;margin:16px 0;text-align:center">0 touches</div>`);

      return new Promise(resolve => {
        let best = 0;
        const onTouch = (e) => {
          const n = e.touches.length;
          const el = document.getElementById('mt-count');
          if (el) el.textContent = `${n} touch${n !== 1 ? 'es' : ''}`;
          if (n > best) best = n;
          if (best >= 5) {
            document.removeEventListener('touchstart', onTouch);
            document.removeEventListener('touchmove',  onTouch);
            resolve({ status: 'pass', detail: `${best} simultaneous touch points detected` });
          }
        };
        document.addEventListener('touchstart', onTouch, { passive: true });
        document.addEventListener('touchmove',  onTouch, { passive: true });
      });
    },
  },

  'display.ghost_touch': {
    label: 'Display — Ghost Touch Detection', group: 'Display',
    run(ctx) {
      if (!navigator.maxTouchPoints) return { status: 'skip', detail: 'No touch screen' };

      return new Promise(resolve => {
        let secs = 20, ghostDetected = false;
        ctx.log('Jangan sentuh layar selama 20 detik...');

        const onTouch = () => {
          ghostDetected = true;
          ctx.log('⚠ Touch event detected — ghost touch!');
        };
        document.addEventListener('touchstart', onTouch, { passive: true });

        const iv = setInterval(() => {
          secs--;
          ctx.log(`${secs}s remaining...`);
          if (secs <= 0) {
            clearInterval(iv);
            document.removeEventListener('touchstart', onTouch);
            if (ghostDetected) {
              resolve({ status: 'fail', detail: 'Unintended touch events detected' });
            } else {
              resolve({ status: 'pass', detail: 'No ghost touch detected in 20s' });
            }
          }
        }, 1000);
      });
    },
  },

  'display.refresh_rate': {
    label: 'Display — Refresh Rate', group: 'Display',
    run: async (ctx) => {
      ctx.log('Measuring refresh rate via requestAnimationFrame...');
      const frames = await new Promise(resolve => {
        const ts = [];
        const step = (t) => { ts.push(t); if (ts.length < 70) requestAnimationFrame(step); else resolve(ts); };
        requestAnimationFrame(step);
      });
      const diffs  = frames.slice(1).map((t, i) => t - frames[i]);
      const avgMs  = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const hz     = Math.round(1000 / avgMs);
      const status = hz >= 55 ? 'pass' : 'fail';
      ctx.log(`Measured: ~${hz} Hz`);
      return { status, detail: `Measured: ${hz}Hz (avg frame: ${avgMs.toFixed(1)}ms)` };
    },
  },

  'display.color': {
    label: 'Display — Color Accuracy', group: 'Display',
    run: async (ctx) => {
      ctx.log('Periksa akurasi warna pada setiap swatch berikut.');
      const swatches = [
        ['#FF0000','Red'], ['#00CC00','Green'], ['#0000FF','Blue'],
        ['#FFFF00','Yellow'], ['#00FFFF','Cyan'], ['#FF00FF','Magenta'],
        ['#FFFFFF','White'], ['#000000','Black'], ['#888888','Gray'],
      ];
      ctx.setUI(`
        <div class="test-instructions">Pastikan setiap warna tampak akurat, jenuh, dan tidak ada color shift.</div>
        <div class="color-swatch-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">
          ${swatches.map(([c, n]) => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="width:56px;height:56px;background:${c};border:1px solid var(--color-border);border-radius:4px"></div>
              <div style="font-size:10px;color:var(--color-text-muted)">${n}</div>
            </div>
          `).join('')}
        </div>
      `);
      return ctx.waitForJudgment();
    },
  },

  'display.backlight_bleed': {
    label: 'Display — Backlight Bleed', group: 'Display',
    run(ctx) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'dp-overlay';
        overlay.style.backgroundColor = '#000000';
        overlay.innerHTML = `<div class="dp-hint">Lihat layar di ruangan redup. Ketuk untuk melanjutkan.</div>`;
        document.body.appendChild(overlay);

        const close = (status, detail) => {
          overlay.remove(); btns.remove();
          resolve({ status, detail });
        };

        const btns = document.createElement('div');
        btns.className = 'dp-btns';
        btns.innerHTML = `
          <button class="btn btn-pass" onclick="event.stopPropagation()">PASS — Tidak ada bleed</button>
          <button class="btn btn-fail" onclick="event.stopPropagation()">FAIL — Ada backlight bleed</button>
        `;
        overlay.addEventListener('click', () => {
          document.body.appendChild(btns);
          overlay.removeEventListener('click', arguments.callee);
        }, { once: true });
        document.body.appendChild(btns);
        btns.querySelectorAll('button')[0].onclick = (e) => { e.stopPropagation(); close('pass', 'No bleed detected'); };
        btns.querySelectorAll('button')[1].onclick = (e) => { e.stopPropagation(); close('fail', 'Backlight bleed reported'); };
      });
    },
  },

  // ── Camera ──────────────────────────────────

  'camera.front': {
    label: 'Camera — Front (Selfie)', group: 'Camera',
    run: async (ctx) => {
      if (!ctx.perm('camera_front')) return { status: 'skip', detail: 'Camera permission denied' };
      ctx.log('Opening front camera...');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      } catch (err) {
        return { status: 'error', detail: `${err.name}: ${err.message}` };
      }
      ctx.log('Camera opened. Evaluate the preview quality.');
      ctx.setUI(`
        <div class="cam-wrap"><video id="cam-v" autoplay playsinline muted></video></div>
        <div class="test-instructions">Periksa: gambar jernih, autofocus bekerja, tidak ada distorsi.</div>
      `);
      const v = document.getElementById('cam-v');
      if (v) v.srcObject = stream;
      const result = await ctx.waitForJudgment({ cleanup: () => { stream.getTracks().forEach(t => t.stop()); if (v) v.srcObject = null; } });
      return { ...result, detail: result.status === 'pass' ? 'Front camera preview OK' : 'Front camera issue reported' };
    },
  },

  'camera.back': {
    label: 'Camera — Rear (Wide)', group: 'Camera',
    run: async (ctx) => {
      if (!ctx.perm('camera_back') && !ctx.perm('camera_front')) return { status: 'skip', detail: 'Camera permission denied' };
      ctx.log('Opening rear camera...');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } });
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch (e) {
          return { status: 'error', detail: e.name + ': ' + e.message };
        }
      }
      ctx.setUI(`
        <div class="cam-wrap"><video id="cam-v" autoplay playsinline muted></video></div>
        <div class="test-instructions">Periksa: gambar jernih, autofocus bekerja, tidak ada bercak/aberasi lensa.</div>
      `);
      const v = document.getElementById('cam-v');
      if (v) v.srcObject = stream;
      const result = await ctx.waitForJudgment({ cleanup: () => { stream.getTracks().forEach(t => t.stop()); if (v) v.srcObject = null; } });
      return { ...result, detail: result.status === 'pass' ? 'Rear camera OK' : 'Rear camera issue reported' };
    },
  },

  'camera.webcam': {
    label: 'Camera — Webcam', group: 'Camera',
    run: async (ctx) => {
      if (!ctx.perm('camera_front')) return { status: 'skip', detail: 'Camera permission denied' };
      ctx.log('Opening webcam...');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
      catch (err) { return { status: 'error', detail: `${err.name}: ${err.message}` }; }
      ctx.setUI(`
        <div class="cam-wrap"><video id="cam-v" autoplay playsinline muted></video></div>
        <div class="test-instructions">Periksa: gambar jernih, tidak ada dead pixel pada kamera.</div>
      `);
      const v = document.getElementById('cam-v');
      if (v) v.srcObject = stream;
      const result = await ctx.waitForJudgment({ cleanup: () => { stream.getTracks().forEach(t => t.stop()); if (v) v.srcObject = null; } });
      return { ...result, detail: result.status === 'pass' ? 'Webcam OK' : 'Webcam issue reported' };
    },
  },

  'camera.video': {
    label: 'Camera — Video Recording', group: 'Camera',
    run: async (ctx) => {
      if (!ctx.perm('camera_back') && !ctx.perm('camera_front')) return { status: 'skip', detail: 'Camera permission denied' };
      if (typeof MediaRecorder === 'undefined') return { status: 'skip', detail: 'MediaRecorder API not supported' };
      ctx.log('Opening camera for video recording test...');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
      catch (err) { return { status: 'error', detail: `${err.name}: ${err.message}` }; }

      ctx.setUI(`
        <div class="cam-wrap"><video id="cam-v" autoplay playsinline muted></video></div>
        <div class="test-instructions" id="cam-instr">Rekaman 5 detik akan dimulai...</div>
      `);
      const liveV = document.getElementById('cam-v');
      if (liveV) liveV.srcObject = stream;

      await delay(1500);
      ctx.log('Recording 5 seconds...');
      const instrEl = document.getElementById('cam-instr');
      if (instrEl) instrEl.textContent = 'Merekam 5 detik... Gerakkan kamera sedikit.';

      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mr.start(200);
      await delay(5000);
      mr.stop();
      stream.getTracks().forEach(t => t.stop());
      await delay(300);

      const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
      const url  = URL.createObjectURL(blob);
      ctx.log('Playback recording...');
      ctx.setUI(`
        <video src="${url}" controls style="width:100%;max-width:480px;border-radius:4px" autoplay></video>
        <div class="test-instructions" style="margin-top:8px">Periksa kualitas video dan audio dari hasil rekaman.</div>
      `);
      const result = await ctx.waitForJudgment({ cleanup: () => URL.revokeObjectURL(url) });
      return { ...result, detail: result.status === 'pass' ? 'Video recording and playback OK' : 'Video recording issue reported' };
    },
  },

  // ── Audio ────────────────────────────────────

  'audio.speaker': {
    label: 'Audio — Speaker Test', group: 'Audio',
    run: async (ctx) => {
      if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
        return { status: 'skip', detail: 'Web Audio API not supported' };
      }
      ctx.log('Web Audio API ready. Tekan tombol untuk memutar nada uji.');
      const tones = [
        { label: 'L Channel 440Hz',  freq: 440,  dur: 0.6, pan: -1 },
        { label: 'R Channel 440Hz',  freq: 440,  dur: 0.6, pan:  1 },
        { label: 'Stereo 440Hz',     freq: 440,  dur: 0.8, pan:  0 },
        { label: 'High 2000Hz',      freq: 2000, dur: 0.4, pan:  0 },
        { label: 'Low 120Hz',        freq: 120,  dur: 0.6, pan:  0 },
      ];

      const playTone = (freq, dur, pan) => {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        if (panner) {
          panner.pan.value = pan;
          osc.connect(panner).connect(gain).connect(ac.destination);
        } else {
          osc.connect(gain).connect(ac.destination);
        }
        osc.start(); osc.stop(ac.currentTime + dur);
        setTimeout(() => ac.close(), (dur + 0.5) * 1000);
      };

      const playAll = () => {
        let d = 0;
        for (const t of tones) {
          setTimeout(() => playTone(t.freq, t.dur, t.pan), d * 1000);
          d += t.dur + 0.2;
        }
      };

      ctx.setUI(`
        <div class="test-instructions">Dengarkan setiap nada. Pastikan speaker kiri/kanan berfungsi, suara jernih.</div>
        <div class="audio-btns">
          ${tones.map((t, i) => `<button class="btn btn-sm btn-ghost" onclick="_playT(${i})">${escHtml(t.label)}</button>`).join('')}
          <button class="btn btn-sm btn-primary" onclick="_playAll()">Putar Semua</button>
        </div>
      `);
      window._playT   = (i) => { const t = tones[i]; playTone(t.freq, t.dur, t.pan); };
      window._playAll = () => playAll();
      return ctx.waitForJudgment();
    },
  },

  'audio.mic': {
    label: 'Audio — Microphone', group: 'Audio',
    run: async (ctx) => {
      if (!ctx.perm('mic')) return { status: 'skip', detail: 'Microphone permission denied' };
      ctx.log('Opening microphone...');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (err) { return { status: 'error', detail: `${err.name}: ${err.message}` }; }

      const AC  = window.AudioContext || window.webkitAudioContext;
      const ac  = new AC();
      const src = ac.createMediaStreamSource(stream);
      const ana = ac.createAnalyser();
      ana.fftSize = 256;
      src.connect(ana);
      const buf = new Uint8Array(ana.frequencyBinCount);

      ctx.setUI(`
        <canvas id="wfm" width="480" height="80" style="width:100%;max-width:480px;height:80px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-secondary)"></canvas>
        <div id="mic-lvl" style="font-size:12px;color:var(--color-text-muted);margin:6px 0">Level: 0%</div>
        <div class="test-instructions">Bicara ke mikrofon. Pastikan waveform bergerak.</div>
      `);

      const cvs   = document.getElementById('wfm');
      const c2d   = cvs?.getContext('2d');
      let running = true;

      const draw = () => {
        if (!running || !c2d) return;
        ana.getByteTimeDomainData(buf);
        const W = cvs.width, H = cvs.height;
        c2d.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-secondary') || '#F5F5F0';
        c2d.fillRect(0, 0, W, H);
        c2d.strokeStyle = '#D4620A'; c2d.lineWidth = 2; c2d.beginPath();
        buf.forEach((v, i) => {
          const x = (i / buf.length) * W;
          const y = (v / 128.0) * (H / 2);
          i === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
        });
        c2d.stroke();
        const peak = Math.max(...buf) - 128;
        const lvl  = Math.round(Math.abs(peak) / 128 * 100);
        const lvlEl = document.getElementById('mic-lvl');
        if (lvlEl) lvlEl.textContent = `Level: ${lvl}%`;
        requestAnimationFrame(draw);
      };
      draw();

      const result = await ctx.waitForJudgment({
        cleanup: () => {
          running = false;
          stream.getTracks().forEach(t => t.stop());
          ac.close();
        },
      });
      return { ...result, detail: result.status === 'pass' ? 'Microphone working' : 'Microphone issue reported' };
    },
  },

  // ── Connectivity ─────────────────────────────

  'connectivity.wifi': {
    label: 'Connectivity — WiFi', group: 'Connectivity',
    run: async (ctx) => {
      const online = navigator.onLine;
      ctx.log(`navigator.onLine: ${online}`);
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      let detail = online ? 'Online' : 'Offline';
      if (conn) {
        detail += ` | type: ${conn.type || 'unknown'} | effectiveType: ${conn.effectiveType || 'unknown'}`;
        if (conn.downlink) detail += ` | downlink: ~${conn.downlink}Mbps`;
        ctx.log(`Connection type: ${conn.effectiveType || conn.type || 'unknown'}`);
      }
      return { status: online ? 'pass' : 'fail', detail };
    },
  },

  'connectivity.gps': {
    label: 'Connectivity — GPS', group: 'Connectivity',
    run: async (ctx) => {
      if (!ctx.perm('gps')) return { status: 'skip', detail: 'Location permission denied' };
      if (!navigator.geolocation) return { status: 'skip', detail: 'Geolocation API not supported' };
      ctx.log('Requesting GPS position (timeout 10s)...');
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: true })
        );
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        ctx.log(`Position: ${lat.toFixed(5)}, ${lng.toFixed(5)} ±${Math.round(accuracy)}m`);
        return { status: 'pass', detail: `Lat: ${lat.toFixed(5)} Lng: ${lng.toFixed(5)} Accuracy: ±${Math.round(accuracy)}m` };
      } catch (err) {
        return { status: err.code === 1 ? 'skip' : 'fail', detail: `${err.message} (code ${err.code})` };
      }
    },
  },

  // ── Sensors ──────────────────────────────────

  'sensor.accelerometer': {
    label: 'Sensor — Accelerometer', group: 'Sensors',
    run: async (ctx) => {
      if (typeof DeviceMotionEvent === 'undefined') return { status: 'skip', detail: 'DeviceMotionEvent not supported' };
      ctx.log('Reading accelerometer for 3 seconds... Move the device.');
      ctx.setUI(`<div id="acc-vals" style="font-size:12px;color:var(--color-text-muted)">X: — Y: — Z: —</div>`);

      const samples = [];
      const onMotion = (e) => {
        const a = e.acceleration || e.accelerationIncludingGravity;
        if (!a) return;
        samples.push({ x: a.x, y: a.y, z: a.z });
        const el = document.getElementById('acc-vals');
        if (el) el.textContent = `X: ${(a.x||0).toFixed(2)}  Y: ${(a.y||0).toFixed(2)}  Z: ${(a.z||0).toFixed(2)}`;
      };
      window.addEventListener('devicemotion', onMotion);
      await delay(3000);
      window.removeEventListener('devicemotion', onMotion);

      if (samples.length === 0) return { status: 'skip', detail: 'No accelerometer data received' };
      const xs = samples.map(s => s.x || 0);
      const delta = Math.max(...xs) - Math.min(...xs);
      const status = delta > 0.5 ? 'pass' : 'skip';
      return { status, detail: `${samples.length} samples, delta X: ${delta.toFixed(2)}` };
    },
  },

  'sensor.gyroscope': {
    label: 'Sensor — Gyroscope', group: 'Sensors',
    run: async (ctx) => {
      if (typeof DeviceOrientationEvent === 'undefined') return { status: 'skip', detail: 'DeviceOrientationEvent not supported' };
      ctx.log('Reading gyroscope for 3 seconds... Tilt the device.');
      ctx.setUI(`<div id="gyro-vals" style="font-size:12px;color:var(--color-text-muted)">α: — β: — γ: —</div>`);

      const samples = [];
      const onOri = (e) => {
        if (e.alpha === null) return;
        samples.push({ a: e.alpha, b: e.beta, g: e.gamma });
        const el = document.getElementById('gyro-vals');
        if (el) el.textContent = `α: ${e.alpha?.toFixed(1)}°  β: ${e.beta?.toFixed(1)}°  γ: ${e.gamma?.toFixed(1)}°`;
      };
      window.addEventListener('deviceorientation', onOri);
      await delay(3000);
      window.removeEventListener('deviceorientation', onOri);

      if (samples.length === 0) return { status: 'skip', detail: 'No orientation data received' };
      const betas = samples.map(s => s.b);
      const delta = Math.max(...betas) - Math.min(...betas);
      return { status: delta > 1 ? 'pass' : 'skip', detail: `${samples.length} samples, delta β: ${delta.toFixed(2)}°` };
    },
  },

  'sensor.compass': {
    label: 'Sensor — Compass', group: 'Sensors',
    run: async (ctx) => {
      if (typeof DeviceOrientationEvent === 'undefined') return { status: 'skip', detail: 'Not supported' };
      ctx.log('Reading compass (alpha) for 2 seconds...');
      const samples = [];
      const onOri = (e) => { if (e.alpha !== null) samples.push(e.alpha); };
      window.addEventListener('deviceorientation', onOri);
      await delay(2000);
      window.removeEventListener('deviceorientation', onOri);
      if (samples.length === 0) return { status: 'skip', detail: 'No compass data received' };
      const heading = samples[samples.length - 1].toFixed(1);
      ctx.log(`Heading: ${heading}°`);
      return { status: 'pass', detail: `Compass heading: ${heading}°` };
    },
  },

  // ── Battery ──────────────────────────────────

  'battery.status': {
    label: 'Battery — Charge Status', group: 'Battery',
    run: skipIfNoApi(() => 'getBattery' in navigator, async (ctx) => {
      const b = await navigator.getBattery();
      const status = b.charging ? 'Charging' : 'Discharging';
      ctx.log(`Status: ${status}`);
      if (b.chargingTime && b.chargingTime !== Infinity) ctx.log(`Time to full: ${Math.round(b.chargingTime / 60)}min`);
      if (b.dischargingTime && b.dischargingTime !== Infinity) ctx.log(`Time to empty: ${Math.round(b.dischargingTime / 60)}min`);
      return { status: 'pass', detail: `${status} | Level: ${Math.round(b.level * 100)}%` };
    }),
  },

  'battery.level': {
    label: 'Battery — Level', group: 'Battery',
    run: skipIfNoApi(() => 'getBattery' in navigator, async (ctx) => {
      const b    = await navigator.getBattery();
      const lvl  = Math.round(b.level * 100);
      ctx.log(`Battery level: ${lvl}%`);
      ctx.setUI(`<div style="margin:8px 0">
        <div style="height:24px;background:var(--color-border);border-radius:4px;overflow:hidden;max-width:320px">
          <div style="height:100%;width:${lvl}%;background:${lvl < 20 ? 'var(--color-fail)' : 'var(--color-pass)'};transition:width 0.4s"></div>
        </div>
        <div style="font-size:20px;font-weight:700;margin-top:8px">${lvl}%</div>
      </div>`);
      return { status: 'pass', detail: `Battery: ${lvl}% (${b.charging ? 'charging' : 'discharging'})` };
    }),
  },

  // ── System ───────────────────────────────────

  'system.info': {
    label: 'System — Device Info', group: 'System',
    run: async (ctx) => {
      ctx.log('Collecting system information...');
      const conn   = navigator.connection || {};
      const rows   = [
        ['User Agent',      navigator.userAgent.slice(0, 80) + (navigator.userAgent.length > 80 ? '...' : '')],
        ['Screen',          `${screen.width} × ${screen.height} (DPR: ${window.devicePixelRatio})`],
        ['Viewport',        `${window.innerWidth} × ${window.innerHeight}`],
        ['CPU Cores',       navigator.hardwareConcurrency || 'unknown'],
        ['RAM (approx)',    navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'unknown'],
        ['Platform',        navigator.platform || 'unknown'],
        ['Language',        navigator.language],
        ['Connection',      conn.effectiveType || conn.type || 'unknown'],
        ['Touch Points',    navigator.maxTouchPoints],
        ['Cookies',         navigator.cookieEnabled ? 'enabled' : 'disabled'],
      ];
      ctx.setUI(`
        <table class="sys-table">
          <tbody>${rows.map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(String(v))}</td></tr>`).join('')}</tbody>
        </table>
      `);
      ctx.log('System info collected.');
      return { status: 'pass', detail: `${screen.width}×${screen.height} | ${navigator.hardwareConcurrency} cores | ${navigator.deviceMemory || '?'}GB RAM` };
    },
  },

  // ── Biometric ────────────────────────────────

  'biometric.fingerprint': {
    label: 'Biometric — Fingerprint (WebAuthn)', group: 'Biometric',
    run: async (ctx) => {
      if (!window.PublicKeyCredential) return { status: 'skip', detail: 'WebAuthn not supported' };
      const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      if (!avail) return { status: 'skip', detail: 'No platform authenticator available' };
      ctx.log('Platform authenticator available. Tap "Test Biometric" to authenticate.');
      ctx.setUI(`<button class="btn btn-primary" id="bio-btn" onclick="_triggerBio()">Test Biometric</button>`);

      return new Promise(resolve => {
        window._triggerBio = async () => {
          const btn = document.getElementById('bio-btn');
          if (btn) { btn.disabled = true; btn.textContent = 'Waiting...'; }
          try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            await navigator.credentials.create({
              publicKey: {
                challenge,
                rp:   { name: 'Zandel Diag' },
                user: { id: new Uint8Array([1]), name: 'test', displayName: 'Test' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
                timeout: 30000,
              },
            });
            resolve({ status: 'pass', detail: 'Biometric authentication succeeded' });
          } catch (err) {
            resolve({ status: err.name === 'NotAllowedError' ? 'fail' : 'error', detail: `${err.name}: ${err.message}` });
          }
        };
      });
    },
  },

  'biometric.faceid': {
    label: 'Biometric — Face ID (WebAuthn)', group: 'Biometric',
    run: async (ctx) => {
      if (!window.PublicKeyCredential) return { status: 'skip', detail: 'WebAuthn not supported' };
      const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      if (!avail) return { status: 'skip', detail: 'No platform authenticator (Face ID not available)' };
      ctx.log('Platform authenticator detected. Tap to trigger Face ID.');
      ctx.setUI(`<button class="btn btn-primary" id="bio-btn" onclick="_triggerBio()">Test Face ID</button>`);
      return new Promise(resolve => {
        window._triggerBio = async () => {
          try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            await navigator.credentials.create({
              publicKey: {
                challenge,
                rp:   { name: 'Zandel Diag' },
                user: { id: new Uint8Array([1]), name: 'test', displayName: 'Test' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
                timeout: 30000,
              },
            });
            resolve({ status: 'pass', detail: 'Face ID authentication succeeded' });
          } catch (err) {
            resolve({ status: err.name === 'NotAllowedError' ? 'fail' : 'error', detail: `${err.name}: ${err.message}` });
          }
        };
      });
    },
  },

  // ── Input ────────────────────────────────────

  'input.keyboard': {
    label: 'Input — Keyboard', group: 'Input',
    run: async (ctx) => {
      ctx.log('Tekan semua tombol keyboard. Tombol yang aktif akan berubah hijau.');

      const ROWS = [
        ['`','1','2','3','4','5','6','7','8','9','0','-','=','⌫'],
        ['Tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\'],
        ['Caps','A','S','D','F','G','H','J','K','L',';',"'",'Enter'],
        ['Shift','Z','X','C','V','B','N','M',',','.','/','Shift↑'],
        ['Ctrl','Win','Alt','Space','Alt','Fn','Ctrl'],
      ];
      const needed = new Set(['Q','W','E','R','T','Y','U','I','O','P','A','S','D','F','G','H','J','K','L','Z','X','C','V','B','N','M','1','2','3','4','5','6','7','8','9','0','ENTER','BACKSPACE','SPACE']);
      const hit = new Set();

      ctx.setUI(`
        <div class="key-rows" id="kboard">
          ${ROWS.map(row => `<div class="key-row">${row.map(k => `<div class="key-cap" id="kc-${k.replace(/[^A-Z0-9]/gi,'_')}">${escHtml(k)}</div>`).join('')}</div>`).join('')}
        </div>
        <div id="k-remain" style="font-size:11px;color:var(--color-text-muted)">Keys remaining: ${needed.size}</div>
      `);

      return new Promise(resolve => {
        const onKey = (e) => {
          const k = e.key.toUpperCase();
          const capEl = document.querySelector(`[id^="kc-"]`);

          // Try to find and highlight the key
          const safe = k.replace(/[^A-Z0-9]/g, '_');
          const el   = document.getElementById(`kc-${safe}`);
          if (el) el.classList.add('hit');

          if (needed.has(k)) { hit.add(k); }
          const rem = needed.size - hit.size;
          const remEl = document.getElementById('k-remain');
          if (remEl) remEl.textContent = `Keys remaining: ${rem}`;
          if (rem <= 0) {
            document.removeEventListener('keydown', onKey);
            resolve({ status: 'pass', detail: 'All main keys registered' });
          }
        };
        document.addEventListener('keydown', onKey);

        // Also offer manual buttons
        const actEl = document.getElementById('test-actions');
        if (actEl) {
          actEl.innerHTML = `
            <button class="btn btn-pass" onclick="document.removeEventListener('keydown', window._kbKey); _jr('pass')">PASS — Semua OK</button>
            <button class="btn btn-fail" onclick="document.removeEventListener('keydown', window._kbKey); _jr('fail')">FAIL — Ada tombol rusak</button>
            <button class="btn btn-skip-t" onclick="document.removeEventListener('keydown', window._kbKey); _jr('skip')">SKIP</button>
          `;
          window._kbKey = onKey;
          window._jr = (status) => { document.removeEventListener('keydown', onKey); resolve({ status, detail: null }); };
        }
      });
    },
  },

  'input.touchpad': {
    label: 'Input — Touchpad', group: 'Input',
    run: async (ctx) => {
      ctx.log('Lakukan semua aksi berikut pada touchpad:');
      const actions = ['Move', 'Left Click', 'Right Click', 'Double Click', 'Scroll Up', 'Scroll Down'];
      const done    = new Set();

      ctx.setUI(`
        <div class="test-instructions">Lakukan aksi berikut di area bawah:</div>
        <div id="tp-area" style="width:100%;max-width:480px;height:180px;border:2px dashed var(--color-border);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:default;margin:8px 0;background:var(--color-bg-secondary)">
          <span style="font-size:12px;color:var(--color-text-muted)">Touchpad test area</span>
        </div>
        <div id="tp-list" style="font-size:12px">
          ${actions.map(a => `<div id="tp-${a.replace(/ /g,'_')}" style="padding:2px 0;color:var(--color-text-muted)">[ ] ${a}</div>`).join('')}
        </div>
      `);

      return new Promise(resolve => {
        const area = document.getElementById('tp-area');
        if (!area) { resolve({ status: 'skip', detail: 'UI unavailable' }); return; }

        const mark = (action) => {
          if (done.has(action)) return;
          done.add(action);
          const el = document.getElementById(`tp-${action.replace(/ /g, '_')}`);
          if (el) { el.style.color = 'var(--color-pass)'; el.textContent = '[✓] ' + action; }
          if (done.size >= actions.length) { cleanup(); resolve({ status: 'pass', detail: 'All touchpad actions detected' }); }
        };

        let lastClick = 0;
        const onMove  = () => mark('Move');
        const onClick = (e) => {
          const now = Date.now();
          if (e.button === 2) { mark('Right Click'); return; }
          mark('Left Click');
          if (now - lastClick < 400) mark('Double Click');
          lastClick = now;
        };
        const onScroll = (e) => { e.deltaY < 0 ? mark('Scroll Up') : mark('Scroll Down'); };

        area.addEventListener('mousemove',   onMove);
        area.addEventListener('mousedown',   onClick);
        area.addEventListener('contextmenu', (e) => { e.preventDefault(); mark('Right Click'); });
        area.addEventListener('wheel',       onScroll, { passive: true });

        const cleanup = () => {
          area.removeEventListener('mousemove',   onMove);
          area.removeEventListener('mousedown',   onClick);
          area.removeEventListener('wheel',       onScroll);
        };

        const actEl = document.getElementById('test-actions');
        if (actEl) {
          actEl.innerHTML = `
            <button class="btn btn-pass" onclick="_jr('pass')">PASS — OK</button>
            <button class="btn btn-fail" onclick="_jr('fail')">FAIL — Ada masalah</button>
            <button class="btn btn-skip-t" onclick="_jr('skip')">SKIP</button>
          `;
          window._jr = (status) => { cleanup(); resolve({ status, detail: `${done.size}/${actions.length} actions detected` }); };
        }
      });
    },
  },

  // ── iPhone specific ──────────────────────────

  'iphone.model_check': {
    label: 'iPhone — Model Identifier', group: 'System',
    run: async (ctx) => {
      const ua = navigator.userAgent;
      ctx.log(`UA: ${ua.slice(0, 100)}`);
      const match = ua.match(/iPhone OS ([\d_]+)/i);
      const iosVer = match ? match[1].replace(/_/g, '.') : 'unknown';
      ctx.log(`iOS version: ${iosVer}`);
      ctx.setUI(`<table class="sys-table"><tbody>
        <tr><td>iOS Version</td><td>${escHtml(iosVer)}</td></tr>
        <tr><td>User Agent</td><td style="font-size:10px;word-break:break-all">${escHtml(ua)}</td></tr>
      </tbody></table>`);
      return { status: 'pass', detail: `iOS ${iosVer}` };
    },
  },

  // ── Manual tests ─────────────────────────────

  'manual.camera_flash':      makeManual('Camera — Flash/Torch',         'Camera',       'Buka aplikasi kamera bawaan. Aktifkan flash/senter. Pastikan flash menyala terang dan merata.'),
  'manual.camera_zoom':       makeManual('Camera — Zoom',                 'Camera',       'Di aplikasi kamera, coba zoom in dan out (pinch-to-zoom). Pastikan transisi wide/normal/telephoto halus.'),
  'manual.audio_earpiece':    makeManual('Audio — Earpiece',              'Audio',        'Coba telepon atau gunakan voice memo dan dengarkan dari earpiece (speaker atas). Pastikan suara jernih.'),
  'manual.audio_jack':        makeManual('Audio — 3.5mm Jack',            'Audio',        'Colokkan headphone ke jack 3.5mm. Putar musik. Pastikan audio berjalan di kedua channel kiri dan kanan.'),
  'manual.btn_power':         makeManual('Hardware — Power Button',       'Hardware',     'Tekan tombol power sekali (lock screen), lalu tekan lagi (unlock). Pastikan tombol responsif dan tidak macet.'),
  'manual.btn_volume':        makeManual('Hardware — Volume Buttons',     'Hardware',     'Tekan tombol volume up dan volume down. Pastikan keduanya responsif dan volume berubah sesuai.'),
  'manual.btn_silent':        makeManual('Hardware — Silent Switch',      'Hardware',     'Toggle switch silent/mute. Pastikan indikator di layar berubah dan device tidak mengeluarkan suara saat silent.'),
  'manual.sim':               makeManual('Connectivity — SIM Card',       'Connectivity', 'Buka Settings → About atau Cellular. Pastikan SIM 1 (dan SIM 2 jika dual-SIM) terdeteksi dengan nomor IMEI.'),
  'manual.bluetooth':         makeManual('Connectivity — Bluetooth',      'Connectivity', 'Buka Settings → Bluetooth. Aktifkan dan scan device terdekat. Pastikan scanning berjalan dan bisa pair.'),
  'manual.nfc':               makeManual('Connectivity — NFC',            'Connectivity', 'Buka Settings → NFC. Aktifkan NFC. Coba tap ke tag NFC atau device lain yang mendukung NFC.'),
  'manual.wireless_charge':   makeManual('Charging — Wireless',           'Charging',     'Letakkan device di atas wireless charger. Pastikan indikator charging muncul dalam 10 detik.'),
  'manual.usb_port':          makeManual('Charging — USB-C / Lightning',  'Charging',     'Colokkan kabel charger. Pastikan device mulai charging. Coba goyangkan kabel untuk cek kontak yang longgar.'),
  'manual.proximity':         makeManual('Sensor — Proximity',            'Sensors',      'Saat telepon aktif, dekatkan tangan ke sensor proximity (dekat earpiece). Layar harus mati secara otomatis.'),
  'manual.vibration':         makeManual('Hardware — Vibration Motor',    'Hardware',     'Aktifkan vibration dari Settings atau ketuk haptic feedback. Pastikan getaran terasa jelas dan stabil.'),
  'manual.battery_health':    makeManual('Battery — Health',              'Battery',      'Buka Settings → Battery → Battery Health. Catat persentase kapasitas. PASS jika ≥80%, FAIL jika di bawah 80%.'),
  'manual.truetone':          makeManual('Display — True Tone',           'Display',      'Buka Settings → Display & Brightness. Toggle True Tone on/off. Perhatikan perubahan white balance layar.'),
  'manual.display_brightness':makeManual('Display — Brightness Control',  'Display',      'Geser slider brightness di Quick Settings / Notification Center dari minimum ke maksimum. Pastikan responsif.'),
  'manual.taptic':            makeManual('Hardware — Taptic Engine',       'Hardware',     'Pergi ke Settings → Sounds & Haptics. Test Haptic. Pastikan getaran terasa presisi dan bukan buzz kasar.'),
  'manual.apple_pencil':      makeManual('Input — Apple Pencil',           'Input',        'Colokkan atau pair Apple Pencil. Buka Notes dan coba menulis. Pastikan tekanan dan tilt terdeteksi dengan baik.'),
  'manual.usb_ports':         makeManual('Hardware — USB Ports',          'Hardware',     'Colokkan USB device (flash drive atau mouse) ke setiap port USB yang ada. Pastikan semua port mendeteksi device.'),
  'manual.hdmi':              makeManual('Hardware — HDMI Port',          'Hardware',     'Colokkan kabel HDMI (atau adapter). Sambungkan ke monitor. Pastikan sinyal video terdeteksi di monitor.'),
  'manual.sdcard':            makeManual('Hardware — SD Card Slot',       'Hardware',     'Masukkan SD card ke slot. Buka File Explorer / Files. Pastikan SD card muncul dan bisa dibaca.'),
  'manual.keyboard_backlight':makeManual('Input — Keyboard Backlight',    'Input',        'Di ruangan redup, tekan tombol keyboard backlight (biasanya Fn + F5/F6). Pastikan backlight menyala dan bisa diatur.'),
  'manual.fan':               makeManual('Hardware — Fan & Cooling',      'Hardware',     'Jalankan task berat (buka banyak tab browser). Pastikan fan berputar (bisa dengar atau cek dengan tangan di ventilasi).'),
  'manual.hinge':             makeManual('Hardware — Hinge',              'Hardware',     'Buka dan tutup laptop beberapa kali. Pastikan engsel tidak longgar, berbunyi krek, atau terasa tidak rata.'),
  'manual.thunderbolt':       makeManual('Hardware — Thunderbolt/USB-C',  'Hardware',     'Colokkan device via Thunderbolt/USB-C (charger, monitor, atau hub). Pastikan koneksi stabil dan charging berjalan.'),
  'manual.magsafe':           makeManual('Charging — MagSafe',            'Charging',     'Sambungkan MagSafe charger. Pastikan magnet terkunci dengan baik dan indikator LED berubah dari oranye ke hijau saat penuh.'),
  'manual.touchbar':          makeManual('Input — Touch Bar',             'Input',        'Cek Touch Bar menyala dan menampilkan kontrol yang sesuai dengan app aktif. Coba tap dan geser di Touch Bar.'),
  'manual.force_touch':       makeManual('Input — Force Touch Trackpad',  'Input',        'Tekan trackpad dengan tekanan normal dan lebih keras. Pastikan Force Click (preview/pop) terasa berbeda dan berfungsi.'),
};

// =============================================
// Device test lists
// =============================================
const DEVICE_TESTS = {
  android: [
    'display.dead_pixel', 'display.touch', 'display.multitouch', 'display.ghost_touch',
    'display.refresh_rate', 'display.color',
    'camera.front', 'camera.back', 'camera.video',
    'audio.speaker', 'audio.mic',
    'connectivity.wifi', 'connectivity.gps',
    'sensor.accelerometer', 'sensor.gyroscope', 'sensor.compass',
    'battery.status', 'battery.level', 'system.info', 'biometric.fingerprint',
    'manual.camera_flash', 'manual.camera_zoom', 'manual.audio_earpiece',
    'manual.audio_jack', 'manual.btn_power', 'manual.btn_volume',
    'manual.sim', 'manual.bluetooth', 'manual.nfc',
    'manual.wireless_charge', 'manual.usb_port', 'manual.proximity',
    'manual.vibration', 'manual.battery_health',
  ],
  iphone: [
    'display.dead_pixel', 'display.touch', 'display.multitouch', 'display.ghost_touch',
    'display.refresh_rate', 'display.color',
    'camera.front', 'camera.back', 'camera.video',
    'audio.speaker', 'audio.mic',
    'connectivity.wifi', 'connectivity.gps',
    'sensor.accelerometer', 'sensor.gyroscope', 'sensor.compass',
    'battery.status', 'battery.level', 'system.info',
    'biometric.faceid', 'iphone.model_check',
    'manual.camera_flash', 'manual.camera_zoom', 'manual.audio_earpiece',
    'manual.btn_power', 'manual.btn_volume', 'manual.btn_silent',
    'manual.sim', 'manual.bluetooth', 'manual.truetone',
    'manual.usb_port', 'manual.wireless_charge',
    'manual.battery_health', 'manual.proximity', 'manual.taptic',
  ],
  ipad: [
    'display.dead_pixel', 'display.touch', 'display.multitouch', 'display.ghost_touch',
    'display.refresh_rate', 'display.color',
    'camera.front', 'camera.back', 'camera.video',
    'audio.speaker', 'audio.mic',
    'connectivity.wifi', 'connectivity.gps',
    'sensor.accelerometer', 'sensor.gyroscope', 'sensor.compass',
    'battery.status', 'battery.level', 'system.info',
    'biometric.faceid',
    'manual.camera_flash', 'manual.camera_zoom', 'manual.audio_jack',
    'manual.btn_power', 'manual.btn_volume', 'manual.bluetooth',
    'manual.truetone', 'manual.usb_port', 'manual.wireless_charge',
    'manual.battery_health', 'manual.taptic', 'manual.apple_pencil',
  ],
  laptop_windows: [
    'display.dead_pixel', 'display.refresh_rate', 'display.color', 'display.backlight_bleed',
    'camera.webcam', 'audio.speaker', 'audio.mic',
    'input.keyboard', 'input.touchpad',
    'connectivity.wifi',
    'battery.status', 'battery.level', 'system.info', 'biometric.fingerprint',
    'manual.display_brightness', 'manual.audio_jack', 'manual.bluetooth',
    'manual.usb_ports', 'manual.hdmi', 'manual.sdcard',
    'manual.battery_health', 'manual.keyboard_backlight', 'manual.fan', 'manual.hinge',
  ],
  laptop_linux: [
    'display.dead_pixel', 'display.refresh_rate', 'display.color', 'display.backlight_bleed',
    'camera.webcam', 'audio.speaker', 'audio.mic',
    'input.keyboard', 'input.touchpad',
    'connectivity.wifi',
    'battery.status', 'battery.level', 'system.info',
    'manual.display_brightness', 'manual.audio_jack', 'manual.bluetooth',
    'manual.usb_ports', 'manual.hdmi', 'manual.sdcard',
    'manual.battery_health', 'manual.keyboard_backlight', 'manual.fan', 'manual.hinge',
  ],
  macbook: [
    'display.dead_pixel', 'display.refresh_rate', 'display.color', 'display.backlight_bleed',
    'camera.webcam', 'audio.speaker', 'audio.mic',
    'input.keyboard', 'input.touchpad',
    'connectivity.wifi',
    'battery.status', 'battery.level', 'system.info', 'biometric.fingerprint',
    'manual.display_brightness', 'manual.truetone', 'manual.audio_jack',
    'manual.bluetooth', 'manual.thunderbolt', 'manual.magsafe',
    'manual.battery_health', 'manual.keyboard_backlight', 'manual.fan', 'manual.hinge',
    'manual.touchbar', 'manual.force_touch',
  ],
};

// =============================================
// Test resolver
// =============================================
function getTestsForDevice(deviceType) {
  const keys = DEVICE_TESTS[deviceType] || DEVICE_TESTS.laptop_windows;
  return keys
    .filter(k => TEST_LIB[k])
    .map(k => ({ key: k, ...TEST_LIB[k] }));
}
