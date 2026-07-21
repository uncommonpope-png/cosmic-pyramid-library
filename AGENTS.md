# Genesis/CPL Agent Law

## Read First
This repo is the live static CPL world. Three.js is the renderer; Genesis is the engine/control layer.

## Build Law
1. **Deploy = push.** GitHub Pages serves the pushed branch. Do not treat local server output as truth.
2. **No persistent local servers. No Playwright on Craig's PC.** Use syntax checks and one-shot scripts only.
3. **Boot readiness contract:** `window.Genesis.bootReady` Promise, `window.__GENESIS_BOOT_READY`, and `genesis:boot-ready` event are the only readiness gates.
4. **Every new system is flag-gated.** Default can be on, but `window.__GENESIS_* = false` must no-op safely.
5. **Every asset path goes through the catalog when possible:** `asset_manifest.json` → `Genesis.AssetCatalog` → `Genesis.AssetPipeline` / `Genesis.StreamingManager`.
6. **Never delete assets from P105 audit alone.** `asset_reference_audit.json` is evidence, not permission.

## Verification
- Local allowed: `node --check` on touched JS and extracted module body.
- Live allowed: `node scripts/verify-live-url.cjs` (one-shot HTTP fetch, exits).
- Forbidden: long-running local `http-server`, `vite dev`, background node listeners, Playwright browser runs unless Craig explicitly authorizes.
