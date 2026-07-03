import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/OrbitControls.js";
import { createNoise2D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";
import * as dat from "https://cdn.jsdelivr.net/npm/dat.gui@0.7.9/build/dat.gui.module.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/UnrealBloomPass.js";

const noise2D = createNoise2D();

/* -----------------------------------------------------------
   Scene / renderer / camera / composer
----------------------------------------------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x05070a, 0.006);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 40, 110);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.8;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // strength
  0.7, // radius
  0.15 // threshold
);
composer.addPass(bloomPass);

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 20, 0);

scene.add(new THREE.AmbientLight(0x223344, 1.2));
scene.add(new THREE.HemisphereLight(0x223344, 0x030502, 0.6));

/* -----------------------------------------------------------
   Shaders
----------------------------------------------------------- */
const hslHelpers = `
  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }
`;

const petalVertexShader = `
  varying float vT;
  void main() {
    vT = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const petalFragmentShader = `
  ${hslHelpers}
  uniform float hueBase;
  uniform float hueTip;
  uniform float sat;
  uniform float light;
  uniform float glow;
  varying float vT;

  void main() {
    float t = clamp(vT, 0.0, 1.0);
    float hue = mix(hueBase, hueTip, t);
    // Interpolate lightness to fade to pink/white near the tip (t -> 1.0)
    float currentLight = mix(light, light + (1.0 - light) * 0.7 * t, t);
    vec3 color = hsl2rgb(vec3(hue, sat, currentLight));
    color *= (1.0 + t * glow);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const discVertexShader = `
  varying vec3 vColor;
  attribute vec3 instanceColor;
  void main() {
    vColor = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const discFragmentShader = `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

/* -----------------------------------------------------------
   Parameters
----------------------------------------------------------- */
const params = {
  flowerCount: 5,
  fieldSpacing: 14,

  seedCount: 80,
  spread: 0.1,
  discRadius: 3.2,

  petalCount: 6,
  petalLength: 5.5,
  petalWidth: 0.35,
  petalCurl: 0.95,
  petalDroop: 0.45,

  hueBase: 0.01,
  hueTip: 0.05,
  discHue: 0.1,
  saturation: 0.95,
  lightness: 0.45,
  glow: 1.4,

  growthSpeed: 0.0012,
  swaySpeed: 0.25,
  autoRotate: true
};

/* -----------------------------------------------------------
   Curved petal geometry
----------------------------------------------------------- */
function buildPetalGeometry(length, width, curl, droop) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width * 0.5, length * 0.45, 0, length);
  shape.quadraticCurveTo(-width * 0.5, length * 0.45, 0, 0);

  const geo = new THREE.ShapeGeometry(shape, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = y / length;

    let px = y;
    let py = 0;
    const curlAngle = (curl || 0.8) * Math.PI * 0.8;
    if (curlAngle > 0.01) {
      const R = length / curlAngle;
      const a = t * curlAngle;
      px = R * Math.sin(a);
      py = -R * (1.0 - Math.cos(a));
    }

    py -= Math.pow(t, 2.0) * (droop || 0.35) * length * 0.5;

    const waveFreq = 10.0;
    const waveAmp = width * 0.25 * Math.sin(t * Math.PI);
    const wavyX = x + Math.sin(t * Math.PI * waveFreq) * waveAmp;

    pos.setXYZ(i, px, py, wavyX);
    uv.setXY(i, uv.getX(i), t);
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildStamenGeometry(length) {
  const points = [];
  const steps = 16;
  const curveLength = length;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = curveLength * (t * 0.75 + 0.25 * Math.sin(t * Math.PI * 0.5));
    const y = curveLength * Math.pow(t, 2.2) * 0.75;
    points.push(new THREE.Vector3(x, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 24, 0.05, 5, false);
  return geo;
}

function buildPistilGeometry(length) {
  const points = [];
  const steps = 16;
  const curveLength = length;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = curveLength * (t * 0.72 + 0.28 * Math.sin(t * Math.PI * 0.5));
    const y = curveLength * Math.pow(t, 2.0) * 0.82;
    points.push(new THREE.Vector3(x, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 24, 0.05, 5, false);
  return geo;
}

function makePetalMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: petalVertexShader,
    fragmentShader: petalFragmentShader,
    uniforms: {
      hueBase: { value: params.hueBase },
      hueTip: { value: params.hueTip },
      sat: { value: params.saturation },
      light: { value: params.lightness },
      glow: { value: params.glow }
    },
    side: THREE.DoubleSide
  });
}

/* -----------------------------------------------------------
   Flower factory
----------------------------------------------------------- */
function createFlower(offset, delay, heightScale) {
  const group = new THREE.Group();
  group.position.copy(offset);

  const stemGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  group.add(stemGroup, headGroup);

  const stemHeight = 22 * heightScale;

  const swayX = (Math.random() - 0.5) * 4;
  const swayZ = (Math.random() - 0.5) * 4;
  const stemPoints = [];
  const SEGMENTS = 24;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    stemPoints.push(
      new THREE.Vector3(
        noise2D(t * 2, offset.x) * 1.5 + swayX * t * t,
        t * stemHeight,
        noise2D(offset.z, t * 2) * 1.5 + swayZ * t * t
      )
    );
  }
  const stemCurve = new THREE.CatmullRomCurve3(stemPoints);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 40, 0.35, 6, false);
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b57,
    roughness: 0.6,
    emissive: 0x0a3d1f,
    emissiveIntensity: 0.3
  });
  stemGroup.add(new THREE.Mesh(stemGeo, stemMat));

  const bulbGeo = new THREE.SphereGeometry(1.6 * heightScale, 16, 16);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x4a3235,
    roughness: 0.9,
    emissive: 0x140508,
    emissiveIntensity: 0.2
  });
  const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
  bulbMesh.position.set(stemPoints[0].x, 0.4, stemPoints[0].z);
  bulbMesh.scale.set(1.1, 0.8, 1.1);
  group.add(bulbMesh);

  headGroup.position.set(swayX, stemHeight, swayZ);

  const discGeo = new THREE.CircleGeometry(0.2, 5);
  const discMat = new THREE.ShaderMaterial({
    vertexShader: discVertexShader,
    fragmentShader: discFragmentShader
  });
  const discMesh = new THREE.InstancedMesh(discGeo, discMat, params.seedCount);
  const colorArray = new Float32Array(params.seedCount * 3);
  discMesh.geometry.setAttribute(
    "instanceColor",
    new THREE.InstancedBufferAttribute(colorArray, 3)
  );
  const dummy = new THREE.Object3D();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const c = new THREE.Color();
  for (let n = 0; n < params.seedCount; n++) {
    const angle = n * goldenAngle;
    const r = params.spread * Math.sqrt(n);
    dummy.position.set(r * Math.cos(angle), 0, r * Math.sin(angle));
    dummy.lookAt(0, 5, 0);
    dummy.updateMatrix();
    discMesh.setMatrixAt(n, dummy.matrix);
    const hue = params.discHue + (n / params.seedCount) * 0.04;
    c.setHSL(((hue % 1) + 1) % 1, params.saturation * 0.7, params.lightness * 0.3);
    c.toArray(colorArray, n * 3);
  }
  discMesh.instanceMatrix.needsUpdate = true;
  headGroup.add(discMesh);

  const receptacleGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const receptacleMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b57,
    roughness: 0.8
  });
  const receptacle = new THREE.Mesh(receptacleGeo, receptacleMat);
  headGroup.add(receptacle);

  const petalGeo = buildPetalGeometry(
    params.petalLength,
    params.petalWidth,
    params.petalCurl,
    params.petalDroop
  );
  const stamenGeo = buildStamenGeometry(params.petalLength * 1.55);
  const pistilGeo = buildPistilGeometry(params.petalLength * 1.75);

  const pedicelsGroup = new THREE.Group();
  const floretsGroup = new THREE.Group();
  headGroup.add(pedicelsGroup, floretsGroup);

  const florets = [];
  const FLORET_COUNT = 6;
  const floretAngleStep = (Math.PI * 2) / FLORET_COUNT;

  const pedicelMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b57,
    roughness: 0.8,
    emissive: 0x052110,
    emissiveIntensity: 0.2
  });
  const ovaryGeo = new THREE.SphereGeometry(0.28, 8, 8);
  const ovaryMat = new THREE.MeshStandardMaterial({
    color: 0x3e8b47,
    roughness: 0.7
  });

  const antherGeo = new THREE.BoxGeometry(0.24, 0.12, 0.12);

  for (let i = 0; i < FLORET_COUNT; i++) {
    const angle = i * floretAngleStep + (Math.random() - 0.5) * 0.05;
    
    const r = params.discRadius;
    const fx = r * Math.cos(angle);
    const fz = r * Math.sin(angle);
    const fy = r * 0.25;
    
    const floret = new THREE.Group();
    floret.position.set(fx, fy, fz);
    floret.rotation.order = "YXZ";
    floret.rotation.y = -angle;
    floret.rotation.z = Math.PI / 6 + (Math.random() - 0.5) * 0.05;
    
    floretsGroup.add(floret);
    florets.push(floret);

    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(fx * 0.45, fy * 0.2, fz * 0.45);
    const p2 = new THREE.Vector3(fx, fy, fz);
    const pedicelCurve = new THREE.CatmullRomCurve3([p0, p1, p2]);
    const pedicelTubeGeo = new THREE.TubeGeometry(pedicelCurve, 12, 0.08, 4, false);
    const pedicelMesh = new THREE.Mesh(pedicelTubeGeo, pedicelMat);
    pedicelsGroup.add(pedicelMesh);

    const ovary = new THREE.Mesh(ovaryGeo, ovaryMat);
    floret.add(ovary);

    const floretPetals = new THREE.Group();
    floret.add(floretPetals);
    for (let j = 0; j < params.petalCount; j++) {
      const pAngle = (j / params.petalCount) * Math.PI * 2;
      const mat = makePetalMaterial();
      const petal = new THREE.Mesh(petalGeo, mat);
      
      petal.position.set(0.12 * Math.cos(pAngle), 0, 0.12 * Math.sin(pAngle));
      petal.rotation.order = "YXZ";
      petal.rotation.y = -pAngle;
      petal.rotation.z = Math.PI / 10 + (Math.random() - 0.5) * 0.04;
      petal.rotation.x = (Math.random() - 0.5) * 0.04;
      
      floretPetals.add(petal);
    }

    const floretStamens = new THREE.Group();
    floret.add(floretStamens);
    for (let j = 0; j < params.petalCount; j++) {
      const sAngle = (j / params.petalCount) * Math.PI * 2 + 0.1;
      const mat = makePetalMaterial();
      const stamen = new THREE.Mesh(stamenGeo, mat);
      stamen.name = "stamen";
      
      stamen.position.set(0.1 * Math.cos(sAngle), 0.06, 0.1 * Math.sin(sAngle));
      stamen.rotation.order = "YXZ";
      stamen.rotation.y = -sAngle;
      stamen.rotation.z = Math.PI / 4.5 + (Math.random() - 0.5) * 0.04;
      floretStamens.add(stamen);

      const antherMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
      const anther = new THREE.Mesh(antherGeo, antherMat);
      
      const curveLength = params.petalLength * 1.55;
      const tipX = curveLength;
      const tipY = curveLength * 0.75;
      anther.position.set(tipX, tipY, 0);
      anther.rotation.set(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5);
      stamen.add(anther);
    }

    const pistilMat = makePetalMaterial();
    const pistil = new THREE.Mesh(pistilGeo, pistilMat);
    pistil.name = "pistil";
    pistil.position.set(0, 0.08, 0);
    pistil.rotation.order = "YXZ";
    pistil.rotation.y = -Math.PI * 0.5;
    pistil.rotation.z = Math.PI / 3.8 + (Math.random() - 0.5) * 0.04;
    floret.add(pistil);

    const stigmaMat = new THREE.MeshStandardMaterial({
      color: 0x3cb371,
      roughness: 0.8
    });
    const stigmaGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const stigma = new THREE.Mesh(stigmaGeo, stigmaMat);
    const pistilCurveLength = params.petalLength * 1.75;
    const stigmaX = pistilCurveLength;
    const stigmaY = pistilCurveLength * 0.82;
    stigma.position.set(stigmaX, stigmaY, 0);
    pistil.add(stigma);
  }

  const state = { growth: -delay };

  function update(dt, time) {
    if (state.growth < 1) state.growth += params.growthSpeed * dt;
    const g = Math.max(0, Math.min(1, state.growth));

    stemGroup.scale.set(1, THREE.MathUtils.smoothstep(g, 0, 0.5), 1);
    
    const bulbG = THREE.MathUtils.smoothstep(g, 0, 0.35);
    bulbMesh.scale.set(1.1 * bulbG, 0.8 * bulbG, 1.1 * bulbG);

    headGroup.visible = g > 0.4;
    const bloom = THREE.MathUtils.smoothstep(g, 0.45, 1);
    
    pedicelsGroup.scale.setScalar(THREE.MathUtils.smoothstep(g, 0.4, 0.7));
    floretsGroup.scale.setScalar(bloom);
    discMesh.scale.setScalar(THREE.MathUtils.smoothstep(g, 0.35, 0.6));

    if (params.autoRotate) headGroup.rotation.y = time * 0.05;

    const windFreq = params.swaySpeed;
    const baseSwayX = Math.sin(time * windFreq + offset.x * 0.2) * 0.05 * bloom;
    const baseSwayZ = Math.cos(time * windFreq * 0.8 + offset.z * 0.2) * 0.05 * bloom;
    group.rotation.x = baseSwayX;
    group.rotation.z = baseSwayZ;

    headGroup.position.y =
      stemHeight * THREE.MathUtils.smoothstep(g, 0, 0.5) +
      Math.sin(time * windFreq * 1.2 + offset.x) * 0.2 * bloom;
    headGroup.rotation.x = Math.sin(time * windFreq * 1.5 + offset.x) * 0.04 * bloom;
    headGroup.rotation.z = Math.cos(time * windFreq * 1.3 + offset.z) * 0.04 * bloom;
  }

  function setUniforms() {
    const cAnther = new THREE.Color();
    cAnther.setHSL(params.hueTip, params.saturation, params.lightness * 0.3);

    florets.forEach((floret) => {
      floret.traverse((child) => {
        if (child.isMesh) {
          if (child.material && child.material.uniforms) {
            child.material.uniforms.hueBase.value = params.hueBase;
            child.material.uniforms.hueTip.value = params.hueTip;
            child.material.uniforms.sat.value = params.saturation;
            child.material.uniforms.light.value = params.lightness;
            child.material.uniforms.glow.value = params.glow;
          }
          if (child.name === "stamen" && child.children.length > 0) {
            const antherMesh = child.children[0];
            if (antherMesh && antherMesh.material) {
              antherMesh.material.color.copy(cAnther);
            }
          }
        }
      });
    });
  }

  return { group, update, setUniforms };
}

