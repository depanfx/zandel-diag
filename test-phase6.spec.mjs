import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { chromium } = req('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');

const BASE = 'http://localhost:8080';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();
  const page    = await ctx.newPage();
  const jsErrs  = [];
  page.on('pageerror', e => jsErrs.push(e.message));

  let passed = 0, failed = 0;
  const ok   = n     => { passed++; console.log(`  ✓ ${n}`); };
  const fail = (n,d) => { failed++; console.error(`  ✗ ${n}: ${d}`); };

  // helper: simulate logged-in state via localStorage
  async function setAuth(role = 'superadmin') {
    await ctx.addInitScript(`
      localStorage.setItem('zd_token', 'fake-jwt-token-${role}');
      localStorage.setItem('zd_user', JSON.stringify({ id: 'u1', username: 'admin', role: '${role}' }));
    `);
    // Also apply to current page
    await page.evaluate(r => {
      localStorage.setItem('zd_token', `fake-jwt-${r}`);
      localStorage.setItem('zd_user', JSON.stringify({ id: 'u1', username: 'admin', role: r }));
      state.authToken   = `fake-jwt-${r}`;
      state.currentUser = { id: 'u1', username: 'admin', role: r };
    }, role);
  }

  async function clearAuth() {
    await page.evaluate(() => {
      localStorage.removeItem('zd_token');
      localStorage.removeItem('zd_user');
      state.authToken   = null;
      state.currentUser = null;
    });
  }

  // ── 1. Load app ───────────────────────────────────────────────────
  console.log('\n[1] App loads + new JS files loaded');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const hasFns = await page.evaluate(() =>
    typeof renderHistory === 'function' &&
    typeof renderAdmin   === 'function' &&
    typeof fmtDate       === 'function' &&
    typeof requireLogin  === 'function' &&
    typeof requireSuperAdmin === 'function'
  );
  hasFns ? ok('All Phase 6 functions defined') : fail('Phase 6 functions', 'one or more missing');

  // ── 2. Auth guards — not logged in ────────────────────────────────
  console.log('\n[2] Auth guards (not logged in)');
  await clearAuth();

  await page.goto(BASE + '/#history', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const histUrl = page.url();
  histUrl.includes('login') ? ok('#history → redirects to #login') : fail('#history guard', histUrl);

  const notice = await page.$('.login-notice');
  notice ? ok('Login notice shown') : fail('login notice', 'not found');

  await page.goto(BASE + '/#admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const adminUrl = page.url();
  adminUrl.includes('login') ? ok('#admin → redirects to #login (not logged in)') : fail('#admin guard (no auth)', adminUrl);

  // ── 3. Header nav — not logged in ────────────────────────────────
  console.log('\n[3] Header nav');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const navNotLoggedIn = await page.$$('.header-nav-link');
  navNotLoggedIn.length === 0 ? ok('No nav links when logged out') : fail('nav logged-out', `found ${navNotLoggedIn.length}`);

  // Simulate superadmin login
  await setAuth('superadmin');
  await page.evaluate(() => { updateHeader(); });
  await page.waitForTimeout(200);

  const navLinks = await page.$$('.header-nav-link');
  navLinks.length >= 2 ? ok(`${navLinks.length} nav links shown (History + Admin)`) : fail('nav links', `found ${navLinks.length}`);

  const linkTexts = await Promise.all(navLinks.map(l => l.textContent()));
  linkTexts.some(t => t.includes('History')) ? ok('History link present') : fail('History link', 'not found');
  linkTexts.some(t => t.includes('Admin'))   ? ok('Admin link present')   : fail('Admin link',   'not found');

  // ── 4. Technician guard (role: technician) ────────────────────────
  console.log('\n[4] Technician cannot access #admin');
  await setAuth('technician');
  await page.evaluate(() => updateHeader());
  await page.waitForTimeout(200);

  await page.goto(BASE + '/#admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const adminAfterTech = page.url();
  adminAfterTech.includes('home') || !adminAfterTech.includes('admin')
    ? ok('Technician → #admin redirects to #home')
    : fail('technician #admin guard', adminAfterTech);

  const techNavLinks = await page.$$('.header-nav-link');
  const techLinkTexts = await Promise.all(techNavLinks.map(l => l.textContent()));
  techLinkTexts.some(t => t.includes('History'))   ? ok('Technician sees History link') : fail('tech History link', 'missing');
  !techLinkTexts.some(t => t.includes('Admin'))    ? ok('Technician has no Admin link')  : fail('tech no Admin link', 'Admin link visible');

  // ── 5. History page structure ─────────────────────────────────────
  console.log('\n[5] History page structure');
  await setAuth('superadmin');
  await page.evaluate(() => updateHeader());

  await page.goto(BASE + '/#history', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500); // wait for API attempt + failure

  (await page.textContent('h1')) === 'Session History'
    ? ok('History h1 correct')
    : fail('History h1', await page.textContent('h1'));

  (await page.$('.filter-bar'))  ? ok('filter-bar rendered')          : fail('filter-bar', 'missing');
  (await page.$('#hist-device')) ? ok('device dropdown present')      : fail('device dropdown', 'missing');
  (await page.$('.filter-toggle')) ? ok('guest toggle present')       : fail('guest toggle', 'missing');

  // API offline → should show empty-state or error state
  const histContent = await page.textContent('#hist-content');
  (histContent && histContent.length > 0) ? ok('hist-content has content (empty/error state)') : fail('hist-content', 'empty');

  // ── 6. History filter toggle ──────────────────────────────────────
  console.log('\n[6] History filter toggle');
  const toggleBtns = await page.$$('.filter-toggle-btn');
  toggleBtns.length === 3 ? ok('3 toggle buttons') : fail('toggle btns', `found ${toggleBtns.length}`);

  const firstActive = await toggleBtns[0]?.getAttribute('class');
  firstActive?.includes('active') ? ok('First toggle btn active by default') : fail('first toggle active', firstActive);

  await toggleBtns[1]?.click(); // Guest Only
  await page.waitForTimeout(800);
  const secondActive = await toggleBtns[1]?.getAttribute('class');
  secondActive?.includes('active') ? ok('Guest Only toggle activates on click') : fail('guest toggle click', secondActive);

  // ── 7. Admin page structure ───────────────────────────────────────
  console.log('\n[7] Admin page structure');
  await page.goto(BASE + '/#admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  (await page.textContent('h1')) === 'Admin Panel'
    ? ok('Admin h1 correct')
    : fail('Admin h1', await page.textContent('h1'));

  (await page.$('.section-hdr h2')) ? ok('section-hdr visible') : fail('section-hdr', 'missing');
  const sectionHdrs = await page.$$('.section-hdr h2');
  const sectionTexts = await Promise.all(sectionHdrs.map(h => h.textContent()));
  sectionTexts.some(t => t.includes('User Management')) ? ok('User Management section') : fail('User Mgmt section', 'missing');
  sectionTexts.some(t => t.includes('Session Statistics')) ? ok('Session Statistics section') : fail('Stats section', 'missing');

  // ── 8. Add User modal ─────────────────────────────────────────────
  console.log('\n[8] Add User modal');
  const addBtn = await page.$('button[onclick="adminShowAddUser()"]');
  addBtn ? ok('Tambah Teknisi button') : fail('Tambah btn', 'not found');

  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(300);

    const modal = await page.$('#admin-modal');
    modal ? ok('admin-modal opened') : fail('admin-modal', 'not found');

    // Validate: empty submit
    await page.click('#admin-modal .btn-primary');
    await page.waitForTimeout(200);
    const errEl  = await page.$('#am-err');
    const errVis = errEl ? await errEl.isVisible() : false;
    errVis ? ok('Validation error shown on empty submit') : fail('validation error', 'not visible');

    // Validate: username too short
    await page.fill('#am-user', 'ab');
    await page.click('#admin-modal .btn-primary');
    await page.waitForTimeout(200);
    const errMsg = await page.textContent('#am-err');
    errMsg?.includes('3') ? ok('Username min length validation') : fail('username validation', errMsg);

    // Validate: password mismatch
    await page.fill('#am-user', 'newtech');
    await page.fill('#am-pass', 'password123');
    await page.fill('#am-pass2', 'different456');
    await page.click('#admin-modal .btn-primary');
    await page.waitForTimeout(200);
    const errMsg2 = await page.textContent('#am-err');
    errMsg2?.toLowerCase().includes('sama') ? ok('Password mismatch validation') : fail('password mismatch', errMsg2);

    // Close modal
    await page.click('#admin-modal .btn-ghost');
    await page.waitForTimeout(200);
    const modalAfterClose = await page.$('#admin-modal');
    !modalAfterClose ? ok('Modal closes on Batal') : fail('modal close', 'still open');
  }

  // ── 9. Edit User modal ────────────────────────────────────────────
  console.log('\n[9] Edit User modal (simulate opening)');
  await page.evaluate(() => {
    adminShowEditUser({ id: 'test-uuid', username: 'testtech' });
  });
  await page.waitForTimeout(300);

  const editModal = await page.$('#admin-modal');
  editModal ? ok('Edit modal opened') : fail('edit modal', 'not found');

  const editInput = await page.inputValue('#am-user').catch(() => null);
  editInput === 'testtech' ? ok('Username pre-filled in edit modal') : fail('edit username pre-fill', editInput);

  await page.click('#admin-modal .btn-ghost');
  await page.waitForTimeout(200);

  // ── 10. Confirm deactivate modal ──────────────────────────────────
  console.log('\n[10] Deactivate confirm modal');
  await page.evaluate(() => {
    adminToggleActive('test-id', 'testtech', false);
  });
  await page.waitForTimeout(300);

  const confirmModal = await page.$('#admin-confirm-modal');
  confirmModal ? ok('Confirm deactivate modal opened') : fail('confirm modal', 'not found');

  const confirmText = await page.textContent('#admin-confirm-modal');
  confirmText?.includes('testtech') ? ok('Confirm modal shows username') : fail('confirm modal username', 'missing');

  // Close
  await page.click('#admin-confirm-modal .btn-ghost');
  await page.waitForTimeout(200);
  !await page.$('#admin-confirm-modal') ? ok('Confirm modal closes on Batal') : fail('confirm modal close', 'still open');

  // ── 11. JS error check ────────────────────────────────────────────
  console.log('\n[11] JS error check');
  const relevant = jsErrs.filter(e => !e.includes('net::ERR_CONNECTION_REFUSED') && !e.includes('Failed to fetch'));
  relevant.length === 0 ? ok('No JS errors') : fail(`${relevant.length} JS error(s)`, relevant.slice(0, 2).join('; '));

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
