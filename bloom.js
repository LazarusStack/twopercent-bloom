import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import qrcode from 'qrcode-generator';

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------
const DEFAULT_URL = 'mailto:twopersonclub@gmail.com';
const CELL = 0.34;          // world size of one QR module
const QUIET = 4;            // quiet-zone modules on the paper card (QR spec minimum)
const BLOOM_MS = 650;
const BOUQUET_CENTER = new THREE.Vector3(0, 3.35, 0);
const BOUQUET_R = 2.1;

const PALETTES = {
  blush:    { name: 'Blush',    petal: '#f67a93', center: '#c9cf5e', tile: '#6d2239', leaf: '#5d7f45' },
  peony:    { name: 'Peony',    petal: '#d9486f', center: '#c9cf5e', tile: '#5a1328', leaf: '#4f7a3c' },
  marigold: { name: 'Marigold', petal: '#eaa23a', center: '#8a3b12', tile: '#5b2a07', leaf: '#5d7f45' },
  lilac:    { name: 'Lilac',    petal: '#a98ddb', center: '#f6e08c', tile: '#35205e', leaf: '#557a4a' },
  club:     { name: 'Club',     petal: '#4a63ff', center: '#f6f1e4', tile: '#101b73', leaf: '#4a7141' },
  snow:     { name: 'Snow',     petal: '#f3efe6', center: '#e5b93f', tile: '#1c1c20', leaf: '#4f7a3c' },
};
// Narrow flowers need a size boost to read as a full bouquet
const FILL = { peony: 1, rose: 1.12, daisy: 1.08, tulip: 1.55, cat: 1.02, bear: 1.02, chick: 1 };
const BUDDIES = new Set(['cat', 'bear', 'chick']);
const FINDER_COLOR = '#2f4bff'; // the vase blue becomes the three "eyes"

const FLOWER_ICONS = {
  peony: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2"/><path d="M8 2.5c2 1.5 2 3.5 0 3.5S6 4 8 2.5ZM13.5 8c-1.5 2-3.5 2-3.5 0s2-2 3.5 0ZM8 13.5c-2-1.5-2-3.5 0-3.5s2 2 0 3.5ZM2.5 8C4 6 6 6 6 8s-2 2-3.5 0Z"/></svg>',
  rose:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 8.5c0-1 1.4-1 1.4 0s-1.2 2.2-2.8 1.6S5 7 7 6s4.4.4 4.2 3S8.4 13 6 12s-3.6-3.8-2-6.4S9.6 2 12 4"/></svg>',
  daisy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="1.6"/><path d="M8 1.5v3.2M8 11.3v3.2M1.5 8h3.2M11.3 8h3.2M3.4 3.4l2.2 2.2M10.4 10.4l2.2 2.2M12.6 3.4l-2.2 2.2M5.6 10.4l-2.2 2.2"/></svg>',
  cat:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6.5 3.5 2l3 2.5h3L12.5 2l.5 4.5a5 5 0 1 1-10 0Z"/><circle cx="6" cy="8" r=".6" fill="currentColor"/><circle cx="10" cy="8" r=".6" fill="currentColor"/></svg>',
  bear:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="4" cy="4.5" r="1.8"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="8" cy="9" r="5"/><ellipse cx="8" cy="10.5" rx="1.8" ry="1.3"/></svg>',
  chick: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="9" r="5.2"/><path d="M8 3.8c-.6-1.4 0-2.3 1-2.3M7.2 10l.8 1.2.8-1.2Z"/><circle cx="6" cy="8" r=".6" fill="currentColor"/><circle cx="10" cy="8" r=".6" fill="currentColor"/></svg>',
  kid:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="6" r="4"/><path d="M5.5 3.2c1-1.4 3.6-1.6 5.2 0M6.4 7.3c.8.7 2 .8 3.2-.2M3.5 15c.5-2.6 2.3-4 4.5-4s4 1.4 4.5 4"/></svg>',
  tulip: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 3.5 6 6l2-3 2 3 2-2.5V8a4 4 0 0 1-8 0V3.5ZM8 12v2.5"/></svg>',
};

// ------------------------------------------------------------------
// Procedural geometry
// ------------------------------------------------------------------
// A petal pointing along +Y with its edges cupped and tip curled toward -Z,
// then laid radially at `tilt` above horizontal around the flower's +Y axis.
const PR = rand(20260925); // phases for petal crumple — fixed so every flower of a type matches
function petal({ len, width, cup = 0.3, curl = 0.1, tilt, yaw, y = 0, shade = [0.72, 1], su = 8, sv = 6, vein = 0.14, crumple = 0, fringe = 0, round = true }) {
  const pos = [], col = [], idx = [];
  const ph1 = PR() * 6.283, ph2 = PR() * 6.283, amp = crumple * width;
  for (let i = 0; i <= su; i++) {
    const u = i / su;
    // Rounded "spoon" petal: narrow claw at the base, widest near the top, round cap.
    // Pointed outline (round=false) is kept for leaves.
    const w = round
      ? width * (u < 0.68 ? 0.28 + 0.72 * Math.sin((Math.PI / 2) * (u / 0.68)) : Math.sqrt(Math.max(0, 1 - ((u - 0.68) / 0.32) ** 2)))
      : width * Math.sin(Math.PI * Math.pow(u, 0.62)) * (1 - 0.12 * u);
    for (let j = 0; j <= sv; j++) {
      const v = (j / sv) * 2 - 1;
      // soft ruffle on the rim gives real petals their wavy edge
      const ruffle = (Math.sin(v * 5 + u * 3) * 0.02 + Math.sin(v * 13 + ph2) * 0.035 * fringe * 10 * Math.pow(u, 3)) * width;
      // serrated tip + crumpled surface: what makes a peony read as a peony
      const tip = 1 - fringe * Math.abs(Math.sin(v * 9 + ph1)) * Math.pow(u, 5); // small scallops, not spikes
      const crease = amp * Math.sin(u * 9 + ph1) * Math.sin(v * 6 + ph2) * u;
      pos.push(v * w, u * len * tip, -cup * v * v * w - curl * u * u * len + ruffle + crease);
      // base shadow → bright tip, darker midrib vein, lighter rim
      let s = shade[0] + (shade[1] - shade[0]) * Math.pow(u, 0.55);
      s *= 1 - vein * Math.exp(-v * v * 40) * (1 - u * 0.6);
      s *= 1 + 0.06 * v * v * u;
      col.push(s, s * (0.9 + 0.1 * u), s * (0.92 + 0.08 * u)); // deeper, warmer at the base
    }
  }
  for (let i = 0; i < su; i++) for (let j = 0; j < sv; j++) {
    const a = i * (sv + 1) + j, b = a + sv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.rotateX(Math.PI / 2 - tilt);
  g.rotateY(yaw);
  g.translate(0, y, 0);
  g.computeVertexNormals();
  return g;
}

// Solid shape helper: strips uv, adds flat vertex colour so it merges with petals
function solid(g, shade = 1) {
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(shade), 3));
  return g;
}

function disc(r, h, y, shade = 1) {
  const g = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  g.translate(0, y, 0);
  return solid(g, shade);
}

function ball(r, x, y, z, sx = 1, sy = 1, sz = 1, shade = 1, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return solid(g, shade);
}

// Little stamens ring the centre of open flowers
function stamens(n, r, h, y, seed) {
  const R = rand(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.3, rr = r * (0.5 + R() * 0.5);
    out.push(ball(0.024, Math.cos(a) * rr, y + h * (0.6 + R() * 0.4), Math.sin(a) * rr, 1, 1, 1, 1, 6));
  }
  return out;
}

