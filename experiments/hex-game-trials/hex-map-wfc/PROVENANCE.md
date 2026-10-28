# Hex Map WFC trial provenance

This trial adapts [Hex Map WFC](https://github.com/felixturner/hex-map-wfc) by Felix Turner. The preserved [MIT licence](LICENSE) applies to the retained upstream code. The upstream [README](upstream/README.md) is retained for context; its medieval art and WebGPU feature list describe the original project.

- Upstream commit: [`ac797a90438a353ff79590282f0f850b1821aef6`](https://github.com/felixturner/hex-map-wfc/commit/ac797a90438a353ff79590282f0f850b1821aef6), dated 10 March 2026.
- `upstream/src/hexmap/HexWFCCore.js` retains upstream cube coordinates, cells, entropy and the six-edge adjacency index. `upstream/src/SeededRandom.js` retains upstream Mulberry32 seeded randomness.
- `upstream/src/workers/wfc.worker.js` retains the weighted entropy solver, constraint propagation, non-chaining constraints, fixed-cell boundaries, backtracking and result extraction. The trial invokes this worker for initial generation, expansion and patch regeneration; it does not use a prearranged scene.
- The worker exports its solver class and guards the `self.onmessage` assignment so Node can exercise the solver. The solver algorithm is unchanged.
- `HexTileData.js` maps seven shared Blender tile roots to terrain states, tree stages and the upstream `preventChaining` rule for ponds. The temporary pond separation rule does not represent a production rule. Tiles have land rims and do not encode road, river or coastline edge matching.
- The trial replaces the original WebGPU renderer and medieval assets with a static WebGL renderer and the shared Blender GLB. It retains the upstream solver while providing a small integration shell.
- The GLB tile roots are `Hex_00_seedling`, `Hex_01_blossoming`, `Hex_02_young`, `Hex_03_pond`, `Hex_04_fruiting`, `Hex_05_blossoming` and `Hex_06_fruiting`. Whole-world and portrait framing follow the shared asset preview. Reduced-motion preferences are respected.

Run from the repository root by serving the files over HTTP. Open `/experiments/hex-game-trials/hex-map-wfc/`. Run `node experiments/hex-game-trials/hex-map-wfc/verify.mjs` for the isolated solver and model checks; it does not run the root application test or touch SQLite.

This trial has no server-backed persistence, progression, path connectivity, earned-tree identity, road/coast matching or production integration. Patch regeneration can replace trees within the selected patch. The self-check does not establish rendering quality or device performance.
