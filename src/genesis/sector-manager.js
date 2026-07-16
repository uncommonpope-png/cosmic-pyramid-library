// GENESIS ENGINE — Sector Manager (manager #4)
// Partitions the world into named sectors; governs enter→active→sleep→dispose.
// Reads userData.cost.sleep + userData.cost.priority from the Cost Contract (Phase A).
// Loaded via flag-gated dynamic import(): import('./src/genesis/sector-manager.js').then(m=>m.install(window.Genesis, THREE, camera))

import * as THREE from 'three';

const SLEEP_PURGE_MS = 20000; // asleep longer than this => eligible for disposal

export function createSectorManager(THREE, camera, ResourceManager) {
  const sectors = new Map(); // id -> { root, maxDistance, autoSleep, state, lastAwakeAt, asleepFor }

  function _isActive(root, maxDistance) {
    if (!root) return true;
    if (root.visible === false) return false;
    if (!root.parent) return false;
    if (!camera) return true;
    root.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
    const d = camera.position.distanceToSquared(p);
    return d <= maxDistance * maxDistance;
  }

  function register(id, root, opts = {}) {
    sectors.set(id, {
      root, maxDistance: opts.maxDistance || 220, autoSleep: opts.autoSleep !== false,
      state: 'active', lastAwakeAt: performance.now(), asleepFor: 0
    });
  }

  function _sleepCost(root) {
    let mode = 'distance';
    root.traverse((o) => { if (o.userData && o.userData.cost && o.userData.cost.sleep) mode = o.userData.cost.sleep; });
    return mode;
  }

  function sleep(id) {
    const s = sectors.get(id); if (!s) return;
    s.root.visible = false;
    s.state = 'asleep';
    s.lastAsleepAt = performance.now();
  }

  function wake(id) {
    const s = sectors.get(id); if (!s) return;
    s.root.visible = true;
    s.state = 'active';
    s.lastAwakeAt = performance.now();
    s.asleepFor = 0;
  }

  function tick() {
    const now = performance.now();
    for (const [id, s] of sectors) {
      if (!s.autoSleep) continue;
      const active = _isActive(s.root, s.maxDistance);
      const costMode = _sleepCost(s.root);
      if (active) {
        if (s.state !== 'active') wake(id);
        if (ResourceManager && s.disposed) { s.disposed = false; } // would re-track on rebuild
      } else {
        if (s.state === 'active') sleep(id);
        // eligibility for disposal: asleep + far + not 'never'
        if (costMode !== 'never' && ResourceManager) {
          s.asleepFor = now - (s.lastAsleepAt || now);
          if (s.asleepFor > SLEEP_PURGE_MS && !s.disposed) {
            ResourceManager.dispose(id);
            s.disposed = true;
          }
        }
      }
    }
  }

  function isAwake(id) { const s = sectors.get(id); return !!s && s.state === 'active'; }

  function summary() {
    const out = {};
    for (const [id, s] of sectors) out[id] = { state: s.state, maxDistance: s.maxDistance, disposed: !!s.disposed };
    return out;
  }

  return { register, sleep, wake, tick, isAwake, summary, _sectors: sectors };
}

export function install(Genesis, THREE, camera, ResourceManager) {
  if (!Genesis) return null;
  const mgr = createSectorManager(THREE, camera, ResourceManager);
  Genesis.SectorManager = mgr;
  return mgr;
}