const deg = (d) => (d * Math.PI) / 180;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Every figure is ~1 unit across and faces +Y. Parts are split by colour role:
// petal → palette main colour, center → palette accent, ink → fixed near-black.
function buildFlower(type) {
  const petals = [], centers = [], ink = [];
  const J = rand(hash(type));
  const j = (amt) => 1 + (J() - 0.5) * 2 * amt; // per-petal jitter so nothing looks stamped
  if (type === 'peony') {
    const layers = [
      { n: 12, len: 0.5, w: 0.25, tilt: 16, cup: 0.45, curl: -0.06 },
      { n: 12, len: 0.46, w: 0.24, tilt: 28, cup: 0.5, curl: 0.02 },
      { n: 12, len: 0.42, w: 0.23, tilt: 40, cup: 0.55, curl: 0.1 },
      { n: 11, len: 0.37, w: 0.21, tilt: 51, cup: 0.6, curl: 0.18 },
      { n: 10, len: 0.32, w: 0.19, tilt: 61, cup: 0.62, curl: 0.24 },
      { n: 9, len: 0.26, w: 0.16, tilt: 70, cup: 0.65, curl: 0.3 },
      { n: 7, len: 0.2, w: 0.12, tilt: 78, cup: 0.65, curl: 0.34 },
    ];
    layers.forEach((L, li) => {
      for (let k = 0; k < L.n; k++) petals.push(petal({
        len: L.len * j(0.16), width: L.w * j(0.2), cup: L.cup * j(0.2), curl: L.curl * j(0.4), tilt: deg(L.tilt * j(0.18) + 2),
        yaw: (k / L.n) * Math.PI * 2 + li * 0.41 + (J() - 0.5) * 0.4, y: li * 0.02,
        shade: [0.58 + li * 0.04, 1], su: 10, sv: 8, crumple: 0.2, fringe: 0.06,
      }));
    });
    centers.push(disc(0.07, 0.05, 0.1, 0.85), ...stamens(22, 0.09, 0.07, 0.1, 7));
  } else if (type === 'rose') {
    const n = 34;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);               // 0 = outer, 1 = inner bud
      petals.push(petal({
        len: (0.52 - t * 0.32) * j(0.06), width: (0.31 - t * 0.17) * j(0.08), cup: 0.55 + t * 0.35,
        curl: t < 0.35 ? -0.2 : 0.28 * t, tilt: deg(12 + t * 78), yaw: k * GOLDEN * 1.02,
        y: t * 0.1, shade: [0.5 + t * 0.12, 0.98 - t * 0.14], vein: 0.08, crumple: 0.15, fringe: 0,
      }));
    }
  } else if (type === 'daisy') {
    for (let layer = 0; layer < 2; layer++) {
      const n = 16;
      for (let k = 0; k < n; k++) petals.push(petal({
        len: (0.48 - layer * 0.05) * j(0.08), width: 0.07 * j(0.12), cup: 0.28, curl: -0.06 * j(0.5), tilt: deg((8 + layer * 12) * j(0.3)),
        yaw: (k / n) * Math.PI * 2 + layer * (Math.PI / n), y: layer * 0.015, shade: [0.78, 1], su: 8, sv: 4, vein: 0.2, crumple: 0.15, fringe: 0.04,
      }));
    }
    centers.push(disc(0.13, 0.08, 0.02, 1));
    for (let i = 0; i < 34; i++) { // seed-head florets in a sunflower spiral
      const r = 0.12 * Math.sqrt(i / 34), a = i * GOLDEN;
      centers.push(ball(0.016, Math.cos(a) * r, 0.1 - r * 0.35, Math.sin(a) * r, 1, 1, 1, 0.8, 6));
    }
  } else if (type === 'tulip') {
    for (let k = 0; k < 6; k++) petals.push(petal({
      len: 0.6 * j(0.05), width: 0.3, cup: 0.72, curl: 0.12 * j(0.3), tilt: deg((k % 2 ? 64 : 72) * j(0.04)),
      yaw: (k / 6) * Math.PI * 2 + (k % 2 ? 0.25 : 0), y: -0.12, shade: [0.55, 1], vein: 0.1, crumple: 0.18,
    }));
  } else if (type === 'cat') {
    petals.push(ball(0.42, 0, 0, 0, 1, 0.78, 0.92));
    for (const s of [-1, 1]) {
      const ear = solid(new THREE.ConeGeometry(0.15, 0.3, 12));
      ear.rotateX(-Math.PI / 2); ear.rotateY(s * -0.35); ear.translate(s * 0.25, 0.04, -0.4);
      petals.push(ear);
      const inner = solid(new THREE.ConeGeometry(0.08, 0.18, 10), 1);
      inner.rotateX(-Math.PI / 2); inner.rotateY(s * -0.35); inner.translate(s * 0.25, 0.1, -0.38);
      centers.push(inner);
      ink.push(ball(0.055, s * 0.15, 0.3, -0.06, 1, 0.6, 1.25));
      centers.push(ball(0.07, s * 0.26, 0.26, 0.1, 1, 0.3, 0.7)); // cheeks
    }
    centers.push(ball(0.13, 0, 0.3, 0.12, 1.2, 0.5, 0.8));      // muzzle
    ink.push(ball(0.035, 0, 0.38, 0.06, 1.3, 0.7, 0.9));         // nose
  } else if (type === 'bear') {
    petals.push(ball(0.42, 0, 0, 0, 1, 0.8, 0.95));
    for (const s of [-1, 1]) {
      petals.push(ball(0.14, s * 0.3, 0.02, -0.32, 1, 0.55, 1));
      centers.push(ball(0.08, s * 0.3, 0.08, -0.31, 1, 0.4, 1));
      ink.push(ball(0.05, s * 0.15, 0.31, -0.08, 1, 0.6, 1));
    }
    centers.push(ball(0.17, 0, 0.29, 0.13, 1.15, 0.55, 0.85));   // snout
    ink.push(ball(0.05, 0, 0.42, 0.07, 1.25, 0.7, 0.85));        // nose
    ink.push(ball(0.012, 0, 0.4, 0.17, 1, 1, 4, 1, 6));          // mouth line
  } else { // chick
    petals.push(ball(0.43, 0, 0, 0, 1, 0.82, 1));
    for (let k = 0; k < 3; k++) { // head tuft
      const t = solid(new THREE.ConeGeometry(0.05, 0.22, 8));
      t.rotateX(-Math.PI / 2 - 0.4); t.rotateY((k - 1) * 0.5); t.translate((k - 1) * 0.06, 0.18, -0.44);
      petals.push(t);
    }
    for (const s of [-1, 1]) {
      ink.push(ball(0.055, s * 0.16, 0.33, -0.04, 1, 0.6, 1));
      centers.push(ball(0.07, s * 0.27, 0.27, 0.1, 1, 0.3, 0.7));
    }
    const beak = solid(new THREE.ConeGeometry(0.08, 0.16, 10), 1);
    beak.rotateX(Math.PI / 2); beak.translate(0, 0.36, 0.1);
    centers.push(beak);
  }
  const parts = [{ role: 'petal', geometry: mergeGeometries(petals) }];
  if (centers.length) parts.push({ role: 'center', geometry: mergeGeometries(centers) });
  if (ink.length) parts.push({ role: 'ink', geometry: mergeGeometries(ink) });
  return parts;
}

function buildLeaf() {
  const g = petal({ len: 0.62, width: 0.14, cup: -0.35, curl: -0.12, tilt: Math.PI / 2, yaw: 0, shade: [0.55, 1], su: 8, sv: 4, round: false });
  // V-fold along the midrib
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - Math.abs(p.getX(i)) * 0.35);
  g.computeVertexNormals();
  return g;
}

function vaseTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 1024, 512);
  x.fillStyle = FINDER_COLOR;
  x.fillRect(0, 0, 1024, 60); x.fillRect(0, 452, 1024, 60);
  x.fillRect(0, 86, 1024, 14); x.fillRect(0, 412, 1024, 14);
  x.font = '900 120px Archivo, "Arial Black", sans-serif';
  x.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const cx = i * 341 + 40;
    x.fillStyle = FINDER_COLOR;
    x.fillText('2', cx, 256);
    x.fillText('%', cx + 78, 256);
    // little QR-ish squares as ornament
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) {
      if ((r * 7 + q * 3 + i) % 3 === 0) continue;
      x.fillRect(cx + 210 + q * 22, 212 + r * 22, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------
// Scene
// ------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c4b0, 1.5));
const sun = new THREE.DirectionalLight(0xfff1e2, 2.6);
sun.position.set(4, 9, 6);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xdfe6ff, 0.6);
rim.position.set(-6, 3, -4);
scene.add(rim);

// Vase
const vase = new THREE.Group();
{
  const prof = [[0, 0], [0.62, 0], [0.7, 0.05], [0.78, 0.5], [0.8, 1.2], [0.74, 1.85], [0.7, 2.05], [0.76, 2.2], [0.7, 2.24], [0.64, 2.2]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 72),
    new THREE.MeshStandardMaterial({ map: vaseTexture(), roughness: 0.28, metalness: 0 }),
  );
  vase.add(body);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  vase.add(shadow);
}
scene.add(vase);

// Butterflies: a handful flutter around the bouquet and fly off when it blooms
function wingGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(0.15, 0.32, 0.62, 0.42, 0.58, 0.12);   // fore wing
  sh.bezierCurveTo(0.55, -0.02, 0.3, -0.04, 0.22, -0.05);
  sh.bezierCurveTo(0.42, -0.14, 0.4, -0.42, 0.18, -0.36); // hind wing
  sh.bezierCurveTo(0.06, -0.32, 0.02, -0.12, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 10);
  g.rotateX(-Math.PI / 2);            // lie flat, span along +X, body along Z
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {  // darker near the body, bright wing edge
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const c = 0.8 + 0.2 * Math.min(1, r / 0.5);
    col.push(c, c, c);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const wingGeo = wingGeometry();
const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5 });
const bodyMat = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.6 });
const bodyGeo = new THREE.CapsuleGeometry(0.03, 0.26, 4, 8).rotateX(Math.PI / 2);
const butterflies = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const L = new THREE.Mesh(wingGeo, wingMat), Rw = new THREE.Mesh(wingGeo, wingMat);
  Rw.scale.x = -1;
  const wl = new THREE.Group(), wr = new THREE.Group();
  wl.add(L); wr.add(Rw);
  g.add(wl, wr, new THREE.Mesh(bodyGeo, bodyMat));
  g.userData = { wl, wr, phase: i * 1.37, speed: 0.22 + i * 0.035, radius: BOUQUET_R + 0.7 + (i % 3) * 0.35, dir: i % 2 ? 1 : -1, size: 0.38 + (i % 3) * 0.07 };
  scene.add(g);
  butterflies.push(g);
}
const _look = new THREE.Vector3();
function flyButterflies(time, bloom) {
  for (const b of butterflies) {
    const u = b.userData;
    const at = (t) => {
      const a = u.dir * t * u.speed + u.phase;
      return new THREE.Vector3(
        Math.cos(a) * u.radius,
        BOUQUET_CENTER.y + 0.4 + Math.sin(t * 0.9 + u.phase) * 1.1 + bloom * 5,
        Math.sin(a) * u.radius * 0.8,
      );
    };
    b.position.copy(at(time));
    b.lookAt(_look.copy(at(time + 0.05)));
    const flap = Math.sin(time * 14 + u.phase * 3) * 0.9;
    u.wl.rotation.z = flap;
    u.wr.rotation.z = -flap;
    b.scale.setScalar(Math.max(1e-4, u.size * (1 - bloom)));
    b.visible = bloom < 0.999;
  }
}

// QR card (paper + quiet zone) — always light so phones can read it in dark mode too
const cardMat = new THREE.MeshBasicMaterial({ color: '#fbfaf7', transparent: true, opacity: 0 });
const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cardMat);
card.rotation.x = -Math.PI / 2;
card.renderOrder = -1;
scene.add(card);

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
const state = {
  url: DEFAULT_URL, flower: 'peony', palette: 'blush',
  target: 0, p: 0, spin: 0, n: 0,
};

let flowerMeshes = [];  // InstancedMesh[] for flower parts
let leafMesh = null, tileMesh = null, finderMesh = null;
let items = [];         // per-flower animation data
let leaves = [];
let tiles = [];         // {x,z,finder}

const petalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
const centerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const inkMat = new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.35 });
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
const tileMat = new THREE.MeshLambertMaterial();
const finderMat = new THREE.MeshLambertMaterial({ color: FINDER_COLOR });
const leafGeo = buildLeaf();
const tileGeo = new THREE.BoxGeometry(1, 1, 1);
const geoCache = {};

