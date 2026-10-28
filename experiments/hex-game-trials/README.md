# Almond forest game trials

Two local gameplay trials use the shared Blender world in `../hex-almond-world/seven-hex-world.glb`. They demonstrate different ways to build a hex garden: deliberate tile placement and constrained tile generation. They are experiments, not production integration or reward decisions.

## Run

From the repository root, serve the files over HTTP:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/experiments/hex-game-trials/>. No npm install or build step is required.

- [Tile builder](hexkingdom/): choose an empty hex, preview and rotate a tile, then place it. Matching neighbours affect the demonstration score. Adapted from [Hexkingdom](https://github.com/Leks2000/Hexkingdom).
- [Growing grove](hex-map-wfc/): generate or expand a layout, then select and regenerate a local patch. Adapted from [Hex Map WFC](https://github.com/felixturner/hex-map-wfc).

Each trial includes its upstream licence and provenance notes. The comparison page and screenshots are alongside this README.

## Shared design and limits

Both trials load the same seven-hex asset study and aim to show the complete world in the overview. Each planted hex contains one main earned tree; the pond hex contains none. Their scores, tile choices and regeneration rules are temporary gameplay mechanics. They do not award or remove garden points, earned trees or subscriber progress. No subscriber API, database or server-backed persistence is connected.

The asset pack has land rims and one pond design, but no modular path, river or coastline edges. See [hex design notes](../../docs/hex-design-notes.md) and [the Blender asset README](../hex-almond-world/README.md) for the current art scope.

## Checks

Run from the repository root:

```sh
node experiments/hex-game-trials/hexkingdom/self-check.mjs
node experiments/hex-game-trials/hex-map-wfc/verify.mjs
```

The first checks placement, scoring, coordinates, rotation and restart behavior. The second checks seeded generation, expansion, fixed cells during patch regeneration, pond spacing and Blender model roots. These checks do not measure physical-phone performance or establish production accessibility, persistence or integration.
