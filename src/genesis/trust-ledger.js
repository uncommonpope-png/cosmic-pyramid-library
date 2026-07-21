// GENESIS ENGINE — Trust Ledger + Betrayal Recall (P47/P48/P122/P123)

function cleanId(id) { return String(id || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'; }

export function install(Genesis, worldState, saveWorldState) {
  if (!Genesis || !worldState || typeof saveWorldState !== 'function') return null;
  worldState.trustLedger = worldState.trustLedger || {};

  function ensure(id) {
    const key = cleanId(id);
    worldState.trustLedger[key] = worldState.trustLedger[key] || { id: key, trust: 0, talks: 0, betrayals: [], events: [] };
    return worldState.trustLedger[key];
  }

  function record(id, delta = 0, reason = 'interaction', meta = {}) {
    const row = ensure(id);
    const n = Number(delta) || 0;
    row.trust = Math.max(-100, Math.min(100, (Number(row.trust) || 0) + n));
    row.events = [{ at: Date.now(), delta: n, reason, meta }, ...(row.events || [])].slice(0, 40);
    saveWorldState();
    try { window.dispatchEvent(new CustomEvent('genesis:trust:delta', { detail: { id: row.id, trust: row.trust, delta: n, reason, meta } })); } catch (_) {}
    if (Genesis.PLT && Genesis.PLT.record) Genesis.PLT.record('trust.delta', { profit: Math.max(0, n) * 0.02, love: Math.max(0, n) * 0.05, tax: Math.max(0, -n) * 0.05 }, { actor: row.id, phase: 'P48/P123', reason });
    return row;
  }

  function onTalk(id, meta = {}) {
    const row = record(id, 1, 'talk', meta);
    row.talks = (row.talks || 0) + 1;
    saveWorldState();
    return row;
  }

  function betray(id, reason = 'betrayal', meta = {}) {
    const row = record(id, -25, reason, meta);
    row.betrayals = [{ at: Date.now(), reason, meta }, ...(row.betrayals || [])].slice(0, 12);
    saveWorldState();
    try { window.dispatchEvent(new CustomEvent('genesis:citizen:betrayal-recalled', { detail: { id: row.id, reason, trust: row.trust } })); } catch (_) {}
    return row;
  }

  function recallLine(id) {
    const row = ensure(id);
    if (!row.betrayals || !row.betrayals.length) return '';
    const b = row.betrayals[0];
    return 'I remember the betrayal: ' + (b.reason || 'trust was broken') + '. ';
  }

  function summary() {
    const rows = Object.values(worldState.trustLedger || {});
    return { citizens: rows.length, hostile: rows.filter((r) => r.trust < -25).length, trusted: rows.filter((r) => r.trust > 25).length };
  }

  window.addEventListener('genesis:citizen:betray', (ev) => {
    const d = ev && ev.detail ? ev.detail : {};
    betray(d.id || d.citizen || 'unknown', d.reason || 'betrayal', d);
  });

  const api = { ensure, record, onTalk, betray, recallLine, summary };
  Genesis.TrustLedger = api;
  return api;
}

export default { install };
