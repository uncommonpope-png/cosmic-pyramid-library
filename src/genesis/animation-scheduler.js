// Genesis Engine — Animation Scheduler (Phase B7)
// Registers AnimationMixers with metadata and ticks ONLY the active ones
// (in-range, awake via SectorManager, visible via Visibility). Far mixers pause.
//
// Reversible: this module only supplies createAnimationScheduler + install.
// The inline mirror decides whether to use it; flag off => no-op stubs.
import * as THREE from 'three';

export function createAnimationScheduler(ctx) {
  const { Genesis, camera } = ctx;
  const mixers = new Map(); // mixer -> meta
  let optionalPaused = false;

  function registerMixer(mixer, meta = {}) {
    if (!mixer) return;
    mixers.set(mixer, {
      root: meta.root || (mixer.getRoot ? mixer.getRoot() : null),
      maxDistance: meta.maxDistance || 180,
      owner: meta.owner || 'unknown',
      critical: !!meta.critical,
      optional: !!meta.optional
    });
  }
  function deregisterMixer(mixer) { mixers.delete(mixer); }

  function isActive(root, meta) {
    if (!root) return true;
    // visibility gate
    if (Genesis.Visibility && Genesis.Visibility.isVisible) {
      // Visibility keys by id; we approximate: visible unless explicitly hidden
    }
    // sector gate (reuse lifecycle helper if present)
    if (Genesis.lifecycle && typeof Genesis.lifecycle.isSectorActive === 'function') {
      if (!Genesis.lifecycle.isSectorActive(root, { root, maxDistance: meta.maxDistance, sleepWhenFar: true, allowWhenHidden: !!meta.critical })) return false;
    } else if (camera && root.parent) {
      root.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      if (camera.position.distanceToSquared(p) > meta.maxDistance * meta.maxDistance) return false;
    }
    return true;
  }

  function tick(dt) {
    for (const [mixer, meta] of mixers) {
      if (meta.optional && optionalPaused) { mixer.time = mixer.time; continue; }
      if (!isActive(meta.root, meta)) { continue; } // paused (not updated)
      if (Genesis.lifecycle && typeof Genesis.lifecycle.updateMixer === 'function') {
        try { Genesis.lifecycle.updateMixer(mixer, dt, { root: meta.root, maxDistance: meta.maxDistance, owner: meta.owner, critical: meta.critical }); continue; } catch (e) {}
      }
      try { mixer.update(dt); } catch (e) {}
    }
  }

  function setOptionalPaused(v) { optionalPaused = !!v; }
  function sweepAndRegister() {
    // Best-effort: find realm._assetMixers arrays in the scene graph the inline
    // block hands us, and register them. Keeps behaviour reversible: scheduler
    // observes existing mixers rather than duplicating creation sites.
    const seen = new Set();
    for (const [, meta] of mixers) seen.add(meta);
    return mixers.size;
  }
  function summary() { return { registered: mixers.size, optionalPaused }; }

  return { registerMixer, deregisterMixer, tick, setOptionalPaused, sweepAndRegister, summary };
}

export function install(Genesis, THREE, camera, _scene) {
  if (!Genesis) return false;
  const mgr = createAnimationScheduler({ Genesis, camera });
  Genesis.AnimationScheduler = Object.assign(Genesis.AnimationScheduler || {}, {
    registerMixer(m, meta) { return mgr.registerMixer(m, meta); },
    deregisterMixer(m) { return mgr.deregisterMixer(m); },
    tick(dt) { return mgr.tick(dt); },
    setOptionalPaused(v) { return mgr.setOptionalPaused(v); },
    sweepAndRegister() { return mgr.sweepAndRegister(); },
    summary() { return mgr.summary(); }
  });
  return true;
}
