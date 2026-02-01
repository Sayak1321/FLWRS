import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/OrbitControls.js";
import { createNoise2D, createNoise3D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";
import * as dat from "https://cdn.jsdelivr.net/npm/dat.gui@0.7.9/build/dat.gui.module.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/UnrealBloomPass.js";


const noise2D = createNoise2D();
const noise3D = createNoise3D();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);


const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 2.2;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  2.2,  // strength (glow power)
  0.8,  // radius (spread)
  0.1   // threshold (LOW = more glow)
);

const petalVertexShader = `
varying float vPos;

void main() {
  vPos = position.x; // along petal length
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const petalFragmentShader = `
varying float vPos;

void main() {
  float t = clamp(vPos, 0.0, 1.0);

  vec3 baseColor = vec3(1.0, 0.6, 0.0);   // orange base
  vec3 tipColor  = vec3(1.0, 1.0, 0.2);   // bright yellow tip

  vec3 color = mix(baseColor, tipColor, t);

  gl_FragColor = vec4(color * 1.8, 1.0); // HDR boost for bloom
}
`;


composer.addPass(bloomPass);



window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

//
// 🖱 Camera Controls
//
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

//
// 🎛 Flower DNA Controls
//
const params = {
  // 🌻 sunflower core
  seedCount: 1200,
  spread: 0.60,
  lineLength: 1.2,
  hueShift: 0.2,

  // 🌼 petal layers
  innerPetals: 1000,
  outerPetals: 1200,
  petalSize: 1.0,
  petalWidth: 0.4,

  // animation
  growthSpeed: 0.0015
};


const gui = new dat.GUI();
gui.add(params, "seedCount", 200, 3000, 10).onFinishChange(rebuildPlant);
gui.add(params, "spread", 0.1, 1).onFinishChange(rebuildPlant);
gui.add(params, "lineLength", 0.2, 3).onFinishChange(rebuildPlant);
gui.add(params, "innerPetals", 5, 2000, 1).onFinishChange(rebuildPlant);
gui.add(params, "outerPetals", 10, 3000, 1).onFinishChange(rebuildPlant);
gui.add(params, "petalSize", 0, 1).onFinishChange(rebuildPlant);
gui.add(params, "petalWidth", 0, 5).onFinishChange(rebuildPlant);
gui.add(bloomPass, "strength", 0, 3).onFinishChange(rebuildPlant);
gui.add(bloomPass, "radius", 0, 1).onFinishChange(rebuildPlant);
gui.add(bloomPass, "threshold", 0, 1).onFinishChange(rebuildPlant);


//
// 🌱 Growth
//
let growth = 0;

//
// 🌿 Groups
//
const plant = new THREE.Group();
const petals = new THREE.Group();
const sepals = new THREE.Group();
const leaves = new THREE.Group();
const stem = new THREE.Group();

plant.add(petals, sepals, leaves, stem);
scene.add(plant);

//
// 🌳 Stem
//
let stemLine, stemPositions;
function createStem() {
  stem.clear();
  const geometry = new THREE.BufferGeometry();
  stemPositions = new Float32Array(60 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(stemPositions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x2e8b57 });
  stemLine = new THREE.Line(geometry, material);
  stem.add(stemLine);
}
createStem();

function updateStem() {
  const visible = Math.floor(growth * 60);
  for (let i = 0; i < visible; i++) {
    const t = i / 60;
    stemPositions[i * 3] = noise2D(t, 0) * 1.2;
    stemPositions[i * 3 + 1] = t * 25;
    stemPositions[i * 3 + 2] = noise2D(0, t) * 1.2;
  }
  stemLine.geometry.attributes.position.needsUpdate = true;
}

//
// 🌸 GEOMETRIC PETALS
//

function createPetalRing(count, baseRadius, hue, tiltAmount) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {

    const angle = i * goldenAngle;
    const radius = baseRadius + Math.sqrt(i) * 0.8;

    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -params.petalWidth, 0, 0,
      params.petalSize, 0, 0,
      params.petalWidth, 0, 0
    ], 3));

    const material = new THREE.ShaderMaterial({
  vertexShader: petalVertexShader,
  fragmentShader: petalFragmentShader
    });

    const petal = new THREE.Line(geometry, material);

    // Position petal
    petal.position.set(x, 25, z);

    // Face outward from center
    petal.lookAt(0, 25, 0);

    // Tilt outward
    petal.rotation.z = tiltAmount;

    petals.add(petal);
  }
}

function createPetals() {
  petals.clear();

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // 🌻 CENTER DISC
  for (let n = 0; n < params.seedCount; n++) {
    const angle = n * goldenAngle;
    const radius = params.spread * Math.sqrt(n);

    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);

    const dx = params.lineLength * Math.cos(angle);
    const dz = params.lineLength * Math.sin(angle);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
      new THREE.Float32BufferAttribute([x, 25, z, x + dx, 25, z + dz], 3)
    );

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(`hsl(${n * params.hueShift}, 100%, 60%)`)
    });

    petals.add(new THREE.Line(geometry, material));
  }

  // inner layer (denser, smaller spread)
  createPetalRing(params.innerPetals, 16, 45, Math.PI / 10);

  // outer layer (larger spiral)
  createPetalRing(params.outerPetals, 22, 55, Math.PI / 4);
}


function updatePetals() {
  const bloom = Math.max(0, (growth - 0.5) * 2);
  petals.scale.set(bloom, bloom, bloom);
  petals.rotation.y += 0.002;
}

//
// 🍃 Leaves
//
function createLeaf(angleOffset) {
  const geometry = new THREE.BufferGeometry();
  const points = [];

  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const length = t * 16;
    const bend = noise2D(t * 2, angleOffset) * 2;
    points.push(Math.cos(angleOffset) * bend, 10 - length, Math.sin(angleOffset) * bend);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x2f6b1f });
  leaves.add(new THREE.Line(geometry, material));
}

function createLeaves() {
  leaves.clear();
  for (let i = 0; i < params.leafCount; i++) {
    createLeaf(Math.random() * Math.PI * 2);
  }
}

function updateLeaves() {
  const spread = Math.max(0, (growth - 0.6) * 2);
  leaves.scale.set(spread, spread, spread);
}

//
// ♻ Rebuild
//
function rebuildPlant() {
  growth = 0;
  createStem();
  createPetals();
  createLeaves();
}

createPetals();
createLeaves();

//
// 🔄 Animation
//
function animate() {
  requestAnimationFrame(animate);

  if (growth < 1) growth += params.growthSpeed;

  updateStem();
  updatePetals();
  updateLeaves();

  controls.update();
  composer.render();

}

animate();
