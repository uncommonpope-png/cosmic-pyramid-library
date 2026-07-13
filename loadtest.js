const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const consoleErrs = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  const url = process.argv[2] || 'https://uncommonpope-png.github.io/cosmic-pyramid-library/?v=9c224e8';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) { console.log('GOTO ERR', e.message); }
  // poll loader hidden state for 20s
  let hiddenAt = null;
  for (let i = 0; i < 20; i++) {
    const hidden = await page.evaluate(() => {
      const el = document.getElementById('loader-overlay');
      return el ? el.classList.contains('hidden') : 'no-el';
    }).catch(e => 'eval-err:' + e.message);
    if (hidden === true) { hiddenAt = i; break; }
    await page.waitForTimeout(1000);
  }
  console.log('LOADER_HIDDEN_AT_SEC:', hiddenAt);
  console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 10), null, 2));
  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrs.slice(0, 15), null, 2));
  await browser.close();
})();
