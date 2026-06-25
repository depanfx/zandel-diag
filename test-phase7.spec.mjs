import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { chromium } = req('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');

const BASE = 'http://localhost:8080';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Fake media streams for camera/mic tests
    permissions: ['camera', 'microphone'],
  });
  const page    = await ctx.newPage();
  const jsErrs  = [];
  page.on('pageerror', e => jsErrs.push(e.message));

  let passed = 0, failed = 0;
  const ok   = n     => { passed++; console.log(`  ✓ ${n}`); };
  const fail = (n,d) => { failed++; console.error(`  ✗ ${n}: ${d}`); };

  async function setAuth(role = 'superadmin') {
    await ctx.addInitScript(`
      localStorage.setItem('zd_token', 'fake-jwt-${role}');
      localStorage.setItem('zd_user', JSON.stringify({ id: 'u1', username: 'admin', role: '${role}' }));
    `);
    await page.evaluate(r => {
      localStorage.setItem('zd_token', `fake-jwt-${r}`);
      localStorage.setItem('zd_user', JSON.stringify({ id: 'u1', username: 'admin', role: r }));
      state.authToken   = `fake-jwt-${r}`;
      state.currentUser = { id: 'u1', username: 'admin', role: r };
    }, role);
  }

  // ── 1. App loads + Phase 7 functions defined ─────────────────────────
  console.log('\n[1] App loads');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const hasFns = await page.evaluate(() =>
    typeof getBrowserInfo === 'function' &&
    typeof endSession     === 'function' &&
    typeof renderDiagnostic === 'function'
  );
  hasFns ? ok('Phase 7 functions (getBrowserInfo, endSession, renderDiagnostic) defined') : fail('Phase 7 functions', 'one or more missing');

  // ── 2. Home page typing animation + cursor ───────────────────────────
  console.log('\n[2] Home page terminal + cursor');
  await page.goto(BASE + '/#home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2800); // wait for typing animation to complete

  const terminalLines = await page.$$('.home-terminal .terminal-line');
  terminalLines.length >= 3 ? ok(`${terminalLines.length} terminal lines rendered`) : fail('terminal lines', `only ${terminalLines.length}`);

  const lastLineClass = await page.evaluate(() => {
    const lines = document.querySelectorAll('.home-terminal .terminal-line');
    return lines[lines.length - 1]?.className || '';
  });
  lastLineClass.includes('typed-done') ? ok('Last terminal line has typed-done cursor class') : fail('typed-done class', lastLineClass);

  // ── 3. Select Device page — auto-detect info ─────────────────────────
  console.log('\n[3] Select Device — auto-detect info');
  await page.goto(BASE + '/#select-device', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const detectInfo = await page.$('.device-detect-info');
  detectInfo ? ok('.device-detect-info shown') : fail('device-detect-info', 'not found');

  const detectText = await detectInfo?.textContent();
  detectText?.includes('Auto-detected') ? ok('Auto-detected text present') : fail('auto-detected text', detectText || 'null');
  detectText?.includes('/') ? ok('Browser / OS info shown') : fail('browser/OS info', detectText || 'null');

  // ── 4. End Session clears localStorage ───────────────────────────────
  console.log('\n[4] End Session clears localStorage');

  // Set up fake session data in localStorage
  await page.evaluate(() => {
    localStorage.setItem('zd_session_id', 'fake-session-uuid');
    localStorage.setItem('zd_device', 'android');
    localStorage.setItem('zd_session_results', '[]');
    state.sessionId      = 'fake-session-uuid';
    state.currentDevice  = 'android';
    state.grantedPermissions = { camera: 'granted' };
  });

  // Call endSession
  await page.evaluate(() => endSession());
  await page.waitForTimeout(400);

  const afterEnd = await page.evaluate(() => ({
    sessionId:  localStorage.getItem('zd_session_id'),
    device:     localStorage.getItem('zd_device'),
    results:    localStorage.getItem('zd_session_results'),
    stateSessionId: state.sessionId,
    stateDevice:    state.currentDevice,
    statePerms:     Object.keys(state.grantedPermissions).length,
    onHome: window.location.hash,
  }));

  !afterEnd.sessionId ? ok('zd_session_id cleared from localStorage') : fail('zd_session_id not cleared', afterEnd.sessionId);
  !afterEnd.device    ? ok('zd_device cleared from localStorage')     : fail('zd_device not cleared', afterEnd.device);
  !afterEnd.results   ? ok('zd_session_results cleared')               : fail('zd_session_results not cleared', afterEnd.results);
  !afterEnd.stateSessionId ? ok('state.sessionId cleared')             : fail('state.sessionId not cleared', afterEnd.stateSessionId);
  !afterEnd.stateDevice    ? ok('state.currentDevice cleared')         : fail('state.currentDevice not cleared', afterEnd.stateDevice);
  afterEnd.statePerms === 0 ? ok('state.grantedPermissions reset')     : fail('grantedPermissions not reset', afterEnd.statePerms);
  afterEnd.onHome.includes('home') ? ok('navigated to #home after endSession') : fail('navigation', afterEnd.onHome);

  // ── 5. New diagnostic clears old session from localStorage ───────────
  console.log('\n[5] New diagnostic auto-clears stale session');
  await page.evaluate(() => {
    localStorage.setItem('zd_session_id', 'stale-session-id');
    localStorage.setItem('zd_device', 'android');
    state.currentDevice = 'laptop_windows';
  });

  // Call renderDiagnostic — stale session should be cleared
  await page.evaluate(async () => {
    const app = document.getElementById('app');
    await renderDiagnostic(app);
  });
  await page.waitForTimeout(800);

  const afterNewDiag = await page.evaluate(() => ({
    staleId: localStorage.getItem('zd_session_id'),
    device:  localStorage.getItem('zd_device'),
  }));
  // The old stale-session-id should be gone (even if no new session started due to offline backend)
  afterNewDiag.staleId !== 'stale-session-id'
    ? ok('Stale session cleared before new diagnostic')
    : fail('stale session not cleared', afterNewDiag.staleId);

  // ── 6. renderCheck resets grantedPermissions ─────────────────────────
  console.log('\n[6] renderCheck resets grantedPermissions');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    state.currentDevice = 'android';
    state.grantedPermissions = { camera: 'granted', microphone: 'denied' };
  });
  await page.goto(BASE + '/#check', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const permCount = await page.evaluate(() => Object.keys(state.grantedPermissions).length);
  permCount === 0 ? ok('grantedPermissions reset on renderCheck') : fail('grantedPermissions not reset', permCount);

  // ── 7. Diagnostic sidebar running item has accent bg ─────────────────
  console.log('\n[7] Sidebar running item styling');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // Check CSS class exists and is styled correctly
  const runningStyle = await page.evaluate(() => {
    const div = document.createElement('div');
    div.className = 'test-item is-running';
    document.body.appendChild(div);
    const style = getComputedStyle(div);
    const bg = style.backgroundColor;
    div.remove();
    return bg;
  });
  runningStyle !== 'rgba(0, 0, 0, 0)' && runningStyle !== ''
    ? ok(`.test-item.is-running has background (${runningStyle})`)
    : fail('is-running background', `none/transparent: ${runningStyle}`);

  // ── 8. Admin stat card border-left ───────────────────────────────────
  console.log('\n[8] Stat card accent border');
  const statCardStyle = await page.evaluate(() => {
    const div = document.createElement('div');
    div.className = 'stat-card';
    document.body.appendChild(div);
    const s = getComputedStyle(div);
    const bl = s.borderLeftWidth;
    div.remove();
    return bl;
  });
  parseFloat(statCardStyle) >= 4
    ? ok(`stat-card border-left: ${statCardStyle}`)
    : fail('stat-card border-left', statCardStyle);

  // ── 9. Responsive header at 375px ────────────────────────────────────
  console.log('\n[9] Responsive 375px header');
  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const mPage  = await mobile.newPage();
  mPage.on('pageerror', e => jsErrs.push(e.message));

  await mPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mPage.evaluate(r => {
    localStorage.setItem('zd_token', `fake-jwt-${r}`);
    localStorage.setItem('zd_user', JSON.stringify({ id: 'u1', username: 'admin', role: r }));
    state.authToken   = `fake-jwt-${r}`;
    state.currentUser = { id: 'u1', username: 'admin', role: r };
    updateHeader();
  }, 'superadmin');
  await mPage.waitForTimeout(500);

  const headerBox = await mPage.locator('.site-header').boundingBox();
  const appBox    = await mPage.locator('#app').boundingBox();
  // Header should not overflow the viewport
  headerBox && headerBox.width <= 375
    ? ok(`Header fits at 375px (width: ${Math.round(headerBox.width)}px)`)
    : fail('header overflow at 375px', `width=${headerBox?.width}`);

  // Content should be visible
  const homeTitle = await mPage.$('.home-title');
  homeTitle ? ok('.home-title visible at 375px') : fail('home-title not found at 375px', 'missing');

  await mobile.close();

  // ── 10. Favicon in index.html ─────────────────────────────────────────
  console.log('\n[10] Favicon + meta');
  const headContent = await page.evaluate(() => document.head.innerHTML);

  headContent.includes('rel="icon"') ? ok('favicon link tag present') : fail('favicon', 'no <link rel="icon">');
  headContent.includes('D4620A')     ? ok('favicon uses accent color #D4620A') : fail('favicon color', 'not found');
  headContent.includes('description') ? ok('meta description present') : fail('meta description', 'missing');

  const title = await page.title();
  title.includes('Zandel Diag') ? ok(`Page title: "${title}"`) : fail('page title', title);

  // ── 11. JS error check ────────────────────────────────────────────────
  console.log('\n[11] JS error check');
  const relevant = jsErrs.filter(e =>
    !e.includes('net::ERR_CONNECTION_REFUSED') &&
    !e.includes('Failed to fetch') &&
    !e.includes('ERR_FAILED')
  );
  relevant.length === 0 ? ok('No JS errors') : fail(`${relevant.length} JS error(s)`, relevant.slice(0, 3).join('; '));

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
