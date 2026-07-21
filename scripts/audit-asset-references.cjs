const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const manifestPath = path.join(repo, 'asset_manifest.json');
const outPath = path.join(repo, 'asset_reference_audit.json');
const scanExt = new Set(['.html', '.js', '.json', '.css', '.md']);
const skipDirs = new Set(['.git', 'node_modules']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (scanExt.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out;
}

function rel(p) { return path.relative(repo, p).replace(/\\/g, '/'); }

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const generated = new Set(['asset_manifest.json', 'asset_reference_audit.json']);
const sources = walk(repo).filter((p) => !rel(p).startsWith('assets/') && !generated.has(rel(p)));
const sourceText = sources.map((p) => ({ path: rel(p), text: fs.readFileSync(p, 'utf8') }));

const assets = manifest.assets || [];
const results = assets.map((asset) => {
  const exact = asset.path;
  const url = asset.url ? asset.url.replace(/^\.\//, '') : exact;
  const base = path.basename(asset.path);
  const refs = [];
  for (const src of sourceText) {
    if (src.text.includes(exact) || src.text.includes(url) || src.text.includes(base)) refs.push(src.path);
  }
  return { id: asset.id, path: asset.path, type: asset.type, bytes: asset.bytes, sizeMB: asset.sizeMB, owner: asset.owner, tier: asset.tier, sector: asset.sector, referenced: refs.length > 0, references: refs.slice(0, 12) };
});

const referenced = results.filter((r) => r.referenced);
const unreferenced = results.filter((r) => !r.referenced);
const totalUnrefBytes = unreferenced.reduce((n, r) => n + (r.bytes || 0), 0);
const audit = {
  schema: 'genesis.asset_reference_audit.v1',
  generatedAt: new Date().toISOString(),
  sourceFilesScanned: sources.length,
  totalAssets: results.length,
  referencedCount: referenced.length,
  unreferencedCount: unreferenced.length,
  unreferencedMB: Number((totalUnrefBytes / 1048576).toFixed(3)),
  warning: 'Reference audit only. Do not delete until human/Genesis confirms dynamic loads and provenance.',
  referenced,
  unreferenced
};

fs.writeFileSync(outPath, JSON.stringify(audit, null, 2) + '\n');
console.log(`wrote ${rel(outPath)} (${audit.referencedCount} referenced / ${audit.unreferencedCount} unreferenced, ${audit.unreferencedMB} MB candidates)`);
