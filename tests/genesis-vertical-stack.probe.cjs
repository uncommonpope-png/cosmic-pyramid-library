const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fallbackNodeModules = process.env.CPL_NODE_MODULES || 'C:/Users/uncom/Desktop/node_modules';
function portableRequire(name) {
  try { return { value: require(name), source: name }; }
  catch (primaryError) {
    const fallback = path.join(fallbackNodeModules, name);
    try { return { value: require(fallback), source: fallback }; }
    catch (fallbackError) {
      fallbackError.message = `${name} unavailable through normal resolution or documented CPL_NODE_MODULES fallback (${fallback}): ${fallbackError.message}`;
      throw fallbackError;
    }
  }
}

const playwrightDependency = portableRequire('playwright');
const sharpDependency = portableRequire('sharp');
const { chromium } = playwrightDependency.value;
const sharp = sharpDependency.value;
const root = path.resolve(__dirname, '..');
const tempRoot = process.env.CPL_AUDIT_OUTPUT || path.join(os.tmpdir(), 'opencode');
fs.mkdirSync(tempRoot, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm'
};
const allowedLocalGlbPath = '/assets/city/walkers/Soldier.glb';
const knownOptionalAvatarUrl = 'https://models.readyplayer.me/65893b0514f9f5f28e61d783.glb';
const blockedByTestUrls = new Set();

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

function scalarMoved(a, b, epsilon = 0.0001) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > epsilon;
}

function scalarStopped(a, b, epsilon = 0.0001) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}

function ticksAdvanced(before, after, keys) {
  return keys.every((key) => Number(after?.ticks?.[key] || 0) > Number(before?.ticks?.[key] || 0));
}

function ticksStopped(before, after, keys) {
  return keys.every((key) => Number(after?.ticks?.[key] || 0) === Number(before?.ticks?.[key] || 0));
}

async function pngSignal(buffer) {
  const stats = await sharp(buffer).stats();
  const rgb = stats.channels.slice(0, 3).map((channel) => Number(channel.mean.toFixed(2)));
  return { rgb, peakMean: Math.max(...rgb), entropy: Number(stats.entropy.toFixed(3)), bytes: buffer.length };
}

