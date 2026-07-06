/**
 * Japanese Red Spider Lily (Lycoris radiata)
 * Advanced Procedural 3D Digital Artwork
 *
 * Architecture:
 *  - Botanical Umbel Cluster Hierarchy
 *  - Custom GLSL Shaders w/ Fresnel Rim-Lighting & SSS Approximation
 *  - Double-Frequency Simplex Noise Wind Physics w/ Aerodynamic Lag
 *  - 3-Phase Time-Lapse Blooming State Machine
 *  - dat.gui Interactive Controls
 */
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/OrbitControls.js";
import { createNoise2D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";
import * as dat from "https://cdn.jsdelivr.net/npm/dat.gui@0.7.9/build/dat.gui.module.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/UnrealBloomPass.js";

/* ============================================================
   NOISE INSTANCES
   Two independent noise fields for base & micro frequencies
============================================================ */
const baseNoise2D  = createNoise2D(); // slow, high-amplitude stem sway
const microNoise2D = createNoise2D(); // fast, low-amplitude stamen tremor

/* ------------------------------------------------------------
   Lightweight self-contained 2D value-noise, used only by the
   new atmospheric spore system below (per gemini-code.md — kept
   separate from the simplex noise already driving the plant so
   none of the existing wind/growth behaviour changes).
------------------------------------------------------------ */
function makeLocalNoise2D(seed = 977) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y) => { const u = (h & 2) ? -x : x, v = (h & 1) ? -y : y; return u + v; };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v
    );
  };
}
const sporeNoise2D = makeLocalNoise2D(2024);

/* ============================================================
   SCENE / RENDERER / CAMERA / POST-PROCESSING
============================================================ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060a);
scene.fog = new THREE.FogExp2(0x04060a, 0.005);

const camera = new THREE.PerspectiveCamera(
  58, window.innerWidth / window.innerHeight, 0.1, 2000
);
camera.position.set(0, 38, 88);

// preserveDrawingBuffer enables the new "Export PNG" dashboard action
// to read back the canvas pixels; does not affect rendering behaviour.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.9;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.25, 0.7, 0.15  // balanced so stamens stay razor-sharp
);
composer.addPass(bloomPass);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 22, 0);

/* Lights */
scene.add(new THREE.AmbientLight(0x180808, 2.0));
const keyLight = new THREE.DirectionalLight(0xfff0e8, 1.2);
keyLight.position.set(15, 40, 20);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x1a0a0a, 0.6);
fillLight.position.set(-20, 10, -10);
scene.add(fillLight);

/* Ground */
const groundMesh = new THREE.Mesh(
  new THREE.CircleGeometry(300, 64),
  new THREE.MeshStandardMaterial({ color: 0x020905, roughness: 1 })
);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

/* ============================================================
   ATMOSPHERIC SPORES  (additive — "Background Environment" from
   gemini-code.md). A soft, glowing THREE.Points cloud that drifts
   gently upward and fades, density controlled from the dashboard.
   Entirely separate system; does not touch the plant/flower code.
============================================================ */
const SPORE_MAX = 1200;
const sporeGeo = new THREE.BufferGeometry();
const sporePos = new Float32Array(SPORE_MAX * 3);
const sporeSeed = new Float32Array(SPORE_MAX); // per-particle phase/speed seed
const sporeField = { x: 220, y: 90, z: 220 };

for (let i = 0; i < SPORE_MAX; i++) {
  sporePos[i * 3]     = (Math.random() - 0.5) * sporeField.x;
  sporePos[i * 3 + 1] = Math.random() * sporeField.y;
  sporePos[i * 3 + 2] = (Math.random() - 0.5) * sporeField.z;
  sporeSeed[i] = Math.random() * 1000;
}
sporeGeo.setAttribute("position", new THREE.BufferAttribute(sporePos, 3));