/* -----------------------------------------------------------
   Field of flowers
----------------------------------------------------------- */
let flowers = [];
const fieldGroup = new THREE.Group();
scene.add(fieldGroup);

function rebuildField() {
  flowers.forEach((f) => fieldGroup.remove(f.group));
  flowers = [];

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < params.flowerCount; i++) {
    const angle = i * goldenAngle;
    const r = params.fieldSpacing * Math.sqrt(i);
    const offset = new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle));
    const heightScale = 0.85 + Math.random() * 0.3;
    const delay = i * 0.12;
    const flower = createFlower(offset, delay, heightScale);
    fieldGroup.add(flower.group);
    flowers.push(flower);
  }
}

function updateColors() {
  flowers.forEach((f) => f.setUniforms());
}

rebuildField();

/* -----------------------------------------------------------
   GUI
----------------------------------------------------------- */
const gui = new dat.GUI();

const fieldFolder = gui.addFolder("Field");
fieldFolder.add(params, "flowerCount", 1, 30, 1).name("flower count").onFinishChange(rebuildField);
fieldFolder.add(params, "fieldSpacing", 6, 30, 1).name("spacing").onFinishChange(rebuildField);
fieldFolder.open();

const shapeFolder = gui.addFolder("Petals & Shape");
shapeFolder.add(params, "petalCount", 6, 120, 1).name("petal count").onFinishChange(rebuildField);
shapeFolder.add(params, "petalLength", 2, 20, 0.1).name("petal length").onFinishChange(rebuildField);
shapeFolder.add(params, "petalWidth", 0.1, 3, 0.05).name("petal width").onFinishChange(rebuildField);
shapeFolder.add(params, "petalCurl", 0, 2, 0.05).name("curl").onFinishChange(rebuildField);
shapeFolder.add(params, "petalDroop", 0, 2, 0.05).name("droop").onFinishChange(rebuildField);
shapeFolder.add(params, "discRadius", 0.2, 5, 0.1).name("center radius").onFinishChange(rebuildField);
shapeFolder.add(params, "seedCount", 10, 500, 5).name("seed count").onFinishChange(rebuildField);
shapeFolder.add(params, "spread", 0.05, 0.5, 0.01).name("seed spread").onFinishChange(rebuildField);

