// GENESIS ENGINE — Visibility System (manager #6)
// Frustum + distance + priority decisions for what is allowed to be seen/updated each frame.
// Reads userData.cost (priority, sector, sleep) from the Cost Contract (Phase A).
// Loaded via flag-gated dynamic import(): import('./src/genesis/visibility-system.js').then(m=>m.install(window.Genesis, THREE, camera))

import * as THREE from 'three';

export function createVisibilitySystem(THREE, camera, SectorManager) {
  const entries = new Map(); // id -> { root, priority, maxDistance, visible }
  const _frustum = new THREE.Frustum();
  const _projScreen = new THREE.Matrix4();
  const _box = new THREE.Box3();
  const _sphere = new THREE.Sphere();

  function _inFrustum(root) {
    if (!camera) return true;
    root.updateWorldMatrix(true, false);
    _box.setFromObject(root);
    if (_box.isEmpty()) return true;
    _box.getBoundingSphere(_sphere);
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    return _frustum.intersectsSphere(_sphere);
  }

  function register(id, root, opts = {}) {
    entries.set(id, { root, priority: (opts.priority != null) ? opts.priority : 5, maxDistance: opts.maxDistance || 260, visible: true });
  }

  function isVisible(id) { const e = entries.get(id); return !!e && e.visible; }

  function wakeOrder() {
    return [...entries.entries()].sort((a, b) => b[1].priority - a[1].priority).map(([id]) => id);
  }

  function tick() {
    for (const [id, e] of entries) {
      // sleep:'never' objects always visible
      let never = false;
      e.root.traverse((o) => { if (o.userData && o.userData.cost && o.userData.cost.sleep === 'never') never = true; });
      if (never) { e.visible = true; if (e.root.visible === false) e.root.visible = true; continue; }
      const inView = _inFrustum(e.root);
      const wasVisible = e.visible;
      e.visible = inView;
      if (e.root.visible !== inView) e.root.visible = inView; // cheap hide/show
      // delegate sleep to Sector Manager when leaving range
      if (SectorManager && typeof SectorManager.tick === 'function') { /* SectorManager.tick handles distance sleep */ }
      if (!inView && wasVisible && typeof console !== 'undefined') { /* no-op: hidden silently */ }
    }
  }

  return { register, isVisible, wakeOrder, tick, _entries: entries };
}

export function install(Genesis, THREE, camera, SectorManager) {
  if (!Genesis) return null;
  const mgr = createVisibilitySystem(THREE, camera, SectorManager);
  Genesis.Visibility = mgr;
  return mgr;
}
