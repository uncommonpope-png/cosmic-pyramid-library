// GENESIS ENGINE — Asset Catalog Loader (P103)
// Loads asset_manifest.json and registers every asset with Genesis.AssetPipeline.

export async function loadCatalog(Genesis, url = './asset_manifest.json') {
  if (!Genesis || !Genesis.AssetPipeline || typeof Genesis.AssetPipeline.registerAsset !== 'function') return null;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('asset manifest fetch failed: ' + res.status);
  const manifest = await res.json();
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  let registered = 0;
  for (const asset of assets) {
    if (Genesis.AssetPipeline.registerAsset(asset)) registered++;
  }
  Genesis.AssetCatalog = {
    manifest,
    registered,
    byId: new Map(assets.map((a) => [a.id, a])),
    summary() {
      return {
        schema: manifest.schema,
        count: manifest.count || assets.length,
        registered,
        totalMB: manifest.totalMB || 0
      };
    }
  };
  return Genesis.AssetCatalog;
}

export function install(Genesis, url) {
  return loadCatalog(Genesis, url);
}

export default { install, loadCatalog };
