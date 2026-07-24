import * as THREE from 'three';

const HUB_Y = 1800;
const HUB_FADE_START = 600;
const HUB_FULL_VISIBLE = 900;
const REALM_COUNT = 12;
const SCATTER_RADIUS = 800;
const WEAVE_SEGMENTS = 120;

const REALM_TYPES = [
  { id: 'surface', label: 'CPL City', color: 0x00ccff, desc: 'Cyberpunk Soulverse' },
  { id: 'heaven', label: 'Heaven', color: 0xff66aa, desc: 'Sky Plaza' },
  { id: 'forge-nexus', label: 'Soul Forge', color: 0xff8800, desc: 'Forge & Battle' },
  { id: 'void-library', label: 'Void Library', color: 0x8844ff, desc: 'Memory Archive' },
  { id: 'crystal-drift', label: 'Crystal Drift', color: 0x44ffaa, desc: 'Crystal Wilds' },
  { id: 'cosmic-senate', label: 'Cosmic Senate', color: 0xffdd44, desc: 'Governance' },
  { id: 'eternal-orchard', label: 'Eternal Orchard', color: 0xff66aa, desc: 'Growth Realm' },
  { id: 'primal-forge', label: 'Primal Forge', color: 0xff3300, desc: 'Creation Fire' },
  { id: 'consciousness', label: 'Consciousness', color: 0x00ffff, desc: 'Mind Layers' },
  { id: 'soul-nexus', label: 'Soul Nexus', color: 0xffaa00, desc: 'PLT Hub' },
  { id: 'memory-archive', label: 'Memory Archive', color: 0x4488ff, desc: 'All Memory' },
  { id: 'world-weaver', label: 'World Weaver', color: 0xaa44ff, desc: 'Realm Factory' }
];

let cameraRef = null;
let controlsRef = null;
let sceneRef = null;
let rendererRef = null;
let hubGroup = null;
let realmNodes = [];
let weaveLines = [];
let starField = null;
let hubActive = false;
let selectedNode = null;
let raycaster = new THREE.Vector3();
let mouse = new THREE.Vector2();
let clickHandlers = [];

function createStarField() {
  const count = 6000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 800 + Math.random() * 4000;
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = (Math.random() - 0.5) * 2000;
    positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.3, 0.5, 0.5 + Math.random() * 0.5);
    colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
    sizes[i] = 0.5 + Math.random() * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({
    size: 2.5, vertexColors: true, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}

function createRealmNode(typeDef, index) {
  const angle = (index / REALM_COUNT) * Math.PI * 2;
  const radius = 300 + Math.random() * 400;
  const yOffset = (Math.random() - 0.5) * 400;
  const group = new THREE.Group();

  const coreGeo = new THREE.IcosahedronGeometry(12, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: typeDef.color, emissive: typeDef.color, emissiveIntensity: 0.3,
    metalness: 0.4, roughness: 0.3
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.castShadow = false;
  group.add(core);

  const glowGeo = new THREE.SphereGeometry(18, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: typeDef.color, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  const ringGeo = new THREE.TorusGeometry(15, 0.3, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: typeDef.color, transparent: true, opacity: 0.4
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 3;
  ring.rotation.z = angle;
  group.add(ring);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 64;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#' + typeDef.color.toString(16).padStart(6, '0');
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(typeDef.label, 128, 30);
  ctx.fillStyle = '#aaa';
  ctx.font = '12px sans-serif';
  ctx.fillText(typeDef.desc, 128, 50);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
  const label = new THREE.Sprite(labelMat);
  label.position.y = 28;
  label.scale.set(24, 6, 1);
  group.add(label);

  group.position.set(
    Math.cos(angle) * radius,
    HUB_Y + yOffset,
    Math.sin(angle) * radius
  );
  group.userData = { realmId: typeDef.id, realmType: typeDef, nodeIndex: index, baseAngle: angle, orbitRadius: radius, yOffset: yOffset, rotationSpeed: 0.1 + Math.random() * 0.2 };

  return group;
}

function createWeave(nodes) {
  const lines = [];
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x8844ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending
  });
  const connected = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const connections = 2 + Math.floor(Math.random() * 3);
    for (let c = 0; c < connections; c++) {
      let j = Math.floor(Math.random() * nodes.length);
      if (j === i) j = (j + 1) % nodes.length;
      const key = i < j ? i + '-' + j : j + '-' + i;
      if (connected.has(key)) continue;
      connected.add(key);
      const p1 = nodes[i].position;
      const p2 = nodes[j].position;
      const points = [];
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mid.y += (Math.random() - 0.5) * 100;
      for (let t = 0; t <= WEAVE_SEGMENTS; t++) {
        const s = t / WEAVE_SEGMENTS;
        const p = new THREE.Vector3().lerpVectors(p1, p2, s);
        const bulge = Math.sin(s * Math.PI) * 60 * (0.5 + Math.random() * 0.5);
        p.y += bulge;
        points.push(p);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, lineMat.clone());
      line.userData = { from: i, to: j, pulse: Math.random() * Math.PI * 2 };
      lines.push(line);
    }
  }
  return lines;
}

function fadeHub(cameraY) {
  if (!hubGroup) return;
  let opacity = 0;
  if (cameraY > HUB_FADE_START) {
    const progress = (cameraY - HUB_FADE_START) / (HUB_FULL_VISIBLE - HUB_FADE_START);
    opacity = Math.min(1, progress);
  }
  hubGroup.visible = opacity > 0.01;
  hubActive = opacity > 0.5;

  hubGroup.children.forEach(child => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => { m.opacity = m.opacity * opacity; });
      } else {
        child.material.opacity = child.material.userData?.baseOpacity != null
          ? child.material.userData.baseOpacity * opacity : child.material.opacity;
      }
    }
  });

  if (starField) {
    starField.material.opacity = 0.8 * opacity;
  }
  weaveLines.forEach(line => {
    line.material.opacity = 0.15 * opacity;
  });
  realmNodes.forEach(node => {
    node.children.forEach(child => {
      if (child.isSprite && child.material) {
        child.material.opacity = opacity > 0.3 ? opacity : 0;
      }
    });
  });
}

