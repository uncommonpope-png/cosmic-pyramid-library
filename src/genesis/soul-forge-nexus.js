import * as THREE from 'three';

const NEXUS_Y = 0;
const NEXUS_RADIUS = 300;
const AGENT_COUNT = 8;

let Genesis = null;
let sceneRef = null;
let cameraRef = null;
let controlsRef = null;
let playerNPCRef = null;
let nexusGroup = null;
let agents = [];
let souls = [];
let gems = 500;
let animTime = 0;
let forgePanelActive = false;
let gachaPanelActive = false;
let combatActive = false;
let nexusPLT = { profit: 50, love: 50, tax: 50 };

const AGENT_NAMES = ['Ember', 'Cinder', 'Forge', 'Anvil', 'Spark', 'Flame', 'Crucible', 'Smelt'];
const AGENT_COLORS = { profit: 0xff8800, love: 0xff4488, tax: 0x00ffaa };
const AGENT_PHRASES = {
  profit: ['Stoking the forge...', 'Growth through fire.', 'Heat increases value.', 'The forge waits.'],
  love: ['Connecting souls...', 'Warmth shared is warmth doubled.', 'The bonds hold.', 'Together we meld.'],
  tax: ['Balance in all things.', 'Cost of creation.', 'Every spark has a price.', 'Patience. The metal must cool.']
};

function rand(a, b) { return a + Math.random() * (b - a); }

function createNexusGround() {
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a05, roughness: 0.9, metalness: 0.3, emissive: 0x0a0502, emissiveIntensity: 0.2
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(NEXUS_RADIUS * 2, NEXUS_RADIUS * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  ground.name = 'Nexus Ground';
  return ground;
}

function createLavaRivers() {
  const group = new THREE.Group();
  const positions = [
    { x: 0, z: 0, r: 180 },
    { x: 80, z: 80, r: 60 },
    { x: -80, z: -80, r: 50 },
    { x: 80, z: -80, r: 40 },
    { x: -80, z: 80, r: 45 }
  ];
  positions.forEach(p => {
    const geo = new THREE.CircleGeometry(p.r, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const circle = new THREE.Mesh(geo, mat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(p.x, 0, p.z);
    circle.userData = { baseOpacity: 0.15, pulseSpeed: 0.5 + Math.random() * 1 };
    group.add(circle);
  });
  return group;
}

function createCentralForge() {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x332211, roughness: 0.8, metalness: 0.6, emissive: 0x663300, emissiveIntensity: 0.3
  });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 3, 16), baseMat);
  platform.position.y = 1.5;
  platform.castShadow = true;
  group.add(platform);

  const altarMat = new THREE.MeshStandardMaterial({
    color: 0x664422, roughness: 0.4, metalness: 0.8, emissive: 0xff6600, emissiveIntensity: 0.2
  });
  const altar = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 4), altarMat);
  altar.position.y = 3.5;
  altar.castShadow = true;
  group.add(altar);

  const fireGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
  );
  fireGlow.position.y = 5;
  group.add(fireGlow);

  const pillars = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x554433, roughness: 0.7, metalness: 0.3, emissive: 0xff4400, emissiveIntensity: 0.05
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 5, 8), pillarMat);
    pillar.position.set(Math.cos(angle) * 10, 2.5, Math.sin(angle) * 10);
    pillar.castShadow = true;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    );
    cap.position.set(Math.cos(angle) * 10, 5, Math.sin(angle) * 10);
    group.add(pillar);
    group.add(cap);
    pillars.push({ pillar, cap, angle });
  }
  group.userData.pillars = pillars;
  group.name = 'Central Forge';
  return group;
}

function createGachaOrbs() {
  const group = new THREE.Group();
  const orbs = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const r = 22;
    const colors = [0xff66aa, 0x4488ff, 0xffaa00, 0x44ff88, 0xaa44ff];
    const orbMat = new THREE.MeshStandardMaterial({
      color: colors[i], emissive: colors[i], emissiveIntensity: 0.5,
      metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.9
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 12), orbMat);
    orb.position.set(Math.cos(angle) * r, 4 + Math.random(), Math.sin(angle) * r);
    orb.userData = { index: i, baseY: orb.position.y, pulsePhase: Math.random() * Math.PI * 2, color: colors[i] };
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending })
    );
    glow.position.copy(orb.position);
    glow.userData = { parentOrb: orb };
    group.add(orb);
    group.add(glow);
    orbs.push(orb);
  }
  group.userData.orbs = orbs;
  group.name = 'Gacha Orbs';
  return group;
}