function rand(seed) { // deterministic so the same link always makes the same bouquet
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hash(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; }

function makeQR(text) {
  const qr = qrcode(0, 'Q');
  qr.addData(unescape(encodeURIComponent(text)), 'Byte');
  qr.make();
  return qr;
}

function isFinder(r, c, n) {
  const inBox = (r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return inBox(0, 0) || inBox(0, n - 7) || inBox(n - 7, 0);
}

function disposeMeshes() {
  for (const m of [...flowerMeshes, leafMesh, tileMesh, finderMesh]) if (m) { scene.remove(m); m.dispose(); }
  flowerMeshes = []; leafMesh = tileMesh = finderMesh = null;
}

const UP = new THREE.Vector3(0, 1, 0);

// Face points along `d`; the top of the head (local -Z) leans toward world up
function uprightFacing(d, roll = 0) {
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
  if (up.lengthSq() < 1e-4) up.set(0, 0, -1);
  up.normalize().applyAxisAngle(d, roll);
  const z = up.clone().negate();
  const x = new THREE.Vector3().crossVectors(d, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
}

function build() {
  let qr;
  try { qr = makeQR(state.url); } catch { note('That link is too long for a QR code.'); return false; }
  note('');
  disposeMeshes();

  const n = qr.getModuleCount();
  state.n = n;
  const isKid = isKidFig(state.flower);
  kid.visible = isKid;
  vase.visible = !isKid;
  if (!isKid && camera.near !== 0.1) { camera.near = 0.1; camera.far = 200; camera.updateProjectionMatrix(); }
  if (isKid) {
    const want = KID_FIGURES[state.flower] || KID_DEFAULT;
    if (want !== kidStyle) { kidStyle = want; rebuildKidBody(); }
    items = []; leaves = []; tiles = [];
    card.visible = false;
    buildKid(qr);
    frame(0, true);
    return true;
  }
  const R = rand(hash(state.url + state.flower));
  const off = ((n - 1) / 2) * CELL;

  const flowerCells = [];
  tiles = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    const x = c * CELL - off, z = r * CELL - off;
    const finder = isFinder(r, c, n);
    tiles.push({ x, z, finder });
    if (!finder) flowerCells.push({ x, z });
  }

  // Bouquet: a few dozen big "hero" blooms cover the dome; the rest wait inside the ball
  // and burst out on bloom. Hundreds of tiny flowers on the surface just read as noise.
  const N = flowerCells.length;
  const buddy = BUDDIES.has(state.flower);
  const yMin = -0.55;
  const K = Math.min(N, buddy ? 90 : 72);
  const slots = [];
  for (let i = 0; i < K; i++) {
    const y = 1 - ((i + 0.5) / K) * (1 - yMin);
    const rr = Math.sqrt(1 - y * y);
    const phi = i * GOLDEN;
    slots.push({ d: new THREE.Vector3(Math.cos(phi) * rr, y, Math.sin(phi) * rr), hero: true });
  }
  for (let i = K; i < N; i++) {
    const d = new THREE.Vector3(R() * 2 - 1, R() * 1.6 - 0.6, R() * 2 - 1).normalize();
    slots.push({ d, hero: false });
  }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }

  const heroScale = Math.sqrt((2 * Math.PI * BOUQUET_R * BOUQUET_R * (1 - yMin)) / Math.max(K, 1)) * 1.3 * FILL[state.flower];
  const gridScale = CELL * 0.9 * Math.min(1.3, FILL[state.flower]);

  items = flowerCells.map((cell, i) => {
    const { d, hero } = slots[i];
    const depth = hero ? 1 - R() * 0.08 : 0.45 + R() * 0.35;
    const bPos = d.clone().multiplyScalar(BOUQUET_R * depth).add(BOUQUET_CENTER);
    let bQuat, gQuat;
    if (buddy) {
      bQuat = uprightFacing(d, (R() - 0.5) * 0.5);
      gQuat = new THREE.Quaternion().setFromAxisAngle(UP, (R() - 0.5) * 0.35);
    } else {
      const twist = new THREE.Quaternion().setFromAxisAngle(UP, R() * Math.PI * 2);
      bQuat = new THREE.Quaternion().setFromUnitVectors(UP, d).multiply(twist);
      gQuat = new THREE.Quaternion().setFromAxisAngle(UP, R() * Math.PI * 2);
    }
    const dist = Math.hypot(cell.x, cell.z) / (off * 1.42 || 1);
    return {
      ao: hero ? 0.9 + 0.1 * R() : 0.6,
      bPos, bQuat, bScale: heroScale * (hero ? 0.88 + R() * 0.3 : 0.5),
      gPos: new THREE.Vector3(cell.x, 0.05, cell.z), gQuat, gScale: gridScale * (1 + R() * 0.08),
      delay: dist * 0.12 + R() * 0.06,
      lift: 0.4 + R() * 0.9,
      tint: [(R() - 0.5) * 0.04, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12],
    };
  });

  // Flower parts
  geoCache[state.flower] ||= buildFlower(state.flower);
  flowerMeshes = geoCache[state.flower].map(({ role, geometry }) => {
    const mat = role === 'center' ? centerMat : role === 'ink' ? inkMat : petalMat;
    const m = new THREE.InstancedMesh(geometry, mat, N);
    m.userData.role = role;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });

  // Greenery around the rim of the bouquet
  const L = Math.round(Math.min(160, 60 + N * 0.2));
  leaves = [];
  for (let i = 0; i < L; i++) {
    const a = (i / L) * Math.PI * 2 + R() * 0.3;
    const elev = -0.55 + R() * 1.4;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev));
    const pos = dir.clone().multiplyScalar(BOUQUET_R * (0.66 + R() * 0.14)).add(BOUQUET_CENTER);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir)
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, R() * Math.PI * 2));
    leaves.push({ pos, q, s: 0.75 + R() * 0.45, delay: R() * 0.2 });
  }
  leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, L);
  leafMesh.frustumCulled = false;
  leafMesh.visible = !buddy;
  scene.add(leafMesh);

  // Tiles
  const data = tiles.filter((t) => !t.finder), eyes = tiles.filter((t) => t.finder);
  tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, data.length);
  finderMesh = new THREE.InstancedMesh(tileGeo, finderMat, eyes.length);
  tileMesh.userData.tiles = data; finderMesh.userData.tiles = eyes;
  scene.add(tileMesh, finderMesh);

  const size = (n + QUIET * 2) * CELL;
  card.scale.set(size, size, 1);

  recolor();
  frame(0, true);
  return true;
}

function recolor() {
  if (isKidFig(state.flower) && state.n) { build(); return; }
  const pal = PALETTES[state.palette];
  const base = new THREE.Color(pal.petal), center = new THREE.Color(pal.center), leaf = new THREE.Color(pal.leaf);
  const c = new THREE.Color();
  for (const m of flowerMeshes) {
    if (m.userData.role === 'ink') continue;
    const src = m.userData.role === 'center' ? center : base;
    items.forEach((it, i) => { c.copy(src).offsetHSL(it.tint[0], it.tint[1], it.tint[2] * 0.6).multiplyScalar(it.ao); m.setColorAt(i, c); });
    m.instanceColor.needsUpdate = true;
  }
  if (leafMesh) {
    leaves.forEach((l, i) => { c.copy(leaf).offsetHSL((i % 5) * 0.006, 0, ((i * 7) % 11) / 11 * 0.1 - 0.05); leafMesh.setColorAt(i, c); });
    leafMesh.instanceColor.needsUpdate = true;
  }
  tileMat.color.set(pal.tile);
  wingMat.color.set(pal.petal);
  document.querySelectorAll('#palettes button').forEach((b) => b.setAttribute('aria-checked', b.dataset.id === state.palette));
}

// ------------------------------------------------------------------
// Animation
// ------------------------------------------------------------------
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const spinQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
const swayQ = new THREE.Quaternion(), swayE = new THREE.Euler();

function frame(dt, force = false) {
  const moving = state.p !== state.target;
  if (moving) {
    const step = dt / (isKidFig(state.flower) ? KID_MS : BLOOM_MS);
    state.p = state.target > state.p ? Math.min(1, state.p + step) : Math.max(0, state.p - step);
  }
  const idle = state.p === 0 && !reduceMotion;
  if (idle && !isKidFig(state.flower)) state.spin += dt * 0.00012;
  if (!moving && !idle && !force && state.p === 1) return false;

  const p = state.p;
  spinQ.setFromAxisAngle(UP, state.spin);
  const time = reduceMotion ? 0 : performance.now() / 1000;
  if (isKidFig(state.flower)) {
    flyButterflies(time, 1);
    kidFrame(p, time);
    return true;
  }

  items.forEach((it, i) => {
    const e = easeInOut(clamp01((p - it.delay) / (1 - 0.18)));
    tmpV.copy(it.bPos).sub(BOUQUET_CENTER).applyQuaternion(spinQ).add(BOUQUET_CENTER);
    P.lerpVectors(tmpV, it.gPos, e);
    P.y += Math.sin(e * Math.PI) * it.lift;
    // idle life: each bloom nods and breathes on its own rhythm, fading out as it flies
    const life = 1 - e;
    swayE.set(Math.sin(time * 1.1 + i * 0.7) * 0.07 * life, 0, Math.cos(time * 0.9 + i * 1.3) * 0.07 * life);
    Q.copy(spinQ).multiply(it.bQuat).multiply(swayQ.setFromEuler(swayE)).slerp(it.gQuat, e);
    S.setScalar(THREE.MathUtils.lerp(it.bScale * (1 + Math.sin(time * 1.6 + i) * 0.025 * life), it.gScale, e));
    M.compose(P, Q, S);
    for (const m of flowerMeshes) m.setMatrixAt(i, M);
  });
  for (const m of flowerMeshes) m.instanceMatrix.needsUpdate = true;

  leaves.forEach((l, i) => {
    const e = easeInOut(clamp01((p - l.delay) / 0.5));
    P.copy(l.pos).sub(BOUQUET_CENTER).applyQuaternion(spinQ).add(BOUQUET_CENTER);
    P.y -= e * 1.2;
    swayE.set(Math.sin(time * 1.3 + i) * 0.1, 0, 0);
    Q.copy(spinQ).multiply(l.q).multiply(swayQ.setFromEuler(swayE));
    S.setScalar(Math.max(1e-4, l.s * (1 - e)));
    M.compose(P, Q, S);
    leafMesh.setMatrixAt(i, M);
  });
  leafMesh.instanceMatrix.needsUpdate = true;

  const eTiles = easeInOut(clamp01((p - 0.35) / 0.55));
  for (const m of [tileMesh, finderMesh]) {
    m.userData.tiles.forEach((t, i) => {
      P.set(t.x, 0.02 * eTiles, t.z);
      S.set(CELL * 0.985 * eTiles || 1e-4, 0.04 * eTiles || 1e-4, CELL * 0.985 * eTiles || 1e-4);
      M.compose(P, Q.identity(), S);
      m.setMatrixAt(i, M);
    });
    m.instanceMatrix.needsUpdate = true;
  }
  cardMat.opacity = easeInOut(clamp01((p - 0.2) / 0.5));
  card.visible = cardMat.opacity > 0.001;

  const eVase = easeInOut(clamp01(p / 0.45));
  vase.scale.setScalar(Math.max(1e-4, 1 - eVase));
  vase.position.y = -eVase * 0.8;
  vase.rotation.y = state.spin;
  flyButterflies(reduceMotion ? 0 : performance.now() / 1000, easeInOut(clamp01(p / 0.4)));

  // Flowers deepen on the grid so the scanner reads them as dark modules
  const eDark = easeInOut(clamp01((p - 0.5) / 0.5));
  petalMat.color.setScalar(THREE.MathUtils.lerp(1, 0.3, eDark));
  centerMat.color.setScalar(THREE.MathUtils.lerp(1, 0.26, eDark));

  placeCamera(easeInOut(p));
  return true;
}

