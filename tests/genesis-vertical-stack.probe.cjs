const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/uncom/Desktop/node_modules/playwright');
const sharp = require('C:/Users/uncom/Desktop/node_modules/sharp');

const root = path.resolve(__dirname, '..');
const tempRoot = 'C:/Users/uncom/AppData/Local/Temp/opencode';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.toLowerCase().startsWith(root.toLowerCase())) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

function moved(a, b, epsilon = 0.02) {
  if (!a || !b) return false;
  return Math.max(...a.map((value, index) => Math.abs(value - b[index]))) > epsilon;
}

function stopped(a, b, epsilon = 0.001) {
  if (!a || !b) return false;
  return Math.max(...a.map((value, index) => Math.abs(value - b[index]))) <= epsilon;
}

async function imageSignal(buffer) {
  const stats = await sharp(buffer).stats();
  const rgb = stats.channels.slice(0, 3).map((channel) => Number(channel.mean.toFixed(2)));
  return { rgb, peakMean: Math.max(...rgb), entropy: Number(stats.entropy.toFixed(3)), bytes: buffer.length };
}

(async () => {
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const port = server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const capture = async (outputPath) => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const buffer = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(outputPath, buffer);
      return buffer;
    };
    const pageErrors = [];
    const consoleMessages = [];
    const shaderErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('console', (message) => {
      const text = message.text();
      consoleMessages.push({ type: message.type(), text });
      if (/THREE\.WebGLProgram:\s*Shader Error/i.test(text)) shaderErrors.push(text);
    });
    await page.addInitScript(() => {
      try { localStorage.setItem('soulfeild_intro_seen', '1'); } catch (_) {}
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 100);
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (/\/assets\/.*\.(?:glb|mp4|webm)(?:\?|$)/i.test(url)) return route.abort('blockedbyclient');
      return route.continue();
    });

    const url = `http://127.0.0.1:${port}/index.html?key=92140facf0a3b8484f85b9d343687a95703e91b4724928eec78b8fd9d4aefc6&genesisDebug=1`;
    console.error('[probe] navigate');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__genesisFirstFrameSeen === true && !!window.__verticalStack, null, { timeout: 60000 });
    await page.waitForFunction(() => window.__cplReady === true, null, { timeout: 30000 });
    await page.waitForFunction(() => window.__genesisBackstopReleased === true, null, { timeout: 30000 });
    console.error('[probe] ready');
    await page.evaluate(() => { const enter = document.getElementById('sl-enter'); if (enter && enter.classList.contains('show')) enter.click(); });
    await page.waitForTimeout(500);

    const baseline = await page.evaluate(() => {
      const scene = window.Genesis.scene;
      const visibleInTree = (object) => {
        let node = object;
        while (node) { if (node.visible === false) return false; node = node.parent; }
        return true;
      };
      const underside = scene.getObjectByName('darkCityUndersideRoot');
      const heaven = scene.getObjectByName('heavenStratumRoot');
      const ground = scene.getObjectByName('Surface City Ground');
      const grid = scene.getObjectByName('Surface City Grid');
      const car = scene.getObjectByName('Surface Traffic Car 1');
      const citizen = scene.getObjectByName('Surface Citizen 1');
      const undersidePos = underside ? underside.getWorldPosition(underside.position.clone()).toArray() : null;
      const summary = window.__verticalStack.summary();
      const genesisSummary = window.__genesisSummary();
      const canvas = window.Genesis.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      return {
        cplReady: window.__cplReady,
        firstFrame: window.__genesisFirstFrameSeen,
        backstop: window.__genesisBackstopReleased,
        firstFrameAt: window.Genesis.boot.firstFrameAt,
        renderedFrames: window.Genesis.renderer.info.render.frame,
        canvas: { width: rect.width, height: rect.height, display: getComputedStyle(canvas).display },
        noInfiniteGrid: !scene.getObjectByName('Infinite Grid'),
        underside: { exists: !!underside, worldPosition: undersidePos, childCount: underside ? underside.children.length : 0, visible: underside ? visibleInTree(underside) : false },
        heaven: { exists: !!heaven, directSceneChild: !!heaven && heaven.parent === scene, visible: heaven ? visibleInTree(heaven) : false },
        stack: summary,
        genesis: genesisSummary,
        baselineVisible: {
          ground: !!ground && visibleInTree(ground), grid: !!grid && visibleInTree(grid),
          car: !!car && visibleInTree(car), citizen: !!citizen && visibleInTree(citizen)
        }
      };
    });

    const surfaceBeforeMotion = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    await page.waitForTimeout(650);
    const surfaceAfterMotion = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());

    const surfaceShotPath = path.join(tempRoot, 'cpl-vertical-surface.png');
    console.error('[probe] capture surface');
    const surfaceBuffer = await capture(surfaceShotPath);
    const surfaceSignal = await imageSignal(surfaceBuffer);

    const undersideShotPath = path.join(tempRoot, 'cpl-dark-city-underside.png');
    console.error('[probe] capture underside');
    await page.evaluate(() => {
      const orbit = document.getElementById('orbit-mode-btn');
      if (orbit) orbit.click();
      const camera = window.Genesis.camera;
      camera.position.set(118, -72, 118);
      camera.lookAt(0, -18, 0);
    });
    await page.waitForTimeout(350);
    const undersideBuffer = await capture(undersideShotPath);
    const undersideSignal = await imageSignal(undersideBuffer);
    await page.evaluate(() => { const npc = document.getElementById('npc-mode-btn'); if (npc) npc.click(); });

    console.error('[probe] transition heaven');
    await page.evaluate(() => {
      window.__verticalTransitionProbe = window.__verticalStack.manager.transitionTo('heaven', { connectorId: 'surface-heaven', prewarmMs: 420 });
    });
    console.error('[probe] transition heaven started');
    await page.waitForTimeout(90);
    console.error('[probe] read prewarm');
    const prewarm = await page.evaluate(() => {
      const summary = window.__verticalStack.summary();
      return {
        active: summary.active,
        transitioning: summary.transitioning,
        sourceVisible: summary.strata.surface.visible,
        destinationState: summary.strata.heaven.state,
        destinationVisible: summary.strata.heaven.visible
      };
    });
    const prewarmShotPath = path.join(tempRoot, 'cpl-vertical-prewarm.png');
    console.error('[probe] capture prewarm');
    const prewarmBuffer = await capture(prewarmShotPath);
    const prewarmSignal = await imageSignal(prewarmBuffer);
    await page.evaluate(() => window.__verticalTransitionProbe);
    await page.waitForFunction(() => window.__verticalStack.getActive() === 'heaven', null, { timeout: 10000 });
    await page.waitForTimeout(450);

    const heavenState = await page.evaluate(() => ({ summary: window.__verticalStack.summary(), player: window.__verticalStack.playerState(), engine: window.__genesisSummary() }));
    const sleepingStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    await page.waitForTimeout(900);
    const sleepingEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const heavenShotPath = path.join(tempRoot, 'cpl-vertical-heaven.png');
    console.error('[probe] capture heaven');
    const heavenBuffer = await capture(heavenShotPath);
    const heavenSignal = await imageSignal(heavenBuffer);

    console.error('[probe] transition surface');
    await page.evaluate(() => {
      window.__verticalTransitionProbe = window.__verticalStack.manager.transitionTo('surface', { connectorId: 'surface-heaven', prewarmMs: 220 });
    });
    await page.evaluate(() => window.__verticalTransitionProbe);
    await page.waitForFunction(() => window.__verticalStack.getActive() === 'surface', null, { timeout: 10000 });
    const returnedStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    await page.waitForTimeout(900);
    const returnedEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const returnedState = await page.evaluate(() => ({ summary: window.__verticalStack.summary(), player: window.__verticalStack.playerState(), engine: window.__genesisSummary() }));
    const returnedShotPath = path.join(tempRoot, 'cpl-vertical-returned.png');
    console.error('[probe] capture returned');
    const returnedBuffer = await capture(returnedShotPath);
    const returnedSignal = await imageSignal(returnedBuffer);

    const checks = {
      readyAndRendered: baseline.cplReady && baseline.firstFrame && baseline.backstop && baseline.firstFrameAt > 0 && baseline.renderedFrames > 0,
      canvasVisible: baseline.canvas.width > 0 && baseline.canvas.height > 0 && baseline.canvas.display !== 'none',
      noPageErrors: pageErrors.length === 0,
      noShaderErrors: shaderErrors.length === 0,
      noInfiniteGrid: baseline.noInfiniteGrid,
      undersideExistsBelowSurface: baseline.underside.exists && baseline.underside.worldPosition[1] < 0 && baseline.underside.childCount >= 7,
      heavenDirectSceneChild: baseline.heaven.exists && baseline.heaven.directSceneChild,
      stackRegistered: baseline.stack.active === 'surface' && baseline.stack.strata.surface && baseline.stack.strata.heaven && baseline.stack.connectors.some((connector) => connector.id === 'surface-heaven'),
      managerRegistered: baseline.genesis.managers.names.includes('VerticalStackManager') && baseline.genesis.managers.count >= 11,
      diagnosticsPresent: !!baseline.genesis.sectors['heaven-prototype'] && !!baseline.genesis.sectors['dark-city-underside'] && !!baseline.genesis.visibility['heaven-prototype'] && !!baseline.genesis.streaming.byTier.world,
      baselineVisible: Object.values(baseline.baselineVisible).every(Boolean),
      surfaceInitiallyMoves: moved(surfaceBeforeMotion.car, surfaceAfterMotion.car),
      destinationPrewarmed: prewarm.transitioning && prewarm.active === 'surface' && prewarm.sourceVisible && prewarm.destinationState === 'LOADED' && prewarm.destinationVisible,
      destinationVisibleBeforeTransfer: heavenState.summary.lastTransition && heavenState.summary.lastTransition.destinationVisibleBeforeTransfer === true,
      heavenPlayerState: heavenState.summary.active === 'heaven' && heavenState.player.floorY > 600 && heavenState.player.cameraTarget[1] > 600 && heavenState.player.grounded && !heavenState.player.flying && Math.abs(heavenState.player.verticalVelocity) < 0.001,
      surfaceSimulationSleeps: stopped(sleepingStart.car, sleepingEnd.car) && stopped(sleepingStart.citizen, sleepingEnd.citizen),
      sectorSleepsOutOfRange: heavenState.engine.sectors['city-outer'].state === 'asleep' && heavenState.engine.visibility['city-outer'].inRange === false,
      sectorWakesFromInvisible: returnedState.engine.sectors['city-outer'].state === 'active' && returnedState.engine.visibility['city-outer'].inRange === true && returnedState.engine.visibility['city-outer'].visible === true,
      surfaceSimulationResumes: moved(returnedStart.car, returnedEnd.car),
      returnedSafely: returnedState.summary.active === 'surface' && returnedState.player.floorY < 1 && returnedState.player.cameraTarget[1] < 4 && returnedState.player.grounded && !returnedState.player.flying,
      noBlackSample: surfaceSignal.peakMean > 2 && undersideSignal.peakMean > 2 && prewarmSignal.peakMean > 2 && heavenSignal.peakMean > 2 && returnedSignal.peakMean > 2
    };

    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    const result = {
      checks,
      imageSignals: { surface: surfaceSignal, underside: undersideSignal, prewarm: prewarmSignal, heaven: heavenSignal, returned: returnedSignal },
      screenshots: [surfaceShotPath, undersideShotPath, prewarmShotPath, heavenShotPath, returnedShotPath],
      pageErrors,
      shaderErrors,
      expectedNetworkConsoleErrors: consoleMessages.filter((entry) => entry.type === 'error').length
    };
    if (failed.length) Object.assign(result, { baseline, prewarm, heavenState, returnedState });
    console.log(JSON.stringify(result, null, 2));
    if (failed.length) {
      console.error('FAILED CHECKS: ' + failed.join(', '));
      process.exitCode = 1;
    }
    await Promise.race([context.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    await Promise.race([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  process.exit(process.exitCode || 0);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(2);
});
