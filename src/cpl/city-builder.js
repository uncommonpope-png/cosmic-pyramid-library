// GENESIS CPL — City Builder Module
// Targeted P8 module split to unblock P7 City Expansion without corrupting index.html.
// Three.js remains the renderer; Genesis managers govern cost, resources, sectors, visibility.

import * as THREE from 'three';

const OUTER_CITY_COST = {
  cpu: 0.2,
  gpu: 0.5,
  memory: 0.1,
  updateFreq: 0,
  priority: 1,
  sector: 'city-outer',
  sleep: 'distance'
};

function makeSharedKit(T, Genesis, owner) {
  const box = new T.BoxGeometry(1, 1, 1);
  const cap = new T.BoxGeometry(1, 0.18, 1);
  const mats = [
    new T.MeshStandardMaterial({ color: 0x182642, emissive: 0x071426, emissiveIntensity: 0.35, roughness: 0.78, metalness: 0.28 }),
    new T.MeshStandardMaterial({ color: 0x22183b, emissive: 0x120624, emissiveIntensity: 0.32, roughness: 0.82, metalness: 0.22 }),
    new T.MeshStandardMaterial({ color: 0x102f35, emissive: 0x052128, emissiveIntensity: 0.38, roughness: 0.76, metalness: 0.24 }),
    new T.MeshStandardMaterial({ color: 0x2a1d12, emissive: 0x1a0b04, emissiveIntensity: 0.28, roughness: 0.84, metalness: 0.18 })
  ];
  if (Genesis && Genesis.ResourceManager) {
    Genesis.ResourceManager.track(box, owner, null);
    Genesis.ResourceManager.track(cap, owner, null);
    for (const mat of mats) Genesis.ResourceManager.track(mat, owner, null);
  }
  return { box, cap, mats };
}

function declare(Genesis, obj, extra = {}) {
  if (!Genesis || window.__GENESIS_COST_CONTRACT === false || !Genesis.declareCost) return;
  Genesis.declareCost(obj, { ...OUTER_CITY_COST, ...extra });
}

function addGrid(T, Genesis, root, kitOwner) {
  const grid = new T.GridHelper(420, 42, 0x203a66, 0x08172a);
  grid.name = 'Genesis Outer City Low-Cost Grid';
  grid.position.y = 0.035;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  root.add(grid);
  declare(Genesis, grid, { gpu: 0.2, memory: 0.05, priority: 1 });
  if (Genesis && Genesis.ResourceManager) {
    Genesis.ResourceManager.track(grid.geometry, kitOwner, grid);
    Genesis.ResourceManager.track(grid.material, kitOwner, grid);
  }
}

function makeOuterBuilding(T, Genesis, root, kit, x, z, idx) {
  const h = 2.5 + ((idx * 7) % 11) * 0.65;
  const w = 1.8 + ((idx * 5) % 5) * 0.26;
  const d = 1.8 + ((idx * 3) % 6) * 0.22;
  const mat = kit.mats[idx % kit.mats.length];
  const b = new T.Mesh(kit.box, mat);
  b.name = 'Genesis Outer City Cheap Building';
  b.position.set(x, h / 2, z);
  b.scale.set(w, h, d);
  b.castShadow = false;
  b.receiveShadow = false;
  root.add(b);
  declare(Genesis, b);

  const cap = new T.Mesh(kit.cap, mat);
  cap.name = 'Genesis Outer City Cap';
  cap.position.set(x, h + 0.11, z);
  cap.scale.set(w * 0.72, 1, d * 0.72);
  root.add(cap);
  declare(Genesis, cap, { gpu: 0.25, memory: 0.03 });
  return b;
}

export function buildOuterCity({ THREE: ThreeRuntime, Genesis, scene, cityGroup, options = {} }) {
  const T = ThreeRuntime || THREE;
  if (!scene || !cityGroup) return null;
  if (window.__GENESIS_CITY_BUILDER_MODULE === false) return null;
  if (scene.getObjectByName('Genesis Outer City Module Root')) return scene.getObjectByName('Genesis Outer City Module Root');

  const root = new T.Group();
  root.name = 'Genesis Outer City Module Root';
  root.userData.owner = 'city-outer';
  scene.add(root);
  declare(Genesis, root, { gpu: 0.1, memory: 0.05, priority: 1 });

  const kit = makeSharedKit(T, Genesis, 'city-outer');
  addGrid(T, Genesis, root, 'city-outer');

  const rings = options.rings || [
    { r: 92, count: 30, skip: 0.48 },
    { r: 124, count: 38, skip: 0.55 },
    { r: 158, count: 46, skip: 0.64 },
    { r: 196, count: 54, skip: 0.72 }
  ];
  let made = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      if (((i * 13 + ring.count) % 100) / 100 < ring.skip) continue;
      const angle = (Math.PI * 2 * i) / ring.count + ((i % 5) - 2) * 0.018;
      const rad = ring.r + ((i * 17) % 13) - 6;
      const x = Math.cos(angle) * rad;
      const z = Math.sin(angle) * rad;
      if (Math.abs(x) < 38 && Math.abs(z) < 38) continue;
      makeOuterBuilding(T, Genesis, root, kit, x, z, made++);
    }
  }

  if (Genesis && window.__GENESIS_SECTOR_MANAGER !== false && Genesis.SectorManager) {
    Genesis.SectorManager.register('city-outer', root, { maxDistance: 430, autoSleep: true });
  }
  if (Genesis && window.__GENESIS_VISIBILITY !== false && Genesis.Visibility) {
    Genesis.Visibility.register('city-outer', root, { priority: 1, maxDistance: 430 });
  }
  root.userData.generatedBuildings = made;
  return root;
}

export function install(Genesis, ThreeRuntime, scene, cityGroup, options = {}) {
  const api = {
    buildOuterCity: (override = {}) => buildOuterCity({ THREE: ThreeRuntime || THREE, Genesis, scene, cityGroup, options: { ...options, ...override } })
  };
  if (Genesis) Genesis.CityBuilder = api;
  return api;
}