// Camera blends between a 3/4 bouquet view and straight-down grid view
const camA = { dir: new THREE.Vector3(0, 0.22, 1).normalize(), target: new THREE.Vector3(0, 2.95, 0) };
const camB = { dir: new THREE.Vector3(0, 1, 0.0001).normalize(), target: new THREE.Vector3(0, 0, 0) };
let view = { w: 1, h: 1, ox: 0, oy: 0, effW: 1, effH: 1 };

// Distance at which a w×h box fills the usable part of the screen (outside the panel)
function fitDistance(w, h) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fx = view.effW / view.w, fy = view.effH / view.h;
  return Math.max(h / 2 / (t * fy), w / 2 / (t * camera.aspect * fx));
}

function placeCamera(e) {
  const dA = fitDistance(5.6, 6.2) * 1.15;
  const size = (state.n + QUIET * 2) * CELL;
  const dB = fitDistance(size, size) * 1.08;
  const dir = tmpV.lerpVectors(camA.dir, camB.dir, e).normalize();
  const target = new THREE.Vector3().lerpVectors(camA.target, camB.target, e);
  camera.position.copy(target).addScaledVector(dir, THREE.MathUtils.lerp(dA, dB, e));
  camera.up.set(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), e).normalize();
  camera.lookAt(target);
}

// ------------------------------------------------------------------
// Kid mode: an original cheeky kid. The QR is a tiny woven label on the
// shirt pocket; tapping zooms the camera in until the thread weave is the code.
// ------------------------------------------------------------------
const KID = 'kid';
const KID_FIGURES = { kid: null };            // figure id → style override (null = default look)
const isKidFig = (id) => id in KID_FIGURES;
const KID_MS = 2100;

// Look of the kid. A local-only module (see boot) can swap this for a personal fan-art style.
const KID_DEFAULT = {
  yarn: null, ground: '#f4efe4', stripes: true,       // null yarn = palette's dark colour
  shorts: '#2e3a57', hair: '#2b1d17', skin: '#f1c29f',
  head: 'round', brows: 'thin', eyes: 'classic', tufts: true, cheeks: true,
  hairCap: [1.38, -0.5, 1], headScale: 1, nose: true, mouth: 'grin', eyeSpread: 0.32, browSize: 1, earSize: 1,
  fibreDark: null, fibreLight: '#f4efe4',
};
let kidStyle = KID_DEFAULT;

const kid = new THREE.Group();
kid.visible = false;
scene.add(kid);

const std = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
const kidMats = {
  skin: std('#f1c29f', 0.55), skinShade: std('#e3a987', 0.6), hair: std('#2b1d17', 0.45),
  shorts: std('#2e3a57', 0.8), sock: std('#f6f3ee', 0.9), shoe: std('#f3f1ec', 0.5), sole: std('#d94f3d', 0.6),
  eyeWhite: std('#fbfaf7', 0.25), pupil: std('#1a1412', 0.2), mouth: std('#7a2a2a', 0.5), cheek: std('#f39b8f', 0.8),
  shirt: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
};
const sleeveMat = new THREE.MeshStandardMaterial({ roughness: 0.95, bumpScale: 1.5 });
// the fibre layer is invisible until the last moment of the zoom
const macroMat = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, opacity: 0, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

// The shirt is a plain striped knit. Only at the very end of the zoom do the fibres
// that make up the fabric resolve into a woven 2D grid of QR codes.
const STITCH = 0.0045;       // world size of one knit stitch
const STRIPE_PERIOD = 0.09;  // world height of one stripe repeat
const FIBRE_TILE = 0.02;     // world size of one woven QR tile: microscopic
const FIBRE_TILES = 9;       // tiles across the revealed patch
const CREAM = '#f4efe4';

