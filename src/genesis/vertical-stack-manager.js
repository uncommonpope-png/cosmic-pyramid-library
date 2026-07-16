import * as THREE from 'three';

export const STRATUM_STATES = Object.freeze({
  UNLOADED: 'UNLOADED',
  LOADED: 'LOADED',
  ACTIVE: 'ACTIVE',
  SLEEPING: 'SLEEPING'
});

const VALID_STATES = new Set(Object.values(STRATUM_STATES));

export function createVerticalStackManager(ctx = {}) {
  const strata = new Map();
  const connectors = new Map();
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let activeId = null;
  let transitionPromise = null;
  let exteriorVisible = true;
  let lastTransition = null;

  function applyState(record) {
    if (!record || !record.root) return;
    const stateVisible = record.state === STRATUM_STATES.ACTIVE || record.state === STRATUM_STATES.LOADED;
    record.root.userData.__genesisVisibilityOwner = 'vertical-stack';
    record.root.userData.verticalStratumId = record.id;
    record.root.userData.verticalState = record.state;
    record.root.userData.verticalSimulationActive = record.state === STRATUM_STATES.ACTIVE;
    record.root.visible = exteriorVisible && !record.root.userData.__verticalExteriorHidden && stateVisible;
  }

  function setRecordState(record, state) {
    if (!record || !VALID_STATES.has(state)) return false;
    record.state = state;
    record.changedAt = now();
    applyState(record);
    if (typeof record.options.onStateChange === 'function') {
      try { record.options.onStateChange(state, record.id); } catch (_) {}
    }
    return true;
  }

  function registerStratum(id, root, options = {}) {
    if (!id || !root) throw new Error('registerStratum requires id and root');
    const state = VALID_STATES.has(options.state) ? options.state : STRATUM_STATES.UNLOADED;
    const record = { id, root, options: { ...options }, state, changedAt: now() };
    strata.set(id, record);
    if (state === STRATUM_STATES.ACTIVE) {
      if (activeId && activeId !== id) setRecordState(strata.get(activeId), STRATUM_STATES.SLEEPING);
      activeId = id;
    }
    applyState(record);
    return id;
  }

  function registerConnector(id, spec = {}) {
    if (!id || !spec.from || !spec.to) throw new Error('registerConnector requires id, from, and to');
    connectors.set(id, { ...spec, id });
    return id;
  }

  function getActive() { return activeId; }

  function getStratum(id) {
    const record = strata.get(id);
    return record ? { id: record.id, root: record.root, state: record.state, options: { ...record.options } } : null;
  }

  function setState(id, state) {
    const record = strata.get(id);
    if (!record || !VALID_STATES.has(state)) return false;
    if (state === STRATUM_STATES.ACTIVE && activeId && activeId !== id) {
      setRecordState(strata.get(activeId), STRATUM_STATES.SLEEPING);
    }
    if (state === STRATUM_STATES.ACTIVE) activeId = id;
    else if (activeId === id) activeId = null;
    return setRecordState(record, state);
  }

  function findConnector(from, to, connectorId) {
    if (connectorId && connectors.has(connectorId)) return connectors.get(connectorId);
    for (const connector of connectors.values()) {
      if (connector.from === from && connector.to === to) return connector;
      if (connector.bidirectional && connector.from === to && connector.to === from) return connector;
    }
    return null;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      const raf = ctx.requestAnimationFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
      if (raf) raf(() => resolve());
      else setTimeout(resolve, 16);
    });
  }

  async function transitionTo(id, context = {}) {
    if (transitionPromise) return transitionPromise;
    if (!strata.has(id)) throw new Error('Unknown stratum: ' + id);
    if (activeId === id) return summary();
    const sourceId = activeId;
    const source = sourceId ? strata.get(sourceId) : null;
    const destination = strata.get(id);
    const connector = findConnector(sourceId, id, context.connectorId);
    const previousDestinationState = destination.state;
    const trace = {
      from: sourceId,
      to: id,
      connector: connector ? connector.id : null,
      startedAt: now(),
      destinationVisibleBeforeTransfer: false,
      completedAt: 0,
      ok: false
    };
    lastTransition = trace;

    transitionPromise = (async () => {
      try {
        setRecordState(destination, STRATUM_STATES.LOADED);
        if (typeof context.prepare === 'function') await context.prepare({ source, destination, connector });
        else if (connector && typeof connector.prepare === 'function') await connector.prepare({ source, destination, connector });
        await nextFrame();
        const prewarmMs = Number(context.prewarmMs != null ? context.prewarmMs : (connector && connector.prewarmMs)) || 0;
        if (prewarmMs > 0) await new Promise((resolve) => setTimeout(resolve, prewarmMs));
        trace.destinationVisibleBeforeTransfer = !!(destination.root && destination.root.parent && destination.root.visible);
        if (!trace.destinationVisibleBeforeTransfer) throw new Error('Destination was not visible before transfer: ' + id);
        const ready = typeof context.ready === 'function'
          ? await context.ready({ source, destination, connector })
          : connector && typeof connector.ready === 'function'
            ? await connector.ready({ source, destination, connector })
            : true;
        if (!ready) throw new Error('Destination not ready: ' + id);
        const transfer = context.transfer || (connector && connector.transfer);
        if (typeof transfer === 'function') await transfer({ from: sourceId, to: id, source, destination, connector, context });
        setRecordState(destination, STRATUM_STATES.ACTIVE);
        activeId = id;
        if (source && source.id !== id) setRecordState(source, STRATUM_STATES.SLEEPING);
        trace.ok = true;
        trace.completedAt = now();
        return summary();
      } catch (error) {
        if (source) { setRecordState(source, STRATUM_STATES.ACTIVE); activeId = source.id; }
        setRecordState(destination, previousDestinationState);
        trace.error = error && error.message ? error.message : String(error);
        trace.completedAt = now();
        throw error;
      } finally {
        transitionPromise = null;
      }
    })();
    return transitionPromise;
  }

  function setExteriorVisible(visible) {
    exteriorVisible = !!visible;
    for (const record of strata.values()) {
      record.root.userData.__verticalExteriorHidden = !exteriorVisible;
      applyState(record);
    }
  }

  function connectorSummary() {
    return [...connectors.values()].map((connector) => ({
      id: connector.id,
      from: connector.from,
      to: connector.to,
      bidirectional: !!connector.bidirectional,
      endpoints: connector.endpoints ? Object.keys(connector.endpoints) : []
    }));
  }

  function summary() {
    const stratumSummary = {};
    for (const [id, record] of strata) {
      stratumSummary[id] = {
        state: record.state,
        visible: !!record.root.visible,
        simulationActive: record.state === STRATUM_STATES.ACTIVE,
        rootName: record.root.name || '',
        parentType: record.root.parent ? record.root.parent.type : null,
        order: record.options.order == null ? 0 : record.options.order
      };
    }
    return {
      active: activeId,
      transitioning: !!transitionPromise,
      exteriorVisible,
      strata: stratumSummary,
      connectors: connectorSummary(),
      lastTransition: lastTransition ? { ...lastTransition } : null
    };
  }

  function tick(context = {}) {
    if (typeof context.exteriorVisible === 'boolean' && context.exteriorVisible !== exteriorVisible) {
      setExteriorVisible(context.exteriorVisible);
    } else {
      for (const record of strata.values()) applyState(record);
    }
    return activeId;
  }

  return Object.freeze({
    states: STRATUM_STATES,
    registerStratum,
    registerConnector,
    getActive,
    getStratum,
    transitionTo,
    setState,
    setExteriorVisible,
    endpoints: connectorSummary,
    summary,
    tick
  });
}

export function install(Genesis, _THREE = THREE, _camera, _scene) {
  if (!Genesis) return null;
  const manager = createVerticalStackManager();
  Genesis.VerticalStackManager = manager;
  return manager;
}
