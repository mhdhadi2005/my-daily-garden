# Hex garden design notes

## Shared world

Both gameplay trials use the same editable Blender study and exported GLB in `experiments/hex-almond-world/`. It has seven hex tile roots and six separate almond-tree roots. Every planted hex holds one main earned tree; the pond hex has no tree. The tile, tree and tree-growth groups are separate assets.

The visual direction is the **Playful 10almonds** palette: warm cream, orange tile sides, restrained navy trim, fresh green foliage, pale almond blossom and clear blue water. The initial world is framed as one complete overview.

## Two different interactions

- **Tile builder / Hexkingdom adaptation:** the player deliberately chooses an empty hex, previews a tile, rotates it and places it. Matching neighbours affect the trial score.
- **Growing grove / Hex Map WFC adaptation:** a constraint solver chooses tiles for an initial layout or expansion. The player may regenerate a selected local patch while cells outside that patch stay fixed.

These are distinct ways to compose a world. They are mechanic demonstrations only. Trial points, tile rules and generation constraints do not define production rewards, remove or grant earned trees, or change product rules.

## Current art gaps

The shared asset study has one pond treatment and land rims. It does not yet provide modular path, river or coastline edges that reconnect across arbitrary neighbours. Water-edge transitions, path adjacency and additional terrain pieces need Blender work before either trial could represent those systems. The current whole-world framing and art are an initial study, not final art or a performance claim.

## File map

- `experiments/hex-almond-world/seven-hex-world.blend`: editable Blender scene.
- `experiments/hex-almond-world/build.py`: procedural scene source and palette values.
- `experiments/hex-almond-world/seven-hex-world.glb`: shared browser asset.
- `experiments/hex-almond-world/index.html`: standalone asset preview.
- `experiments/hex-game-trials/hexkingdom/`: deliberate placement trial.
- `experiments/hex-game-trials/hex-map-wfc/`: constrained-generation trial.
- `experiments/hex-game-trials/index.html`: comparison page.

Open the `.blend` file in Blender. See the individual READMEs for running and checking the trials and rebuilding the asset study.