function stitchSprite(hex, s, k) {
  const size = Math.max(2, Math.ceil(s));
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const col = new THREE.Color(hex);
  const css = (m) => `rgb(${Math.min(255, col.r * 255 * m * k) | 0},${Math.min(255, col.g * 255 * m * k) | 0},${Math.min(255, col.b * 255 * m * k) | 0})`;
  x.fillStyle = css(0.55); x.fillRect(0, 0, size, size);
  for (const side of [-1, 1]) {
    x.save();
    x.translate(size / 2 + side * size * 0.2, size * 0.5);
    x.rotate(side * -0.5);
    const g = x.createLinearGradient(-size * 0.2, 0, size * 0.2, 0);
    g.addColorStop(0, css(0.75)); g.addColorStop(0.5, css(1.12)); g.addColorStop(1, css(0.7));
    x.fillStyle = g;
    x.beginPath(); x.ellipse(0, 0, size * 0.2, size * 0.52, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  return c;
}

// One stripe repeat of knit, tiled across the shirt
function knitTexture(yarnHex, groundHex = CREAM, stripes = true) {
  const rows = Math.round(STRIPE_PERIOD / STITCH), band = Math.round(rows * 0.42), cols = 32, px = 12;
  const c = document.createElement('canvas'); c.width = cols * px; c.height = rows * px;
  const x = c.getContext('2d'), sprites = {};
  const sprite = (hex, v) => (sprites[hex + v] ||= stitchSprite(hex, px, 0.9 + v * 0.07));
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    x.drawImage(sprite(stripes && r >= band ? groundHex : yarnHex, (hash(`${r},${q}`) >>> 3) % 4), q * px, r * px, px, px);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const knitFit = (tex, w, h) => { tex.repeat.set(w / (32 * STITCH), h / STRIPE_PERIOD); return tex; };

// One seamless tile: the QR (with its quiet zone) as over-under woven fibres
function fibreTile(qr, darkHex, lightHex = CREAM) {
  const n = qr.getModuleCount(), T = n + QUIET * 2, size = 1024, m = size / T, s = m / 3;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const R = rand(hash(state.url + 'fibre'));
  const dark = new THREE.Color(darkHex), light = new THREE.Color(lightHex);
  const css = (col, k) => `rgb(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0})`;
  for (let r = -QUIET; r < n + QUIET; r++) for (let q = -QUIET; q < n + QUIET; q++) {
    const inside = r >= 0 && q >= 0 && r < n && q < n;
    const col = inside && qr.isDark(r, q) ? dark : light;
    const ox = (q + QUIET) * m, oy = (r + QUIET) * m;
    x.fillStyle = css(col, 0.72); x.fillRect(ox, oy, m, m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const px = ox + j * s, py = oy + i * s, k = 0.93 + R() * 0.14;
      const horizontal = (i + j + r + q) % 2 === 0;
      const g = horizontal ? x.createLinearGradient(0, py, 0, py + s) : x.createLinearGradient(px, 0, px + s, 0);
      g.addColorStop(0, css(col, 0.8 * k)); g.addColorStop(0.45, css(col, 1.08 * k)); g.addColorStop(1, css(col, 0.74 * k));
      x.fillStyle = g;
      const inset = s * 0.12;
      x.beginPath();
      if (horizontal) x.roundRect(px - s * 0.05, py + inset, s * 1.1, s - inset * 2, s * 0.35);
      else x.roundRect(px + inset, py - s * 0.05, s - inset * 2, s * 1.1, s * 0.35);
      x.fill();
    }
  }
  x.lineWidth = 1;
  for (let i = 0; i < 500; i++) { // stray fibres
    const px = R() * size, py = R() * size, a = R() * Math.PI, l = 3 + R() * 8;
    x.strokeStyle = `rgba(255,255,255,${0.06 + R() * 0.08})`;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(FIBRE_TILES, FIBRE_TILES);
  return t;
}

// Head shape. 'onigiri' widens the lower face into round cheeks and narrows the crown,
// smoothly (the factor fades to zero at the poles). Skull, hair and features all use it.
const HEAD_C = new THREE.Vector3(0, 2.45, 0), HEAD_R = new THREE.Vector3(0.67, 0.59, 0.62); // HEAD_R is set per style
function shapeHead(v) { // v: point on the unit sphere → shaped point (before HEAD_R scaling)
  if (kidStyle.head !== 'onigiri') return v;
  const y = v.y, band = Math.sqrt(Math.max(0, 1 - y * y));
  const f = 1 + 0.3 * (0.45 - y) * band;
  return v.set(v.x * f, y > 0 ? y * 0.9 : y * 1.02, v.z * (1 + 0.12 * (0.3 - y) * band));
}
function headGeometry(thetaLength = Math.PI, grow = 1) {
  const g = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, thetaLength);
  const P = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    shapeHead(v.fromBufferAttribute(P, i));
    P.setXYZ(i, v.x * HEAD_R.x * grow, v.y * HEAD_R.y * grow, v.z * HEAD_R.z * grow);
  }
  g.computeVertexNormals();
  return g;
}
function headPoint(yaw, pitch) {
  const v = shapeHead(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)));
  return v.multiply(HEAD_R);
}
// Point + outward normal on the head surface, for placing facial features
function onHead(yaw, pitch, lift = 0) {
  const p = headPoint(yaw, pitch), e = 0.01;
  const t1 = headPoint(yaw + e, pitch).sub(p), t2 = headPoint(yaw, pitch + e).sub(p);
  const nrm = new THREE.Vector3().crossVectors(t1, t2).normalize();
  if (nrm.dot(p) < 0) nrm.negate();
  return { p: p.addScaledVector(nrm, lift).add(HEAD_C), n: nrm };
}
function feature(mesh, yaw, pitch, lift = 0) {
  const { p, n } = onHead(yaw, pitch, lift);
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  g.add(mesh);
  return g;
}
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);

const kidParts = {};
function rebuildKidBody() {
  for (const c of [...kid.children]) { kid.remove(c); c.traverse?.((o) => o.geometry?.dispose()); }
  buildKidBody();
}

