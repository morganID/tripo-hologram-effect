# Tripo Hologram Effect (Three.js)

A faithful, reusable **hologram effect for Three.js** — reverse‑engineered from the
Tripo3D studio viewer. It combines **5 layers** into one animated "materialise from
grains" hologram:

1. **Surface** hologram — fresnel rim, triplanar edge‑grid, scan beam, micro‑scanlines, breathing pulse (`NormalBlending`).
2. **Points** — sparkle "grains" on the surface, visible only while the model assembles.
3. **Glyph digital‑rain** — 160 columns of A–Z / 0–9 characters (2‑pass: model‑silhouette mask → rain buffer → composite), emerging with the reveal and dissolving afterwards.
4. **LaserRayField** — instanced energy rays that shoot from emitters onto the reveal front, following the bottom→top assembly.
5. **Bloom** — `UnrealBloomPass` (strength .55 / radius .7 / threshold .2).

The model **materialises from the bottom up**: a scan front rises, grains/particles
form the upper body, rays fire along the front, then everything settles into a clean
hologram with a periodic scan + glitch.

## Demo

```
example/
├── index.html   # live demo (Three.js from CDN)
└── model.glb    # sample model (bring your own)
```

Serve the repo root (or the `example/` folder) over HTTP and open `example/index.html`:

```bash
npx serve .          # or: python3 -m http.server 8080
# open http://localhost:8080/example/
```

> Must be served over HTTP — ES module imports and the model fetch won't work from `file://`.

## Install

Copy `src/tripo-hologram.js` into your project (it has the shaders inlined and only
needs `three` as a peer dependency), or add this repo as a dependency.

```bash
npm install three
# then import from ./src/tripo-hologram.js (or your node_modules path)
```

## Usage

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHologram } from './src/tripo-hologram.js';

// --- scene / camera / renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 200);

// --- put your model inside a container group ---
const container = new THREE.Group();
scene.add(container);
container.add(modelRoot);          // your loaded glTF / FBX scene

// --- create the hologram (applies materials, builds glyph + ray systems) ---
const holo = createHologram({ scene, renderer, camera, container, modelRoot });

// --- bloom (use the values the effect was tuned for) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.2));
composer.addPass(new OutputPass());

// --- render loop ---
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  holo.update(dt);        // advances reveal, points, glyphs, rays
  holo.renderMask();      // offscreen silhouette + glyph rain pass (call BEFORE composer.render)
  composer.render();
  requestAnimationFrame(tick);
}
tick();

// replay the assembly animation
document.addEventListener('click', () => holo.replay());
```

### `createHologram(options)`

| Option | Type | Description |
|---|---|---|
| `scene` | `THREE.Scene` | Scene to add the glyph + ray meshes to. |
| `renderer` | `THREE.WebGLRenderer` | Used for the offscreen mask/rain passes. |
| `camera` | `THREE.Camera` | Camera (for glyph billboarding + mask render). |
| `container` | `THREE.Object3D` | Parent of the model; its world matrix defines model space. |
| `modelRoot` | `THREE.Object3D` | The model whose meshes get the hologram material. |

Returns:

| Method | Description |
|---|---|
| `update(dt)` | Advance time + reveal + glyph emerge/dissolve + rays. Call every frame. |
| `renderMask()` | Render the model silhouette and glyph rain into offscreen targets. Call **before** `composer.render()`. |
| `resize(w, h, pixelRatio)` | Resize offscreen targets on window resize. |
| `replay()` | Restart the bottom→top assembly. |
| `surfaceMat`, `points`, `glyph`, `rays` | Handles if you need to tweak further. |

### Tuning

The effect reads the original Tripo3D config (surface `J`, points `K`, glyph `q`,
growth `Y`, bloom `G`). To tweak, edit `CFG` at the top of `src/tripo-hologram.js`
or reach into the returned handles (`holo.glyph.letterUniforms`, etc.).

## How it works

```
update(dt):
  reveal i = 1 - (1 - t/5.2)^2.1        // bottom→top front, ease-out
  surface.setReveal(i) · points.visible = loading
  glyph.setEmerge(i) · glyph.setReveal(i) · (after load) glyph.setDissolve(...)
  rays.update(dt, i, loading)           // spawn rays only on the front band
renderMask():
  render model → maskTarget (silhouette)
  render glyph columns → rainTarget (masked)
composer.render():
  surface + points + rays + glyph composite quad  →  bloom
```

The `shaders/` folder keeps the raw GLSL extracted from the original for reference.

## Notes

- The glyph fragment's original energy chain did not evaluate in this port, so the
  glyph energy is simplified — atlas sampling, the silhouette mask and the 2‑pass
  pipeline are the originals.
- Requires Three.js ≥ 0.150 (uses `RGFormat`, `HalfFloatType`, `InstancedBufferGeometry`).
- **Disclaimer:** this is a study / reverse‑engineering of the Tripo3D viewer effect for
  educational purposes. All original shader logic and design belong to Tripo3D. The
  sample `model.glb` is provided as a placeholder — use your own assets.

## License

MIT — see [LICENSE](LICENSE).
