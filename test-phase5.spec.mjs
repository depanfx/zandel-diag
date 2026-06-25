import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { chromium } = req('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');

const BASE = 'http://localhost:8080';

async function advanceTest(page) {
  // 1. dp-btns (dead pixel / backlight judgment buttons)
  const dpBtn = await page.$('.dp-btns .btn-pass, .dp-btns button:first-child');
  if (dpBtn) { await dpBtn.click().catch(() => {}); return 'dp-btn'; }

  // 2. dp-overlay (still cycling through colors — click to advance)
  const dpOverlay = await page.$('.dp-overlay');
  if (dpOverlay) { await dpOverlay.click().catch(() => {}); return 'dp-overlay'; }

  // 3. window._jr (waitForJudgment) — skip via global callback
  const hasJr = await page.evaluate(() => typeof window._jr === 'function');
  if (hasJr) { await page.evaluate(() => window._jr('skip')); return '_jr'; }

  // 4. standard test-actions buttons — click first one
  const actBtn = await page.$('#test-actions .btn');
  if (actBtn) { await actBtn.click().catch(() => {}); return 'action-btn'; }

  return null; // auto-running
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx  = await browser.newContext({
    permissions: ['geolocation', 'camera', 'microphone'],
    geolocation: { latitude: -6.2, longitude: 106.8 },
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  let passed = 0, failed = 0;
  const ok   = (n)    => { passed++; console.log(`  ✓ ${n}`); };
  const fail = (n, d) => { failed++; console.error(`  ✗ ${n}: ${d}`); };

  // ── 1. Home page ─────────────────────────────────────────────────
  console.log('\n[1] Home page');
  await page.goto(BASE + '/#home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const title = await page.textContent('.home-title');
  title === 'ZANDEL DIAG' ? ok('title present') : fail('title', title);
  const btn = await page.$('.btn-primary');
  btn ? ok('"Mulai Diagnosa" button present') : fail('start button', 'not found');

  // ── 2. Login page ─────────────────────────────────────────────────
  console.log('\n[2] Login page');
  await page.goto(BASE + '/#login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  (await page.textContent('h1')) === 'Login' ? ok('login h1') : fail('login h1', await page.textContent('h1'));
  (await page.$('#l-user') && await page.$('#l-pass')) ? ok('login form inputs') : fail('login inputs', 'missing');

  await page.fill('#l-user', 'admin');
  await page.fill('#l-pass', 'wrongpassword');
  await page.click('#l-btn');
  await page.waitForTimeout(2000);
  const errEl  = await page.$('#l-err');
  const errVis = errEl ? await errEl.isVisible() : false;
  errVis ? ok('login error shown on failed attempt') : fail('login error', 'not visible');

  // ── 3. Select Device page ─────────────────────────────────────────
  console.log('\n[3] Select Device page');
  await page.goto(BASE + '/#select-device', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const cards = await page.$$('.device-card');
  cards.length === 6 ? ok('6 device cards') : fail('device cards', `found ${cards.length}`);

  // ── 4. tests.js: getTestsForDevice ───────────────────────────────
  console.log('\n[4] tests.js — getTestsForDevice');
  const hasGetTests = await page.evaluate(() => typeof getTestsForDevice === 'function');
  hasGetTests ? ok('getTestsForDevice defined') : fail('getTestsForDevice', 'not a function');

  const laptopTests = await page.evaluate(() => {
    try { return getTestsForDevice('laptop_windows').map(t => t.key); }
    catch (e) { return ['ERR:' + e.message]; }
  });
  (Array.isArray(laptopTests) && laptopTests.length >= 14)
    ? ok(`laptop_windows: ${laptopTests.length} tests`)
    : fail('laptop tests', JSON.stringify(laptopTests?.slice(0,3)));

  const androidTests = await page.evaluate(() => {
    try { return getTestsForDevice('android').map(t => t.key); }
    catch (e) { return ['ERR:' + e.message]; }
  });
  (Array.isArray(androidTests) && androidTests.length >= 20)
    ? ok(`android: ${androidTests.length} tests`)
    : fail('android tests', JSON.stringify(androidTests?.slice(0,3)));

  // Spot-check known keys exist
  const keys = ['system.info', 'connectivity.wifi', 'display.refresh_rate', 'manual.fan'];
  const allHave = keys.every(k => laptopTests.includes(k));
  allHave ? ok('key tests present (system.info, wifi, refresh_rate, fan)') : fail('missing keys', keys.filter(k => !laptopTests.includes(k)).join(', '));

  // ── 5. Permission flow ────────────────────────────────────────────
  console.log('\n[5] Permission flow (laptop_windows)');
  await page.evaluate(() => { state.currentDevice = 'laptop_windows'; });
  await page.goto(BASE + '/#check', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const permItems = await page.$$('.perm-item');
  permItems.length >= 1 ? ok(`${permItems.length} permission items shown`) : fail('perm-items', 'none');

  const prEl  = await page.$('#perm-result');
  const prVis = prEl ? await prEl.isVisible() : false;
  prVis ? ok('perm-result visible') : fail('perm-result', 'not visible');

  const contBtn = await page.$('button[onclick="startDiagnostic()"]');
  contBtn ? ok('"Lanjut ke Diagnostik" button') : fail('continue btn', 'missing');

  // ── 6. Diagnostic layout ──────────────────────────────────────────
  console.log('\n[6] Diagnostic runner');
  if (contBtn) await contBtn.click();
  await page.waitForTimeout(1500);

  (await page.$('.diag-layout')) ? ok('diag-layout rendered') : fail('diag-layout', 'missing');
  (await page.$('.diag-sidebar')) ? ok('sidebar rendered') : fail('sidebar', 'missing');

  const siItems = await page.$$('.test-item');
  siItems.length >= 10 ? ok(`${siItems.length} sidebar items`) : fail('sidebar items', `only ${siItems.length}`);

  const heading = await page.textContent('#test-heading').catch(() => '');
  heading ? ok(`first test: "${heading.slice(0, 40)}"`) : fail('test-heading', 'empty');

  // ── 7. Drive through all tests ────────────────────────────────────
  console.log('\n[7] Driving through tests...');
  let autoPassSeen = false;
  for (let i = 0; i < 80; i++) {
    const diagDone = await page.evaluate(() => {
      const h = document.getElementById('test-heading');
      return h && h.textContent === 'Diagnostic Complete';
    });
    if (diagDone) break;

    // Detect auto-completed tests from terminal text
    const termText = await page.evaluate(() =>
      [...document.querySelectorAll('#test-terminal .terminal-line')].map(e => e.textContent).join('|')
    );
    if (!autoPassSeen && (
      termText.includes('System info collected') ||
      termText.includes('navigator.onLine') ||
      termText.includes('Measured:') ||
      termText.includes('Battery level') ||
      termText.includes('Heading:')
    )) {
      autoPassSeen = true;
      const curHeading = await page.textContent('#test-heading').catch(() => '');
      ok(`auto test ran: "${curHeading.slice(0, 40)}"`);
    }

    const action = await advanceTest(page);
    await page.waitForTimeout(action ? 300 : 500);
  }

  // ── 8. Summary page ───────────────────────────────────────────────
  console.log('\n[8] Summary');
  // finishSession() replaces #test-heading with class-only .test-heading
  const summHeading = await page.evaluate(() => {
    const h = document.querySelector('.test-heading');
    return h ? h.textContent : '';
  });
  summHeading === 'Diagnostic Complete'
    ? ok('Diagnostic Complete reached')
    : fail('summary screen', `heading = "${summHeading}"`);

  const summCells = await page.$$('.summary-cell');
  summCells.length === 4 ? ok('4 summary cells') : fail('summary cells', `found ${summCells.length}`);

  const resultRows = await page.$$('.result-row');
  resultRows.length > 0 ? ok(`${resultRows.length} result rows`) : fail('result rows', 'none');

  // Check counts
  const counts = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.summary-cell')];
    return cells.map(c => {
      const lbl = c.querySelector('.summary-lbl')?.textContent;
      const cnt = parseInt(c.querySelector('.summary-count')?.textContent || '0');
      return { lbl, cnt };
    });
  });
  console.log('  Summary:', counts.map(c => `${c.lbl}:${c.cnt}`).join(' '));
  const totalChecked = counts.reduce((a, b) => a + b.cnt, 0);
  totalChecked === siItems.length ? ok(`All ${totalChecked} tests accounted for`) : fail('test count', `${totalChecked} vs ${siItems.length}`);

  if (!autoPassSeen) fail('auto test run', 'no auto test detected in terminal');

  // ── 9. End session ────────────────────────────────────────────────
  console.log('\n[9] End session');
  const endBtn = await page.$('button[onclick="endSession()"]');
  if (endBtn) {
    await endBtn.click();
    await page.waitForTimeout(500);
    const url = page.url();
    url.includes('home') ? ok('endSession → #home') : fail('endSession nav', url);
  } else {
    ok('endSession: no button (requires backend session), skipping');
  }

  // ── 10. JS errors ─────────────────────────────────────────────────
  console.log('\n[10] JS error check');
  const relevant = errs.filter(e => !e.includes('net::ERR_CONNECTION_REFUSED'));
  relevant.length === 0 ? ok('No JS errors') : fail(`${relevant.length} JS error(s)`, relevant.slice(0, 2).join('; '));

  // ── Done ─────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