function buildKidBody() {
  const M = kidMats, K = kidStyle;
  M.skin.color.set(K.skin); M.hair.color.set(K.hair); M.shorts.color.set(K.shorts);
  HEAD_R.set(...(K.head === 'onigiri' ? [0.7, 0.6, 0.62] : [0.67, 0.59, 0.62]));
  // legs + shoes
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 12), M.skin); leg.position.set(s * 0.2, 0.52, 0); kid.add(leg);
    const sock = mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.16, 16), M.sock); sock.position.set(s * 0.2, 0.24, 0); kid.add(sock);
    const shoe = mesh(new RoundedBoxGeometry(0.3, 0.16, 0.46, 4, 0.07), M.shoe); shoe.position.set(s * 0.2, 0.09, 0.06); kid.add(shoe);
    const sole = mesh(new RoundedBoxGeometry(0.31, 0.05, 0.47, 3, 0.02), M.sole); sole.position.set(s * 0.2, 0.025, 0.06); kid.add(sole);
  }
  const shorts = mesh(new RoundedBoxGeometry(0.86, 0.38, 0.58, 4, 0.13), M.shorts); shorts.position.y = 0.92; kid.add(shorts);
  // one knitted torso: the front face carries the hidden QR, the other faces plain knit
  const torsoGeo = new RoundedBoxGeometry(0.92, 0.8, 0.58, 5, 0.2);
  const torso = mesh(torsoGeo, M.shirt);
  torso.position.y = 1.43; kid.add(torso);
  // measure the front face so stitches map 1:1 onto it
  const g4 = torsoGeo.groups[4], P4 = torsoGeo.attributes.position, I4 = torsoGeo.index;
  let xmax = 0, ymax = 0;
  for (let i = g4.start; i < g4.start + g4.count; i++) { const v = I4 ? I4.getX(i) : i; xmax = Math.max(xmax, P4.getX(v)); ymax = Math.max(ymax, P4.getY(v)); }
  kidParts.face = { w: xmax * 2, h: ymax * 2, flatW: 0.92 - 0.4, flatH: 0.8 - 0.4, cx: 0, cy: 1.43, z: 0.29 };
  // hi-res close-up of the hidden QR patch, sitting exactly over the same stitches
  const macro = mesh(new THREE.PlaneGeometry(1, 1), macroMat); kid.add(macro);
  kidParts.macro = macro;
  const neck = mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.16, 16), M.skin); neck.position.y = 1.86; kid.add(neck);

  // arms on shoulder pivots so they can wave
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.5, 1.72, 0);
    const sleeve = mesh(new THREE.CapsuleGeometry(0.135, 0.2, 6, 12), sleeveMat); sleeve.position.y = -0.17; arm.add(sleeve);
    const fore = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 6, 12), M.skin); fore.position.y = -0.5; arm.add(fore);
    const hand = mesh(new THREE.SphereGeometry(0.11, 16, 12), M.skin); hand.position.y = -0.74; hand.scale.set(1, 1.1, 0.8); arm.add(hand);
    kid.add(arm);
    kidParts[s < 0 ? 'armR' : 'armL'] = arm; // kid's right arm is on the viewer's left
  }

  // head
  const head = new THREE.Group();
  const skull = mesh(headGeometry(), M.skin); skull.position.copy(HEAD_C); head.add(skull);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.14 * K.earSize, 16, 12), M.skin); ear.scale.set(0.5, 1, 0.8); ear.position.copy(onHead(s * Math.PI / 2, -0.05).p); head.add(ear);
  }
  // hair: a cap pushed back to show the forehead, plus messy tufts and a cowlick
  const [capTheta, capTilt, capScale] = K.hairCap;
  const cap = mesh(headGeometry(capTheta, 1.035 * capScale), M.hair);
  cap.rotation.x = capTilt; cap.position.copy(HEAD_C).add(new THREE.Vector3(0, 0.02, -0.02)); head.add(cap);
  const TR = rand(77);
  for (let i = 0; i < (K.tufts ? 14 : 0); i++) {
    const tuft = mesh(new THREE.SphereGeometry(1, 10, 8), M.hair); tuft.scale.set(0.07, 0.17, 0.05);
    const yaw = (TR() - 0.5) * 2.6, pitch = 0.45 + TR() * 0.5;
    const { p, n } = onHead(yaw, pitch, 0.02);
    tuft.position.copy(p).addScaledVector(n, 0.03);
    tuft.quaternion.setFromUnitVectors(UP, n.clone().add(new THREE.Vector3((TR() - 0.5) * 0.6, 0.3, 0.25)).normalize());
    head.add(tuft);
  }
  const cow = mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 20, Math.PI * 1.4), M.hair);
  cow.position.set(0.05, 3.08, -0.02); cow.rotation.set(0, 0.3, 0.6); if (K.tufts) head.add(cow);

  // face
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    if (K.eyes === 'dark') { // solid dark oval eyes with a single highlight
      const iris = mesh(new THREE.SphereGeometry(0.1, 20, 14), M.pupil); iris.scale.set(0.85, 1.15, 0.35); eye.add(iris);
      const glint = mesh(new THREE.SphereGeometry(0.022, 8, 6), M.eyeWhite); glint.position.set(0.025, 0.04, 0.04); eye.add(glint);
    } else {
      const white = mesh(new THREE.SphereGeometry(0.12, 20, 14), M.eyeWhite); white.scale.set(0.95, 1.15, 0.45); eye.add(white);
      const pupil = mesh(new THREE.SphereGeometry(0.065, 16, 12), M.pupil); pupil.position.set(0.025, -0.01, 0.045); pupil.scale.z = 0.5; eye.add(pupil);
      const glint = mesh(new THREE.SphereGeometry(0.018, 8, 6), M.eyeWhite); glint.position.set(0.05, 0.035, 0.075); eye.add(glint);
    }
    const g = feature(eye, s * K.eyeSpread, 0.1, -0.01); head.add(g); eyes.push(eye);
    // thin brows, one cocked up for the cheeky look
    if (K.brows === 'thick') {
      const brow = mesh(new THREE.CapsuleGeometry(0.04 * K.browSize, 0.1 * K.browSize, 6, 12), M.hair);
      brow.rotation.z = Math.PI / 2 - s * 0.18; brow.scale.z = 0.55;
      head.add(feature(brow, s * (K.eyeSpread + 0.04), 0.3, 0.012));
    } else {
      const brow = mesh(new THREE.TorusGeometry(0.1, 0.017, 6, 16, Math.PI * 0.7), M.hair);
      brow.rotation.z = Math.PI * 0.15 + (s > 0 ? 0.25 : 0);
      head.add(feature(brow, s * 0.32, s > 0 ? 0.36 : 0.31, 0.005));
    }
    if (K.cheeks) {
      const cheek = mesh(new THREE.SphereGeometry(0.11, 16, 10), M.cheek); cheek.scale.set(1, 0.7, 0.25);
      head.add(feature(cheek, s * 0.52, -0.12, -0.012));
    }
  }
  kidParts.eyes = eyes;
  if (K.nose) { const nose = mesh(new THREE.SphereGeometry(0.05, 12, 10), M.skinShade); head.add(feature(nose, 0, -0.03, 0.01)); }
  if (K.mouth === 'open') { // small open mouth with a tongue
    const mouth = new THREE.Group();
    const hole = mesh(new THREE.SphereGeometry(0.1, 24, 12), M.mouth); hole.scale.set(0.95, 0.5, 0.18); mouth.add(hole);
    const tongue = mesh(new THREE.SphereGeometry(0.06, 16, 10), M.cheek); tongue.scale.set(1.15, 0.55, 0.2); tongue.position.set(0, -0.022, 0.012); mouth.add(tongue);
    head.add(feature(mouth, 0.02, -0.33, 0.004));
  } else {
    // lopsided grin: an arc tilted up on one side
    const grin = mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 24, Math.PI * 0.85), M.mouth);
    grin.rotation.z = Math.PI + 0.35; head.add(feature(grin, 0.05, -0.27, 0.0));
    const dimple = mesh(new THREE.SphereGeometry(0.02, 8, 6), M.skinShade); head.add(feature(dimple, 0.3, -0.2, 0));
  }
  // head pivots at the neck so it can be scaled per style and nod naturally
  const neckY = 1.86, pivot = new THREE.Group();
  pivot.position.set(0, neckY, 0); head.position.set(0, -neckY, 0); pivot.add(head);
  pivot.scale.setScalar(K.headScale);
  kid.add(pivot);
  kidParts.head = pivot;
  // framing for the full-body shot follows the figure's real size
  const box = new THREE.Box3().setFromObject(kid);
  kidParts.fit = new THREE.Vector2(Math.max(2.8, box.max.x - box.min.x + 0.6), box.max.y - box.min.y + 0.3);
  kidParts.fitCenter = box.getCenter(new THREE.Vector3()).setX(0).setZ(0);
}
buildKidBody();

function buildKid(qr) {
  const K = kidStyle;
  const yarn = K.yarn || PALETTES[state.palette].tile; // default: Breton stripes in the palette's dark yarn
  for (const mat of [macroMat, kidMats.shirt, sleeveMat]) mat.map?.dispose();
  const knit = knitTexture(yarn, K.ground, K.stripes);
  kidMats.shirt.map = knitFit(knit, 0.92, 0.8); kidMats.shirt.bumpMap = knit; kidMats.shirt.bumpScale = 1.5; kidMats.shirt.needsUpdate = true;
  const sl = knitFit(knit.clone(), 0.85, 0.47); sl.needsUpdate = true;
  sleeveMat.map = sl; sleeveMat.bumpMap = sl; sleeveMat.needsUpdate = true;

  // the hidden fibre grid: a patch of woven QR tiles on the chest, one tile centred on the zoom point
  const fib = fibreTile(qr, K.fibreDark || yarn, K.fibreLight);
  macroMat.map = fib; macroMat.bumpMap = fib; macroMat.needsUpdate = true;
  const macro = kidParts.macro, face = kidParts.face;
  macro.geometry.dispose(); macro.geometry = new THREE.PlaneGeometry(FIBRE_TILE * FIBRE_TILES, FIBRE_TILE * FIBRE_TILES);
  const R = rand(hash(state.url + 'spot')); // "any part of the shirt": the spot moves with the link
  macro.position.set(face.cx + (R() - 0.5) * face.flatW * 0.7, face.cy + (R() - 0.5) * face.flatH * 0.7, face.z + 0.0006);
}