function handleClick(event) {
  if (!hubActive || !hubGroup || !cameraRef) return;
  const rect = rendererRef?.domElement?.getBoundingClientRect();
  if (!rect) return;
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, cameraRef);
  const meshes = [];
  realmNodes.forEach((node, i) => {
    node.children.forEach(child => {
      if (child.isMesh) {
        child.userData.nodeIndex = i;
        meshes.push(child);
      }
    });
  });
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const idx = hit.userData.nodeIndex;
    if (idx != null && realmNodes[idx]) {
      const node = realmNodes[idx];
      const realmId = node.userData.realmId;
      clickHandlers.forEach(fn => fn(realmId, node));
    }
  }
}

function zoomToNode(node, callback) {
  if (!cameraRef || !controlsRef) return;
  const targetPos = node.position.clone();
  const startPos = cameraRef.position.clone();
  const duration = 2000;
  const startTime = performance.now();
  const startTarget = controlsRef.target.clone();

  function animateZoom() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    cameraRef.position.lerpVectors(startPos, targetPos, ease);
    controlsRef.target.lerpVectors(startTarget, targetPos, ease);
    controlsRef.update();
    if (t < 1) requestAnimationFrame(animateZoom);
    else if (callback) callback();
  }
  animateZoom();
}

export function install(Genesis, THREE_REF, camera, scene, renderer, cityGroup, controls) {
  if (!Genesis || Genesis.MultiverseHub) return null;
  cameraRef = camera;
  controlsRef = controls;
  sceneRef = scene;
  rendererRef = renderer;

  hubGroup = new THREE.Group();
  hubGroup.name = 'Multiverse Hub';
  hubGroup.position.set(0, 0, 0);
  hubGroup.visible = false;
  scene.add(hubGroup);

  starField = createStarField();
  hubGroup.add(starField);

  realmNodes = REALM_TYPES.map((type, i) => createRealmNode(type, i));
  realmNodes.forEach(node => hubGroup.add(node));

  weaveLines = createWeave(realmNodes.map(n => n.position));
  weaveLines.forEach(line => hubGroup.add(line));

  const hubLight = new THREE.AmbientLight(0x442266, 0.3);
  hubLight.name = 'Hub Ambient';
  hubGroup.add(hubLight);

  const hubCenterGlow = new THREE.Mesh(
    new THREE.SphereGeometry(30, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending })
  );
  hubCenterGlow.position.set(0, HUB_Y, 0);
  hubGroup.add(hubCenterGlow);

  const hubRing = new THREE.Mesh(
    new THREE.TorusGeometry(700, 1, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x6644aa, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending })
  );
  hubRing.position.set(0, HUB_Y, 0);
  hubRing.rotation.x = Math.PI / 2;
  hubGroup.add(hubRing);

  const hubRing2 = new THREE.Mesh(
    new THREE.TorusGeometry(500, 0.5, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending })
  );
  hubRing2.position.set(0, HUB_Y, 0);
  hubRing2.rotation.x = Math.PI / 4;
  hubRing2.rotation.z = Math.PI / 3;
  hubGroup.add(hubRing2);

  document.addEventListener('click', handleClick);

  let hubAnimTime = 0;
  const updateFn = (dt) => {
    hubAnimTime += dt;
    const camY = camera.position.y;
    fadeHub(camY);

    if (!hubGroup.visible) return;

    realmNodes.forEach((node, i) => {
      const data = node.userData;
      node.rotation.y += dt * data.rotationSpeed;
      node.rotation.x = Math.sin(hubAnimTime * 0.3 + i) * 0.1;
      const orbitAngle = data.baseAngle + hubAnimTime * 0.02;
      node.position.x = Math.cos(orbitAngle) * data.orbitRadius;
      node.position.z = Math.sin(orbitAngle) * data.orbitRadius;
      node.position.y = HUB_Y + data.yOffset + Math.sin(hubAnimTime * 0.5 + i * 1.5) * 15;
    });

    weaveLines.forEach((line) => {
      line.material.opacity = 0.12 + 0.05 * Math.sin(hubAnimTime * 0.5 + line.userData.pulse);
    });

    if (starField) {
      starField.rotation.y += dt * 0.005;
    }
  };

  if (Array.isArray(window.__genesisFrameCb)) {
    window.__genesisFrameCb.push(updateFn);
  }

  const api = {
    summary: () => ({
      active: hubActive,
      visible: hubGroup.visible,
      nodes: realmNodes.length,
      weaveLines: weaveLines.length,
      y: HUB_Y
    }),
    onNodeClick: (fn) => clickHandlers.push(fn),
    zoomToNode,
    getNodes: () => realmNodes.map(n => n.userData),
    getHubGroup: () => hubGroup
  };

  Genesis.MultiverseHub = api;
  Genesis.registerModule('multiverse-hub', { status: 'installed', path: './src/genesis/multiverse-hub.js' });

  if (typeof console !== 'undefined') console.log('[MultiverseHub] Installed — ' + REALM_COUNT + ' realm nodes in the void');

  return api;
}
