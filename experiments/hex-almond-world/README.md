# Seven-hex almond world

Editable Blender study in the **Playful 10almonds** palette: orange tile sides, navy trim, fresh green foliage, pale blossom, blue water and a warm cream backdrop. The complete seven-hex world fits in the default view.

Open `seven-hex-world.blend` in Blender. The world collection contains seven separate tile roots and six separate tree roots: a seedling, a young tree, two fruiting trees and two blossoming trees. The seventh hex contains a pond and footbridge. Each planted hex has one main tree; the pond hex has none. Studio lights, camera and backdrop are separate and excluded from the GLB export.

## Files

- `seven-hex-world.blend`: editable geometry, shared materials, lights and camera.
- `seven-hex-world.png`: 1800 × 1350 Blender render.
- `seven-hex-portrait.png`: 900 × 1100 whole-world render.
- `seven-hex-world.glb`: static browser asset shared by both gameplay trials.
- `index.html`: standalone interactive preview using the repository's Three.js runtime.
- `build.py`: procedural source; `PALETTE` at the top controls colours.
- `check.py`: Blender scene checks.

To edit colours by hand, change shared materials such as `Brand_Orange`, `Brand_Navy`, `Leaf_Fresh` and `Blossom_Blush`. For reproducible changes, update `PALETTE` or geometry in `build.py`. The build replaces generated files, including the `.blend` and `.glb`; save manual edits under a different name first.

## Rebuild and check

From the repository root, with Blender's command-line executable available as `blender`:

```sh
blender --background --factory-startup --python-exit-code 1 --python experiments/hex-almond-world/build.py
blender --background experiments/hex-almond-world/seven-hex-world.blend --python-exit-code 1 --python experiments/hex-almond-world/check.py
```

Append `-- --preview` to the build command for a quicker preview render. It still replaces the generated `.blend` and `.glb`; run the full build again for final deliverables. The build writes `receipt.json` and `scene-check.json` with its results.

## Open the preview

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/experiments/hex-almond-world/>. No npm install or build step is needed.

## Scope

Built with Blender 5.2.2 LTS. The Blender scene check covers seven unique hexes, tree placement and growth stages, palette values and camera margins. The browser preview has been checked at desktop and 390 × 844 viewport sizes, including orbit, reset and horizontal overflow. These checks do not establish physical-device performance or production integration.

This is a first art study. The Blender render and browser preview use different lighting and tone mapping. Geometry is original procedural mesh work, and the benchmark image is not used as a texture. The vendored viewer helpers retain Three.js MIT licence notices.

Paths and bridges are fixed geometry. The asset set does not yet include modular pieces for matching path, river or coastline edges between neighbouring tiles.
