console.log("%c[script.js] LOADED — petal-fix build v6 (narrow+recurve pass)", "color:#ff8a6b;font-weight:bold;font-size:14px");

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
import { BokehPass } from "https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/postprocessing/BokehPass.js";

/* ============================================================
   NOISE INSTANCES
   Two independent noise fields for base & micro frequencies
============================================================ */
const baseNoise2D = createNoise2D(); // slow, high-amplitude stem sway
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
/* ============================================================
   PROCEDURAL ENVIRONMENT MAP & UTILITIES
============================================================ */
function createProceduralEnvMap(renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // Dark night garden sky gradient (dark teal/blue to pitch black)
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0a1622");
  grad.addColorStop(0.5, "#040910");
  grad.addColorStop(1, "#000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft red bioluminescent ambient glow
  ctx.fillStyle = "rgba(180, 50, 20, 0.08)";
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();

  // Soft green leaf/ambient bounce glow
  ctx.fillStyle = "rgba(30, 90, 50, 0.05)";
  ctx.beginPath();
  ctx.arc(384, 128, 140, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  pmremGenerator.dispose();
  texture.dispose();

  return envMap;
}

function createCircularParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
  grad.addColorStop(0.25, "rgba(255, 240, 220, 0.85)");
  grad.addColorStop(0.5, "rgba(255, 200, 160, 0.35)");
  grad.addColorStop(1, "rgba(255, 200, 160, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const envMap = createProceduralEnvMap(renderer);
scene.environment = envMap;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Cinematic Bloom
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3, 0.75, 0.18
);
composer.addPass(bloomPass);

// Cinematic Bokeh Depth of Field
const bokehPass = new BokehPass(scene, camera, {
  focus: 89.0,
  aperture: 0.0003, // extremely subtle aperture for realistic macro bokeh
  maxblur: 0.012,
  width: window.innerWidth,
  height: window.innerHeight
});
composer.addPass(bokehPass);

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
scene.add(new THREE.AmbientLight(0x0a0505, 1.2)); // dark, physical ambient occlusion

const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.6); // strong warm sun
keyLight.position.set(25, 55, 30);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 160;
const d = 45;
keyLight.shadow.camera.left = -d;
keyLight.shadow.camera.right = d;
keyLight.shadow.camera.top = d;
keyLight.shadow.camera.bottom = -d;
keyLight.shadow.bias = -0.0003;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x0e131f, 0.85); // soft night sky fill
fillLight.position.set(-25, 15, -20);
scene.add(fillLight);

/* Ground */
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x050806, // wet soil / mud
  roughness: 0.88,
  metalness: 0.08,
});
groundMat.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `
    #include <color_fragment>
    // Procedural color variance for wet mud and moss
    float mudNoise = sin(vViewPosition.x * 0.4) * cos(vViewPosition.z * 0.4) * 0.15 + 0.85;
    diffuseColor.rgb *= mudNoise;
    `
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_begin>',
    `
    #include <normal_fragment_begin>
    // Procedural micro-bump texture for ground roughness
    float bumpNoise = sin(vViewPosition.x * 2.5) * sin(vViewPosition.z * 2.5) * 0.1;
    normal = normalize(normal + bumpNoise * normal);
    `
  );
};

const groundMesh = new THREE.Mesh(
  new THREE.CircleGeometry(300, 64),
  groundMat
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
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
  sporePos[i * 3] = (Math.random() - 0.5) * sporeField.x;
  sporePos[i * 3 + 1] = Math.random() * sporeField.y;
  sporePos[i * 3 + 2] = (Math.random() - 0.5) * sporeField.z;
  sporeSeed[i] = Math.random() * 1000;
}
sporeGeo.setAttribute("position", new THREE.BufferAttribute(sporePos, 3));

