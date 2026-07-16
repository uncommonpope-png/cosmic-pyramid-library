// Genesis Engine — Streaming Manager (Phase B2)
// Adds explicit load/unload lifecycle on top of the existing lazy-asset queue.
// Assets are loaded once (tracked via ResourceManager), and can be unloaded when
// their sector is exited (MemoryManager.deepDispose + ResourceManager.dispose).
//
// Reversible: supplies createStreamingManager + install only. Inline decides use.
import * as THREE from 'three';

export function createStreamingManager(ctx) {
  const { Genesis } = ctx;
  const assets = new Map(); // key -> { loaderFn, meta, loaded, object }
  const MemoryManager = (Genesis && Genesis.MemoryManager) || null;
  const ResourceManager = (Genesis && Genesis.ResourceManager) || null;

  function register(assetKey, loaderFn, meta = {}) {
    if (!assetKey || typeof loaderFn !== 'function') return;
    if (assets.has(assetKey) && meta.loadOnce !== false) return;
    assets.set(assetKey, { loaderFn, meta, loaded: false, object: null });
  }

  function ensureLoaded(key) {
    const a = assets.get(key);
    if (!a) return null;
    if (a.loaded) return a.object;
    const obj = a.loaderFn();
    a.loaded = true;
    a.object = obj || null;
    if (obj && ResourceManager && typeof ResourceManager.track === 'function' && obj.userData) {
      ResourceManager.track(obj, a.meta.owner || key, obj);
    }
    return obj;
  }

  function unload(key) {
    const a = assets.get(key);
    if (!a || !a.loaded) return false;
    if (a.object && MemoryManager && typeof MemoryManager.deepDispose === 'function') {
      try { MemoryManager.deepDispose(a.object, a.meta.owner || key); } catch (e) {}
    } else if (a.object && ResourceManager && typeof ResourceManager.dispose === 'function') {
      try { ResourceManager.dispose(a.meta.owner || key); } catch (e) {}
    }
    a.loaded = false;
    a.object = null;
    return true;
  }

  // Lazy unload of assets whose sector is no longer awake.
  function tick() {
    for (const [key, a] of assets) {
      if (!a.loaded) continue;
      const sectorId = a.meta.sector;
      if (sectorId && Genesis.SectorManager && typeof Genesis.SectorManager.isAwake === 'function') {
        if (!Genesis.SectorManager.isAwake(sectorId)) { try { unload(key); } catch (e) {} }
      }
    }
  }

  function summary() {
    const byTier = {};
    const requests = {};
    let loaded = 0;
    for (const [key, asset] of assets) {
      if (asset.loaded) loaded++;
      const tier = asset.meta.tier || 'decor';
      byTier[tier] = (byTier[tier] || 0) + 1;
      requests[key] = { loaded: asset.loaded, tier, priority: asset.meta.priority || 0, sector: asset.meta.sector || null };
    }
    return { registered: assets.size, loaded, byTier, requests };
  }

  return { register, ensureLoaded, unload, tick, summary };
}

export function install(Genesis, THREE, _camera, _scene) {
  if (!Genesis) return false;
  const mgr = createStreamingManager({ Genesis });
  Genesis.StreamingManager = Object.assign(Genesis.StreamingManager || {}, {
    register(k, fn, meta) { return mgr.register(k, fn, meta); },
    ensureLoaded(k) { return mgr.ensureLoaded(k); },
    unload(k) { return mgr.unload(k); },
    tick() { return mgr.tick(); },
    summary() { return mgr.summary(); }
  });
  return true;
}