function createCombatArena() {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x222233, roughness: 0.7, metalness: 0.4, emissive: 0x111122, emissiveIntensity: 0.1
  });
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 6, 6), wallMat);
    pillar.position.set(Math.cos(angle) * 40, 3, Math.sin(angle) * 40);
    pillar.castShadow = true;
    group.add(pillar);
  }
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e, roughness: 0.6, metalness: 0.5, emissive: 0x0a0a1e, emissiveIntensity: 0.1
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(38, 24), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  group.add(floor);

  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xff4444, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending
  });
  const marker = new THREE.Mesh(new THREE.RingGeometry(1, 3, 24), markerMat);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(0, 0.05, 0);
  group.add(marker);
  group.userData.marker = marker;
  group.name = 'Combat Arena';
  return group;
}

function createNexusBuildings() {
  const group = new THREE.Group();
  const buildingDefs = [
    { x: 50, z: 50, h: 8, color: 0x884422 },
    { x: -50, z: 50, h: 12, color: 0x664433 },
    { x: 50, z: -50, h: 6, color: 0xaa6633 },
    { x: -50, z: -50, h: 10, color: 0x775544 },
    { x: 0, z: 70, h: 7, color: 0x995522 },
    { x: 70, z: 0, h: 9, color: 0x884433 },
    { x: -70, z: 0, h: 11, color: 0x665544 },
    { x: 0, z: -70, h: 5, color: 0xaa5533 }
  ];
  buildingDefs.forEach(def => {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.05, metalness: 0.3, roughness: 0.7
    });
    const w = rand(4, 8);
    const d = rand(4, 8);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, def.h, d), mat);
    mesh.position.set(def.x, def.h / 2, def.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6600, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending
    });
    const topGlow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5), glowMat);
    topGlow.position.set(def.x, def.h + 0.1, def.z);
    group.add(topGlow);
  });
  return group;
}

function createNexusAgent(type, x, z, name) {
  const group = new THREE.Group();
  const c = AGENT_COLORS[type] || 0xffffff;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.8, 0.3),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 })
  );
  torso.position.y = 1.2; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffddcc })
  );
  head.position.y = 1.85; head.castShadow = true; group.add(head);
  const arms = [];
  [-0.45, 0.45].forEach(xo => {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.6, 0.15),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05 })
    );
    arm.position.set(xo, 1.1, 0); arm.castShadow = true; group.add(arm); arms.push(arm);
  });
  const legs = [];
  [-0.15, 0.15].forEach(xo => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.7, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x332211 })
    );
    leg.position.set(xo, 0.35, 0); leg.castShadow = true; group.add(leg); legs.push(leg);
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.03, 8, 32),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; group.add(ring);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 64;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
  ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(name, 128, 42);
  const nameSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true })
  );
  nameSprite.position.y = 2.3; nameSprite.scale.set(2, 0.5, 1); group.add(nameSprite);
  group.position.set(x, 0, z);
  return {
    group, torso, head, arms, legs, ring, type, name, needs: {
      energy: 80 + Math.random() * 20, social: 80 + Math.random() * 20,
      skill: 80 + Math.random() * 20, purpose: 80 + Math.random() * 20
    },
    state: 'IDLE', targetPos: null, stateTimer: 0, hp: 100, maxHp: 100
  };
}

