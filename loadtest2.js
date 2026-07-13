const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  const url = process.argv[2] || 'https://uncommonpope-png.github.io/cosmic-pyramid-library/?v=747281f';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  let hiddenAt = null;
  for (let i = 0; i < 20; i++) {
    const hidden = await page.evaluate(() => {
      const el = document.getElementById('loader-overlay');
      return el ? el.classList.contains('hidden') : 'no-el';
    }).catch(() => 'err');
    if (hidden === true) { hiddenAt = i; break; }
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000);
  const diag = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const cph = document.getElementById('camera-panel');
    const avBtns = document.querySelectorAll('.avatar-btn').length;
    const gskPanel = document.getElementById('gsk-panel');
    let px = null;
    if (canvas) {
      try {
        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        px = gl ? 'webgl-ctx' : 'no-gl';
      } catch (e) { px = 'gl-err'; }
    }
    return {
      hasCanvas: !!canvas,
      canvasW: canvas ? canvas.width : 0,
      canvasH: canvas ? canvas.height : 0,
      cameraPanel: !!cph,
      avatarButtons: avBtns,
      gskPanel: !!gskPanel,
      gl: px
    };
  }).catch(e => ({ evalErr: e.message }));
  await page.screenshot({ path: 'c:\\users\\uncom\\appdata\\local\\temp\\opencode\\cpl-shot.png' }).catch(()=>{});
  console.log('LOADER_HIDDEN_AT_SEC:', hiddenAt);
  console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0,8)));
  console.log('DIAG:', JSON.stringify(diag, null, 2));
  await browser.close();
})();