const _lp = new THREE.Vector3(), _ln = new THREE.Vector3(), _kq = new THREE.Quaternion();
function kidFrame(p, time) {
  const e = easeInOut(p);
  const life = 1 - easeInOut(clamp01(p * 2.2)); // idle motion settles early so the camera can lock on
  kid.position.y = Math.abs(Math.sin(time * 2.2)) * 0.05 * life;
  kid.rotation.y = Math.sin(time * 0.6) * 0.35 * life + state.spin * life;
  kidParts.head.rotation.z = Math.sin(time * 1.3) * 0.06 * life;
  kidParts.head.rotation.x = Math.sin(time * 0.9) * 0.04 * life;
  kidParts.armL.rotation.z = (2.5 + Math.sin(time * 7) * 0.35) * life + 0.12 * (1 - life); // waving
  kidParts.armR.rotation.z = -0.14 - Math.sin(time * 1.4) * 0.05 * life;
  const blink = (time % 3.6) < 0.12 ? 0.1 : 1;
  for (const eye of kidParts.eyes) eye.scale.y = reduceMotion ? 1 : blink;

  // Camera: one quintic ease drives a geometric (constant-feeling) zoom. The aim point and
  // view direction are tied to the zoom *distance*, so the spot we dive into stays pinned on screen.
  kid.updateMatrixWorld(true);
  kidParts.macro.getWorldPosition(_lp);
  _ln.set(0, 0, 1).applyQuaternion(kid.getWorldQuaternion(_kq));
  const z = p * p * p * (p * (p * 6 - 15) + 10);
  const dFull = fitDistance(kidParts.fit.x, kidParts.fit.y) * 1.1;
  const dEnd = fitDistance(FIBRE_TILE, FIBRE_TILE) * 1.12;
  const d = dFull * Math.pow(dEnd / dFull, z);
  const k = (dFull - d) / (dFull - dEnd);
  const target = kidParts.fitCenter.clone().lerp(_lp, k);
  const dir = new THREE.Vector3(0, 0.12, 1).normalize().lerp(_ln, k).normalize();
  camera.position.copy(target).addScaledVector(dir, d);
  camera.up.set(0, 1, 0);
  // fibres resolve into the QR grid as magnification passes a threshold, not on a timer
  const reveal = clamp01(Math.log((dEnd * 7) / d) / Math.log(7 / 1.15));
  macroMat.opacity = reveal * reveal * (3 - 2 * reveal);
  kidParts.macro.visible = macroMat.opacity > 0.001;
  camera.lookAt(target);
  // clip planes follow the zoom so the fabric neither clips nor flickers up close
  camera.near = Math.max(0.004, d * 0.05); camera.far = d * 40 + 20;
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------
const panel = document.getElementById('panel');
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const mobile = w <= 860;
  const rect = panel.getBoundingClientRect();
  const head = document.querySelector('.brand').getBoundingClientRect();
  let ox = 0, oy = 0, effW = w, effH = h;
  if (mobile) {
    const bottom = h - rect.top;
    document.documentElement.style.setProperty('--sheet', `${bottom}px`);
    const top = head.bottom + 8;
    effH = Math.max(200, h - bottom - top - 50);
    oy = (bottom + 50 - top) / 2;
  } else {
    const right = w - rect.left + 16;
    effW = w - right;
    ox = right / 2;
  }
  view = { w, h, ox, oy, effW, effH };
  camera.aspect = w / h;
  camera.setViewOffset(w, h, ox, oy, w, h);
  camera.updateProjectionMatrix();
  frame(0, true);
}

// ------------------------------------------------------------------
// Loop
// ------------------------------------------------------------------
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now();
function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  if (reduceMotion && state.p !== state.target) state.p = state.target;
  frame(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------
// UI
// ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const urlInput = $('url'), hint = $('hint'), bloomBtn = $('bloomBtn');

function note(msg) { $('note').textContent = msg; }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1600);
}

function toggleBloom(force) {
  state.target = typeof force === 'number' ? force : state.target ? 0 : 1;
  const open = state.target === 1;
  document.body.classList.toggle('is-bloomed', open);
  syncCopy();
  hint.classList.add('is-quiet');
  syncShare();
}

function syncCopy() {
  const open = state.target === 1, isKid = isKidFig(state.flower);
  hint.textContent = isKid
    ? (open ? 'Tap to zoom back out' : 'Tap the kid to zoom into the shirt')
    : (open ? 'Tap to gather the bouquet' : 'Tap the bouquet to bloom a QR code');
  bloomBtn.textContent = isKid ? (open ? 'Zoom out' : 'Zoom in') : (open ? 'Gather it' : 'Bloom it');
}

function shareUrl() {
  const u = new URL(location.href.split('?')[0]);
  u.searchParams.set('u', state.url);
  u.searchParams.set('f', state.flower);
  u.searchParams.set('p', state.palette);
  return u.toString();
}
function syncShare() {
  const link = shareUrl();
  history.replaceState(null, '', link);
  const text = 'Made a QR code out of flowers 🌸';
  $('shareX').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
  $('shareIn').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
}

function renderControls() {
  const btn = (id) => `<button role="radio" data-id="${id}" aria-checked="${id === state.flower}">${FLOWER_ICONS[id]}${id[0].toUpperCase() + id.slice(1)}</button>`;
  $('flowers').innerHTML = Object.keys(FLOWER_ICONS).filter((id) => !BUDDIES.has(id) && !isKidFig(id)).map(btn).join('');
  $('buddies').innerHTML = [...BUDDIES, ...Object.keys(KID_FIGURES)].map(btn).join('');
  $('palettes').innerHTML = Object.entries(PALETTES).map(([id, p]) =>
    `<button role="radio" data-id="${id}" aria-checked="${id === state.palette}"><i style="background:${p.petal}"></i>${p.name}</button>`).join('');
}

function pickFigure(e) {
  const b = e.target.closest('button'); if (!b || b.dataset.id === state.flower) return;
  state.flower = b.dataset.id;
  document.querySelectorAll('#flowers button, #buddies button').forEach((x) => x.setAttribute('aria-checked', x === b));
  build(); syncCopy(); syncShare();
}
$('flowers').addEventListener('click', pickFigure);
$('buddies').addEventListener('click', pickFigure);
$('palettes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.palette = b.dataset.id; recolor(); syncShare();
});

let typing;
urlInput.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    const v = urlInput.value.trim();
    if (!v) { note('Add a link to grow your bouquet.'); return; }
    state.url = v;
    if (build()) syncShare();
  }, 260);
});
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { urlInput.blur(); toggleBloom(1); } });

// Tap vs drag: only a clean tap toggles
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!down || state.p > 0) return;
  state.spin += (e.clientX - down.lx) * 0.008;
  down.lx = e.clientX;
});
canvas.addEventListener('pointerup', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) toggleBloom();
  down = null;
});
canvas.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBloom(); } });
hint.addEventListener('click', () => toggleBloom());
bloomBtn.addEventListener('click', () => toggleBloom());

$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); toast('Link copied'); } catch { toast('Copy failed. Use the address bar.'); }
});

$('download').addEventListener('click', () => {
  // Render a square, high-res frame without the panel offset
  const size = 1800, prev = { ...view }, prevPR = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  camera.clearViewOffset(); camera.aspect = 1;
  view = { w: size, h: size, ox: 0, oy: 0, effW: size, effH: size };
  camera.updateProjectionMatrix();
  placeCamera(easeInOut(state.p));
  const bg = renderer.getClearColor(new THREE.Color()), bgA = renderer.getClearAlpha();
  renderer.setClearColor(state.p > 0.5 ? '#fbfaf7' : getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f2f0eb', 1);
  renderer.render(scene, camera);
  const data = canvas.toDataURL('image/png');
  renderer.setClearColor(bg, bgA);
  renderer.setPixelRatio(prevPR);
  view = prev;
  resize();
  const a = document.createElement('a');
  a.href = data; a.download = `bloom-${state.flower}-${state.palette}.png`; a.click();
});

// Theme: light by default, remembered per browser
const themeBtn = $('theme');
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
applyTheme(document.documentElement.dataset.theme || 'light');
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('bloom-theme', next); } catch {}
});

// Mobile sheet
const grip = $('grip');
grip.addEventListener('click', () => {
  const open = panel.dataset.open !== 'true';
  panel.dataset.open = open; grip.setAttribute('aria-expanded', open);
  requestAnimationFrame(resize);
});

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
const requestedFigure = new URLSearchParams(location.search).get('f'); // kept for figures that load later
{
  const q = new URLSearchParams(location.search);
  if (q.get('u')) state.url = q.get('u');
  if (FLOWER_ICONS[q.get('f')]) state.flower = q.get('f');
  if (PALETTES[q.get('p')]) state.palette = q.get('p');
  urlInput.value = state.url;
}
renderControls();
build();
syncCopy();
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  import('./figures.local.js').then(({ default: figs }) => {
    for (const [id, f] of Object.entries(figs)) { KID_FIGURES[id] = { ...KID_DEFAULT, ...f.style }; FLOWER_ICONS[id] = f.icon; }
    renderControls();
    if (KID_FIGURES[requestedFigure] && state.flower !== requestedFigure) { state.flower = requestedFigure; renderControls(); build(); syncCopy(); syncShare(); }
  }).catch(() => {});
}
syncShare();
addEventListener('resize', resize);
new ResizeObserver(resize).observe(panel);
resize();
requestAnimationFrame(loop);