function updateNexusAgents(dt, time) {
  agents.forEach(a => {
    Object.keys(a.needs).forEach(k => {
      a.needs[k] -= dt * (1 + Math.random() * 0.5);
      a.needs[k] = Math.max(0, Math.min(100, a.needs[k]));
    });
    a.stateTimer += dt;
    if (a.state === 'IDLE') {
      const lowest = Object.entries(a.needs).sort((a, b) => a[1] - b[1])[0];
      if (lowest && lowest[1] < 40) {
        a.targetPos = new THREE.Vector3(
          rand(-150, 150), 0, rand(-150, 150)
        );
        a.state = 'WALKING';
        a.ring.material.opacity = 0.3;
      }
    } else if (a.state === 'WALKING' && a.targetPos) {
      const pos = a.group.position;
      const dx = a.targetPos.x - pos.x;
      const dz = a.targetPos.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.5) {
        a.state = 'IDLE';
        a.ring.material.opacity = 0;
        a.targetPos = null;
      } else {
        pos.x += (dx / dist) * 2.5 * dt;
        pos.z += (dz / dist) * 2.5 * dt;
        a.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    a.arms.forEach((arm, i) => {
      arm.rotation.x = a.state === 'WALKING' ? Math.sin(time * 5 + i * Math.PI) * 0.3 : 0;
    });
    a.legs.forEach((leg, i) => {
      leg.rotation.x = a.state === 'WALKING' ? Math.sin(time * 5 + i * Math.PI) * 0.4 : 0;
    });
  });
}

export function install(GenesisRef, THREE_REF, camera, scene, renderer, cityGroup, controls) {
  if (!GenesisRef || GenesisRef.SoulForgeNexus) return;
  Genesis = GenesisRef;
  sceneRef = scene;
  cameraRef = camera;
  controlsRef = controls;

  nexusGroup = window.__forgeNexusRoot || new THREE.Group();
  if (!window.__forgeNexusRoot) {
    nexusGroup.name = 'Soul Forge Nexus';
    nexusGroup.position.set(0, NEXUS_Y, 0);
    nexusGroup.visible = true;
    scene.add(nexusGroup);
  } else {
    nexusGroup.visible = true;
  }

  const nexusLight = new THREE.HemisphereLight(0xff6633, 0x1a0500, 1.2);
  nexusLight.name = 'Nexus Light';
  nexusGroup.add(nexusLight);

  const nexusDirLight = new THREE.DirectionalLight(0xff8844, 1.0);
  nexusDirLight.position.set(20, 40, 10);
  nexusDirLight.castShadow = true;
  nexusGroup.add(nexusDirLight);

  const nexusAmbient = new THREE.AmbientLight(0x442211, 0.4);
  nexusAmbient.name = 'Nexus Ambient';
  nexusGroup.add(nexusAmbient);

  nexusGroup.add(createNexusGround());
  nexusGroup.add(createLavaRivers());
  nexusGroup.add(createCentralForge());
  nexusGroup.add(createGachaOrbs());
  nexusGroup.add(createCombatArena());
  nexusGroup.add(createNexusBuildings());

  for (let i = 0; i < AGENT_COUNT; i++) {
    const type = ['profit', 'love', 'tax'][i % 3];
    const a = createNexusAgent(type, rand(-120, 120), rand(-120, 120), AGENT_NAMES[i]);
    nexusGroup.add(a.group);
    agents.push(a);
  }

  const updateFn = (dt) => {
    const isActive = Genesis && Genesis.VerticalStackManager && Genesis.VerticalStackManager.getActive() === 'forge-nexus';
    if (!isActive) return;
    animTime += dt;
    updateNexusAgents(dt, animTime);
    const forge = nexusGroup.getObjectByName('Central Forge');
    if (forge && forge.userData.pillars) {
      forge.userData.pillars.forEach((p, i) => {
        p.cap.material.opacity = 0.4 + 0.3 * Math.sin(animTime * 0.5 + i);
      });
    }
    const gacha = nexusGroup.getObjectByName('Gacha Orbs');
    if (gacha && gacha.userData.orbs) {
      gacha.userData.orbs.forEach((orb, i) => {
        orb.position.y = orb.userData.baseY + Math.sin(animTime * 0.8 + orb.userData.pulsePhase) * 0.5;
        orb.rotation.y += dt * 0.5;
      });
    }
    const arena = nexusGroup.getObjectByName('Combat Arena');
    if (arena && arena.userData.marker) {
      arena.userData.marker.material.opacity = 0.08 + 0.05 * Math.sin(animTime * 0.3);
    }
  };

  if (Array.isArray(window.__genesisFrameCb)) {
    window.__genesisFrameCb.push(updateFn);
  }

  const api = {
    summary: () => ({
      agents: agents.length,
      souls: souls.length,
      gems,
      plt: { ...nexusPLT }
    }),
    getNexusGroup: () => nexusGroup,
    setPlayerRef: (ref) => { playerNPCRef = ref; }
  };

  Genesis.SoulForgeNexus = api;
  Genesis.registerModule('soul-forge-nexus', { status: 'installed', path: './src/genesis/soul-forge-nexus.js' });
  if (typeof console !== 'undefined') console.log('[SoulForgeNexus] Installed — ' + AGENT_COUNT + ' forge agents walking');
  return api;
}
