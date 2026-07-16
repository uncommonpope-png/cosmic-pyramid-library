// Genesis Engine — Render Graph (Phase B3)
// Owns the post-processing composition as a first-class, governor-adjustable pass.
// addPass(pass, meta), setResolutionScale(scale) (clamped), compose() (mirrors
// effectComposer.render() unless overridden), tick().
//
// Reversible: supplies createRenderGraph + install only. Inline decides use.
import * as THREE from 'three';

export function createRenderGraph(ctx) {
  const { renderer, effectComposer, basePixelRatio } = ctx;
  const passes = new Map();
  let resolutionScale = 1.0;
  const baseDPR = (typeof basePixelRatio === 'number' && basePixelRatio > 0) ? basePixelRatio : 1;
  const MIN_SCALE = 0.5, MAX_SCALE = 1.0;

  function addPass(pass, meta = {}) {
    if (!pass) return;
    passes.set(pass, { owner: meta.owner || 'unknown', optional: !!meta.optional });
    if (effectComposer && typeof effectComposer.addPass === 'function') {
      try { effectComposer.addPass(pass); } catch (e) {}
    }
  }
  function setResolutionScale(scale) {
    resolutionScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    const dpr = Math.max(0.5, Math.min(2, baseDPR * resolutionScale));
    try {
      renderer.setPixelRatio(dpr);
      if (effectComposer && typeof effectComposer.setPixelRatio === 'function') effectComposer.setPixelRatio(dpr);
      if (effectComposer && typeof effectComposer.setSize === 'function') effectComposer.setSize(window.innerWidth, window.innerHeight);
    } catch (e) {}
    return dpr;
  }
  function compose() {
    if (effectComposer && typeof effectComposer.render === 'function') { try { effectComposer.render(); return true; } catch (e) {} }
    try { renderer.render(renderer.__genesisScene || (renderer.info && null), renderer.__genesisCamera || null); } catch (e) {}
    return false;
  }
  function tick() {}
  function summary() { return { passes: passes.size, resolutionScale, baseDPR }; }
  return { addPass, setResolutionScale, compose, tick, summary, getResolutionScale: () => resolutionScale };
}

export function install(Genesis, THREE, renderer, _camera, _scene, effectComposer, basePixelRatio) {
  if (!Genesis) return false;
  const mgr = createRenderGraph({ renderer, effectComposer, basePixelRatio });
  Genesis.RenderGraph = Object.assign(Genesis.RenderGraph || {}, {
    addPass(p, meta) { return mgr.addPass(p, meta); },
    setResolutionScale(s) { return mgr.setResolutionScale(s); },
    compose() { return mgr.compose(); },
    tick() { return mgr.tick(); },
    getResolutionScale() { return mgr.getResolutionScale(); },
    summary() { return mgr.summary(); }
  });
  return true;
}
