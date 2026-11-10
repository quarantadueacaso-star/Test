/*
 * Corsa Cosmica: corsa infinita in 3D.
 * Unica dipendenza: three.js r160 (globale THREE).
 */
(function () {
  'use strict';

  const T = window.THREE;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- utilità
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fmt = (n) => Math.floor(n).toLocaleString('it-IT');

  // localStorage può mancare (navigazione privata, iframe): il gioco funziona lo stesso
  const store = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* niente da fare */ }
    },
  };

  // ---------------------------------------------------------------- costanti
  const LANE_W = 2.1;
  const LANES = [-LANE_W, 0, LANE_W];
  const ROAD_W = LANE_W * 3 + 1.0;
  const ROAD_LEN = 800;
  const TILE = 11;                 // lunghezza di una piastrella della pista
  const SPEED_0 = 13;
  const SPEED_MAX = 32;
  const SPEED_TAU = 70;            // secondi: quanto in fretta si arriva alla velocità massima
  const GRAVITY = 34;
  const JUMP_V = 11.5;
  const SLIDE_T = 0.65;
  const SPAWN_Z = -140;
  const KILL_Z = 14;
  const ZONE_LEN = 600;
  const STAND_H = 1.45;
  const SLIDE_H = 0.7;
  const HALF_W = 0.3;
  const HALF_D = 0.3;
  const ORB_POINTS = 10;

  const C_JUMP = 0xff5fae;
  const C_SLIDE = 0x45e3ff;
  const C_DODGE = 0xff9440;
  const C_HERO = 0xffc233;

  // ---------------------------------------------------------------- renderer
  const canvas = $('scene');
  let renderer = null;
  try {
    if (!T) throw new Error('three.js non caricato');
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    $('nogl').hidden = false;
    $('nogl').style.zIndex = '10';
    $('start').hidden = true;
    return;
  }

  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const coarse = mq('(pointer: coarse)');
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.fog = new T.Fog(0x000000, 34, 140);
  const camera = new T.PerspectiveCamera(60, 1, 0.3, 1600);

  const hemi = new T.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(hemi);

  const sun = new T.DirectionalLight(0xffffff, 1);
  sun.position.set(-9, 14, 3);
  sun.target.position.set(0, 0, -9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.camera.left = -31;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- zone (tavolozze)
  const ZONES = [
    { name: 'Tramonto', top: 0x1a1046, hor: 0xf0627e, ground: 0x2d1b55, peak: 0x43236b, sun: 0xffb48c, sunI: 2.7, hemiSky: 0x9f8cff, hemiGnd: 0x55275a, hemiI: 2.0, stars: 0.6 },
    { name: 'Notte', top: 0x02040f, hor: 0x17367c, ground: 0x0f1738, peak: 0x0f1f4d, sun: 0x9cc0ff, sunI: 2.0, hemiSky: 0x5b78ff, hemiGnd: 0x1b2050, hemiI: 1.8, stars: 1.0 },
    { name: 'Alba', top: 0x27458f, hor: 0xffc59a, ground: 0x40305f, peak: 0x5d4176, sun: 0xfff0d2, sunI: 2.9, hemiSky: 0xc3d6ff, hemiGnd: 0x6d4c68, hemiI: 2.1, stars: 0.12 },
    { name: 'Giorno', top: 0x0b6887, hor: 0xbdf3e0, ground: 0x1f5663, peak: 0x2a707d, sun: 0xffffff, sunI: 3.1, hemiSky: 0xdcfff5, hemiGnd: 0x2f6b72, hemiI: 2.2, stars: 0.0 },
  ];
  const COLOR_KEYS = ['top', 'hor', 'ground', 'peak', 'sun', 'hemiSky', 'hemiGnd'];
  const NUM_KEYS = ['sunI', 'hemiI', 'stars'];
  const ZC = ZONES.map((z) => {
    const o = { name: z.name };
    COLOR_KEYS.forEach((k) => { o[k] = new T.Color(z[k]); });
    NUM_KEYS.forEach((k) => { o[k] = z[k]; });
    return o;
  });
  const pal = {};
  COLOR_KEYS.forEach((k) => { pal[k] = ZC[0][k].clone(); });
  NUM_KEYS.forEach((k) => { pal[k] = ZC[0][k]; });

  // ---------------------------------------------------------------- texture da canvas
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const glowTex = canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });

  const roadTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#15123a';
    g.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 4;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const v = 26 + Math.random() * 16;
        g.fillStyle = 'rgb(' + (v | 0) + ',' + ((v - 4) | 0) + ',' + ((v + 44) | 0) + ')';
        g.fillRect(i * w / cols + 2, j * h / rows + 2, w / cols - 4, h / rows - 4);
      }
    }
    // qualche bullone agli angoli delle piastre
    g.fillStyle = 'rgba(160,150,255,0.28)';
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j < rows; j++) {
        g.fillRect(i * w / cols - 9, j * h / rows + 7, 4, 4);
        g.fillRect(i * w / cols + 5, j * h / rows + 7, 4, 4);
      }
    }
  });
  const roadGlowTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    // linee tratteggiate tra le corsie
    const half = ROAD_W / 2;
    [-LANE_W / 2, LANE_W / 2].forEach((x) => {
      const u = (x + half) / ROAD_W * w;
      g.fillStyle = 'rgba(69,227,255,0.55)';
      g.fillRect(u - 3, h * 0.08, 6, h * 0.46);
    });
    // bordi
    g.fillStyle = 'rgba(69,227,255,0.35)';
    g.fillRect(0, 0, 14, h);
    g.fillRect(w - 14, 0, 14, h);
  });
  [roadTex, roadGlowTex].forEach((t) => {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(1, ROAD_LEN / TILE);
    t.anisotropy = maxAniso;
  });

  const NOISE_TILE = 30;
  const noiseTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b4b4b4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 3 + Math.random() * 20;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          g.beginPath();
          g.arc(x + dx * w, y + dy * h, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
  noiseTex.wrapS = noiseTex.wrapT = T.RepeatWrapping;
  noiseTex.repeat.set(700 / NOISE_TILE, ROAD_LEN / NOISE_TILE);
  noiseTex.anisotropy = Math.min(4, maxAniso);

  // ---------------------------------------------------------------- cielo
  const skyMat = new T.ShaderMaterial({
    uniforms: { top: { value: pal.top }, hor: { value: pal.hor } },
    vertexShader: [
      'varying vec3 vP;',
      'void main() {',
      '  vP = position;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 top;',
      'uniform vec3 hor;',
      'varying vec3 vP;',
      'void main() {',
      '  float h = normalize(vP).y;',
      '  float t = smoothstep(0.09, 0.95, h);',
      '  t = pow(t, 0.7);',
      '  gl_FragColor = vec4(mix(hor, top, t), 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    side: T.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new T.Mesh(new T.SphereGeometry(1200, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const starsMat = new T.PointsMaterial({ size: 2.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false });
  {
    const N = 520;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const v = new T.Vector3();
    for (let i = 0; i < N; i++) {
      do {
        v.set(rand(-1, 1), rand(0.06, 1), rand(-1, 1));
      } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize().multiplyScalar(1000);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = rand(0.35, 1);
      col.set([b, b, Math.min(1, b + 0.12)], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const stars = new T.Points(geo, starsMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    sky.add(stars);
  }

  // pianeta con anelli all'orizzonte, più due lune
  {
    const planetTex = canvasTex(256, 128, (g, w, h) => {
      const bands = ['#ffd9a8', '#f7a98f', '#e97d86', '#c9628f', '#f2b99a', '#ffe3bf', '#d9778a', '#a8529a'];
      let y = 0;
      while (y < h) {
        const bh = 3 + Math.random() * 15;
        g.fillStyle = pick(bands);
        g.fillRect(0, y, w, bh + 1);
        y += bh;
      }
      for (let i = 0; i < 46; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(60,20,80,0.08)';
        g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3);
      }
    });
    const planet = new T.Mesh(
      new T.SphereGeometry(1, 48, 28),
      new T.MeshStandardMaterial({ map: planetTex, emissive: 0xffffff, emissiveMap: planetTex, emissiveIntensity: 0.22, roughness: 1, metalness: 0, fog: false })
    );
    const ringGeo = new T.RingGeometry(1.35, 2.25, 96, 1);
    const rp = ringGeo.attributes.position;
    const ruv = ringGeo.attributes.uv;
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getY(i));
      ruv.setXY(i, (r - 1.35) / (2.25 - 1.35), 0.5);
    }
    const ringTex = canvasTex(256, 4, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      let x = 0;
      while (x < w) {
        const bw = 2 + Math.random() * 14;
        const edge = Math.sin((x / w) * Math.PI);
        const a = (0.15 + Math.random() * 0.75) * (0.25 + 0.75 * edge);
        g.fillStyle = 'rgba(255,226,196,' + a.toFixed(3) + ')';
        g.fillRect(x, 0, bw + 1, h);
        x += bw;
      }
    });
    const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -1.2;
    const planetGroup = new T.Group();
    planetGroup.add(planet, ring);
    planetGroup.position.set(-135, 84, -540);
    planetGroup.rotation.z = 0.36;
    planetGroup.scale.setScalar(98);
    scene.add(planetGroup);

    const moonMat = new T.MeshStandardMaterial({ color: 0xd6dcff, roughness: 1, metalness: 0, fog: false });
    const moonA = new T.Mesh(new T.SphereGeometry(1, 24, 16), moonMat);
    moonA.position.set(215, 170, -500);
    moonA.scale.setScalar(15);
    const moonB = new T.Mesh(new T.SphereGeometry(1, 32, 20), new T.MeshStandardMaterial({ color: 0xa9f0e6, emissive: 0x4fb8c4, emissiveIntensity: 0.45, roughness: 1, metalness: 0, fog: false }));
    moonB.position.set(-206, 82, 521);
    moonB.scale.setScalar(52);
    scene.add(moonA, moonB);
  }

  // ---------------------------------------------------------------- pista e terreno
  const world = new T.Group();
  scene.add(world);

  const roadMat = new T.MeshStandardMaterial({ map: roadTex, emissive: 0xffffff, emissiveMap: roadGlowTex, emissiveIntensity: 1, roughness: 0.62, metalness: 0.15 });
  const road = new T.Mesh(new T.PlaneGeometry(ROAD_W, ROAD_LEN), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  world.add(road);

  const kerbMat = new T.MeshBasicMaterial({ color: 0x2fc4e6 });
  [-1, 1].forEach((s) => {
    const kerb = new T.Mesh(new T.BoxGeometry(0.16, 0.12, ROAD_LEN), kerbMat);
    kerb.position.set(s * (ROAD_W / 2 + 0.08), 0.06, 0);
    world.add(kerb);
  });

  const terrMat = new T.MeshLambertMaterial({ color: pal.ground.clone(), map: noiseTex });
  [-1, 1].forEach((s) => {
    const m = new T.Mesh(new T.PlaneGeometry(700, ROAD_LEN), terrMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(s * (ROAD_W / 2 + 0.16 + 350), 0, 0);
    m.receiveShadow = true;
    world.add(m);
  });

  // ---------------------------------------------------------------- scenografia (istanze riciclate)
  const dummy = new T.Object3D();
  const tmpColor = new T.Color();

  class Scatter {
    constructor(geo, mat, count, zMin, zMax, place, even) {
      this.mesh = new T.InstancedMesh(geo, mat, count);
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.zMin = zMin;
      this.zMax = zMax;
      this.span = zMax - zMin;
      this.place = place;
      this.items = [];
      for (let i = 0; i < count; i++) {
        const it = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, shade: 1 };
        it.z = even ? zMin + (Math.floor(i / even) + 0.5) / (count / even) * this.span : zMin + (i + Math.random()) / count * this.span;
        place(it, i);
        this.items.push(it);
      }
      world.add(this.mesh);
      this.update(0);
    }

    update(dz) {
      const items = this.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.z += dz;
        if (it.z > this.zMax) {
          it.z -= this.span;
          this.place(it, i);
        } else if (it.z < this.zMin) {
          it.z += this.span;
        }
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rx, it.ry, it.rz);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  const side = () => (Math.random() < 0.5 ? -1 : 1);

  // montagne: sagome piatte che sfumano verso l'orizzonte
  const mountains = new Scatter(
    new T.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0),
    new T.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    44, -340, 340,
    (it) => {
      const r = rand(16, 40);
      it.x = side() * rand(62, 190);
      it.sx = r;
      it.sz = r;
      it.sy = rand(14, 44);
      it.ry = rand(0, Math.PI);
      it.shade = rand(0.78, 1.12);
    }
  );
  mountains.mesh.renderOrder = -5;
  function paintMountains() {
    const items = mountains.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const far = smooth(70, 300, Math.abs(it.z));
      tmpColor.copy(pal.peak).multiplyScalar(it.shade).lerp(pal.hor, 0.22 + 0.78 * far);
      mountains.mesh.setColorAt(i, tmpColor);
    }
    mountains.mesh.instanceColor.needsUpdate = true;
  }

  const rockMat = new T.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95, metalness: 0 });
  const rocks = new Scatter(
    new T.IcosahedronGeometry(1, 0), rockMat, 70, -165, 165,
    (it) => {
      const s = rand(0.45, 2.4);
      it.x = side() * (rand(0, 1) < 0.35 ? rand(5.4, 9) : rand(9, 44));
      it.sx = s * rand(0.8, 1.3);
      it.sy = s * rand(0.5, 0.9);
      it.sz = s * rand(0.8, 1.3);
      it.y = it.sy * 0.25;
      it.ry = rand(0, 6.28);
      it.rx = rand(-0.3, 0.3);
    }
  );

  const sceneCrystalMat = new T.MeshStandardMaterial({ color: 0x58e6b0, emissive: 0x22b98a, emissiveIntensity: 0.5, flatShading: true, roughness: 0.35, metalness: 0.1 });
  const sceneCrystals = new Scatter(
    new T.ConeGeometry(0.34, 1, 5, 1).translate(0, 0.5, 0), sceneCrystalMat, 56, -165, 165,
    (it) => {
      const h = rand(1.2, 5);
      it.x = side() * rand(5.6, 34);
      it.sy = h;
      it.sx = it.sz = 0.6 + h * 0.28;
      it.rz = rand(-0.4, 0.4);
      it.rx = rand(-0.3, 0.3);
      it.ry = rand(0, 6.28);
      it.y = -0.2;
    }
  );

  // lampioni ai lati della pista, a distanza regolare: danno il ritmo della velocità
  const LAMP_X = ROAD_W / 2 + 0.9;
  const lampPlace = (it, i) => {
    it.x = (i % 2 ? 1 : -1) * LAMP_X;
  };
  const lampPosts = new Scatter(
    new T.CylinderGeometry(0.05, 0.09, 2.6, 6).translate(0, 1.3, 0),
    new T.MeshStandardMaterial({ color: 0x2a2660, roughness: 0.5, metalness: 0.4 }),
    28, -154, 154, lampPlace, 2
  );
  const lampHeads = new Scatter(
    new T.OctahedronGeometry(0.24, 0).translate(0, 2.8, 0),
    new T.MeshBasicMaterial({ color: 0xfff1b8 }),
    28, -154, 154, lampPlace, 2
  );

  // archi sopra la pista
  const archMat = new T.MeshStandardMaterial({ color: 0x3b3192, emissive: 0x6a55ff, emissiveIntensity: 0.3, roughness: 0.45, metalness: 0.4, flatShading: true });
  const arches = new Scatter(
    new T.TorusGeometry(6.8, 0.24, 6, 28, Math.PI), archMat, 4, -154, 154,
    (it) => { it.y = -0.2; }, 1
  );

  // pulviscolo: punti che scorrono e rendono l'idea della velocità
  const MOTE_N = 150;
  const motePos = new Float32Array(MOTE_N * 3);
  for (let i = 0; i < MOTE_N; i++) {
    motePos[i * 3] = rand(-16, 16);
    motePos[i * 3 + 1] = rand(0.3, 8);
    motePos[i * 3 + 2] = rand(-98, 2);
  }
  const moteGeo = new T.BufferGeometry();
  moteGeo.setAttribute('position', new T.BufferAttribute(motePos, 3).setUsage(T.DynamicDrawUsage));
  const motes = new T.Points(moteGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }));
  motes.frustumCulled = false;
  world.add(motes);

  // ---------------------------------------------------------------- Bip, il robot
  const P = {
    lane: 1, x: 0, y: 0, vy: 0, grounded: true,
    slideT: 0, slideQueued: false, jumpBuf: 0,
    phase: 0, lean: 0, roll: 0, legL: 0, legR: 0, armL: 0, armR: 0, offY: 0, offZ: 0, headYaw: 0,
  };
  const bip = (function buildBip() {
    const root = new T.Group();
    const tilt = new T.Group();
    root.add(tilt);

    const mBody = new T.MeshStandardMaterial({ color: C_HERO, roughness: 0.42, metalness: 0.08 });
    const mWhite = new T.MeshStandardMaterial({ color: 0xf4f1ff, roughness: 0.5, metalness: 0.05 });
    const mDark = new T.MeshStandardMaterial({ color: 0x1b1746, roughness: 0.32, metalness: 0.35 });
    const mEye = new T.MeshBasicMaterial({ color: 0x8ffbff });
    const mHot = new T.MeshBasicMaterial({ color: 0xff7038 });

    const add = (parent, geo, mat, x, y, z) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // busto
    const torso = add(tilt, new T.CapsuleGeometry(0.26, 0.2, 6, 16), mBody, 0, 0.78, 0);
    torso.scale.set(1.12, 1, 0.94);
    const belt = add(tilt, new T.TorusGeometry(0.262, 0.036, 8, 24), mWhite, 0, 0.6, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.12, 0.94, 1);
    const chest = add(tilt, new T.CircleGeometry(0.07, 18), mEye, 0, 0.9, -0.262);
    chest.rotation.y = Math.PI;
    chest.castShadow = false;

    // zaino con propulsore
    add(tilt, new T.BoxGeometry(0.36, 0.38, 0.17), mWhite, 0, 0.85, 0.28);
    add(tilt, new T.CylinderGeometry(0.07, 0.1, 0.12, 10), mDark, 0, 0.62, 0.3);
    const flame = add(tilt, new T.ConeGeometry(0.07, 0.3, 8).rotateX(Math.PI).translate(0, -0.15, 0), mHot, 0, 0.57, 0.3);
    flame.castShadow = false;

    // testa
    const head = new T.Group();
    head.position.set(0, 1.3, 0);
    tilt.add(head);
    const skull = add(head, new T.SphereGeometry(0.31, 24, 18), mBody, 0, 0, 0);
    skull.scale.set(1.08, 0.94, 1);
    const visor = add(head, new T.SphereGeometry(0.318, 24, 10, Math.PI * 1.5 - 1.15, 2.3, 1.18, 0.74), mDark, 0, 0, 0);
    visor.scale.set(1.08, 0.94, 1);
    visor.castShadow = false;
    [-1, 1].forEach((s) => {
      const eye = add(head, new T.SphereGeometry(0.046, 12, 10), mEye, s * 0.115, 0.01, -0.305);
      eye.scale.set(1, 1.5, 0.5);
      eye.castShadow = false;
      const ear = add(head, new T.CylinderGeometry(0.075, 0.075, 0.08, 14), mWhite, s * 0.355, 0, 0);
      ear.rotation.z = Math.PI / 2;
    });
    const antenna = new T.Group();
    antenna.position.set(0, 0.27, 0);
    head.add(antenna);
    add(antenna, new T.CylinderGeometry(0.014, 0.014, 0.26, 6), mDark, 0, 0.13, 0);
    add(antenna, new T.SphereGeometry(0.062, 12, 10), mHot, 0, 0.29, 0);

    // braccia e gambe: ogni arto ruota attorno a un perno
    const limb = (x, y, parts) => {
      const pivot = new T.Group();
      pivot.position.set(x, y, 0);
      tilt.add(pivot);
      parts(pivot);
      return pivot;
    };
    const arm = (s) => limb(s * 0.375, 0.99, (g) => {
      add(g, new T.CapsuleGeometry(0.065, 0.22, 4, 10), mWhite, 0, -0.17, 0);
      add(g, new T.SphereGeometry(0.085, 12, 10), mDark, 0, -0.36, 0);
    });
    const leg = (s) => limb(s * 0.14, 0.5, (g) => {
      add(g, new T.CapsuleGeometry(0.075, 0.24, 4, 10), mWhite, 0, -0.2, 0);
      add(g, new T.BoxGeometry(0.17, 0.11, 0.3), mDark, 0, -0.44, -0.05);
    });

    return { root, tilt, head, antenna, flame, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  })();
  scene.add(bip.root);

  // ---------------------------------------------------------------- ostacoli
  const HIT = {
    low: { hw: 0.8, hd: 0.4, y0: 0, y1: 0.8 },      // cristalli: si saltano
    high: { hw: 0.95, hd: 0.22, y0: 1.0, y1: 2.7 }, // portale: ci si scivola sotto
    wall: { hw: 0.75, hd: 0.4, y0: 0, y1: 4 },      // monolite: si schiva
  };

  const mCrystal = new T.MeshStandardMaterial({ color: C_JUMP, emissive: 0xff2d8a, emissiveIntensity: 0.6, flatShading: true, roughness: 0.3, metalness: 0.1 });
  const mBase = new T.MeshStandardMaterial({ color: 0x241a4d, flatShading: true, roughness: 0.9 });
  const mGateMetal = new T.MeshStandardMaterial({ color: 0x2c2a66, roughness: 0.4, metalness: 0.5 });
  const mGateBar = new T.MeshBasicMaterial({ color: C_SLIDE });
  const mGateField = new T.MeshBasicMaterial({ color: C_SLIDE, transparent: true, opacity: 0.17, side: T.DoubleSide, depthWrite: false });
  const mWall = new T.MeshStandardMaterial({ color: 0x1d1838, flatShading: true, roughness: 0.75, metalness: 0.2 });
  const mWallGlow = new T.MeshBasicMaterial({ color: C_DODGE });
  const glowMat = (color) => new T.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mGlow = { low: glowMat(C_JUMP), high: glowMat(C_SLIDE), wall: glowMat(C_DODGE) };

  const gCone = new T.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0);
  const gBox = new T.BoxGeometry(1, 1, 1);
  const gPlane = new T.PlaneGeometry(1, 1);
  const gOcta = new T.OctahedronGeometry(1, 0);
  const gBaseRock = new T.DodecahedronGeometry(1, 0);
  const gObelisk = new T.CylinderGeometry(0.72, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);

  function part(group, geo, mat, x, y, z, sx, sy, sz, shadow) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = shadow !== false;
    group.add(m);
    return m;
  }
  function groundGlow(group, type, sx, sz) {
    const m = new T.Mesh(gPlane, mGlow[type]);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.userData.sx = sx;
    m.userData.sz = sz;
    group.add(m);
    return m;
  }

  const BUILD = {
    low() {
      const g = new T.Group();
      part(g, gBaseRock, mBase, 0, 0.02, 0, 0.9, 0.16, 0.5);
      const spikes = [
        [0.02, 1.0, 0.33, 0.0, 0.05],
        [-0.46, 0.74, 0.27, 0.36, -0.08],
        [0.47, 0.8, 0.28, -0.32, 0.02],
        [-0.2, 0.52, 0.2, -0.45, 0.26],
        [0.22, 0.48, 0.2, 0.42, -0.26],
      ];
      spikes.forEach((s) => {
        const m = part(g, gCone, mCrystal, s[0], 0.05, s[4], s[2], s[1], s[2]);
        m.rotation.z = s[3] * 0.8;
        m.rotation.y = Math.random() * 3;
      });
      g.userData.glow = groundGlow(g, 'low', 3.0, 2.3);
      return g;
    },
    high() {
      const g = new T.Group();
      part(g, gBox, mGateMetal, -0.98, 1.35, 0, 0.13, 2.7, 0.13);
      part(g, gBox, mGateMetal, 0.98, 1.35, 0, 0.13, 2.7, 0.13);
      part(g, gBox, mGateMetal, 0, 2.66, 0, 2.09, 0.1, 0.13);
      part(g, gBox, mGateBar, 0, 1.17, 0, 1.9, 0.2, 0.2);
      part(g, gBox, mGateBar, 0, 1.68, 0, 1.84, 0.035, 0.035, false);
      part(g, gBox, mGateBar, 0, 2.14, 0, 1.84, 0.035, 0.035, false);
      part(g, gPlane, mGateField, 0, 1.96, 0, 1.84, 1.38, 1, false);
      g.userData.glow = groundGlow(g, 'high', 3.2, 1.5);
      return g;
    },
    wall() {
      const g = new T.Group();
      part(g, gObelisk, mWall, 0, 0, 0, 1.15, 3.3, 0.62);
      part(g, gBox, mWallGlow, 0, 0.55, 0, 1.6, 0.13, 0.88, false);
      part(g, gBox, mWallGlow, 0, 2.3, 0, 1.33, 0.09, 0.72, false);
      g.userData.spin = part(g, gOcta, mWallGlow, 0, 3.78, 0, 0.2, 0.28, 0.2, false);
      g.userData.glow = groundGlow(g, 'wall', 3.0, 2.2);
      return g;
    },
  };

  const obstacles = [];
  const pools = { low: [], high: [], wall: [] };
  const rows = [];

  function addObstacle(type, lane, z) {
    const o = pools[type].pop() || { type, mesh: BUILD[type](), hit: HIT[type] };
    o.lane = lane;
    o.x = LANES[lane];
    o.z = z;
    o.mesh.position.set(o.x, 0, z);
    o.mesh.visible = true;
    if (!o.mesh.parent) world.add(o.mesh);
    obstacles.push(o);
  }
  function releaseObstacle(i) {
    const o = obstacles[i];
    o.mesh.visible = false;
    pools[o.type].push(o);
    obstacles[i] = obstacles[obstacles.length - 1];
    obstacles.pop();
  }

  // ---------------------------------------------------------------- sfere d'oro
  const orbGeo = new T.OctahedronGeometry(1, 0);
  const orbMat = new T.MeshBasicMaterial({ color: 0xffd84a });
  const orbs = [];
  const orbPool = [];
  function addOrb(x, y, z) {
    const o = orbPool.pop() || { mesh: new T.Mesh(orbGeo, orbMat) };
    o.x = x;
    o.y = y;
    o.z = z;
    o.mesh.scale.set(0.2, 0.3, 0.2);
    o.mesh.position.set(x, y, z);
    o.mesh.visible = true;
    if (!o.mesh.parent) world.add(o.mesh);
    orbs.push(o);
  }
  function releaseOrb(i) {
    const o = orbs[i];
    o.mesh.visible = false;
    orbPool.push(o);
    orbs[i] = orbs[orbs.length - 1];
    orbs.pop();
  }

  // ---------------------------------------------------------------- particelle
  const PART_N = 90;
  const partMesh = new T.InstancedMesh(new T.TetrahedronGeometry(0.1, 0), new T.MeshBasicMaterial({ color: 0xffffff }), PART_N);
  partMesh.frustumCulled = false;
  partMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const parts = [];
  for (let i = 0; i < PART_N; i++) {
    parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, r: 0 });
    partMesh.setColorAt(i, tmpColor.set(0xffffff));
  }
  let partCursor = 0;
  world.add(partMesh);

  function burst(x, y, z, n, color, power, up) {
    tmpColor.set(color);
    for (let k = 0; k < n; k++) {
      const p = parts[partCursor];
      partMesh.setColorAt(partCursor, tmpColor);
      partCursor = (partCursor + 1) % PART_N;
      p.max = p.life = rand(0.35, 0.8);
      p.x = x + rand(-0.15, 0.15);
      p.y = y + rand(-0.1, 0.1);
      p.z = z + rand(-0.15, 0.15);
      p.vx = rand(-1, 1) * power;
      p.vy = rand(0.2, 1) * up;
      p.vz = rand(-1, 1) * power;
      p.s = rand(0.6, 1.5);
      p.r = rand(0, 6);
    }
    partMesh.instanceColor.needsUpdate = true;
  }
  function updateParticles(dt, dz) {
    for (let i = 0; i < PART_N; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 15 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt + dz;
        if (p.y < 0.05) {
          p.y = 0.05;
          p.vy *= -0.35;
        }
        const s = p.life > 0 ? p.s * (p.life / p.max) : 0;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.r + p.life * 6, p.r, 0);
        dummy.scale.set(s, s, s);
      } else {
        dummy.position.set(0, -5, 0);
        dummy.scale.set(0, 0, 0);
      }
      dummy.updateMatrix();
      partMesh.setMatrixAt(i, dummy.matrix);
    }
    partMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- audio (sintetizzato, nessun file)
  const audio = { ctx: null, master: null, noise: null, muted: !!store.get('cc.muted', false) };
  const music = { on: false, step: 0, next: 0 };

  function initAudio() {
    if (audio.ctx) {
      resumeAudio();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = audio.muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      audio.ctx = ctx;
      audio.master = master;
      audio.noise = buf;
      resumeAudio();
    } catch (e) {
      audio.ctx = null;
    }
  }
  function resumeAudio() {
    const ctx = audio.ctx;
    if (ctx && ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }
  function suspendAudio() {
    const ctx = audio.ctx;
    if (ctx && ctx.state === 'running') {
      const p = ctx.suspend();
      if (p && p.catch) p.catch(() => {});
    }
  }
  function tone(type, f0, f1, dur, vol, when) {
    const ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function hiss(dur, vol, f0, f1, type, when) {
    const ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    const t = when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(audio.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }
  let orbCombo = 0;
  let lastOrbT = -9;
  const sfx = {
    start() {
      tone('triangle', 440, 440, 0.12, 0.14);
      tone('triangle', 660, 660, 0.12, 0.14, audio.ctx ? audio.ctx.currentTime + 0.1 : 0);
      tone('triangle', 880, 880, 0.2, 0.14, audio.ctx ? audio.ctx.currentTime + 0.2 : 0);
    },
    jump() { tone('triangle', 300, 640, 0.16, 0.2); },
    slide() { hiss(0.28, 0.2, 2400, 500, 'bandpass'); },
    lane() { tone('sine', 560, 420, 0.07, 0.1); },
    land() { hiss(0.08, 0.1, 500, 200, 'lowpass'); },
    orb() {
      orbCombo = time - lastOrbT < 0.5 ? Math.min(orbCombo + 1, 9) : 0;
      lastOrbT = time;
      const f = 880 * Math.pow(2, orbCombo / 12);
      tone('sine', f, f, 0.14, 0.16);
      tone('sine', f * 2, f * 2, 0.1, 0.05);
    },
    crash() {
      hiss(0.5, 0.6, 900, 120, 'lowpass');
      tone('sawtooth', 190, 38, 0.55, 0.3);
    },
    zone() {
      tone('triangle', 660, 660, 0.14, 0.13);
      tone('triangle', 990, 990, 0.24, 0.13, audio.ctx ? audio.ctx.currentTime + 0.12 : 0);
    },
  };

  // base musicale: quattro accordi, cassa, charleston e arpeggio
  const CHORDS = [
    [110.0, [220.0, 261.63, 329.63, 440.0]],
    [87.31, [174.61, 220.0, 261.63, 349.23]],
    [130.81, [261.63, 329.63, 392.0, 523.25]],
    [98.0, [196.0, 246.94, 293.66, 392.0]],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  function musicTick() {
    const ctx = audio.ctx;
    if (!ctx || !music.on || audio.muted || ctx.state !== 'running') return;
    const stepDur = 60 / (112 + difficulty() * 26) / 4;
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + 0.04;
    while (music.next < ctx.currentTime + 0.16) {
      const s = music.step;
      const st = s & 15;
      const chord = CHORDS[(s >> 4) & 3];
      const t = music.next;
      if (st % 4 === 0) tone('sine', 140, 46, 0.14, 0.3, t);
      if (st % 4 === 2) hiss(0.04, 0.045, 7000, 7000, 'highpass', t);
      if (st === 0 || st === 6 || st === 10) tone('triangle', chord[0] * 2, chord[0] * 2, 0.2, 0.13, t);
      if (st % 2 === 0) {
        const f = chord[1][ARP[(s >> 1) & 7]] * 2;
        tone('triangle', f, f, 0.15, 0.05, t);
      }
      music.next += stepDur;
      music.step = (s + 1) & 63;
    }
  }
  function setMuted(m) {
    audio.muted = m;
    store.set('cc.muted', m);
    if (audio.master) audio.master.gain.value = m ? 0 : 0.9;
    ui.sound.setAttribute('aria-pressed', m ? 'false' : 'true');
    ui.sound.setAttribute('aria-label', m ? 'Audio spento: tocca per riattivarlo' : 'Audio acceso: tocca per spegnerlo');
  }

  // ---------------------------------------------------------------- stato di gioco
  const ui = {
    hud: $('hud'), score: $('score'), orbs: $('orbs'), best: $('best'),
    start: $('start'), startBest: $('start-best'), how: $('how'),
    over: $('over'), overTag: $('over-tag'), final: $('final'), stDist: $('st-dist'), stOrbs: $('st-orbs'), stBest: $('st-best'),
    pause: $('pause'), pauseBtn: $('btn-pause'), sound: $('btn-sound'),
    toast: $('toast'), hint: $('hint'), flash: $('flash'),
  };

  let state = 'ready';            // ready | playing | paused | dead | over
  let time = 0;                   // tempo di scena
  let runT = 0;                   // tempo della corsa in atto
  let speed = 7;
  let dist = 0;
  let orbCount = 0;
  let best = store.get('cc.best', 0) || 0;
  let tutorial = !store.get('cc.tutorial', false);
  let zoneIdx = 0;
  let rowCount = 0;
  let rowsPassed = 0;
  let nextRowZ = -52;
  let deadT = 0;
  let overAt = 0;
  let shake = 0;
  let camK = 0;                   // 0 = inquadratura iniziale, 1 = inseguimento
  let toastT = 0;
  let shownScore = -1;
  let shownOrbs = -1;
  let shownHint = '';

  const score = () => Math.floor(dist) + orbCount * ORB_POINTS;
  const difficulty = () => clamp((speed - SPEED_0) / (SPEED_MAX - SPEED_0), 0, 1);

  const HINTS = {
    jump: coarse ? '↑ Scorri in su: salta!' : '↑ Salta!',
    slide: coarse ? '↓ Scorri in giù: scivola!' : '↓ Scivola!',
    dodge: coarse ? '← → Scorri di lato!' : '← → Cambia corsia!',
  };
  function setHow(touch) {
    ui.how.textContent = touch
      ? 'Scorri il dito sullo schermo nella direzione della freccia. Un tocco veloce fa saltare.'
      : 'Usa le frecce o WASD. Spazio salta, P mette in pausa.';
  }
  setHow(coarse);

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('on');
    toastT = 2.4;
  }

  // ---------------------------------------------------------------- generazione degli ostacoli
  function shuffled3() {
    const a = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // Ogni riga è sempre superabile: mai tre monoliti insieme, e cristalli e portali
  // si passano saltando o scivolando da qualsiasi corsia.
  function makePattern(n, d) {
    const types = d < 0.12 ? ['low', 'low', 'high', 'wall'] : ['low', 'high', 'wall'];
    const pTriple = n < 6 ? 0 : 0.1 + 0.45 * d;
    const pDouble = 0.3 + 0.25 * d;
    const r = Math.random();
    const count = r < pTriple ? 3 : r < pTriple + pDouble ? 2 : 1;
    const lanes = shuffled3();
    const cells = ['', '', ''];
    let walls = 0;
    for (let i = 0; i < count; i++) {
      let t = pick(types);
      if (t === 'wall' && walls >= 2) t = Math.random() < 0.5 ? 'low' : 'high';
      if (t === 'wall') walls++;
      cells[lanes[i]] = t;
    }
    return cells;
  }

  function spawnOrbLine(z, cells) {
    const free = [0, 1, 2].filter((l) => cells[l] !== 'wall');
    const lane = pick(free);
    const kind = cells[lane];
    const gap = clamp(speed * 0.11, 1.5, 3.3);
    for (let k = -2; k <= 2; k++) {
      let y = 0.95;
      if (kind === 'low') y = 1.0 + 0.9 * (1 - (k / 2) * (k / 2));
      else if (kind === 'high') y = 0.42;
      addOrb(LANES[lane], y, z + k * gap);
    }
  }

  function spawnRow() {
    const z = nextRowZ;
    const d = difficulty();
    const n = rowCount++;
    const teaching = tutorial && n < 3;
    let cells;
    let hint = '';
    if (teaching && n === 0) {
      cells = ['low', 'low', 'low'];
      hint = 'jump';
    } else if (teaching && n === 1) {
      cells = ['high', 'high', 'high'];
      hint = 'slide';
    } else if (teaching) {
      cells = Math.random() < 0.5 ? ['wall', 'wall', ''] : ['', 'wall', 'wall'];
      hint = 'dodge';
    } else {
      cells = makePattern(n, d);
    }
    for (let l = 0; l < 3; l++) {
      if (cells[l]) addObstacle(cells[l], l, z);
    }
    rows.push({ z, cells, hint, passed: false });
    if (!teaching && Math.random() < 0.65) spawnOrbLine(z, cells);

    const v = Math.min(SPEED_MAX, speed + 2);
    const gapT = teaching ? 2.1 : lerp(1.35, 0.86, d) + Math.random() * lerp(0.55, 0.25, d);
    nextRowZ -= gapT * v;
  }

  // ---------------------------------------------------------------- azioni del giocatore
  function jump() {
    if (state !== 'playing') return;
    if (P.grounded) {
      P.vy = JUMP_V;
      P.grounded = false;
      P.slideT = 0;
      P.slideQueued = false;
      P.jumpBuf = 0;
      sfx.jump();
      burst(P.x, 0.1, 0.2, 4, 0xbfb6ff, 1.6, 2.2);
    } else {
      P.jumpBuf = 0.14;
    }
  }
  function slide() {
    if (state !== 'playing') return;
    if (P.grounded) {
      if (P.slideT <= 0) sfx.slide();
      P.slideT = SLIDE_T;
    } else {
      // in aria: scende subito e scivola all'atterraggio
      P.vy = Math.min(P.vy, -19);
      P.slideQueued = true;
      P.jumpBuf = 0;
    }
  }
  function move(dir) {
    if (state !== 'playing') return;
    const lane = clamp(P.lane + dir, 0, 2);
    if (lane !== P.lane) {
      P.lane = lane;
      sfx.lane();
    }
  }

  // ---------------------------------------------------------------- simulazione
  const keys = { down: false };

  function physics(h) {
    P.x = damp(P.x, LANES[P.lane], 16, h);
    if (!P.grounded) {
      P.vy -= GRAVITY * h;
      P.y += P.vy * h;
      if (P.y <= 0) {
        P.y = 0;
        P.vy = 0;
        P.grounded = true;
        sfx.land();
        burst(P.x, 0.08, 0.1, 5, 0xbfb6ff, 2.2, 1.6);
        if (P.slideQueued) {
          P.slideQueued = false;
          P.slideT = SLIDE_T;
          sfx.slide();
        }
      }
    }
    if (P.jumpBuf > 0) {
      P.jumpBuf -= h;
      if (P.grounded) jump();
    }
    if (P.slideT > 0) {
      P.slideT -= h;
      if (P.slideT <= 0 && keys.down && P.grounded) P.slideT = 0.05;
    }
  }

  function collide() {
    const sliding = P.slideT > 0 && P.grounded;
    const h = sliding ? SLIDE_H : STAND_H;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const hit = o.hit;
      if (Math.abs(o.z) > HALF_D + hit.hd) continue;
      if (Math.abs(o.x - P.x) > HALF_W + hit.hw) continue;
      if (P.y >= hit.y1 || P.y + h <= hit.y0) continue;
      crash();
      return;
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      if (Math.abs(o.z) > 0.75 || Math.abs(o.x - P.x) > 0.8) continue;
      if (o.y < P.y - 0.4 || o.y > P.y + h + 0.5) continue;
      orbCount++;
      sfx.orb();
      burst(o.x, o.y, o.z, 6, 0xffd84a, 2.4, 3.2);
      releaseOrb(i);
    }
  }

  function sim(h) {
    if (state === 'playing') {
      runT += h;
      speed = SPEED_MAX - (SPEED_MAX - SPEED_0) * Math.exp(-runT / SPEED_TAU);
      dist += speed * h;
    } else if (state === 'ready') {
      speed = damp(speed, 7, 3, h);
    } else {
      speed = damp(speed, 0, 5, h);
    }
    const dz = speed * h;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].z += dz;
      if (obstacles[i].z > KILL_Z) releaseObstacle(i);
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      orbs[i].z += dz;
      if (orbs[i].z > KILL_Z) releaseOrb(i);
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      r.z += dz;
      if (!r.passed && r.z > 1.2) {
        r.passed = true;
        if (state === 'playing') {
          rowsPassed++;
          if (tutorial && rowsPassed >= 3) {
            tutorial = false;
            store.set('cc.tutorial', true);
          }
        }
      }
      if (r.z > KILL_Z) rows.splice(i, 1);
    }
    nextRowZ += dz;

    if (state === 'playing') {
      while (nextRowZ > SPAWN_Z) spawnRow();
      physics(h);
      collide();
    } else if (state === 'dead' || state === 'over') {
      if (!P.grounded) {
        P.vy -= GRAVITY * h;
        P.y += P.vy * h;
        if (P.y <= 0) {
          P.y = 0;
          if (P.vy < -4) {
            P.vy *= -0.32;
          } else {
            P.vy = 0;
            P.grounded = true;
          }
        }
      }
    }
    return dz;
  }

  function crash() {
    state = 'dead';
    deadT = 0;
    music.on = false;
    sfx.crash();
    speed = -speed * 0.22;       // rimbalzo all'indietro
    P.vy = 7.5;
    P.grounded = false;
    P.slideT = 0;
    shake = reduceMotion ? 0 : 1;
    burst(P.x, P.y + 0.8, -0.2, 22, C_HERO, 4.5, 6);
    burst(P.x, P.y + 0.8, -0.2, 10, 0xffffff, 3.5, 5);
    if (!reduceMotion) {
      ui.flash.classList.remove('on');
      void ui.flash.offsetWidth;
      ui.flash.classList.add('on');
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(120); } catch (e) { /* non disponibile */ }
    }
    ui.hint.classList.remove('on');
    shownHint = '';
  }

  function showGameOver() {
    state = 'over';
    overAt = performance.now();
    const s = score();
    const record = s > best;
    if (record) {
      best = s;
      store.set('cc.best', best);
    }
    ui.over.classList.toggle('is-record', record);
    ui.overTag.textContent = record ? 'Nuovo record!' : 'Corsa finita';
    ui.final.textContent = fmt(s);
    ui.stDist.textContent = fmt(dist) + ' m';
    ui.stOrbs.textContent = fmt(orbCount);
    ui.stBest.textContent = fmt(best);
    ui.best.textContent = fmt(best);
    ui.over.hidden = false;
    ui.pauseBtn.hidden = true;
  }

  function resetWorld() {
    while (obstacles.length) releaseObstacle(obstacles.length - 1);
    while (orbs.length) releaseOrb(orbs.length - 1);
    rows.length = 0;
    rowCount = 0;
    rowsPassed = 0;
    nextRowZ = -52;
    runT = 0;
    dist = 0;
    orbCount = 0;
    zoneIdx = 0;
    speed = SPEED_0;
    shake = 0;
    P.lane = 1;
    P.x = 0;
    P.y = 0;
    P.vy = 0;
    P.grounded = true;
    P.slideT = 0;
    P.slideQueued = false;
    P.jumpBuf = 0;
    shownScore = -1;
    shownOrbs = -1;
  }

  function startGame() {
    if (state !== 'ready' && state !== 'over') return;
    if (state === 'over' && performance.now() - overAt < 350) return;
    initAudio();
    resetWorld();
    state = 'playing';
    ui.start.hidden = true;
    ui.over.hidden = true;
    ui.pause.hidden = true;
    ui.hud.hidden = false;
    ui.pauseBtn.hidden = false;
    ui.best.textContent = fmt(best);
    music.on = true;
    music.step = 0;
    music.next = 0;
    sfx.start();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      ui.pause.hidden = false;
      ui.pauseBtn.hidden = true;
      suspendAudio();
    } else if (state === 'paused') {
      state = 'playing';
      ui.pause.hidden = true;
      ui.pauseBtn.hidden = false;
      resumeAudio();
      last = performance.now();
    }
  }

  // ---------------------------------------------------------------- comandi
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const code = e.code;
    const isJump = k === 'ArrowUp' || k === ' ' || code === 'Space' || code === 'KeyW';
    const isDown = k === 'ArrowDown' || code === 'KeyS';
    const isLeft = k === 'ArrowLeft' || code === 'KeyA';
    const isRight = k === 'ArrowRight' || code === 'KeyD';
    if (isJump || isDown || isLeft || isRight) e.preventDefault();
    if (!e.repeat) setHow(false);

    if (state === 'ready' || state === 'over') {
      if (!e.repeat && (k === 'Enter' || k === ' ' || code === 'Space')) startGame();
      return;
    }
    if (state === 'paused') {
      if (!e.repeat && (k === 'p' || k === 'P' || k === 'Escape' || k === 'Enter' || k === ' ')) togglePause();
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (!e.repeat) togglePause();
      return;
    }
    if (k === 'm' || k === 'M') {
      if (!e.repeat) setMuted(!audio.muted);
      return;
    }
    if (isDown) {
      keys.down = true;
      if (!e.repeat) slide();
      return;
    }
    if (e.repeat) return;
    if (isJump) jump();
    else if (isLeft) move(-1);
    else if (isRight) move(1);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  });

  // tocco: scorrimento in quattro direzioni, tocco breve = salto
  let ptr = null;
  const onControl = (e) => !!(e.target && e.target.closest && e.target.closest('button, a'));
  window.addEventListener('pointerdown', (e) => {
    if (onControl(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse') setHow(true);
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false, dir: '', live: state === 'playing' };
  });
  window.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    const base = Math.max(16, Math.min(window.innerWidth, window.innerHeight) * 0.04);
    const th = ptr.swiped ? base * 1.5 : base;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy < 0 ? 'U' : 'D');
    // Un gesto vale un'azione sola: proseguire nella stessa direzione non la ripete.
    // Cambiando direzione senza staccare il dito (es. di lato e poi in su) se ne fa un'altra.
    if (dir !== ptr.dir) {
      if (dir === 'R') move(1);
      else if (dir === 'L') move(-1);
      else if (dir === 'U') jump();
      else slide();
    }
    ptr.dir = dir;
    ptr.swiped = true;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
  });
  const endPointer = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (e.type === 'pointerup' && !ptr.swiped && ptr.live && performance.now() - ptr.t < 320) jump();
    ptr = null;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // niente scorrimento della pagina, zoom o menu contestuale durante il gioco
  document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => { e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  ui.start.addEventListener('click', startGame);
  ui.over.addEventListener('click', startGame);
  ui.pause.addEventListener('click', () => { if (state === 'paused') togglePause(); });
  ui.pauseBtn.addEventListener('click', () => { ui.pauseBtn.blur(); togglePause(); });
  ui.sound.addEventListener('click', () => {
    ui.sound.blur();
    setMuted(!audio.muted);
    if (!audio.muted && state === 'playing') initAudio();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });
  window.addEventListener('blur', () => {
    keys.down = false;
    if (state === 'playing') togglePause();
  });

  // ---------------------------------------------------------------- inquadratura e ridimensionamento
  const view = { fov: 58, h: 3.3, r: 7, introR: 4.8, introShift: 1.7, introY: 1.0, portrait: 0 };
  const INTRO_THETA = 2.52;
  const camTarget = new T.Vector3();

  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const t = clamp((1.3 - aspect) / 0.8, 0, 1);  // 0 = orizzontale, 1 = verticale
    view.portrait = t;
    view.fov = lerp(57, 77, t);
    view.h = lerp(3.3, 4.3, t);
    view.r = lerp(7.0, 8.2, t);
    view.introR = lerp(4.5, 5.0, t);
    view.introShift = lerp(1.6, 0, t);
    view.introY = lerp(1.05, 1.2, t);
    camera.aspect = aspect;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { setTimeout(resize, 120); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  function updateCamera(dt) {
    if (state === 'ready') camK = damp(camK, 0, 3, dt);
    else camK = Math.min(1, camK + dt / 1.15);
    const k = easeInOut(camK);

    const sway = reduceMotion ? 0 : Math.sin(time * 0.33) * 0.14;
    const th = lerp(INTRO_THETA + sway, 0, k);
    const r = lerp(view.introR, view.r, k);
    const hgt = lerp(1.5, view.h + P.y * 0.22, k);
    let cx = Math.sin(th) * r + P.x * 0.55 * k;
    let cy = hgt;
    const cz = Math.cos(th) * r;

    // bersaglio: all'inizio Bip (spostato per lasciare spazio ai testi), poi un punto più avanti
    const ix = -Math.cos(th) * view.introShift;
    const iz = Math.sin(th) * view.introShift;
    camTarget.set(
      lerp(ix, P.x * 0.6, k),
      lerp(view.introY, 1.25, k),
      lerp(iz, -9, k)
    );

    if (shake > 0.001) {
      cx += (Math.random() - 0.5) * shake * 0.5;
      cy += (Math.random() - 0.5) * shake * 0.4;
      shake = damp(shake, 0, 6, dt);
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(camTarget);

    const fov = view.fov + (state === 'playing' ? difficulty() * 6 : 0);
    if (Math.abs(fov - camera.fov) > 0.05) {
      camera.fov = damp(camera.fov, fov, 3, dt);
      camera.updateProjectionMatrix();
    }
    sky.position.copy(camera.position);
  }

  // ---------------------------------------------------------------- animazione di Bip
  function animateBip(dt) {
    let lean;
    let legL;
    let legR;
    let armL;
    let armR;
    let offY = 0;
    let offZ = 0;
    let headYaw = 0;
    const sliding = P.slideT > 0 && P.grounded;

    if (state === 'dead' || state === 'over') {
      lean = 1.42;
      legL = -0.5;
      legR = 0.35;
      armL = 2.5;
      armR = 2.1;
      offY = 0.14;
      offZ = 0.25;
    } else if (sliding) {
      lean = 1.2;
      legL = 0.05;
      legR = -0.6;
      armL = -0.55;
      armR = -0.35;
      offY = 0.1;
      offZ = -0.6;
    } else if (!P.grounded) {
      lean = clamp(-P.vy * 0.018, -0.22, 0.2) - 0.05;
      legL = 0.95;
      legR = -0.5;
      armL = 2.5;
      armR = 2.2;
    } else {
      P.phase += dt * (7 + Math.abs(speed) * 0.4);
      const s = Math.sin(P.phase);
      lean = -0.16;
      legL = s;
      legR = -s;
      armL = -s * 0.85;
      armR = s * 0.85;
      offY = Math.abs(Math.cos(P.phase)) * 0.06;
      if (state === 'ready') headYaw = -0.55 + Math.sin(time * 0.9) * 0.25;
    }

    P.lean = damp(P.lean, lean, 13, dt);
    P.legL = damp(P.legL, legL, 30, dt);
    P.legR = damp(P.legR, legR, 30, dt);
    P.armL = damp(P.armL, armL, 30, dt);
    P.armR = damp(P.armR, armR, 30, dt);
    P.offY = damp(P.offY, offY, 20, dt);
    P.offZ = damp(P.offZ, offZ, 13, dt);
    P.roll = damp(P.roll, clamp((P.x - LANES[P.lane]) * 0.3, -0.35, 0.35), 14, dt);
    P.headYaw = damp(P.headYaw, headYaw, 5, dt);

    bip.root.position.set(P.x, P.y, 0);
    bip.tilt.rotation.set(P.lean, 0, P.roll);
    bip.tilt.position.set(0, P.offY, P.offZ);
    bip.legL.rotation.x = P.legL;
    bip.legR.rotation.x = P.legR;
    bip.armL.rotation.x = P.armL;
    bip.armR.rotation.x = P.armR;
    bip.armL.rotation.z = -0.12;
    bip.armR.rotation.z = 0.12;
    bip.head.rotation.y = P.headYaw;
    bip.antenna.rotation.x = Math.sin(time * 11) * 0.16 + clamp(P.vy * 0.03, -0.4, 0.4);
    const thrust = !P.grounded && P.vy > 0 ? 1.7 : sliding ? 0.2 : 0.75;
    bip.flame.scale.set(1, thrust * (0.8 + Math.random() * 0.4), 1);
  }

  // ---------------------------------------------------------------- aggiornamento della scena
  function applyPalette(dt) {
    const z = ZC[zoneIdx % ZC.length];
    const k = dt >= 99 ? 1 : 1 - Math.exp(-0.9 * dt);
    COLOR_KEYS.forEach((key) => { pal[key].lerp(z[key], k); });
    NUM_KEYS.forEach((key) => { pal[key] = lerp(pal[key], z[key], k); });

    scene.fog.color.copy(pal.hor);
    renderer.setClearColor(pal.hor, 1);
    hemi.color.copy(pal.hemiSky);
    hemi.groundColor.copy(pal.hemiGnd);
    hemi.intensity = pal.hemiI;
    sun.color.copy(pal.sun);
    sun.intensity = pal.sunI;
    terrMat.color.copy(pal.ground);
    rockMat.color.copy(pal.peak).multiplyScalar(1.5);
    starsMat.opacity = pal.stars;
    paintMountains();
  }

  function updateScene(dt, dz) {
    roadTex.offset.y = (roadTex.offset.y + dz / TILE) % 1;
    roadGlowTex.offset.y = roadTex.offset.y;
    noiseTex.offset.y = (noiseTex.offset.y + dz / NOISE_TILE) % 1;

    mountains.update(dz);
    rocks.update(dz);
    sceneCrystals.update(dz);
    lampPosts.update(dz);
    lampHeads.update(dz);
    arches.update(dz);

    for (let i = 0; i < MOTE_N; i++) {
      let z = motePos[i * 3 + 2] + dz;
      if (z > 2) {
        z -= 100;
        motePos[i * 3] = rand(-16, 16);
        motePos[i * 3 + 1] = rand(0.3, 8);
      }
      motePos[i * 3 + 2] = z;
    }
    moteGeo.attributes.position.needsUpdate = true;

    mCrystal.emissiveIntensity = 0.55 + Math.sin(time * 4) * 0.18;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      o.mesh.position.z = o.z;
      const ud = o.mesh.userData;
      const near = clamp((o.z - SPAWN_Z) / 45, 0, 1);
      ud.glow.scale.set(ud.glow.userData.sx * near, ud.glow.userData.sz * near, 1);
      if (ud.spin) ud.spin.rotation.y = time * 2.2;
    }
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      o.mesh.position.set(o.x, o.y + Math.sin(time * 4 + o.z * 0.4) * 0.06, o.z);
      o.mesh.rotation.y = time * 3.2 + i;
    }
    updateParticles(dt, dz);
  }

  function updateHud(dt) {
    if (state === 'playing' || state === 'dead') {
      const s = score();
      if (s !== shownScore) {
        shownScore = s;
        ui.score.textContent = fmt(s);
      }
      if (orbCount !== shownOrbs) {
        shownOrbs = orbCount;
        ui.orbs.textContent = fmt(orbCount);
      }
    }
    if (state === 'playing') {
      const zi = Math.floor(dist / ZONE_LEN);
      if (zi !== zoneIdx) {
        zoneIdx = zi;
        sfx.zone();
        showToast('Zona ' + (zi + 1) + ' · ' + ZC[zi % ZC.length].name);
      }
      // suggerimento per la prossima riga della lezione iniziale
      let hint = '';
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.hint && !r.passed && r.z > -speed * 0.85 && r.z < 0.5) {
          hint = r.hint;
          break;
        }
      }
      if (hint !== shownHint) {
        shownHint = hint;
        if (hint) {
          ui.hint.textContent = HINTS[hint];
          ui.hint.dataset.k = hint;
        }
        ui.hint.classList.toggle('on', !!hint);
      }
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) ui.toast.classList.remove('on');
    }
  }

  // ---------------------------------------------------------------- qualità adattiva
  const perf = { acc: 0, n: 0, level: 0 };
  function trackPerf(dt) {
    if (state !== 'playing') return;
    perf.acc += dt;
    perf.n++;
    if (perf.acc < 2.5) return;
    const fps = perf.n / perf.acc;
    perf.acc = 0;
    perf.n = 0;
    if (fps >= 42 || perf.level >= 3) return;
    perf.level++;
    if (perf.level === 1) pixelRatio = Math.min(pixelRatio, 1.5);
    else if (perf.level === 2) pixelRatio = Math.min(pixelRatio, 1);
    else sun.castShadow = false;
    resize();
  }

  // ---------------------------------------------------------------- ciclo principale
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;

    if (state !== 'paused') {
      trackPerf(dt);
      time += dt;
      // passi brevi: a 32 m/s un fotogramma lungo salterebbe gli ostacoli
      const steps = Math.max(1, Math.ceil(dt / (1 / 110)));
      const h = dt / steps;
      let dz = 0;
      for (let i = 0; i < steps; i++) dz += sim(h);

      if (state === 'dead') {
        deadT += dt;
        if (deadT > 1.05) showGameOver();
      }
      applyPalette(dt);
      updateScene(dt, dz);
      animateBip(dt);
      updateHud(dt);
      musicTick();
    }
    updateCamera(state === 'paused' ? 0 : dt);
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- avvio
  function boot(data) {
    if (data && typeof data.best === 'number' && data.best > best) best = data.best;
    ui.startBest.textContent = fmt(best);
    ui.best.textContent = fmt(best);
    setMuted(audio.muted);
    applyPalette(99);
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(frame);
    });
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ best }));
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});

  // piccolo accesso in sola lettura, utile per le prove automatiche
  window.__corsa = {
    get state() { return state; },
    get speed() { return speed; },
    get score() { return score(); },
    get dist() { return dist; },
    get orbs() { return orbCount; },
    player: P,
    rows,
    obstacles,
  };
})();