const colorFolder = gui.addFolder("Color / Hue");
colorFolder.add(params, "hueBase", 0, 1, 0.001).name("hue: base").onChange(updateColors);
colorFolder.add(params, "hueTip", 0, 1, 0.001).name("hue: tip").onChange(updateColors);
colorFolder.add(params, "discHue", 0, 1, 0.001).name("hue: disc").onFinishChange(rebuildField);
colorFolder.add(params, "saturation", 0, 1, 0.01).onChange(updateColors);
colorFolder.add(params, "lightness", 0, 1, 0.01).onChange(updateColors);
colorFolder.add(params, "glow", 0, 3, 0.05).onChange(updateColors);
colorFolder.open();

const animFolder = gui.addFolder("Animation");
animFolder.add(params, "growthSpeed", 0.0002, 0.01, 0.0001);
animFolder.add(params, "swaySpeed", 0, 1, 0.01);
animFolder.add(params, "autoRotate");

const bloomFolder = gui.addFolder("Bloom (postFX)");
bloomFolder.add(bloomPass, "strength", 0, 3, 0.05);
bloomFolder.add(bloomPass, "radius", 0, 1, 0.01);
bloomFolder.add(bloomPass, "threshold", 0, 1, 0.01);

/* -----------------------------------------------------------
   Ground plane
----------------------------------------------------------- */
const groundGeo = new THREE.CircleGeometry(300, 64);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x03110a, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

/* -----------------------------------------------------------
   Animation loop
----------------------------------------------------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta() * 60;
  const time = clock.elapsedTime;

  flowers.forEach((f) => f.update(dt, time));

  controls.update();
  composer.render();
}
animate();
