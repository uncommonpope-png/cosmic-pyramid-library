const https = require('https');

const url = process.env.GENESIS_LIVE_URL || 'https://uncommonpope-png.github.io/cosmic-pyramid-library/';
const required = [
  'window.__GENESIS_BOOT_READY',
  'Genesis.bootReady',
  'genesis:boot-ready',
  './src/cpl/city-builder.js',
  './asset_manifest.json'
];

function get(target) {
  return new Promise((resolve, reject) => {
    https.get(target, { headers: { 'User-Agent': 'GenesisLiveVerifier/1.0' } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

(async () => {
  const res = await get(url);
  const checks = Object.fromEntries(required.map((needle) => [needle, res.body.includes(needle)]));
  const ok = res.statusCode >= 200 && res.statusCode < 300 && Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, url, statusCode: res.statusCode, checks }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, url, error: err && err.message ? err.message : String(err) }, null, 2));
  process.exit(1);
});
