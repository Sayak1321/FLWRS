# Lycoris Radiata (Japanese Red Spider Lily)
### Advanced Procedural WebGL 3D Digital Artwork

An advanced procedural WebGL recreation of the *Lycoris radiata* (Japanese Red Spider Lily), combining mathematical botany, physics-based animation, custom GLSL shaders, and cinematic post-processing effects.

---

## 🌸 Key Architecture & Features

This simulation models the organic geometry and environment of the Red Spider Lily using a hybrid CPU/GPU workflow:

### 1. Botanical Umbel Cluster Hierarchy
- **Stems (Scapes):** Solid, leafless green stalks deformed dynamically by Simplex wind calculations.
- **Bracts & Ovaries:** Procedural papery bracts and waxy green ovaries instantiated at the junction.
- **Tepals (Petals):** Ribbon-like geometries created using parametric Bezier curves, incorporating custom axial twist, lanceolate tapering, and wavy margin undulations.
- **Stamens & Pistils:** Long, elegant filaments curving outwards and upwards with independent rotation, capped with bioluminescent, pulsing anther glow lobes.

### 2. Custom GLSL Shaders
- **Subsurface Scattering (SSS):** Approximated using a translucent physical PBR layer, allowing light to bleed through filaments and petals.
- **Velvet Sheen:** Custom fragment shader injection adding a crimson rim-glow to petals.
- **Procedural Detailing:** Dynamic micro-vein patterns and organic HSL gradient color interpolation from the base to the tips.
- **Dew Droplets:** Real-time procedural water droplets mapped directly onto the normal and roughness channels of the petals.

### 3. Physics & Wind Simulation
- **Double-Frequency Wind:** Drives base stem sway using slow, high-amplitude noise, and fast, low-amplitude micro-tremors for the stamens.
- **Aerodynamic Lag:** Incorporates physical inertia/lag to represent heavy loading and wind resistance on the flower heads.

### 4. Cinematic Post-Processing
- **Unreal Bloom:** Computes bright emissive highlights on anthers and spores, creating soft glowing halos.
- **Bokeh Depth-of-Field (DOF):** Simulates a macro-lens aperture blur with adjustable focus distance, max blur, and aperture size.
- **Atmospheric Spores:** A custom 3D point cloud of glowing ambient spores that drift upwards based on local 2D value noise.

---

## 🎛 Unified Glassmorphic Dashboard

Every parameter of the environment, flowers, and camera is unified within a single, elegant glassmorphism overlay menu. This unified panel replaces the default `dat.GUI` setup entirely to keep the view clean and immersive:

### 📁 Field & Growth
- **Flowers in Field:** Dynamically scales the flower count from 1 to 20 using Golden Angle spacing.
- **Spacing:** Controls the radius and density of the flower bed.
- **Growth Speed:** Adjusts the multiplier of the blooming time-lapse.
- **Manual Bloom Progress:** Manual slider override (0.0 to 1.0) to study the phases of growth.
- **Wind Intensity:** Adjusts the strength of the swaying and stamen tremor.
- **Auto Bloom Toggle:** Pauses/plays the time-lapse growth loop.

### 📁 Petals & Color
- **Palette Presets:** Quick select profiles:
  - *Vintage Pastel (Lycoris):* The classic deep crimson lily colorway.
  - *Solar Glow:* Bright orange-yellow petals with warm amber spores.
  - *Bioluminescent Neon:* Sci-fi cyan/neon-green petals with waxy teal spores.
- **Hue Base & Hue Tip:** Fine HSL adjustments to shift petal base and tip gradients.
- **Saturation & Lightness:** Modifies physical color intensity.
- **Fresnel Power & Velvet Glow:** Fine-tunes the velvet rim reflection.

### 📁 Cinematic Effects (FX)
- **Atmosphere Spores Density:** Controls count of drifting background spores.
- **Autofocus Camera:** When checked (default), dynamically tracks and focuses on the center of the flowers as the camera orbits or zooms. Manual adjustments to the Camera Focus slider automatically disable autofocus.
- **Camera Focus & Lens Aperture:** Adjusts macro focus distance (when Autofocus is disabled) and background bokeh blur depth.
- **Max Blur:** Caps the maximum blur radius of the bokeh lens.
- **Bloom Pass Settings:** Direct tuning of bloom strength, radius, and luminance threshold.
- **Raw Render Mode:** Bypasses post-processing completely for performance testing.

### 📁 Playback & Capture
- **Rewind (⟲):** Resets the growth cycle to the beginning.
- **Pause/Play:** Toggles active growth.
- **Export PNG:** Captures a high-resolution, alpha-blended render of the WebGL canvas.

---

## 🎮 Interaction & Controls

- **Orbit Camera:** Left Click + Drag
- **Pan Camera:** Right Click + Drag / Arrow Keys
- **Zoom In/Out:** Scroll Wheel

---

## 🚀 Getting Started

Simply open `index.html` in any web browser supporting WebGL 2.0.

For local development or live reloading:
1. Run a local static file server from the project directory, e.g.:
   ```bash
   npx serve .
   ```
2. Open `http://localhost:3000` (or the port specified by your static server) in your browser.
