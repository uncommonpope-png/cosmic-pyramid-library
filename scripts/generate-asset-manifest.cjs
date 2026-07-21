const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const assetsRoot = path.join(repo, 'assets');
const outPath = path.join(repo, 'asset_manifest.json');
const keep = new Set(['.glb', '.gltf', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mp3', '.wav', '.json']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (keep.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out;
}

function typeFor(ext) {
  if (ext === '.glb' || ext === '.gltf') return 'model';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'texture';
  if (['.mp4', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav'].includes(ext)) return 'audio';
  if (ext === '.json') return 'data';
  return 'asset';
}

function ownerTier(rel, type) {
  const p = rel.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/world/')) return ['world', 'world', 'surface'];
  if (p.includes('/figures/')) return ['citizen', 'world', 'citizens'];
  if (p.includes('/vehicles/') || p.includes('/cars/') || p.includes('car')) return ['traffic', 'world', 'city-core'];
  if (p.includes('/retro-urban-kit/')) return ['city-kit', 'decor', 'city-outer'];
  if (p.includes('/ifa/')) return ['avatar', 'critical', 'surface'];
  if (type === 'texture') return ['texture-library', 'decor', 'shared'];
  return ['misc', 'decor', 'shared'];
}

const files = walk(assetsRoot).sort((a, b) => a.localeCompare(b));
const assets = files.map((abs) => {
  const rel = path.relative(repo, abs).replace(/\\/g, '/');
  const ext = path.extname(abs).toLowerCase();
  const st = fs.statSync(abs);
  const type = typeFor(ext);
  const [owner, tier, sector] = ownerTier(rel, type);
  const base = rel.replace(/^assets\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return {
    id: base,
    type,
    url: './' + rel,
    path: rel,
    ext: ext.slice(1),
    bytes: st.size,
    sizeMB: Number((st.size / 1048576).toFixed(3)),
    owner,
    tier,
    sector,
    lod: rel.includes('.opt.') ? 'optimized' : (st.size > 20 * 1048576 ? 'heavy' : 'base'),
    cost: {
      cpu: type === 'model' ? 1 : 0.2,
      gpu: type === 'model' ? Math.min(10, Math.max(1, Math.round(st.size / 1048576))) : 0.5,
      memory: Number((st.size / 1048576).toFixed(3)),
      updateFreq: type === 'video' ? 30 : 0,
      priority: tier === 'critical' ? 9 : tier === 'world' ? 6 : 2,
      sector,
      sleep: tier === 'critical' ? 'never' : 'distance'
    },
    provenance: { source: 'repo-scan', license: 'unknown' }
  };
});

const manifest = {
  schema: 'genesis.asset_manifest.v1',
  generatedAt: new Date().toISOString(),
  root: 'assets/',
  count: assets.length,
  totalBytes: assets.reduce((n, a) => n + a.bytes, 0),
  totalMB: Number((assets.reduce((n, a) => n + a.bytes, 0) / 1048576).toFixed(3)),
  assets
};

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(repo, outPath)} (${manifest.count} assets, ${manifest.totalMB} MB)`);
