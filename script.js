import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/OrbitControls.js";
import { createNoise2D, createNoise3D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";
import * as dat from "https://cdn.jsdelivr.net/npm/dat.gui@0.7.9/build/dat.gui.module.js";

const noise2D = createNoise2D();
const noise3D = createNoise3D();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  petalCount: 240,
  petalLength: 18,
  petalSharpness: 4,
  twist: 0.5,
  noiseStrength: 0.4,
  growthSpeed: 0.002,
  hueShift: 1.5,
  leafCount: 4
};

const gui = new dat.GUI();
gui.add(params, "petalCount", 50, 400, 1).onFinishChange(rebuildPlant);
gui.add(params, "petalLength", 5, 30).onFinishChange(rebuildPlant);
gui.add(params, "petalSharpness", 2, 10, 1).onFinishChange(rebuildPlant);
gui.add(params, "twist", 0, 2).onFinishChange(rebuildPlant);
gui.add(params, "noiseStrength", 0, 1).onFinishChange(rebuildPlant);
gui.add(params, "leafCount", 1, 8, 1).onFinishChange(rebuildPlant);

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
function createPetals() {
  petals.clear();
  const k = params.petalSharpness;

  for (let i = 0; i < params.petalCount; i++) {
    const geometry = new THREE.BufferGeometry();
    const points = [];

    const baseAngle = (i / params.petalCount) * Math.PI * 2;

    for (let j = 0; j < 80; j++) {
      const t = j / 80;
      const theta = baseAngle + t * params.twist;

      const r =
        params.petalLength * Math.sin(k * theta) +
        noise3D(Math.cos(theta), Math.sin(theta), t) * params.noiseStrength;

      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const y = 25 + t * 2;

      points.push(x, y, z);
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(`hsl(${i * params.hueShift}, 100%, 65%)`)
    });

    petals.add(new THREE.Line(geometry, material));
  }
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
  renderer.render(scene, camera);
}

animate();
