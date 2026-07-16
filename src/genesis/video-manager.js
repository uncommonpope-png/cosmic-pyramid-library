// Genesis Engine — Video Manager (Phase B9)
// Governs billboard videos: registers each (videoEl, plane, meta), counts active
// playbacks, and can pause videos beyond a cap to protect the frame budget.
//
// Reversible: supplies createVideoManager + install only. Inline decides use.
import * as THREE from 'three';

export function createVideoManager(ctx) {
  const { Genesis } = ctx;
  const entries = new Map(); // videoEl -> { plane, meta, active }
  let activeCount = 0;

  function register(videoEl, plane, meta = {}) {
    if (!videoEl) return;
    entries.set(videoEl, { plane, meta, active: true });
    activeCount = entries.size;
  }
  function unregister(videoEl) { if (entries.delete(videoEl)) activeCount = entries.size; }

  function count() { return entries.size; }

  // Pause videos beyond maxActive (keep first maxActive registered; pause rest).
  function capCheck(maxActive) {
    const cap = (typeof maxActive === 'number') ? maxActive : 4;
    const list = [...entries.entries()];
    let paused = 0;
    for (let i = cap; i < list.length; i++) {
      const [v, rec] = list[i];
      if (rec.active) { try { v.pause(); } catch (e) {} if (rec.plane) rec.plane.visible = false; rec.active = false; paused++; }
    }
    return paused;
  }

  function tick() {
    // cheap bookkeeping; cap enforced on demand by Governor
  }

  function summary() { return { registered: entries.size, active: activeCount }; }

  return { register, unregister, activeCount: count, capCheck, tick, summary };
}

export function install(Genesis, THREE, _camera, _scene) {
  if (!Genesis) return false;
  const mgr = createVideoManager({ Genesis });
  Genesis.VideoManager = Object.assign(Genesis.VideoManager || {}, {
    register(v, p, meta) { return mgr.register(v, p, meta); },
    unregister(v) { return mgr.unregister(v); },
    activeCount() { return mgr.count(); },
    capCheck(max) { return mgr.capCheck(max); },
    tick() { return mgr.tick(); },
    summary() { return mgr.summary(); }
  });
  return true;
}