function isAllowedConsoleError(entry) {
  const text = entry.text || '';
  const source = entry.url || '';
  if (/WebSocket connection to ['"]ws:\/\/localhost:(?:3002|9001)\//i.test(text)) return true;
  if (/WebSocket connection to ['"]wss?:\/\/127\.0\.0\.1:(?:3002|9001)\//i.test(text)) return true;
  if (/Failed to load resource/i.test(text) && /(?:localhost|127\.0\.0\.1):(?:3001|3002|9001)\//i.test(source)) return true;
  if (blockedByTestUrls.has(source) && /(?:Failed to load resource|net::ERR_(?:FAILED|ABORTED|BLOCKED_BY_CLIENT))/i.test(text)) return true;
  if (source.startsWith(knownOptionalAvatarUrl) && /(?:Failed to load resource|net::ERR_(?:FAILED|ABORTED|BLOCKED_BY_CLIENT))/i.test(text)) return true;
  return false;
}

function isAllowedRequestFailure(entry) {
  // The harness serves only /assets/city/walkers/Soldier.glb locally and aborts
  // every other local .glb/.mp4/.webm; an aborted local Soldier.glb fetch is the
  // probe's own route policy (blockedHeavyRoutes), not an app regression.
  const isLocalGlbAbort = /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/assets\/city\/walkers\/Soldier\.glb$/i.test(entry.url) && /ERR_ABORTED/i.test(entry.error || '');
  return /(?:localhost|127\.0\.0\.1):(?:3001|3002|9001)\//i.test(entry.url) || blockedByTestUrls.has(entry.url) || entry.url.startsWith(knownOptionalAvatarUrl) || isLocalGlbAbort;
}

(async () => {
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const port = server.address().port;
  let browser;
  let browserLaunch = 'msedge';
  try {
    const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'] };
    try { browser = await chromium.launch({ ...launchOptions, channel: process.env.CPL_BROWSER_CHANNEL || 'msedge' }); }
    catch (_) { browserLaunch = 'playwright-chromium'; browser = await chromium.launch(launchOptions); }
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleMessages = [];
    const shaderErrors = [];
    const requestFailures = [];
    const blockedHeavyRoutes = [];
    const allowedLocalGlbResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('console', (message) => {
      const location = message.location();
      const entry = { type: message.type(), text: message.text(), url: location.url || '' };
      consoleMessages.push(entry);
      if (/THREE\.WebGLProgram:\s*Shader Error/i.test(entry.text)) shaderErrors.push(entry.text);
    });
    page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));
    page.on('response', (response) => {
      const responseUrl = response.url();
      if (new URL(responseUrl).pathname === allowedLocalGlbPath) allowedLocalGlbResponses.push({ url: responseUrl, status: response.status(), ok: response.ok() });
    });
    await page.addInitScript(() => {
      try { localStorage.setItem('soulfeild_intro_seen', '1'); } catch (_) {}
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 100);
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const parsed = new URL(url);
      if (url.startsWith(knownOptionalAvatarUrl)) {
        blockedHeavyRoutes.push({ url, reason: 'known-optional-avatar' });
        blockedByTestUrls.add(url);
        return route.abort('blockedbyclient');
      }
      if (parsed.hostname === '127.0.0.1' && /\.(?:glb|mp4|webm)$/i.test(parsed.pathname) && parsed.pathname !== allowedLocalGlbPath) {
        blockedHeavyRoutes.push(url);
        blockedByTestUrls.add(url);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });

    const captureCanvas = async (fileName) => {
      const outputPath = path.join(tempRoot, fileName);
      const capture = await page.evaluate(() => {
        const renderer = window.Genesis.renderer;
        const canvas = renderer.domElement;
        const renderGraph = window.Genesis.RenderGraph;
        const before = renderGraph && renderGraph.summary ? renderGraph.summary() : null;
        const composeSucceeded = !!(renderGraph && renderGraph.compose && renderGraph.compose());
        const after = renderGraph && renderGraph.summary ? renderGraph.summary() : null;
        const gl = renderer.getContext();
        gl.finish();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let sumR = 0, sumG = 0, sumB = 0, peak = 0, nonBlack = 0;
        const pixelCount = width * height;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          sumR += r; sumG += g; sumB += b;
          peak = Math.max(peak, r, g, b);
          if (r > 5 || g > 5 || b > 5) nonBlack++;
        }
        return {
          composeSucceeded,
          renderPath: after?.lastPath || null,
          renderError: after?.lastError || null,
          composeCountBefore: before?.composeCount ?? null,
          composeCountAfter: after?.composeCount ?? null,
          fallbackCountBefore: before?.fallbackCount ?? null,
          fallbackCountAfter: after?.fallbackCount ?? null,
          lastRenderedAt: after?.lastRenderedAt || 0,
          png: canvas.toDataURL('image/png').split(',')[1],
          framebuffer: {
            width, height, peak,
            rgb: [sumR / pixelCount, sumG / pixelCount, sumB / pixelCount].map((value) => Number(value.toFixed(2))),
            nonBlackRatio: Number((nonBlack / pixelCount).toFixed(4))
          }
        };
      });
      const buffer = Buffer.from(capture.png, 'base64');
      fs.writeFileSync(outputPath, buffer);
      return { path: outputPath, ...capture, png: await pngSignal(buffer) };
    };

    const url = `http://127.0.0.1:${port}/index.html?key=92140facf0a3b8484f85b9d343687a95703e91b4724928eec78b8fd9d4aefc6&genesisDebug=1`;
    console.error('[probe] navigate');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__genesisFirstFrameSeen === true && !!window.__verticalStack, null, { timeout: 60000 });
    await page.waitForFunction(() => window.__cplReady === true && window.__genesisBackstopReleased === true, null, { timeout: 30000 });
    await page.evaluate(() => { const enter = document.getElementById('sl-enter'); if (enter && enter.classList.contains('show')) enter.click(); });
    await page.waitForTimeout(700);
    await page.waitForFunction(() => {
      const requests = window.__genesisSummary?.().streaming?.requests || {};
      return Object.values(requests).some((request) => request.tier === 'world' && request.state !== 'queued');
    }, null, { timeout: 15000 });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })));
    await page.waitForFunction(() => {
      const requests = Object.values(window.__genesisSummary?.().streaming?.requests || {});
      return requests.some((request) => request.label === 'Soldier.glb' && request.state === 'loaded' && request.loaded === true);
    }, null, { timeout: 30000 });
    await page.waitForFunction(() => {
      const requests = Object.values(window.__genesisSummary?.().streaming?.requests || {});
      return requests.some((request) => request.label === '65893b0514f9f5f28e61d783.glb' && request.state === 'error' && !!request.error);
    }, null, { timeout: 20000 });
    const duplicateStreaming = await page.evaluate(() => window.__verticalStack.test.exerciseDuplicateStreaming());
    const streamingEvidence = await page.evaluate(() => {
      const requests = Object.values(window.__genesisSummary().streaming.requests);
      return {
        soldier: requests.filter((request) => request.label === 'Soldier.glb'),
        optionalAvatar: requests.filter((request) => request.label === '65893b0514f9f5f28e61d783.glb'),
        repeatedAngel: requests.filter((request) => request.label === 'angel.opt.glb')
      };
    });
    const steadyStackBefore = await page.evaluate(() => window.__verticalStack.summary().performance);
    await page.waitForTimeout(650);
    const steadyStackAfter = await page.evaluate(() => window.__verticalStack.summary().performance);
    console.error('[probe] ready');

    const baseline = await page.evaluate(() => {
      const scene = window.Genesis.scene;
      const visibleInTree = (object) => {
        let node = object;
        while (node) { if (node.visible === false) return false; node = node.parent; }
        return true;
      };
      const underside = scene.getObjectByName('darkCityUndersideRoot');
      const prototypeHeaven = scene.getObjectByName('heavenStratumRoot');
      const legacyHeaven = scene.getObjectByName('Legacy Surface Heaven City');
      const legacyHeavenLayer = scene.getObjectByName('Legacy Surface Heaven Layer');
      const ground = scene.getObjectByName('Surface City Ground');
      const surfaceGrid = scene.getObjectByName('Surface City Grid');
      const coreFloor = scene.getObjectByName('Genesis Grid Floor (core shadow catch)');
      const car = scene.getObjectByName('Surface Traffic Car 1');
      const citizen = scene.getObjectByName('Surface Citizen 1');
      const worldPosition = scene.position.clone();
      const worldQuaternion = scene.quaternion.clone();
      const scenePlanes = scene.children.filter((object) => object.isMesh && object.geometry?.type === 'PlaneGeometry').map((object) => {
        object.getWorldPosition(worldPosition);
        object.getWorldQuaternion(worldQuaternion);
        const normal = scene.position.clone().set(0, 0, 1).applyQuaternion(worldQuaternion);
        return {
          name: object.name || '',
          y: worldPosition.y,
          normal: normal.toArray(),
          width: Number(object.geometry.parameters?.width || 0),
          height: Number(object.geometry.parameters?.height || 0),
          materialType: object.material?.type || ''
        };
      });
      const namedInfiniteGrid = [];
      scene.traverse((object) => { if (/infinite\s*grid/i.test(object.name || '')) namedInfiniteGrid.push(object.name); });
      const prohibitedPlanes = scenePlanes.filter((plane) => /infinite\s*grid/i.test(plane.name) || (Math.abs(plane.normal[1]) < 0.85 && Math.max(plane.width, plane.height) >= 100));
      const corePlane = scenePlanes.find((plane) => plane.name === 'Genesis Grid Floor (core shadow catch)');
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
        gridTruth: {
          namedInfiniteGrid,
          prohibitedPlanes,
          corePlane,
          coreExists: !!coreFloor,
          coreMaterialType: coreFloor?.material?.type || null
        },
        underside: { exists: !!underside, worldY: underside ? underside.getWorldPosition(worldPosition).y : null, childCount: underside?.children.length || 0, visible: underside ? visibleInTree(underside) : false, cost: underside?.userData?.cost ? { ...underside.userData.cost } : null },
        prototypeHeaven: { exists: !!prototypeHeaven, directSceneChild: prototypeHeaven?.parent === scene, visible: prototypeHeaven ? visibleInTree(prototypeHeaven) : false },
        legacyHeavens: {
          nestedName: legacyHeaven?.name || null,
          directName: legacyHeavenLayer?.name || null,
          nestedType: legacyHeaven?.userData?.verticalContentType || null,
          directType: legacyHeavenLayer?.userData?.verticalContentType || null
        },
        stack: summary,
        genesis: genesisSummary,
        diagnosticsFrozen: Object.isFrozen(window.__verticalStack) && !('manager' in window.__verticalStack) && Object.isFrozen(window.__verticalStack.test),
        simulationApi: {
          available: typeof window.Genesis.isSimulationActive === 'function' && typeof window.Genesis.VerticalStackManager.isSimulationActive === 'function',
          ancestorSurfaceActive: !!citizen && window.Genesis.isSimulationActive(citizen),
          legacyRootActive: window.Genesis.isSimulationActive({ userData: {}, parent: null })
        },
        baselineVisible: {
          ground: !!ground && visibleInTree(ground), surfaceGrid: !!surfaceGrid && visibleInTree(surfaceGrid),
          car: !!car && visibleInTree(car), citizen: !!citizen && visibleInTree(citizen)
        }
      };
    });

    const surfaceActorsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const surfaceSystemsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    await page.waitForTimeout(750);
    const surfaceActorsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const surfaceSystemsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    const captureRenderGraphBefore = await page.evaluate(() => window.Genesis.RenderGraph.summary());
    const surfaceCapture = await captureCanvas('cpl-vertical-surface.png');
    const surfaceParticleEvidence = await page.evaluate(() => {
      let scenePoints = 0;
      window.Genesis.scene.traverse((object) => { if (object.isPoints) scenePoints++; });
      return { scenePoints, summary: window.Genesis.Diagnostics.summary() };
    });
    const surfaceDiagnostics = surfaceParticleEvidence.summary;
    const diagnosticsPanelProof = await page.evaluate(() => {
      const root = document.getElementById('genesis-pill');
      const summary = document.getElementById('genesis-diagnostics-summary');
      const requiredLabels = ['ACTIVE STRATUM', 'ACTIVE SECTOR(S)', 'DRAW CALLS', 'TRIANGLES', 'POINT LIGHTS', 'VIDEOS', 'MIXERS', 'PARTICLE SYSTEMS', 'TEXTURES', 'FRAME TIME', 'GPU TIME', 'RENDERER PATH'];
      const beforeExpanded = root?.classList.contains('expanded') || false;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`', bubbles: true }));
      const afterToggle = root?.classList.contains('expanded') || false;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`', bubbles: true }));
      const restored = root?.classList.contains('expanded') || false;
      return {
        exists: !!root && !!summary,
        shown: !!root && root.classList.contains('show') && getComputedStyle(root).opacity !== '0',
        pinned: !!window.Genesis.ui.debugPinned,
        beforeExpanded,
        afterToggle,
        restored,
        labels: Object.fromEntries(requiredLabels.map((label) => [label, summary?.textContent.includes(label) || false])),
        textOnly: !!summary && summary.childElementCount === 0,
        diagnosticsFrozen: Object.isFrozen(window.Genesis.Diagnostics)
      };
    });
    const mixerDoubleTickGuard = await page.evaluate(() => window.__verticalStack.test.exerciseMixerDoubleTickGuard());

    console.error('[probe] capture underside');
    const undersideCapture = await page.evaluate(() => {
      document.getElementById('orbit-mode-btn')?.click();
      const camera = window.Genesis.camera;
      camera.position.set(118, -72, 118);
      camera.lookAt(0, -18, 0);
      return true;
    }).then(() => page.waitForTimeout(350)).then(() => captureCanvas('cpl-dark-city-underside.png'));
    await page.evaluate(() => document.getElementById('npc-mode-btn')?.click());

    const farConnectorRejected = await page.evaluate(() => window.__verticalStack.test.activateConnector());
    console.error('[probe] connector transition heaven');
    await page.evaluate(() => { window.__verticalConnectorProbe = window.__verticalStack.test.activateConnector({ placeNear: true }); return true; });
    await page.waitForTimeout(60);
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
    const prewarmCapture = await captureCanvas('cpl-vertical-prewarm.png');
    await page.evaluate(() => window.__verticalConnectorProbe);
    await page.waitForFunction(() => window.__verticalStack.getActive() === 'heaven', null, { timeout: 10000 });
    await page.waitForTimeout(350);

    const heavenState = await page.evaluate(() => ({
      summary: window.__verticalStack.summary(),
      player: window.__verticalStack.playerState(),
      systems: window.__verticalStack.sampleSurfaceSystems(),
      interaction: window.__verticalStack.interactionState(),
      engine: window.__genesisSummary()
    }));
    const sleepingActorsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const sleepingSystemsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    const heavenSystemsStart = await page.evaluate(() => window.__verticalStack.sampleHeavenSystems());
    await page.waitForTimeout(900);
    const sleepingActorsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const sleepingSystemsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    const heavenSystemsEnd = await page.evaluate(() => window.__verticalStack.sampleHeavenSystems());
    const heavenSimulationOwnership = await page.evaluate(() => {
      const citizen = window.Genesis.scene.getObjectByName('Surface Citizen 1');
      const heavenChild = window.Genesis.scene.getObjectByName('Heaven Return Pad');
      return {
        surfaceChildActive: citizen ? window.Genesis.isSimulationActive(citizen) : null,
        heavenChildActive: heavenChild ? window.Genesis.isSimulationActive(heavenChild) : null
      };
    });
    const hiddenPortalAttempt = await page.evaluate(() => window.__verticalStack.test.attemptSurfacePortal());
    const boundaryAttempt = await page.evaluate(() => window.__verticalStack.test.attemptHeavenBoundary(120, 0));
    const beaconCollisionAttempt = await page.evaluate(() => window.__verticalStack.test.attemptHeavenBoundary(0, -14));
    const supportCollisionAttempt = await page.evaluate(() => window.__verticalStack.test.attemptHeavenObstacle('support', 0));
    const towerCollisionAttempt = await page.evaluate(() => window.__verticalStack.test.attemptHeavenObstacle('tower', 0));
    const heavenMovementContract = await page.evaluate(() => window.__verticalStack.movementContract());
    const heavenAfterSafety = await page.evaluate(() => ({ player: window.__verticalStack.playerState(), interaction: window.__verticalStack.interactionState() }));
    const heavenCapture = await captureCanvas('cpl-vertical-heaven.png');
    const heavenParticleEvidence = await page.evaluate(() => {
      let scenePoints = 0;
      window.Genesis.scene.traverse((object) => { if (object.isPoints) scenePoints++; });
      return { scenePoints, summary: window.Genesis.Diagnostics.summary() };
    });
    const heavenDiagnostics = heavenParticleEvidence.summary;
    const verticalWakeGuard = await page.evaluate(() => {
      const root = window.Genesis.scene.getObjectByName('outerCity');
      const wakeResult = window.Genesis.SectorManager.wake('city-outer');
      window.Genesis.Visibility.tick();
      const sector = window.Genesis.SectorManager.summary()['city-outer'];
      let visible = !!root;
      let node = root;
      while (node) { if (node.visible === false) visible = false; node = node.parent; }
      return { wakeResult, visible, sector };
    });

    console.error('[probe] connector transition surface');
    await page.evaluate(() => { window.__verticalConnectorReturnProbe = window.__verticalStack.test.activateConnector({ placeNear: true }); return true; });
    await page.evaluate(() => window.__verticalConnectorReturnProbe);
    await page.waitForFunction(() => window.__verticalStack.getActive() === 'surface', null, { timeout: 10000 });
    const returnedActorsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const returnedSystemsStart = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    const returnedHeavenStart = await page.evaluate(() => window.__verticalStack.sampleHeavenSystems());
    await page.waitForTimeout(900);
    const returnedActorsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceActors());
    const returnedSystemsEnd = await page.evaluate(() => window.__verticalStack.sampleSurfaceSystems());
    const returnedHeavenEnd = await page.evaluate(() => window.__verticalStack.sampleHeavenSystems());
    const returnedState = await page.evaluate(() => ({
      summary: window.__verticalStack.summary(),
      player: window.__verticalStack.playerState(),
      systems: window.__verticalStack.sampleSurfaceSystems(),
      engine: window.__genesisSummary()
    }));
    const returnedCapture = await captureCanvas('cpl-vertical-returned.png');
    const returnedParticleEvidence = await page.evaluate(() => {
      let scenePoints = 0;
      window.Genesis.scene.traverse((object) => { if (object.isPoints) scenePoints++; });
      return { scenePoints, summary: window.Genesis.Diagnostics.summary() };
    });
    const returnedDiagnostics = returnedParticleEvidence.summary;
    const captureRenderGraphAfter = await page.evaluate(() => window.Genesis.RenderGraph.summary());

    const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error');
    const expectedConsoleErrors = consoleErrors.filter(isAllowedConsoleError);
    const unexpectedConsoleErrors = consoleErrors.filter((entry) => !isAllowedConsoleError(entry));
    const unexpectedRequestFailures = requestFailures.filter((entry) => !isAllowedRequestFailure(entry));
    const surfaceRoles = baseline.stack.strata.surface.roots.map((rootEntry) => rootEntry.role);
    const hiddenSurfaceRoots = heavenState.summary.strata.surface.roots;
    const returnedSurfaceRoots = returnedState.summary.strata.surface.roots;
    const worldRequests = Object.values(baseline.genesis.streaming.requests).filter((request) => request.tier === 'world');
    const framebufferSignals = [surfaceCapture, undersideCapture, prewarmCapture, heavenCapture, returnedCapture];
    const tickKeys = ['billboards', 'videos', 'particles', 'physics', 'audio', 'legacyAngels', 'sky'];
    const availableTickKeys = tickKeys.filter((key) => surfaceSystemsStart.available?.[key] !== false);
    const unavailableTickKeys = tickKeys.filter((key) => surfaceSystemsStart.available?.[key] === false);
    const phase0SurfaceTickKeys = ['billboards', 'videos', 'souls', 'legacyHeaven', 'sky', 'traffic', 'citizens', 'gskVisuals', 'runes', 'recentExtensions'];
    const particleEvidenceTruthful = (evidence) => {
      const particles = evidence?.summary?.particles;
      if (!particles || particles.semantics !== 'THREE.Points Object3D systems + Quarks system') return false;
      const numeric = [particles.active, particles.registered, particles.points?.active, particles.points?.registered];
      if (!numeric.every((value) => Number.isInteger(value) && value >= 0)) return false;
      if (particles.active > particles.registered || particles.points.active > particles.points.registered) return false;
      if (particles.points.registered !== evidence.scenePoints) return false;
      if (particles.registered !== particles.points.registered + (particles.quarks?.explicitlyCounted ? 1 : 0)) return false;
      const totals = Object.values(particles.byStratum || {}).reduce((sum, counts) => ({ active: sum.active + counts.active, registered: sum.registered + counts.registered }), { active: 0, registered: 0 });
      return totals.active === particles.active && totals.registered === particles.registered;
    };
    const lifecycleForRole = (role, minimum) => {
      const initial = baseline.stack.strata.surface.roots.filter((entry) => entry.role === role);
      return initial.length >= minimum && initial.every((entry) => {
        const hidden = hiddenSurfaceRoots.find((candidate) => candidate.role === role && candidate.name === entry.name);
        const returned = returnedSurfaceRoots.find((candidate) => candidate.role === role && candidate.name === entry.name);
        return !!hidden && hidden.visible === false && !!returned && returned.visible === entry.visible;
      });
    };
    const soldierRequests = streamingEvidence.soldier;
    const optionalAvatarRequests = streamingEvidence.optionalAvatar;
    const repeatedAngelRequests = streamingEvidence.repeatedAngel;
    const surfaceRootsPreserved = (() => {
      const counts = (entries) => {
        const result = new Map();
        for (const entry of entries) {
          const key = `${entry.role}\u0000${entry.name}\u0000${entry.visible}`;
          result.set(key, (result.get(key) || 0) + 1);
        }
        return result;
      };
      const initial = counts(baseline.stack.strata.surface.roots);
      const returned = counts(returnedSurfaceRoots);
      return [...initial].every(([key, count]) => (returned.get(key) || 0) >= count);
    })();

    const checks = {
      readyAndRendered: baseline.cplReady && baseline.firstFrame && baseline.backstop && baseline.firstFrameAt > 0 && baseline.renderedFrames > 0,
      canvasVisible: baseline.canvas.width > 0 && baseline.canvas.height > 0 && baseline.canvas.display !== 'none',
      canvasOnlyNonBlack: framebufferSignals.every((signal) => signal.framebuffer.peak > 5 && signal.framebuffer.nonBlackRatio > 0.01 && signal.png.peakMean > 2),
      productionComposerCaptured: framebufferSignals.every((signal) => signal.composeSucceeded === true && signal.renderPath === 'composer' && signal.renderError === null && signal.composeCountAfter === signal.composeCountBefore + 1 && signal.fallbackCountAfter === signal.fallbackCountBefore && signal.lastRenderedAt > 0),
      noRenderFallbackDuringCaptureWindow: captureRenderGraphAfter.fallbackCount === captureRenderGraphBefore.fallbackCount,
      renderPathTelemetryPresent: ['composer', 'raw-fallback', 'raw', 'failed'].includes(captureRenderGraphAfter.lastPath) && Number.isFinite(captureRenderGraphAfter.composeCount) && Number.isFinite(captureRenderGraphAfter.fallbackCount) && Number.isFinite(captureRenderGraphAfter.lastRenderedAt),
      noPageErrors: pageErrors.length === 0,
      noShaderErrors: shaderErrors.length === 0,
      noUnexpectedConsoleErrors: unexpectedConsoleErrors.length === 0,
      noUnexpectedRequestFailures: unexpectedRequestFailures.length === 0,
      portableDependencies: !!playwrightDependency.source && !!sharpDependency.source,
      heavyRoutesExplicitlyBlocked: blockedHeavyRoutes.length > 0 && ![...blockedByTestUrls].some((blockedUrl) => new URL(blockedUrl).pathname === allowedLocalGlbPath),
      oneLocalGlbAllowedAndServed: allowedLocalGlbResponses.length >= 1 && allowedLocalGlbResponses.every((response) => response.ok && response.status === 200),
      noMutableManagerDiagnostic: baseline.diagnosticsFrozen,
      ancestorAwareSimulationApi: baseline.simulationApi.available && baseline.simulationApi.ancestorSurfaceActive && baseline.simulationApi.legacyRootActive && heavenSimulationOwnership.surfaceChildActive === false && heavenSimulationOwnership.heavenChildActive === true,
      finiteCoreGridPermitted: baseline.gridTruth.coreExists && baseline.gridTruth.corePlane && Math.abs(baseline.gridTruth.corePlane.normal[1]) > 0.95 && baseline.gridTruth.corePlane.y < 0 && baseline.gridTruth.corePlane.width === 600 && baseline.gridTruth.corePlane.height === 600 && baseline.gridTruth.coreMaterialType !== 'ShaderMaterial',
      noWorldSplittingGrid: baseline.gridTruth.namedInfiniteGrid.length === 0 && baseline.gridTruth.prohibitedPlanes.length === 0,
      undersideExistsBelowSurface: baseline.underside.exists && baseline.underside.worldY < 0 && baseline.underside.childCount >= 7,
      undersideRemainsStaticSurfaceContent: baseline.underside.cost?.updateFreq === 0 && baseline.underside.cost?.sector === 'dark-city-underside',
      prototypeHeavenDirectSceneChild: baseline.prototypeHeaven.exists && baseline.prototypeHeaven.directSceneChild,
      duplicateHeavensNamedTruthfully: baseline.legacyHeavens.nestedType === 'legacy-surface-heaven' && baseline.legacyHeavens.directType === 'legacy-surface-heaven' && baseline.stack.strata.heaven.contentType === 'prototype-heaven',
      stackRegistered: baseline.stack.active === 'surface' && baseline.stack.strata.surface && baseline.stack.strata.heaven && baseline.stack.connectors.some((connector) => connector.id === 'surface-heaven'),
      completeSurfaceCompanionRoles: ['surface-sky', 'legacy-surface-heaven', 'surface-pyramid', 'surface-world-legacy'].every((role) => surfaceRoles.includes(role)),
      managerRegistered: baseline.genesis.managers.names.includes('VerticalStackManager') && baseline.genesis.managers.count >= 11,
      diagnosticsPresent: !!baseline.genesis.sectors['heaven-prototype'] && !!baseline.genesis.sectors['dark-city-underside'] && !!baseline.genesis.visibility['heaven-prototype'] && !!baseline.genesis.streaming.byTier.world,
      visibilityMetricsTruthful: baseline.genesis.visibility['heaven-prototype'].managedExternally === true && typeof baseline.genesis.visibility['heaven-prototype'].inRange === 'boolean' && typeof baseline.genesis.visibility['heaven-prototype'].inFrustum === 'boolean' && baseline.genesis.visibility['heaven-prototype'].metricKind === 'root-origin-point' && baseline.genesis.visibility['heaven-prototype'].distanceMetric === 'root-origin',
      streamingWorldTierInvoked: worldRequests.length > 0 && worldRequests.some((request) => request.invoked && request.state !== 'queued') && worldRequests.every((request) => !(request.state === 'invoked' && request.loaded)),
      localGlbReachedLoaded: soldierRequests.length === 1 && soldierRequests[0].invoked && soldierRequests[0].loaded && soldierRequests[0].state === 'loaded' && !soldierRequests[0].error,
      optionalRemoteGlbReachedError: optionalAvatarRequests.length === 1 && optionalAvatarRequests[0].invoked && !optionalAvatarRequests[0].loaded && optionalAvatarRequests[0].state === 'error' && !!optionalAvatarRequests[0].error,
      repeatedAngelRequestsRemainUnique: repeatedAngelRequests.length === 3 && new Set(repeatedAngelRequests.map((request) => request.requestId)).size === 3 && repeatedAngelRequests.every((request) => request.label === 'angel.opt.glb'),
      duplicateLabelsInvokedIndependently: duplicateStreaming.requests.length === 3 && duplicateStreaming.uniqueRequestIds === 3 && duplicateStreaming.requests.every((request) => request.invoked && request.loaded && request.state === 'loaded'),
      duplicateCallbacksAllFired: duplicateStreaming.callbacks === 3,
      duplicateMetadataPreserved: duplicateStreaming.requests.every((request) => request.label === duplicateStreaming.label && request.tier === 'world' && request.owner === 'probe-duplicate-owner') && duplicateStreaming.requests.map((request) => request.priority).sort((a, b) => a - b).join(',') === '31,32,33',
      stackApplySkipsSteadyFrames: steadyStackAfter.tickCount > steadyStackBefore.tickCount && steadyStackAfter.idleTickCount > steadyStackBefore.idleTickCount && steadyStackAfter.applyCount === steadyStackBefore.applyCount && steadyStackAfter.applyPolicy === 'state-or-refresh-only',
      baselineVisible: Object.values(baseline.baselineVisible).every(Boolean),
      chamberPortalRingLifecycle: lifecycleForRole('surface-chamber-portal-ring', 1),
      godWorldLifecycle: lifecycleForRole('surface-god-world', 4),
      dockingRingLifecycle: lifecycleForRole('surface-docking-ring', 2),
      dockingBeaconLifecycle: lifecycleForRole('surface-docking-beacon', 6),
      portalCaretakerLifecycle: lifecycleForRole('surface-portal-caretaker', 1),
      thoughtStreamLifecycle: lifecycleForRole('surface-thought-stream', 1),
      realmPortalLifecycle: lifecycleForRole('surface-realm-portal', 3),
      hubAtmosphereLifecycle: lifecycleForRole('surface-hub-atmosphere', 1),
      gskLateRootLifecycle: lifecycleForRole('surface-gsk-body', 1) && lifecycleForRole('surface-gsk-memory', 1) && lifecycleForRole('surface-gsk-subagents', 1),
      lateRootsNamedTruthfully: baseline.stack.strata.surface.roots.filter((entry) => entry.role.startsWith('surface-') && ['surface-chamber-portal-ring','surface-god-world','surface-docking-ring','surface-docking-beacon','surface-portal-caretaker','surface-thought-stream','surface-realm-portal','surface-hub-atmosphere'].includes(entry.role)).every((entry) => entry.name.startsWith('Surface ')),
      surfaceInitiallyMoves: moved(surfaceActorsStart.car, surfaceActorsEnd.car),
      surfaceSystemsInitiallyRun: availableTickKeys.length > 0 && ticksAdvanced(surfaceSystemsStart, surfaceSystemsEnd, availableTickKeys),
      unavailableSurfaceCountersStayTruthful: unavailableTickKeys.every((key) => Number(surfaceSystemsStart.ticks[key] || 0) === Number(surfaceSystemsEnd.ticks[key] || 0)),
      phase0SurfaceSystemsAdvance: ticksAdvanced(surfaceSystemsStart, surfaceSystemsEnd, phase0SurfaceTickKeys),
      surfaceMixersTickOnlyInScheduler: surfaceDiagnostics.mixers.registered > 0 && surfaceDiagnostics.mixers.activeThisTick > 0 && (surfaceDiagnostics.mixers.byStratum.surface?.active || 0) > 0,
      mixerDoubleTickPrevented: mixerDoubleTickGuard.first === true && mixerDoubleTickGuard.second === false && mixerDoubleTickGuard.updates === 1 && mixerDoubleTickGuard.secondUpdateDelta === 0 && mixerDoubleTickGuard.doubleTickSkipDelta >= 1,
      representativeSurfaceValuesInitiallyMove: scalarMoved(surfaceSystemsStart.billboardSweepY, surfaceSystemsEnd.billboardSweepY) && scalarMoved(surfaceSystemsStart.legacyDirectHeavenCrownRotation, surfaceSystemsEnd.legacyDirectHeavenCrownRotation) && scalarMoved(surfaceSystemsStart.skyCloudY, surfaceSystemsEnd.skyCloudY),
      connectorProximityRejectsFarPlayer: farConnectorRejected === false && baseline.stack.active === 'surface',
      destinationPrewarmed: prewarm.transitioning && prewarm.active === 'surface' && prewarm.sourceVisible && prewarm.destinationState === 'LOADED' && prewarm.destinationVisible,
      destinationVisibleBeforeTransfer: heavenState.summary.lastTransition?.destinationVisibleBeforeTransfer === true,
      heavenPlayerState: heavenState.summary.active === 'heaven' && heavenState.player.floorY > 600 && heavenState.player.cameraTarget[1] > 600 && heavenState.player.grounded && !heavenState.player.flying && Math.abs(heavenState.player.verticalVelocity) < 0.001,
      allSurfaceRootsHiddenInHeaven: hiddenSurfaceRoots.length >= 10 && hiddenSurfaceRoots.every((rootEntry) => rootEntry.visible === false),
      legacyHeavensHiddenInHeaven: hiddenSurfaceRoots.filter((rootEntry) => rootEntry.role === 'legacy-surface-heaven').length >= 1 && hiddenSurfaceRoots.filter((rootEntry) => rootEntry.role === 'legacy-surface-heaven').every((rootEntry) => rootEntry.visible === false),
      surfaceSimulationSleeps: stopped(sleepingActorsStart.car, sleepingActorsEnd.car) && stopped(sleepingActorsStart.citizen, sleepingActorsEnd.citizen) && ticksStopped(sleepingSystemsStart, sleepingSystemsEnd, tickKeys),
      allPhase0SurfaceSystemsSleep: ticksStopped(sleepingSystemsStart, sleepingSystemsEnd, phase0SurfaceTickKeys),
      heavenSystemsAdvanceInHeaven: ticksAdvanced(heavenSystemsStart, heavenSystemsEnd, ['prototype']) && scalarMoved(heavenSystemsStart.ringRotation, heavenSystemsEnd.ringRotation) && scalarMoved(heavenSystemsStart.beaconRotation, heavenSystemsEnd.beaconRotation),
      surfaceMixersZeroActiveInHeaven: heavenDiagnostics.mixers.registered > 0 && heavenDiagnostics.mixers.activeThisTick === 0 && (heavenDiagnostics.mixers.byStratum.surface?.active || 0) === 0 && (heavenDiagnostics.mixers.byStratum.surface?.sleeping || 0) > 0,
      sectorAndVisibilityCannotWakeVerticalSleep: verticalWakeGuard.wakeResult === false && verticalWakeGuard.visible === false && verticalWakeGuard.sector.state === 'asleep' && verticalWakeGuard.sector.simulationActive === false,
      representativeSurfaceValuesSleep: scalarStopped(sleepingSystemsStart.billboardSweepY, sleepingSystemsEnd.billboardSweepY) && scalarStopped(sleepingSystemsStart.legacyDirectHeavenCrownRotation, sleepingSystemsEnd.legacyDirectHeavenCrownRotation) && scalarStopped(sleepingSystemsStart.skyCloudY, sleepingSystemsEnd.skyCloudY),
      videosPausedInHeaven: sleepingSystemsEnd.activeVideos === 0,
      hiddenSurfacePortalRejected: heavenState.interaction.surfacePortalVisible === false && heavenState.interaction.surfacePortalEligible === false && hiddenPortalAttempt.accepted === false && hiddenPortalAttempt.inside === false,
      hiddenPortalPreservesHeavenFloor: hiddenPortalAttempt.floorY > 600 && heavenAfterSafety.player.floorY > 600 && heavenAfterSafety.interaction.activeStratum === 'heaven',
      heavenMovementConfined: boundaryAttempt.applied && boundaryAttempt.radius <= 42.001 && boundaryAttempt.floorY > 600 && heavenAfterSafety.player.position[1] > 600,
      heavenBeaconCollision: beaconCollisionAttempt.applied && beaconCollisionAttempt.beaconDistance >= 5.599 && beaconCollisionAttempt.floorY > 600,
      heavenObstacleContractComplete: heavenMovementContract.obstacles.supports === 2 && heavenMovementContract.obstacles.towers === 28 && heavenMovementContract.obstacles.beacons === 1 && heavenMovementContract.obstacles.total === 31 && heavenMovementContract.elevatedPlazas === 'visual-only-no-walkable-collision',
      heavenSupportCollisionPushesOut: supportCollisionAttempt.applied && supportCollisionAttempt.category === 'support' && supportCollisionAttempt.pushedOut && supportCollisionAttempt.floorY > 600,
      heavenTowerCollisionPushesOut: towerCollisionAttempt.applied && towerCollisionAttempt.category === 'tower' && towerCollisionAttempt.pushedOut && towerCollisionAttempt.floorY > 600,
      sectorSleepsOutOfRange: heavenState.engine.sectors['city-outer'].state === 'asleep' && heavenState.engine.visibility['city-outer'].inRange === false,
      sectorWakesFromInvisible: returnedState.engine.sectors['city-outer'].state === 'active' && returnedState.engine.visibility['city-outer'].inRange === true && returnedState.engine.visibility['city-outer'].visible === true,
      surfaceSimulationResumes: moved(returnedActorsStart.car, returnedActorsEnd.car) && ticksAdvanced(returnedSystemsStart, returnedSystemsEnd, availableTickKeys),
      phase0SurfaceSystemsResume: ticksAdvanced(returnedSystemsStart, returnedSystemsEnd, phase0SurfaceTickKeys),
      heavenSystemsStopOnSurfaceReturn: ticksStopped(returnedHeavenStart, returnedHeavenEnd, ['prototype']) && scalarStopped(returnedHeavenStart.ringRotation, returnedHeavenEnd.ringRotation) && scalarStopped(returnedHeavenStart.beaconRotation, returnedHeavenEnd.beaconRotation),
      surfaceMixersResumeThroughScheduler: returnedDiagnostics.mixers.activeThisTick > 0 && (returnedDiagnostics.mixers.byStratum.surface?.active || 0) > 0,
      diagnosticsStateMachineTruthful: surfaceDiagnostics.activeStratum === 'surface' && heavenDiagnostics.activeStratum === 'heaven' && returnedDiagnostics.activeStratum === 'surface' && surfaceDiagnostics.activeSectors.length > 0 && heavenDiagnostics.activeSectors.includes('heaven-prototype') && returnedDiagnostics.activeSectors.length > 0,
      diagnosticsMetricsPresent: [surfaceDiagnostics, heavenDiagnostics, returnedDiagnostics].every((d) => Number.isFinite(d.drawCalls) && Number.isFinite(d.triangles) && Number.isFinite(d.pointLights.active) && Number.isFinite(d.pointLights.registered) && Number.isFinite(d.videos.active) && Number.isFinite(d.videos.registered) && Number.isFinite(d.mixers.activeThisTick) && Number.isFinite(d.mixers.registered) && Number.isFinite(d.mixers.pausedThisTick) && Number.isFinite(d.particles.active) && Number.isFinite(d.particles.registered) && Number.isFinite(d.textures) && Number.isFinite(d.frameTimeMs) && Object.prototype.hasOwnProperty.call(d, 'gpuTimeMs') && typeof d.rendererPath === 'string'),
      particleDiagnosticsUseRuntimeEvidence: [surfaceParticleEvidence, heavenParticleEvidence, returnedParticleEvidence].every(particleEvidenceTruthful),
      particleDiagnosticsSleepWithStratum: surfaceDiagnostics.particles.active > heavenDiagnostics.particles.active && returnedDiagnostics.particles.active > heavenDiagnostics.particles.active && (heavenDiagnostics.particles.byStratum.surface?.active || 0) === 0 && ((heavenDiagnostics.particles.byStratum.surface?.registered || 0) !== heavenDiagnostics.particles.registered || heavenDiagnostics.particles.active === 0),
      diagnosticsPanelPinnedAndToggleable: diagnosticsPanelProof.exists && diagnosticsPanelProof.shown && diagnosticsPanelProof.pinned && diagnosticsPanelProof.beforeExpanded && diagnosticsPanelProof.afterToggle !== diagnosticsPanelProof.beforeExpanded && diagnosticsPanelProof.restored === diagnosticsPanelProof.beforeExpanded && diagnosticsPanelProof.textOnly && diagnosticsPanelProof.diagnosticsFrozen && Object.values(diagnosticsPanelProof.labels).every(Boolean),
      drawCallsChangeAcrossStrata: surfaceDiagnostics.drawCalls > 0 && heavenDiagnostics.drawCalls > 0 && surfaceDiagnostics.drawCalls !== heavenDiagnostics.drawCalls,
      diagnosticsRendererPathProven: [surfaceDiagnostics, heavenDiagnostics, returnedDiagnostics].every((d) => d.rendererPath === 'composer'),
      representativeSurfaceValuesResume: scalarMoved(returnedSystemsStart.billboardSweepY, returnedSystemsEnd.billboardSweepY) && scalarMoved(returnedSystemsStart.legacyDirectHeavenCrownRotation, returnedSystemsEnd.legacyDirectHeavenCrownRotation) && scalarMoved(returnedSystemsStart.skyCloudY, returnedSystemsEnd.skyCloudY),
      surfaceRootsResume: surfaceRootsPreserved,
      returnedSafelyThroughConnector: returnedState.summary.active === 'surface' && returnedState.player.floorY < 1 && returnedState.player.cameraTarget[1] < 4 && returnedState.player.grounded && !returnedState.player.flying
    };

    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    const screenshots = framebufferSignals.map((signal) => signal.path);
    const result = {
      checkCount: Object.keys(checks).length,
      passedCount: Object.values(checks).filter(Boolean).length,
      checks,
      canvasOnlySignals: Object.fromEntries(['surface', 'underside', 'prewarm', 'heaven', 'returned'].map((name, index) => [name, { composeSucceeded: framebufferSignals[index].composeSucceeded, renderPath: framebufferSignals[index].renderPath, renderError: framebufferSignals[index].renderError, composeCountBefore: framebufferSignals[index].composeCountBefore, composeCountAfter: framebufferSignals[index].composeCountAfter, fallbackCountBefore: framebufferSignals[index].fallbackCountBefore, fallbackCountAfter: framebufferSignals[index].fallbackCountAfter, lastRenderedAt: framebufferSignals[index].lastRenderedAt, png: framebufferSignals[index].png, framebuffer: framebufferSignals[index].framebuffer }])),
      screenshots,
      dependencies: { playwright: playwrightDependency.source, sharp: sharpDependency.source, browser: browserLaunch },
      blockedHeavyRoutes: { count: blockedHeavyRoutes.length, policy: `Only ${allowedLocalGlbPath} is allowed locally; every other local GLB/MP4/WebM and the known optional ReadyPlayerMe avatar are blocked by this probe.` },
      renderPathEvidence: { beforeCaptures: captureRenderGraphBefore, afterCaptures: captureRenderGraphAfter },
      streamingEvidence: { duplicateStreaming, lifecycle: streamingEvidence, allowedLocalGlbResponses },
      pageErrors,
      shaderErrors,
      expectedConsoleErrors,
      unexpectedConsoleErrors,
      unexpectedRequestFailures
    };
    if (failed.length) Object.assign(result, { failed, baseline, prewarm, heavenState, hiddenPortalAttempt, boundaryAttempt, beaconCollisionAttempt, supportCollisionAttempt, towerCollisionAttempt, heavenMovementContract, steadyStackBefore, steadyStackAfter, returnedState });
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