const sporeMat = new THREE.PointsMaterial({
  color: 0xffcf9e,
  size: 0.5,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const sporePoints = new THREE.Points(sporeGeo, sporeMat);
sporePoints.frustumCulled = false;
scene.add(sporePoints);

function setSporeCount(count) {
  sporeGeo.setDrawRange(0, THREE.MathUtils.clamp(count, 0, SPORE_MAX));
}
setSporeCount(400);

function updateSpores(dt, time) {
  const posAttr = sporeGeo.attributes.position;
  const drawCount = sporeGeo.drawRange.count;
  for (let i = 0; i < drawCount; i++) {
    const seed = sporeSeed[i];
    let y = posAttr.array[i * 3 + 1];
    y += (0.06 + 0.05 * Math.sin(seed)) * dt;
    if (y > sporeField.y) y = 0; // recycle from the ground once it drifts too high
    posAttr.array[i * 3 + 1] = y;

    // gentle horizontal wobble via the self-contained noise field
    const wob = sporeNoise2D(time * 0.05 + seed, seed * 0.7) * 0.04;
    posAttr.array[i * 3] += wob;
  }
  posAttr.needsUpdate = true;

  // fade the whole cloud in/out slightly with a slow breathing pulse
  sporeMat.opacity = 0.4 + Math.sin(time * 0.3) * 0.1;
}

/* ============================================================
   PARAMETERS
============================================================ */
const params = {
  flowerCount:    5,
  fieldSpacing:   14,
  growthSpeed:    0.0008,
  windIntensity:  1.0,
  bloomProgress:  0.0,     // manual override (0–1)
  autoBloom:      true,    // auto-animate bloom
  restartBloom() {
    flowers.forEach(f => f.restart());
  },
  hueBase:     0.0,
  hueTip:      0.04,
  saturation:  1.0,
  lightness:   0.45,
  fresnelPow:  2.8,
  glow:        0.9,
  bloomStrength:  bloomPass.strength,
  bloomRadius:    bloomPass.radius,
  bloomThreshold: bloomPass.threshold,

  // --- new dashboard-only additions (gemini-code.md) ---
  particleDensity: 400,
  palette: "pastel",
};

/* ============================================================
   PALETTE PRESETS (dashboard-only convenience — just sets the
   existing hue/sat/light params + spore tint to a named look;
   doesn't add any new colour system to the plant itself)
============================================================ */
const PALETTE_PRESETS = {
  solar:  { hueBase: 0.08, hueTip: 0.15, saturation: 0.9,  lightness: 0.55, sporeColor: 0xffcf9e },
  neon:   { hueBase: 0.55, hueTip: 0.85, saturation: 1.0,  lightness: 0.55, sporeColor: 0x8affe6 },
  pastel: { hueBase: 0.0,  hueTip: 0.04, saturation: 1.0,  lightness: 0.45, sporeColor: 0xffcf9e }, // original Lycoris crimson
};

function applyPalette(name) {
  const p = PALETTE_PRESETS[name];
  if (!p) return;
  params.hueBase = p.hueBase;
  params.hueTip = p.hueTip;
  params.saturation = p.saturation;
  params.lightness = p.lightness;
  sporeMat.color.setHex(p.sporeColor);
  updateColors();
}

/* ============================================================
   GLSL HELPERS
============================================================ */
const glslHSL = /* glsl */`
  vec3 hsl2rgb(vec3 c) {
    vec3 p = clamp(abs(mod(c.x*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y*(p-0.5)*(1.0-abs(2.0*c.z-1.0));
  }
`;

/* ============================================================
   PETAL VERTEX SHADER
   – pow() tip curl (upward & backward)
   – sin() lateral crinkle along margins
   – Analytical normal via partial derivatives
============================================================ */
const petalVert = /* glsl */`
  uniform float uLength;
  uniform float uWaveFreq;
  uniform float uWaveAmp;
  uniform float uCurlY;
  uniform float uCurlZ;
  uniform float uPhase; // per-petal random offset — organic irregularity

  varying float vT;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  void main(){
    // t = normalised distance from base (0) to tip (1)
    float t = clamp(uv.y, 0.0, 1.0);
    vT = t;

    vec3 pos = position;

    /* lateral crinkle – decays at base & tip for clean attachment.
       uPhase (unique per petal) breaks perfect mathematical symmetry
       between petals so tips read as organically irregular rather
       than identically stamped copies. */
    float crinkle = sin(pos.y * uWaveFreq + uPhase) * uWaveAmp * sin(t * 3.14159265);
    pos.x += crinkle;

    /* tip curl – aggressive backward & upward bend */
    float t3 = pow(t, 3.0);
    pos.z -= t3 * uCurlZ;
    pos.y -= t3 * uCurlY;

    /* analytical normal for correct lighting on deformed mesh */
    float dt = 1.0 / uLength;
    float dWave = uWaveFreq * cos(position.y*uWaveFreq + uPhase) * uWaveAmp * sin(t*3.14159265)
                + sin(position.y*uWaveFreq + uPhase) * uWaveAmp * cos(t*3.14159265) * 3.14159265*dt;
    float dCY = 3.0 * pow(t,2.0) * uCurlY * dt;
    float dCZ = 3.0 * pow(t,2.0) * uCurlZ * dt;
    vec3 tX = vec3(1.0, 0.0, 0.0);
    vec3 tY = vec3(dWave, 1.0-dCY, -dCZ);
    vec3 nModel = normalize(cross(tX, tY));

    vWorldNormal = normalize(mat3(modelMatrix) * nModel);
    vWorldPos    = (modelMatrix * vec4(pos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/* ============================================================
   PETAL FRAGMENT SHADER
   – HSL crimson colour + tip-lightness fade
   – Fresnel rim-lighting (velvet sheen)
   – SSS approximation (backlit translucency)
============================================================ */
const petalFrag = /* glsl */`
  ${glslHSL}

  uniform float uHueBase;
  uniform float uHueTip;
  uniform float uSat;
  uniform float uLight;
  uniform float uGlow;
  uniform float uFresnelPow;
  uniform vec3  uCameraPos;

  varying float vT;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  void main(){
    /* Base colour with tip fade */
    float t = clamp(vT, 0.0, 1.0);
    float hue  = mix(uHueBase, uHueTip, t);
    float lum  = mix(uLight, uLight + (1.0-uLight)*0.65*t, t);
    vec3 col   = hsl2rgb(vec3(hue, uSat, lum));

    /* Diffuse + back-fill */
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(vec3(15,40,20) - vWorldPos);
    float diff = max(dot(N, L), 0.0)*0.7 + 0.3;
    col *= diff;

    /* Fresnel rim – velvet glow on curved edges */
    vec3 V = normalize(uCameraPos - vWorldPos);
    float rim = pow(1.0 - max(dot(N, V), 0.0), uFresnelPow);
    vec3 rimCol = hsl2rgb(vec3(uHueBase, 1.0, 0.72));
    col += rim * rimCol * 0.55;

    /* SSS approximation – translucency when backlit */
    float backScatter = pow(max(dot(-L, V), 0.0), 6.0) * 0.25;
    vec3 sssCol = hsl2rgb(vec3(uHueTip, 0.9, 0.75));
    col += backScatter * sssCol;

    /* Tip glow pulse */
    col += col * t * uGlow * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ============================================================
   STAMEN / PISTIL VERTEX SHADER (tube – uses tube UVs)
============================================================ */
const stamenVert = /* glsl */`
  varying float vT;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  void main(){
    vT = uv.x;   // TubeGeometry: u runs along length
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPos    = (modelMatrix * vec4(position,1.0)).xyz;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

/* Same fragment logic reused for stamens */
const stamenFrag = petalFrag;

/* ============================================================
   MATERIAL FACTORIES
============================================================ */
function makePetalMat() {
  return new THREE.ShaderMaterial({
    vertexShader:   petalVert,
    fragmentShader: petalFrag,
    uniforms: {
      uLength:     { value: params.petalLength || 5.5 },
      uWaveFreq:   { value: 18.0  },
      uWaveAmp:    { value: 0.12  },
      uCurlY:      { value: 1.8   },
      uCurlZ:      { value: 2.2   },
      uPhase:      { value: Math.random() * Math.PI * 2 }, // organic irregularity, unique per petal
      uHueBase:    { value: params.hueBase    },
      uHueTip:     { value: params.hueTip     },
      uSat:        { value: params.saturation },
      uLight:      { value: params.lightness  },
      uGlow:       { value: params.glow       },
      uFresnelPow: { value: params.fresnelPow },
      uCameraPos:  { value: new THREE.Vector3() },
    },
    side: THREE.DoubleSide,
  });
}

function makeStamenMat(isAnther = false) {
  if (isAnther) {
    // Pollen glow (gemini-code.md "Luminescent Centers"): strong warm
    // emissive so the anther/stigma tips read as bioluminescent and
    // catch the UnrealBloomPass highlight, without changing their
    // geometry or placement.
    return new THREE.MeshStandardMaterial({
      color:             0x7a3b1e,
      roughness:         0.6,
      metalness:         0.05,
      emissive:          0xffb066,
      emissiveIntensity: 1.1,
    });
  }
  return new THREE.ShaderMaterial({
    vertexShader:   stamenVert,
    fragmentShader: stamenFrag,
    uniforms: {
      uLength:     { value: 8.0   },
      uWaveFreq:   { value: 0.0   },
      uWaveAmp:    { value: 0.0   },
      uCurlY:      { value: 0.0   },
      uCurlZ:      { value: 0.0   },
      uHueBase:    { value: params.hueBase    },
      uHueTip:     { value: params.hueTip     },
      uSat:        { value: params.saturation },
      uLight:      { value: params.lightness  },
      uGlow:       { value: params.glow       },
      uFresnelPow: { value: params.fresnelPow },
      uCameraPos:  { value: new THREE.Vector3() },
    },
    side: THREE.DoubleSide,
  });
}

/* ============================================================
   GEOMETRY BUILDERS
============================================================ */
const PETAL_LEN = 5.5, PETAL_W = 0.34;

function buildPetalGeo() {
  const g = new THREE.PlaneGeometry(PETAL_W, PETAL_LEN, 10, 32);
  g.translate(0, PETAL_LEN / 2, 0);
  return g;
}

function buildStamenCurve(length, spreadAngle, heightBias) {
  // Clean outward+upward arc – control points strictly progress away from origin
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(
      length * t * Math.cos(spreadAngle) * (0.6 + 0.4 * t),
      length * Math.pow(t, 1.6) * (0.5 + heightBias * t),
      length * t * Math.sin(spreadAngle) * (0.6 + 0.4 * t)
    ));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function buildBractGeo() {
  const s = new THREE.Shape();
  s.moveTo(0,   0);
  s.lineTo(0.3, 0.8);
  s.lineTo(-0.3, 0.8);
  s.closePath();
  return new THREE.ShapeGeometry(s, 4);
}

/* ============================================================
   FLORET BUILDER  (one individual miniature flower)
   Returns { group, stamenMeshes, petalMeshes, allMats }
============================================================ */
function buildFloret() {
  const floret   = new THREE.Group();
  const petalGeo = buildPetalGeo();

  const petalMeshes  = [];
  const stamenMeshes = [];
  const allMats      = [];

  /* 6 tepals (petals) */
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2;
    const mat = makePetalMat();
    allMats.push(mat);
    const mesh = new THREE.Mesh(petalGeo, mat);

    mesh.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    mesh.rotation.order = "YXZ";
    mesh.rotation.x =  Math.PI * 0.5;   // lay flat, shader curls it up
    mesh.rotation.y = -a;
    mesh.rotation.z =  0.3 + (Math.random() - 0.5) * 0.06;

    floret.add(mesh);
    petalMeshes.push(mesh);
  }

  /* Ovary (tiny green sphere at base) */
  floret.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a7a30, roughness: 0.8 })
  ));

  /* 6 Stamens + 1 Pistil (asymmetric, 15% longer) */
  const filamentGeo = (len, thick) => {
    const curve = buildStamenCurve(len, 0, 0.4);
    return new THREE.TubeGeometry(curve, 22, thick, 5, false);
  };

  const antherGeo = new THREE.CapsuleGeometry(0.055, 0.18, 4, 6);
  antherGeo.rotateZ(Math.PI / 2);

  for (let j = 0; j < 7; j++) {
    const isPistil  = (j === 6);
    const len       = isPistil ? PETAL_LEN * 1.9 : PETAL_LEN * 1.62;
    const thick     = isPistil ? 0.038 : 0.042;
    const sAngle    = isPistil
      ? (5.5 / 7) * Math.PI * 2 + 0.22   // offset from stamens
      : (j / 6) * Math.PI * 2 + 0.08;

    const mat = makeStamenMat(false);
    allMats.push(mat);

    const curve   = buildStamenCurve(len, 0, 0.38 + (isPistil ? 0.12 : 0));
    const tubGeo  = new THREE.TubeGeometry(curve, 22, thick, 5, false);
    const stamen  = new THREE.Mesh(tubGeo, mat);
    stamen.name   = isPistil ? "pistil" : "stamen";

    stamen.rotation.order = "YXZ";
    stamen.rotation.y = -sAngle;
    stamen.rotation.z = (Math.PI / 4.2) + (Math.random() - 0.5) * 0.04;

    floret.add(stamen);
    stamenMeshes.push(stamen);

    /* Anther / Stigma at tip */
    const tipPt   = curve.getPoint(1);
    const tipMesh = new THREE.Mesh(
      isPistil ? new THREE.SphereGeometry(0.09, 6, 6) : antherGeo.clone(),
      makeStamenMat(true)
    );
    tipMesh.position.copy(stamen.localToWorld(tipPt.clone()));
    // Place in world then re-parent to stamen group
    tipMesh.position.copy(tipPt);
    stamen.add(tipMesh);
  }

  return { group: floret, stamenMeshes, petalMeshes, allMats };
}

/* ============================================================
   FLOWER FACTORY  (full plant: bulb + scape + umbel)
============================================================ */
function createFlower(offset, delay, heightScale) {
  const root      = new THREE.Group();
  root.position.copy(offset);

  /* --- Underground Bulb --- */
  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.5 * heightScale, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0x4a3030, roughness: 0.92, emissive: 0x12080a, emissiveIntensity: 0.3
    })
  );
  bulbMesh.scale.set(1.05, 0.75, 1.05);
  bulbMesh.position.y = 0.4;
  root.add(bulbMesh);

  /* --- Scape (leafless green stem) --- */
  const stemH = 22 * heightScale;
  const swayX = (Math.random() - 0.5) * 3.5;
  const swayZ = (Math.random() - 0.5) * 3.5;

  // Build stem points - slightly curved via noise at creation time
  const stemPts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    stemPts.push(new THREE.Vector3(
      baseNoise2D(t * 2, offset.x) * 1.4 + swayX * t * t,
      t * stemH,
      baseNoise2D(offset.z, t * 2) * 1.4 + swayZ * t * t
    ));
  }
  const stemCurve = new THREE.CatmullRomCurve3(stemPts);
  const stemMesh  = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 40, 0.33, 6, false),
    new THREE.MeshStandardMaterial({
      color: 0x2e8b50, roughness: 0.62,
      emissive: 0x0a3d1c, emissiveIntensity: 0.3
    })
  );
  root.add(stemMesh);

  /* --- Head Group (umbrella node at stem apex) --- */
  const headGroup    = new THREE.Group();
  headGroup.position.set(stemPts[24].x, stemH, stemPts[24].z);
  root.add(headGroup);

  /* Central receptacle */
  const receptacle = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e8b50, roughness: 0.8 })
  );
  headGroup.add(receptacle);

  /* Papery bracts at the junction */
  const bractMat = new THREE.MeshStandardMaterial({
    color: 0x6b4b2a, roughness: 0.9, side: THREE.DoubleSide
  });
  const bractGeo = buildBractGeo();
  for (let b = 0; b < 6; b++) {
    const ba  = (b / 6) * Math.PI * 2;
    const brm = new THREE.Mesh(bractGeo, bractMat);
    brm.position.set(Math.cos(ba) * 0.55, 0, Math.sin(ba) * 0.55);
    brm.rotation.y = -ba;
    brm.rotation.x =  0.35;
    headGroup.add(brm);
  }

  /* --- Pedicels + Florets --- */
  const FLORET_COUNT  = 6;
  const CLUSTER_R     = 3.2;
  const pedicelsGroup = new THREE.Group();
  const floretsGroup  = new THREE.Group();
  headGroup.add(pedicelsGroup, floretsGroup);

  const pedicelMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b50, roughness: 0.8, emissive: 0x052110, emissiveIntensity: 0.15
  });

  const floretData = [];

  for (let i = 0; i < FLORET_COUNT; i++) {
    const angle = (i / FLORET_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
    const fx    = CLUSTER_R * Math.cos(angle);
    const fz    = CLUSTER_R * Math.sin(angle);
    const fy    = CLUSTER_R * 0.22;

    /* Pedicel tube */
    const pedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(fx * 0.4, fy * 0.15, fz * 0.4),
      new THREE.Vector3(fx, fy, fz),
    ]);
    pedicelsGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(pedCurve, 12, 0.07, 4, false), pedicelMat
    ));

    /* Floret sub-group */
    const { group: floret, stamenMeshes, petalMeshes, allMats } = buildFloret();
    floret.position.set(fx, fy, fz);
    floret.rotation.order = "YXZ";
    floret.rotation.y = -angle;
    floret.rotation.z = Math.PI / 6 + (Math.random() - 0.5) * 0.04;
    floretsGroup.add(floret);

    floretData.push({ floret, stamenMeshes, petalMeshes, allMats, angle, fx, fy, fz });
  }

  /* ============================================================
     STATE MACHINE VARIABLES
  ============================================================ */
  let _bloomProgress  = 0.0;
  let _growing        = true;
  let _stemLag        = 0.0;   // aerodynamic lag accumulator
  let _stamenLag      = 0.0;

  /* store rest positions for lag math */
  const restHeadY = stemH;

  /* ============================================================
     RESTART FUNCTION (called from GUI)
  ============================================================ */
  function restart() {
    _bloomProgress = 0.0;
    _growing       = true;
    stemMesh.scale.set(1, 0.001, 1);
    headGroup.visible = false;
  }
  restart();

  /* ============================================================
     UPDATE FUNCTION (called every frame)
  ============================================================ */
  function update(dt, time) {
    /* --- Auto bloom progression --- */
    if (params.autoBloom && _growing) {
      _bloomProgress += params.growthSpeed * dt;
      if (_bloomProgress >= 1.0) { _bloomProgress = 1.0; _growing = false; }
    } else if (!params.autoBloom) {
      _bloomProgress = params.bloomProgress;
    }

    const bp = _bloomProgress;

    /* ---- PHASE 1: Stem shoots up (0.0 → 0.3) ---- */
    const stemScale = THREE.MathUtils.smoothstep(bp, 0.0, 0.3);
    stemMesh.scale.set(1, stemScale, 1);
    bulbMesh.scale.set(
      1.05 * THREE.MathUtils.smoothstep(bp, 0.0, 0.15),
      0.75 * THREE.MathUtils.smoothstep(bp, 0.0, 0.15),
      1.05 * THREE.MathUtils.smoothstep(bp, 0.0, 0.15)
    );

    /* ---- PHASE 2: Head pod emerges (0.3 → 0.6) ---- */
    headGroup.visible = bp > 0.3;
    const podOpen = THREE.MathUtils.smoothstep(bp, 0.3, 0.6);
    receptacle.scale.setScalar(podOpen);
    pedicelsGroup.scale.setScalar(podOpen);

    /* Bracts spread */
    headGroup.children.forEach((child, idx) => {
      if (child.geometry && child.geometry.type === "ShapeGeometry") {
        const br = THREE.MathUtils.smoothstep(bp, 0.3, 0.55);
        child.scale.setScalar(br);
      }
    });

    /* ---- PHASE 3: Florets open, petals curl (0.6 → 1.0) ---- */
    const bloom = THREE.MathUtils.smoothstep(bp, 0.6, 1.0);
    floretsGroup.scale.setScalar(bloom);

    /* Petal curl intensity grows with bloom */
    const curlFactor = bloom;
    floretData.forEach(({ allMats }) => {
      allMats.forEach(mat => {
        if (mat.uniforms && mat.uniforms.uCurlY) {
          mat.uniforms.uCurlY.value = curlFactor * 1.8;
          mat.uniforms.uCurlZ.value = curlFactor * 2.2;
        }
      });
    });

    /* ============================================================
       WIND PHYSICS – Double-Frequency Simplex Noise
    ============================================================ */
    const wi = params.windIntensity;

    /* Base frequency: slow, high-amplitude → stem sway */
    const baseSX = baseNoise2D(time * 0.18, offset.x * 0.05) * 0.06 * wi * bloom;
    const baseSZ = baseNoise2D(time * 0.16 + 3.7, offset.z * 0.05) * 0.06 * wi * bloom;

    /* Aerodynamic inertia – lag the accumulation */
    const lagSpeed = 0.08;
    _stemLag   += (baseSX - _stemLag)   * lagSpeed;
    _stamenLag += (baseSZ - _stamenLag) * lagSpeed;

    root.rotation.x  = _stemLag;
    root.rotation.z  = _stamenLag * 0.7;

    /* Head nod lag (heavier load lags more) */
    const headSX = baseNoise2D(time * 0.22 + 1.1, offset.x * 0.07) * 0.045 * wi * bloom;
    const headSZ = baseNoise2D(time * 0.19 + 5.3, offset.z * 0.07) * 0.045 * wi * bloom;
    headGroup.rotation.x = headSX;
    headGroup.rotation.z = headSZ;

    /* Micro frequency: fast, tiny → stamen tremor */
    floretData.forEach(({ stamenMeshes }, fi) => {
      stamenMeshes.forEach((s, si) => {
        const tremor = microNoise2D(time * 3.5 + fi * 1.7, si * 0.9) * 0.032 * wi * bloom;
        s.rotation.x += tremor * 0.5;
        s.rotation.z += tremor;
      });
    });

    /* Head vertical bob */
    headGroup.position.y = restHeadY * stemScale
      + Math.sin(time * 0.28 * wi + offset.x) * 0.18 * bloom;

    /* Auto-rotate slowly */
    if (params.autoRotate) headGroup.rotation.y = time * 0.04;

    /* Update camera position in all shader mats */
    const camPos = camera.position;
    floretData.forEach(({ allMats }) => {
      allMats.forEach(mat => {
        if (mat.uniforms && mat.uniforms.uCameraPos) {
          mat.uniforms.uCameraPos.value.copy(camPos);
        }
      });
    });
  }

  /* Update colours from GUI */
  function setUniforms() {
    floretData.forEach(({ allMats }) => {
      allMats.forEach(mat => {
        if (!mat.uniforms) return;
        mat.uniforms.uHueBase.value    = params.hueBase;
        mat.uniforms.uHueTip.value     = params.hueTip;
        mat.uniforms.uSat.value        = params.saturation;
        mat.uniforms.uLight.value      = params.lightness;
        mat.uniforms.uGlow.value       = params.glow;
        mat.uniforms.uFresnelPow.value = params.fresnelPow;
      });
    });
  }

  return { group: root, update, setUniforms, restart };
}

/* ============================================================
   FIELD
============================================================ */
let flowers = [];
const fieldGroup = new THREE.Group();
scene.add(fieldGroup);

function rebuildField() {
  flowers.forEach(f => fieldGroup.remove(f.group));
  flowers = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < params.flowerCount; i++) {
    const angle  = i * goldenAngle;
    const r      = params.fieldSpacing * Math.sqrt(i);
    const offset = new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle));
    const f      = createFlower(offset, i * 0.12, 0.85 + Math.random() * 0.3);
    fieldGroup.add(f.group);
    flowers.push(f);
  }
}

function updateColors() { flowers.forEach(f => f.setUniforms()); }

rebuildField();

/* ============================================================
   GUI
============================================================ */
const gui = new dat.GUI();
gui.width = 280;

const fField = gui.addFolder("Field");
fField.add(params, "flowerCount", 1, 20, 1).name("count").onFinishChange(rebuildField);
fField.add(params, "fieldSpacing", 6, 30, 1).name("spacing").onFinishChange(rebuildField);
fField.open();

const fAnim = gui.addFolder("Growth & Wind");
fAnim.add(params, "growthSpeed",   0.0001, 0.004, 0.0001).name("grow speed");
fAnim.add(params, "windIntensity", 0,      3,     0.05).name("wind intensity");
fAnim.add(params, "bloomProgress", 0,      1,     0.01).name("bloom progress");
fAnim.add(params, "autoBloom").name("auto bloom");
fAnim.add(params, "restartBloom").name("↺ restart bloom");
fAnim.open();

const fShape = gui.addFolder("Petals & Shape");
fShape.add(params, "fresnelPow", 0.5, 8, 0.1).name("fresnel power").onChange(updateColors);
fShape.add(params, "glow",       0,   3, 0.05).onChange(updateColors);

const fColor = gui.addFolder("Colour");
fColor.add(params, "hueBase",    0, 1, 0.001).name("hue base").onChange(updateColors);
fColor.add(params, "hueTip",     0, 1, 0.001).name("hue tip").onChange(updateColors);
fColor.add(params, "saturation", 0, 1, 0.01).onChange(updateColors);
fColor.add(params, "lightness",  0, 1, 0.01).onChange(updateColors);
fColor.open();

const fBloom = gui.addFolder("Bloom (postFX)");
fBloom.add(bloomPass, "strength",  0, 2,   0.01).name("strength");
fBloom.add(bloomPass, "radius",    0, 1,   0.01).name("radius");
fBloom.add(bloomPass, "threshold", 0, 0.5, 0.01).name("threshold");

/* ============================================================
   ANIMATION LOOP
============================================================ */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt   = clock.getDelta() * 60;
  const time = clock.elapsedTime;

  flowers.forEach(f => f.update(dt, time));
  updateSpores(dt / 60, time); // dt/60 = real seconds elapsed this frame

  controls.update();
  composer.render();
}
animate();

/* ============================================================
   GLASS DASHBOARD WIRING  (additive — mirrors/extends the dat.gui
   controls above through the new HTML overlay from index.html.
   Does not replace or remove the dat.gui panel.
============================================================ */
const baseGrowthSpeed = params.growthSpeed; // remember default so the
                                             // dashboard slider can act
                                             // as a clean multiplier

const $ = (id) => document.getElementById(id);
const elFlowers = $("ctrlFlowers"), valFlowers = $("valFlowers");
const elSpeed   = $("ctrlSpeed"),   valSpeed   = $("valSpeed");
const elDensity = $("ctrlDensity"), valDensity = $("valDensity");
const elPalette = $("ctrlPalette");
const elPlay    = $("btnPlay");
const elRewind  = $("btnRewind");
const elExport  = $("btnExport");
const panel     = $("bloomPanel");
const tab       = $("bloomTab");
const closeBtn  = $("bloomClose");

if (elFlowers) {
  elFlowers.addEventListener("change", (e) => {
    params.flowerCount = parseInt(e.target.value, 10);
    rebuildField();
  });
  elFlowers.addEventListener("input", (e) => {
    valFlowers.textContent = e.target.value;
  });
}

if (elSpeed) {
  elSpeed.addEventListener("input", (e) => {
    const mult = parseFloat(e.target.value);
    params.growthSpeed = baseGrowthSpeed * mult;
    valSpeed.textContent = mult.toFixed(1) + "×";
  });
}

if (elDensity) {
  elDensity.addEventListener("input", (e) => {
    params.particleDensity = parseInt(e.target.value, 10);
    setSporeCount(params.particleDensity);
    valDensity.textContent = params.particleDensity;
  });
}

if (elPalette) {
  elPalette.addEventListener("change", (e) => applyPalette(e.target.value));
}

if (elPlay) {
  elPlay.addEventListener("click", () => {
    params.autoBloom = !params.autoBloom;
    elPlay.textContent = params.autoBloom ? "⏸ Pause" : "▶ Play";
  });
}

if (elRewind) {
  elRewind.addEventListener("click", () => {
    params.autoBloom = true;
    if (elPlay) elPlay.textContent = "⏸ Pause";
    params.restartBloom();
  });
}

if (elExport) {
  elExport.addEventListener("click", () => {
    // The dashboard is a separate HTML overlay (never drawn onto the
    // WebGL canvas), so reading back the canvas pixels captures the
    // artwork cleanly with no UI baked in.
    const link = document.createElement("a");
    link.download = `lycoris-${Date.now()}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  });
}

if (tab && panel && closeBtn) {
  closeBtn.addEventListener("click", () => {
    panel.classList.add("collapsed");
    tab.classList.add("visible");
  });
  tab.addEventListener("click", () => {
    panel.classList.remove("collapsed");
    tab.classList.remove("visible");
  });
}

// sync dashboard particle slider with the initial spore count set above
setSporeCount(params.particleDensity);