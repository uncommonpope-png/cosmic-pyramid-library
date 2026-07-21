// GENESIS ENGINE — Prophet Archive (P37 / P126)
// Turns prophecy output into persistent memory/witness records.

export function install(Genesis, worldState, saveWorldState, options = {}) {
  if (!Genesis || !worldState || typeof saveWorldState !== 'function') return null;
  const max = options.max || 100;

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  }

  function archive(text, context = {}) {
    const clean = normalize(text);
    if (!clean) return null;
    const entry = {
      id: 'prophecy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      type: 'prophecy',
      text: clean,
      at: Date.now(),
      realm: 'prophet',
      source: context.source || 'gsk-prophet',
      mood: context.mood || (Genesis.GSK && Genesis.GSK.mood) || null,
      plt: context.plt || (Genesis.PLT && Genesis.PLT.summary && Genesis.PLT.summary()) || null,
      tags: ['prophet', 'future', 'world-reaction', 'memory']
    };
    worldState.prophecies = [...(worldState.prophecies || []), { text: clean.slice(0, 600), at: entry.at, id: entry.id }].slice(-10);
    worldState.prophecyArchive = [entry, ...(worldState.prophecyArchive || [])].slice(0, max);
    worldState.memoryEvents = [
      { id: entry.id, type: 'prophecy-archived', at: entry.at, summary: clean.slice(0, 180), tags: entry.tags },
      ...(worldState.memoryEvents || [])
    ].slice(0, 250);
    saveWorldState();
    try { window.dispatchEvent(new CustomEvent('genesis:prophet:archive', { detail: entry })); } catch (_) {}
    return entry;
  }

  function list(limit = 20) {
    return (worldState.prophecyArchive || []).slice(0, limit);
  }

  function summary() {
    return {
      archived: (worldState.prophecyArchive || []).length,
      latest: (worldState.prophecyArchive || [])[0] || null
    };
  }

  const api = { archive, list, summary };
  Genesis.ProphetArchive = api;
  return api;
}

export default { install };