const sporeMat = new THREE.PointsMaterial({
  color: 0xffcf9e,
  size: 1.4, // larger size because it fades out at the edges
  map: createCircularParticleTexture(),
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
  flowerCount: 5,
  fieldSpacing: 14,
  growthSpeed: 0.0008,
  windIntensity: 1.0,
  bloomProgress: 0.0,     // manual override (0–1)
  autoBloom: true,    // auto-animate bloom
  restartBloom() {
    flowers.forEach(f => f.restart());
  },
  hueBase: 0.0,
  hueTip: 0.04,
  saturation: 1.0,
  lightness: 0.45,
  fresnelPow: 2.8,
  glow: 0.9,
  bloomStrength: bloomPass.strength,
  bloomRadius: bloomPass.radius,
  bloomThreshold: bloomPass.threshold,
  bokehFocus: 89.0,
  bokehAperture: 0.0003,
  rawRender: false, // debug: bypass bloom/DOF post-processing entirely

  // --- new dashboard-only additions (gemini-code.md) ---
  particleDensity: 400,
  palette: "pastel",
  autofocus: true,
};

/* ============================================================
   PALETTE PRESETS (dashboard-only convenience — just sets the
   existing hue/sat/light params + spore tint to a named look;
   doesn't add any new colour system to the plant itself)
============================================================ */
const PALETTE_PRESETS = {
  solar: { hueBase: 0.08, hueTip: 0.15, saturation: 0.9, lightness: 0.55, sporeColor: 0xffcf9e },
  neon: { hueBase: 0.55, hueTip: 0.85, saturation: 1.0, lightness: 0.55, sporeColor: 0x8affe6 },
  pastel: { hueBase: 0.0, hueTip: 0.04, saturation: 1.0, lightness: 0.45, sporeColor: 0xffcf9e }, // original Lycoris crimson
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

  // Sync to dashboard sliders if initialized
  const elHueBase = document.getElementById("ctrlHueBase");
  const valHueBase = document.getElementById("valHueBase");
  const elHueTip = document.getElementById("ctrlHueTip");
  const valHueTip = document.getElementById("valHueTip");
  const elSaturation = document.getElementById("ctrlSaturation");
  const valSaturation = document.getElementById("valSaturation");
  const elLightness = document.getElementById("ctrlLightness");
  const valLightness = document.getElementById("valLightness");

  if (elHueBase) { elHueBase.value = p.hueBase; valHueBase.textContent = p.hueBase.toFixed(3); }
  if (elHueTip) { elHueTip.value = p.hueTip; valHueTip.textContent = p.hueTip.toFixed(3); }
  if (elSaturation) { elSaturation.value = p.saturation; valSaturation.textContent = p.saturation.toFixed(2); }
  if (elLightness) { elLightness.value = p.lightness; valLightness.textContent = p.lightness.toFixed(2); }
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
   MATERIAL FACTORIES (PBR + custom vertex/fragment shader injections)
============================================================ */
function createPhysicalFlowerMaterial(isStamen = false) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, // colored procedurally by HSL gradient inside fragment shader
    roughness: isStamen ? 0.55 : 0.65,
    metalness: 0.0,
    transmission: isStamen ? 0.3 : 0.42, // petals and filaments are translucent
    thickness: isStamen ? 0.15 : 0.3, // thickness for SSS approximation
    ior: 1.36,
    sheen: 1.0,
    sheenRoughness: 0.5,
    sheenColor: 0xff3b3b, // red velvet sheen
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide
  });

  // Share variables with shaders via userData.uniforms
  mat.userData.uniforms = {
    uLength: { value: isStamen ? 8.0 : 5.5 },
    uWaveFreq: { value: isStamen ? 0.0 : 4.0 },
    uWaveAmp: { value: isStamen ? 0.0 : 0.065 },
    uCurlY: { value: isStamen ? 0.0 : 0.45 },
    uCurlZ: { value: isStamen ? 0.0 : 0.65 },
    uPhase: { value: Math.random() * Math.PI * 2 },
    uHueBase: { value: params.hueBase },
    uHueTip: { value: params.hueTip },
    uSat: { value: params.saturation },
    uLight: { value: params.lightness },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);

    // Inject uniform declarations and varyings in vertex shader
    shader.vertexShader = `
      uniform float uLength;
      uniform float uWaveFreq;
      uniform float uWaveAmp;
      uniform float uCurlY;
      uniform float uCurlZ;
      uniform float uPhase;
      varying float vT;
      varying vec2 vPetalUv;
    ` + shader.vertexShader;

    // Apply vertex deformations
    if (!isStamen) {
      // Petals: geometry already carries full twist+taper+undulation baked in.
      // We only need to pass vT and vPetalUv to the fragment shader.
      // A gentle sinusoidal micro-crinkle adds life without fighting the baked shape.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vT = uv.y;          // ribbon length param (0 = base, 1 = tip)
        vPetalUv = uv;
        // Micro crinkle — tiny amplitude so it doesn't override the baked twist
        float crinkle = sin(uv.y * uWaveFreq + uPhase) * uWaveAmp * 0.35;
        transformed.y += crinkle;
        `
      );
    } else {
      // Stamen tubes: extract length progress
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vT = uv.x;
        `
      );
    }

    // Inject fragment shader header: HSL conversion & procedural dew droplet mapping
    shader.fragmentShader = `
      uniform float uHueBase;
      uniform float uHueTip;
      uniform float uSat;
      uniform float uLight;
      varying float vT;
      varying vec2 vPetalUv;

      vec3 hsl2rgb(vec3 c) {
        vec3 p = clamp(abs(mod(c.x*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
        return c.z + c.y*(p-0.5)*(1.0-abs(2.0*c.z-1.0));
      }

      vec3 getDropletNormal(vec2 uv, vec3 baseNormal, out float isDroplet) {
        const int NUM_DROPLETS = 4;
        vec2 centers[NUM_DROPLETS];
        centers[0] = vec2(0.35, 0.3);
        centers[1] = vec2(0.65, 0.55);
        centers[2] = vec2(0.25, 0.75);
        centers[3] = vec2(0.55, 0.88);

        float radii[NUM_DROPLETS];
        radii[0] = 0.055;
        radii[1] = 0.04;
        radii[2] = 0.05;
        radii[3] = 0.038;

        vec3 finalNormal = baseNormal;
        isDroplet = 0.0;
        float aspect = 16.0;

        for (int i = 0; i < NUM_DROPLETS; i++) {
          vec2 dist = uv - centers[i];
          dist.y *= aspect;
          float d = length(dist);
          float r = radii[i];
          if (d < r) {
            float nx = dist.x / r;
            float ny = dist.y / (aspect * r);
            float nz = sqrt(1.0 - nx*nx - ny*ny);
            vec3 tangentNormal = normalize(vec3(nx * 1.5, ny * 1.5, nz));
            finalNormal = tangentNormal;
            isDroplet = 1.0;
            break;
          }
        }
        return finalNormal;
      }
    ` + shader.fragmentShader;

    // Apply diffuse gradients, veins, normal mappings, and roughness shifts
    if (!isStamen) {
      // Petals
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>

        float t = clamp(vT, 0.0, 1.0);
        float hue  = mix(uHueBase, uHueTip, t);
        float lum  = mix(uLight, uLight + (1.0-uLight)*0.65*t, t);
        vec3 gradientCol = hsl2rgb(vec3(hue, uSat, lum));
        diffuseColor.rgb = gradientCol;

        // Micro veins along width/length contour
        float veinPattern = sin(vPetalUv.x * 65.0 + sin(vPetalUv.y * 8.0) * 1.5) * 0.5 + 0.5;
        float fineVeinPattern = sin(vPetalUv.x * 165.0) * 0.5 + 0.5;
        float totalVeins = mix(1.0, 0.85, (veinPattern * 0.75 + fineVeinPattern * 0.25) * (1.0 - pow(abs(vPetalUv.x - 0.5) * 2.0, 4.0)));
        diffuseColor.rgb *= totalVeins;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `
        #include <normal_fragment_begin>

        float isDropletNorm = 0.0;
        vec3 dropletNormal = getDropletNormal(vPetalUv, vec3(0.0, 0.0, 1.0), isDropletNorm);

        if (isDropletNorm > 0.5) {
          // Tangent space conversion
          vec3 q0 = dFdx( -vViewPosition );
          vec3 q1 = dFdy( -vViewPosition );
          vec2 st0 = dFdx( vPetalUv );
          vec2 st1 = dFdy( vPetalUv );

          vec3 N = normal;

          vec3 tempT = q0 * st1.t - q1 * st0.t;
          vec3 tempB = -q0 * st1.s + q1 * st0.s;

          vec3 T = normalize( tempT - N * dot( tempT, N ) );
          vec3 B = normalize( tempB - N * dot( tempB, N ) );

          vec3 perturbedNormal = T * dropletNormal.x + B * dropletNormal.y + N * dropletNormal.z;
          normal = normalize( perturbedNormal );
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        float isDropletRough = 0.0;
        getDropletNormal(vPetalUv, vec3(0.0, 0.0, 1.0), isDropletRough);
        if (isDropletRough > 0.5) {
          roughnessFactor = 0.0; // water is perfectly smooth
        }
        `
      );
    } else {
      // Filaments
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>

        float t = clamp(vT, 0.0, 1.0);
        float hue  = mix(uHueBase, uHueTip, t);
        float lum  = mix(uLight, uLight + (1.0-uLight)*0.65*t, t);
        vec3 gradientCol = hsl2rgb(vec3(hue, uSat, lum));
        diffuseColor.rgb = gradientCol;
        `
      );
    }
  };

  return mat;
}

function makeAntherMat() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a0806, // near-black dark maroon, matching real Lycoris anthers
    roughness: 0.6,
    metalness: 0.1,
    emissive: 0x3a0f08,
    emissiveIntensity: 0.15, // just a faint warm tint, not a glowing bulb
  });

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `
      #include <normal_fragment_begin>
      // High-frequency procedural 3D noise for pollen dusting bumps
      float pollenNoise = sin(vViewPosition.x * 260.0) * sin(vViewPosition.y * 260.0) * sin(vViewPosition.z * 260.0);
      normal = normalize(normal + pollenNoise * 0.15 * normal);
      `
    );
  };
  return mat;
}

/**
 * makeAntherGlowMat – vivid pollen-fire emissive material.
 * Emissive sits well above the bloom threshold so UnrealBloomPass
 * produces a natural halo without needing any extra light source.
 */
function makeAntherGlowMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xfff0a0,          // pale warm yellow surface
    emissive: new THREE.Color(0xff9900),  // hot orange-amber glow
    emissiveIntensity: 3.2,   // well above bloom threshold (usually 1.0)
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });
}

// Module-level registry — populated in buildFloret, consumed in animate()
const antherGlowCaps = [];

function makePetalMat() {
  return createPhysicalFlowerMaterial(false);
}

function makeStamenMat(isAnther = false) {
  if (isAnther) {
    return makeAntherMat();
  }
  return createPhysicalFlowerMaterial(true);
}

/* ============================================================
   GEOMETRY BUILDERS
============================================================ */
const PETAL_LEN = 5.5;

/**
 * buildPetalGeo – parametric twisted ribbon
 *
 * Architecture:
 *  1. A cubic Bézier spine defines the midrib centre-line in local space
 *     (the petal grows along +Z, drooping gently in Y).
 *  2. At each spine sample we lay out a tiny cross-section strip of width W(t).
 *  3. The strip is rotated by an axial twist angle that grows linearly from 0
 *     at the base to TWIST_TOTAL at the tip → the unmistakable ribbon spiral.
 *  4. Edge undulation: both margin vertices are perturbed in the strip-normal
 *     direction with a low-frequency sine, giving the wavy outer edge.
 *  5. Lanceolate taper: W(t) is very narrow at the base, fullest at ~55 %,
 *     then tapering to a sharp point.
 *  6. The geometry's local origin sits 15 % up the spine so the petal pivots
 *     from inside the ovary rather than the absolute base.
 */
function buildPetalGeo() {
  const LEN_SEGS = 48; // longitudinal divisions
  const W_SEGS   = 6;  // cross-section divisions (ribbon, not a broad blade)
  const TWIST_TOTAL = Math.PI * 1.3;  // 234 ° — visible spiral characteristic
  const MAX_W    = 0.09;              // maximum half-width in world units
  const DROOP_Y  = 0.55;              // how much the midrib dips downward at the tip
  const DROOP_Z  = PETAL_LEN * 0.92; // how far it extends along Z

  const totalVerts = (LEN_SEGS + 1) * (W_SEGS + 1);
  const positions  = new Float32Array(totalVerts * 3);
  const uvs        = new Float32Array(totalVerts * 2);
  const indices    = [];

  // Cubic Bézier helper
  function bezier3(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
      u*u*u*p0[2] + 3*u*u*t*p1[2] + 3*u*t*t*p2[2] + t*t*t*p3[2],
    ];
  }
  function bezier3Tan(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [
      3*(u*u*(p1[0]-p0[0]) + 2*u*t*(p2[0]-p1[0]) + t*t*(p3[0]-p2[0])),
      3*(u*u*(p1[1]-p0[1]) + 2*u*t*(p2[1]-p1[1]) + t*t*(p3[1]-p2[1])),
      3*(u*u*(p1[2]-p0[2]) + 2*u*t*(p2[2]-p1[2]) + t*t*(p3[2]-p2[2])),
    ];
  }

  // Spine control points (local petal space: base at origin, tip along +Z)
  const B0 = [0,  0,         0          ];
  const B1 = [0,  DROOP_Y * 0.1, DROOP_Z * 0.35];
  const B2 = [0,  DROOP_Y * 0.6, DROOP_Z * 0.72];
  const B3 = [0, -DROOP_Y,       DROOP_Z       ];

  let vi = 0, ui = 0;
  for (let li = 0; li <= LEN_SEGS; li++) {
    const t   = li / LEN_SEGS;           // 0 = base … 1 = tip
    const spine = bezier3(B0, B1, B2, B3, t);
    const tan   = bezier3Tan(B0, B1, B2, B3, t);

    // Orthonormal frame: tangent, up-ref → bitangent → normal
    const tLen = Math.sqrt(tan[0]*tan[0] + tan[1]*tan[1] + tan[2]*tan[2]) || 1;
    const tx = tan[0]/tLen, ty = tan[1]/tLen, tz = tan[2]/tLen;

    // Stable reference vector: use world-X unless tangent is nearly parallel
    const refX = Math.abs(tx) < 0.9 ? 1 : 0;
    const refY = Math.abs(tx) < 0.9 ? 0 : 1;
    // Bitangent = T × ref, then normal = T × B
    let bx = ty*0 - tz*refY, by = tz*refX - tx*0, bz = tx*refY - ty*refX;
    let bLen = Math.sqrt(bx*bx+by*by+bz*bz)||1; bx/=bLen; by/=bLen; bz/=bLen;
    let nx = ty*bz - tz*by, ny = tz*bx - tx*bz, nz = tx*by - ty*bx;
    let nLen = Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=nLen; ny/=nLen; nz/=nLen;

    // Axial twist angle: linear 0 → TWIST_TOTAL
    const twistAngle = t * TWIST_TOTAL;
    const cosA = Math.cos(twistAngle), sinA = Math.sin(twistAngle);
    // Rotate (b, n) frame around tangent by twistAngle
    const rbx = bx*cosA - nx*sinA, rby = by*cosA - ny*sinA, rbz = bz*cosA - nz*sinA;

    // Lanceolate width profile
    const halfW = MAX_W * (0.05 + 0.95 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 1.6));

    for (let wi = 0; wi <= W_SEGS; wi++) {
      const s = wi / W_SEGS;       // 0 = one edge, 1 = other edge
      const localU = s * 2 - 1;   // -1 … +1

      // Edge undulation: small sinusoidal perturbation in normal direction
      const undulate = 0.012 * Math.sin(t * Math.PI * 3.5 + localU * Math.PI) * Math.sin(Math.PI * t);

      const px = spine[0] + rbx * localU * halfW + nx * undulate;
      const py = spine[1] + rby * localU * halfW + ny * undulate;
      const pz = spine[2] + rbz * localU * halfW + nz * undulate;

      positions[vi*3]   = px;
      positions[vi*3+1] = py;
      positions[vi*3+2] = pz;
      uvs[ui*2]   = s;
      uvs[ui*2+1] = t;
      vi++; ui++;
    }
  }

  // Build triangle indices
  for (let li = 0; li < LEN_SEGS; li++) {
    for (let wi = 0; wi < W_SEGS; wi++) {
      const a = li * (W_SEGS+1) + wi;
      const b = a + 1;
      const c = a + (W_SEGS+1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Pivot: shift so the base sits 15 % back from origin → petal pivots inside ovary
  geo.translate(0, 0, -PETAL_LEN * 0.15);
  return geo;
}

function buildStamenCurve(length) {
  // Fountain arc: starts nearly vertical, sweeps outward, tip curves up
  const pts = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // X: slow lateral sweep that accelerates — fountain silhouette
    const x = length * 0.72 * Math.pow(t, 1.4);
    // Y: rises gently at first then drops slightly at the very tip
    const y = length * 0.35 * Math.sin(t * Math.PI * 0.62) * (1 - 0.18 * t);
    // Z: small forward depth
    const z = length * 0.22 * t * t;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function buildBractGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
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
  const floret = new THREE.Group();
  const petalGeo = buildPetalGeo();

  const petalMeshes = [];
  const stamenMeshes = [];
  const allMats = [];

  /* 6 tepals (petals)
   *
   * All petals emerge from essentially the same point (the ovary),
   * then fan outward purely via rotation.y.
   *
   * Natural jitter on the inter-petal angle gives the asymmetric
   * 58-63° spacing real lilies show.
   */
  const baseAngles = [];
  let acc = 0;
  for (let j = 0; j < 6; j++) {
    baseAngles.push(acc);
    // 60° nominal + ±5° random jitter per step
    acc += (Math.PI / 3) + (Math.random() - 0.5) * 0.18;
  }

  for (let j = 0; j < 6; j++) {
    const a = baseAngles[j];
    const mat = makePetalMat();
    allMats.push(mat);
    const mesh = new THREE.Mesh(petalGeo, mat);

    // All petals emerge from inside the ovary — no radial offset
    mesh.position.set(0, 0, 0);
    mesh.rotation.order = "YXZ";
    // Y: spin petal around the vertical axis to fan the 6 ribbons
    mesh.rotation.y = a;
    // X: gentle downward tilt so petals sweep outward+down before twisting back
    mesh.rotation.x = -Math.PI * 0.18 + (Math.random() - 0.5) * 0.06;
    // Z: very small roll, keeps petals from all lying in one plane
    mesh.rotation.z = (Math.random() - 0.5) * 0.12;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    floret.add(mesh);
    petalMeshes.push(mesh);
  }

  /* Ovary (tiny green sphere at base) */
  const ovary = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a7a30, roughness: 0.8 })
  );
  ovary.castShadow = true;
  ovary.receiveShadow = true;
  floret.add(ovary);

  /* 6 Stamens + 1 Pistil (asymmetric, 15% longer) */
  const filamentGeo = (len, thick) => {
    const curve = buildStamenCurve(len);
    return new THREE.TubeGeometry(curve, 64, thick, 10, false);
  };

  const antherGeo = new THREE.CapsuleGeometry(0.032, 0.1, 6, 10);
  antherGeo.rotateZ(Math.PI / 2);

  for (let j = 0; j < 7; j++) {
    const isPistil = (j === 6);
    const len = isPistil ? PETAL_LEN * 2.45 : PETAL_LEN * 2.2;
    const thick = isPistil ? 0.015 : 0.012;
    const sAngle = isPistil
      ? (5.5 / 7) * Math.PI * 2 + 0.22   // offset from stamens
      : (j / 6) * Math.PI * 2 + 0.08;

    const mat = makeStamenMat(false);
    allMats.push(mat);

    const curve = buildStamenCurve(len);
    const tubGeo = new THREE.TubeGeometry(curve, 64, thick, 10, false);
    const stamen = new THREE.Mesh(tubGeo, mat);
    stamen.name = isPistil ? "pistil" : "stamen";
    stamen.castShadow = true;
    stamen.receiveShadow = true;

    stamen.rotation.order = "YXZ";
    stamen.rotation.y = -sAngle;
    stamen.rotation.z = (Math.PI / 4.2) + (Math.random() - 0.5) * 0.04;

    floret.add(stamen);
    stamenMeshes.push(stamen);

    /* Anther / Stigma at tip */
    const tipPt = curve.getPoint(1);
    const tipMesh = new THREE.Mesh(
      isPistil ? new THREE.SphereGeometry(0.09, 6, 6) : antherGeo.clone(),
      makeStamenMat(true)
    );
    tipMesh.castShadow = true;
    tipMesh.receiveShadow = true;
    tipMesh.position.copy(tipPt);

    if (!isPistil) {
      // Orient the anther's long axis to the filament's actual tangent at
      // the tip (not a fixed static rotation) so it presents its round
      // profile to the viewer instead of sitting edge-on like a flat chip.
      const tipTangent = curve.getTangent(1).normalize();
      const bakedAxis = new THREE.Vector3(1, 0, 0); // matches antherGeo.rotateZ(PI/2) above
      tipMesh.quaternion.setFromUnitVectors(bakedAxis, tipTangent);

      /* ── Anther tip glow caps ────────────────────────────────────────
       * The CapsuleGeometry lobes sit at ±halfLength along its baked X
       * axis (after rotateZ(PI/2) the long axis == filament tangent).
       * We add one tiny emissive sphere at each lobe end so that the
       * bloom pass halos just the tips, not the whole capsule body.
       *
       * Capsule: radius 0.032, length 0.1 → half-length = 0.05
       * Sphere offset from capsule centre along tipTangent: ±(0.05 + r)
       */
      const capR   = 0.028;                                    // glow sphere radius
      const offset = (0.05 + capR * 0.6);                     // capsule half-len + sink in slightly
      const capGeo = new THREE.SphereGeometry(capR, 8, 8);

      [-1, 1].forEach(sign => {
        const glowMat  = makeAntherGlowMat();                  // unique mat per cap for independent pulse
        const capMesh  = new THREE.Mesh(capGeo, glowMat);

        // Offset along the filament tangent (which is now tipMesh's local X
        // after setFromUnitVectors aligned it)
        capMesh.position.copy(tipTangent).multiplyScalar(sign * offset);

        // Store with a random phase so the 42 caps don't all pulse in sync
        capMesh.userData.glowPhase = Math.random() * Math.PI * 2;

        tipMesh.add(capMesh);
        antherGlowCaps.push(capMesh);
      });
    }

    stamen.add(tipMesh);
  }

  return { group: floret, stamenMeshes, petalMeshes, allMats };
}

/* ============================================================
   FLOWER FACTORY  (full plant: bulb + scape + umbel)
============================================================ */
function createFlower(offset, delay, heightScale) {
  const root = new THREE.Group();
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
  bulbMesh.castShadow = true;
  bulbMesh.receiveShadow = true;
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

  // Waxy cuticle stem physical material with vertical longitudinal channels/ridges
  const stemMat = new THREE.MeshPhysicalMaterial({
    color: 0x184c26, // waxy dark green
    roughness: 0.55,
    metalness: 0.05,
    clearcoat: 0.4, // waxy surface clearcoat
    clearcoatRoughness: 0.45,
    transmission: 0.16, // waxy translucency
    thickness: 0.35,
    ior: 1.38,
  });

  stemMat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec2 vStemUv;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vStemUv = uv;
      `
    );

    shader.fragmentShader = `
      varying vec2 vStemUv;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `
      #include <normal_fragment_begin>
      // 6 longitudinal ridges along the stem
      float stemRidges = sin(vStemUv.x * 6.0 * 3.14159 * 2.0) * 0.06;
      normal = normalize(normal + vec3(stemRidges * cos(vStemUv.x * 6.0 * 3.14159 * 2.0), 0.0, stemRidges * sin(vStemUv.x * 6.0 * 3.14159 * 2.0)));
      `
    );
  };

  const stemMesh = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 40, 0.33, 6, false),
    stemMat
  );
  stemMesh.castShadow = true;
  stemMesh.receiveShadow = true;
  root.add(stemMesh);

  /* --- Head Group (umbrella node at stem apex) --- */
  const headGroup = new THREE.Group();
  headGroup.position.set(stemPts[24].x, stemH, stemPts[24].z);
  root.add(headGroup);

  /* Central receptacle */
  const receptacle = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e8b50, roughness: 0.8 })
  );
  receptacle.castShadow = true;
  receptacle.receiveShadow = true;
  headGroup.add(receptacle);

  /* Papery bracts at the junction */
  const bractMat = new THREE.MeshStandardMaterial({
    color: 0x6b4b2a, roughness: 0.9, side: THREE.DoubleSide
  });
  const bractGeo = buildBractGeo();
  for (let b = 0; b < 6; b++) {
    const ba = (b / 6) * Math.PI * 2;
    const brm = new THREE.Mesh(bractGeo, bractMat);
    brm.position.set(Math.cos(ba) * 0.55, 0, Math.sin(ba) * 0.55);
    brm.rotation.y = -ba;
    brm.rotation.x = 0.35;
    brm.castShadow = true;
    brm.receiveShadow = true;
    headGroup.add(brm);
  }

  /* --- Pedicels + Florets --- */
  const FLORET_COUNT = 6;
  const CLUSTER_R = 3.2;
  const pedicelsGroup = new THREE.Group();
  const floretsGroup = new THREE.Group();
  headGroup.add(pedicelsGroup, floretsGroup);

  const pedicelMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b50, roughness: 0.8, emissive: 0x052110, emissiveIntensity: 0.15
  });

  const floretData = [];

  for (let i = 0; i < FLORET_COUNT; i++) {
    const angle = (i / FLORET_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
    const fx = CLUSTER_R * Math.cos(angle);
    const fz = CLUSTER_R * Math.sin(angle);
    // ±20° height variation: some florets droop, some rise — nature is not flat
    const fyBase = CLUSTER_R * 0.22;
    const fyJitter = CLUSTER_R * 0.38 * (Math.random() - 0.5); // ±0.19 * R
    const fy = fyBase + fyJitter;

    /* Pedicel tube */
    const pedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(fx * 0.4, fy * 0.15, fz * 0.4),
      new THREE.Vector3(fx, fy, fz),
    ]);
    const pedMesh = new THREE.Mesh(
      new THREE.TubeGeometry(pedCurve, 12, 0.07, 4, false), pedicelMat
    );
    pedMesh.castShadow = true;
    pedMesh.receiveShadow = true;
    pedicelsGroup.add(pedMesh);

    /* Floret sub-group */
    const { group: floret, stamenMeshes, petalMeshes, allMats } = buildFloret();
    floret.position.set(fx, fy, fz);
    floret.rotation.order = "YXZ";
    floret.rotation.y = -angle;
    // Gentle droop: tilt each floret outward from the umbel centre
    // so the stamens point away from the stem rather than straight up.
    floret.rotation.x = 0.28 + (Math.random() - 0.5) * 0.12;
    floret.rotation.z = 0;
    floretsGroup.add(floret);

    floretData.push({ floret, stamenMeshes, petalMeshes, allMats, angle, fx, fy, fz });
  }

  /* ============================================================
     STATE MACHINE VARIABLES
  ============================================================ */
  let _bloomProgress = 0.0;
  let _growing = true;
  let _stemLag = 0.0;   // aerodynamic lag accumulator
  let _stamenLag = 0.0;

  /* store rest positions for lag math */
  const restHeadY = stemH;

  /* ============================================================
     RESTART FUNCTION (called from GUI)
  ============================================================ */
  function restart() {
    _bloomProgress = 0.0;
    _growing = true;
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
        if (mat.userData && mat.userData.uniforms && mat.userData.uniforms.uCurlY) {
          mat.userData.uniforms.uCurlY.value = curlFactor * 0.45;
          mat.userData.uniforms.uCurlZ.value = curlFactor * 0.65;
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
    _stemLag += (baseSX - _stemLag) * lagSpeed;
    _stamenLag += (baseSZ - _stamenLag) * lagSpeed;

    root.rotation.x = _stemLag;
    root.rotation.z = _stamenLag * 0.7;

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
  }

  /* Update colours from GUI */
  function setUniforms() {
    floretData.forEach(({ allMats }) => {
      allMats.forEach(mat => {
        if (mat.userData && mat.userData.uniforms) {
          mat.userData.uniforms.uHueBase.value = params.hueBase;
          mat.userData.uniforms.uHueTip.value = params.hueTip;
          mat.userData.uniforms.uSat.value = params.saturation;
          mat.userData.uniforms.uLight.value = params.lightness;
        }

        // Dynamically map glow and fresnel settings to physical sheen parameters
        if (mat.isMeshPhysicalMaterial) {
          mat.sheen = params.glow * 1.25;
          mat.sheenRoughness = THREE.MathUtils.clamp(1.0 - (params.fresnelPow / 8.0), 0.1, 1.0);
        }
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
    const angle = i * goldenAngle;
    const r = params.fieldSpacing * Math.sqrt(i);
    const offset = new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle));
    const f = createFlower(offset, i * 0.12, 0.85 + Math.random() * 0.3);
    fieldGroup.add(f.group);
    flowers.push(f);
  }
}

function updateColors() { flowers.forEach(f => f.setUniforms()); }

rebuildField();

/* ============================================================
   ANIMATION LOOP
============================================================ */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta() * 60;
  const time = clock.elapsedTime;

  flowers.forEach(f => f.update(dt, time));
  updateSpores(dt / 60, time); // dt/60 = real seconds elapsed this frame

  /* ── Anther glow pulse ────────────────────────────────────────────
   * Each cap breathes independently (offset phase) between a dim base
   * and a bright peak, creating the impression of pollen bioluminescence.
   */
  antherGlowCaps.forEach(cap => {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.8 + cap.userData.glowPhase);
    // Range: 2.0 (dim) → 4.8 (bright) — always above bloom threshold
    cap.material.emissiveIntensity = 2.0 + pulse * 2.8;
  });

  // Autofocus camera to controls target distance
  if (params.autofocus) {
    const dist = camera.position.distanceTo(controls.target);
    params.bokehFocus = dist;
    bokehPass.uniforms["focus"].value = dist;

    const elFocus = document.getElementById("ctrlFocus");
    const valFocus = document.getElementById("valFocus");
    if (elFocus) elFocus.value = dist;
    if (valFocus) valFocus.textContent = dist.toFixed(0) + "m";
  }

  controls.update();
  if (params.rawRender) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
}
animate();

/* ============================================================
   GLASS DASHBOARD WIRING
============================================================ */
const baseGrowthSpeed = params.growthSpeed;

const $ = (id) => document.getElementById(id);
const elFlowers = $("ctrlFlowers"), valFlowers = $("valFlowers");
const elSpacing = $("ctrlSpacing"), valSpacing = $("valSpacing");
const elSpeed = $("ctrlSpeed"), valSpeed = $("valSpeed");
const elBloomProgress = $("ctrlBloomProgress"), valBloomProgress = $("valBloomProgress");
const elWind = $("ctrlWind"), valWind = $("valWind");
const elAutoBloom = $("ctrlAutoBloom");

const elPalette = $("ctrlPalette");
const elHueBase = $("ctrlHueBase"), valHueBase = $("valHueBase");
const elHueTip = $("ctrlHueTip"), valHueTip = $("valHueTip");
const elSaturation = $("ctrlSaturation"), valSaturation = $("valSaturation");
const elLightness = $("ctrlLightness"), valLightness = $("valLightness");
const elFresnel = $("ctrlFresnel"), valFresnel = $("valFresnel");
const elGlow = $("ctrlGlow"), valGlow = $("valGlow");

const elDensity = $("ctrlDensity"), valDensity = $("valDensity");
const elFocus = $("ctrlFocus"), valFocus = $("valFocus");
const elAperture = $("ctrlAperture"), valAperture = $("valAperture");
const elMaxBlur = $("ctrlMaxBlur"), valMaxBlur = $("valMaxBlur");
const elBloomStrength = $("ctrlBloomStrength"), valBloomStrength = $("valBloomStrength");
const elBloomRadius = $("ctrlBloomRadius"), valBloomRadius = $("valBloomRadius");
const elBloomThreshold = $("ctrlBloomThreshold"), valBloomThreshold = $("valBloomThreshold");
const elRawRender = $("ctrlRawRender");
const elAutofocus = $("ctrlAutofocus");

const elPlay = $("btnPlay");
const elRewind = $("btnRewind");
const elExport = $("btnExport");
const panel = $("bloomPanel");
const tab = $("bloomTab");
const closeBtn = $("bloomClose");



if (elFlowers) {
  elFlowers.addEventListener("change", (e) => {
    params.flowerCount = parseInt(e.target.value, 10);
    rebuildField();
  });
  elFlowers.addEventListener("input", (e) => {
    valFlowers.textContent = e.target.value;
  });
}

if (elSpacing) {
  elSpacing.addEventListener("change", (e) => {
    params.fieldSpacing = parseInt(e.target.value, 10);
    rebuildField();
  });
  elSpacing.addEventListener("input", (e) => {
    valSpacing.textContent = e.target.value + "m";
  });
}

if (elSpeed) {
  elSpeed.addEventListener("input", (e) => {
    const mult = parseFloat(e.target.value);
    params.growthSpeed = baseGrowthSpeed * mult;
    valSpeed.textContent = mult.toFixed(1) + "×";
  });
}

if (elBloomProgress) {
  elBloomProgress.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.bloomProgress = val;
    valBloomProgress.textContent = val.toFixed(2);
    params.autoBloom = false;
    if (elAutoBloom) elAutoBloom.checked = false;
    if (elPlay) elPlay.textContent = "▶ Play";
  });
}

if (elWind) {
  elWind.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.windIntensity = val;
    valWind.textContent = val.toFixed(2);
  });
}

if (elAutoBloom) {
  elAutoBloom.addEventListener("change", (e) => {
    params.autoBloom = e.target.checked;
    if (elPlay) elPlay.textContent = params.autoBloom ? "⏸ Pause" : "▶ Play";
  });
}

if (elPalette) {
  elPalette.addEventListener("change", (e) => applyPalette(e.target.value));
}

if (elHueBase) {
  elHueBase.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.hueBase = val;
    valHueBase.textContent = val.toFixed(3);
    updateColors();
  });
}

if (elHueTip) {
  elHueTip.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.hueTip = val;
    valHueTip.textContent = val.toFixed(3);
    updateColors();
  });
}

if (elSaturation) {
  elSaturation.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.saturation = val;
    valSaturation.textContent = val.toFixed(2);
    updateColors();
  });
}

if (elLightness) {
  elLightness.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.lightness = val;
    valLightness.textContent = val.toFixed(2);
    updateColors();
  });
}

if (elFresnel) {
  elFresnel.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.fresnelPow = val;
    valFresnel.textContent = val.toFixed(1);
    updateColors();
  });
}

if (elGlow) {
  elGlow.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.glow = val;
    valGlow.textContent = val.toFixed(2);
    updateColors();
  });
}

if (elDensity) {
  elDensity.addEventListener("input", (e) => {
    params.particleDensity = parseInt(e.target.value, 10);
    setSporeCount(params.particleDensity);
    valDensity.textContent = params.particleDensity;
  });
}

if (elFocus) {
  elFocus.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    params.bokehFocus = val;
    bokehPass.uniforms["focus"].value = val;
    valFocus.textContent = val.toFixed(0) + "m";
    params.autofocus = false;
    if (elAutofocus) elAutofocus.checked = false;
  });
}

if (elAperture) {
  elAperture.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    const apVal = val * 0.0001;
    params.bokehAperture = apVal;
    bokehPass.uniforms["aperture"].value = apVal;
    valAperture.textContent = val.toFixed(0);
  });
}

if (elMaxBlur) {
  elMaxBlur.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    bokehPass.uniforms["maxblur"].value = val;
    valMaxBlur.textContent = val.toFixed(3);
  });
}

if (elBloomStrength) {
  elBloomStrength.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    bloomPass.strength = val;
    valBloomStrength.textContent = val.toFixed(2);
  });
}

if (elBloomRadius) {
  elBloomRadius.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    bloomPass.radius = val;
    valBloomRadius.textContent = val.toFixed(2);
  });
}

if (elBloomThreshold) {
  elBloomThreshold.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    bloomPass.threshold = val;
    valBloomThreshold.textContent = val.toFixed(2);
  });
}

if (elRawRender) {
  elRawRender.addEventListener("change", (e) => {
    params.rawRender = e.target.checked;
  });
}

if (elAutofocus) {
  elAutofocus.addEventListener("change", (e) => {
    params.autofocus = e.target.checked;
  });
}

if (elPlay) {
  elPlay.addEventListener("click", () => {
    params.autoBloom = !params.autoBloom;
    if (elAutoBloom) elAutoBloom.checked = params.autoBloom;
    elPlay.textContent = params.autoBloom ? "⏸ Pause" : "▶ Play";
  });
}

if (elRewind) {
  elRewind.addEventListener("click", () => {
    params.autoBloom = true;
    if (elAutoBloom) elAutoBloom.checked = true;
    if (elPlay) elPlay.textContent = "⏸ Pause";
    params.restartBloom();
  });
}

if (elExport) {
  elExport.addEventListener("click", () => {
    composer.render();
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

// Sync dashboard spore count
setSporeCount(params.particleDensity);