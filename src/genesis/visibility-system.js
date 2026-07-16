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
  const _position = new THREE.Vector3();

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
    entries.set(id, {
      root,
      priority: (opts.priority != null) ? opts.priority : 5,
      maxDistance: opts.maxDistance || 260,
      stateOwned: !!opts.stateOwned,
      owner: opts.owner || null,
      visible: true,
      inRange: true,
      inFrustum: true
    });
  }

  function isVisible(id) { const e = entries.get(id); return !!e && e.visible; }

  function wakeOrder() {
    return [...entries.entries()].sort((a, b) => b[1].priority - a[1].priority).map(([id]) => id);
  }

  function tick() {
    for (const [id, e] of entries) {
      const stateOwned = e.stateOwned || !!(e.root.userData && e.root.userData.__genesisVisibilityOwner);
      if (stateOwned) {
        e.inRange = true;
        e.inFrustum = true;
        e.visible = e.root.visible !== false;
        continue;
      }
      // sleep:'never' objects always visible
      let never = false;
      e.root.traverse((o) => { if (o.userData && o.userData.cost && o.userData.cost.sleep === 'never') never = true; });
      if (never) { e.inRange = true; e.inFrustum = true; e.visible = true; if (e.root.visible === false) e.root.visible = true; continue; }
      e.root.updateWorldMatrix(true, false);
      _position.setFromMatrixPosition(e.root.matrixWorld);
      e.inRange = !camera || camera.position.distanceToSquared(_position) <= e.maxDistance * e.maxDistance;
      e.inFrustum = e.inRange && _inFrustum(e.root);
      const inView = e.inRange && e.inFrustum;
      const wasVisible = e.visible;
      e.visible = inView;
      if (e.root.visible !== inView) e.root.visible = inView; // cheap hide/show
      // delegate sleep to Sector Manager when leaving range
      if (SectorManager && typeof SectorManager.tick === 'function') { /* SectorManager.tick handles distance sleep */ }
      if (!inView && wasVisible && typeof console !== 'undefined') { /* no-op: hidden silently */ }
    }
  }

  function summary() {
    const out = {};
    for (const [id, e] of entries) out[id] = {
      visible: e.visible,
      inRange: e.inRange,
      inFrustum: e.inFrustum,
      maxDistance: e.maxDistance,
      priority: e.priority,
      stateOwned: e.stateOwned || !!(e.root.userData && e.root.userData.__genesisVisibilityOwner),
      owner: e.owner
    };
    return out;
  }

  return { register, isVisible, wakeOrder, tick, summary, _entries: entries };
}

export function install(Genesis, THREE, camera, SectorManager) {
  if (!Genesis) return null;
  const mgr = createVisibilitySystem(THREE, camera, SectorManager);
  Genesis.Visibility = mgr;
  return mgr;
}
