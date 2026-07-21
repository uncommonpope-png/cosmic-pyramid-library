// GENESIS ENGINE — Asset LOD Streamer (P104 bridge)
// Registers manifest assets with StreamingManager without eager-loading them.

export function install(Genesis, options = {}) {
  if (!Genesis || !Genesis.AssetCatalog || !Genesis.StreamingManager || !Genesis.AssetPipeline) return null;
  const catalog = Genesis.AssetCatalog.manifest;
  const assets = Array.isArray(catalog.assets) ? catalog.assets : [];
  const registered = new Set();
  const allowTypes = new Set(options.types || ['model']);

  function registerCatalog(filter = {}) {
    let count = 0;
    for (const asset of assets) {
      if (!asset || !asset.id || registered.has(asset.id)) continue;
      if (allowTypes.size && !allowTypes.has(asset.type)) continue;
      if (filter.tier && asset.tier !== filter.tier) continue;
      if (filter.owner && asset.owner !== filter.owner) continue;
      const ok = Genesis.StreamingManager.register(asset.id, () => new Promise((resolve, reject) => {
        try { Genesis.AssetPipeline.load(asset.id, resolve, reject); }
        catch (e) { reject(e); }
      }), {
        owner: asset.owner || asset.id,
        sector: asset.sector || 'shared',
        tier: asset.tier || 'decor',
        priority: asset.cost && asset.cost.priority ? asset.cost.priority : 1,
        lod: asset.lod || 'base',
        label: asset.path || asset.id,
        loadOnce: true
      });
      if (ok) { registered.add(asset.id); count++; }
    }
    return count;
  }

  function loadById(id) {
    if (!registered.has(id)) registerCatalog({});
    return Genesis.StreamingManager.ensureLoaded(id);
  }

  function summary() {
    const byTier = {};
    const byLod = {};
    for (const id of registered) {
      const asset = Genesis.AssetCatalog.byId && Genesis.AssetCatalog.byId.get ? Genesis.AssetCatalog.byId.get(id) : assets.find((a) => a.id === id);
      if (!asset) continue;
      byTier[asset.tier || 'decor'] = (byTier[asset.tier || 'decor'] || 0) + 1;
      byLod[asset.lod || 'base'] = (byLod[asset.lod || 'base'] || 0) + 1;
    }
    return { registered: registered.size, byTier, byLod };
  }

  const api = { registerCatalog, loadById, summary };
  Genesis.AssetLODStreamer = api;
  return api;
}

export default { install };
