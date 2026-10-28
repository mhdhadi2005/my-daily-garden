# Hexkingdom trial provenance

This trial adapts [Hexkingdom](https://github.com/Leks2000/Hexkingdom) by Aleksandr (Leks2000), under the preserved [MIT licence](LICENSE).

- Upstream commit: [`e21057413b7a28e4bbab5c342e6d3f026d4109ea`](https://github.com/Leks2000/Hexkingdom/commit/e21057413b7a28e4bbab5c342e6d3f026d4109ea).
- `upstream/` contains the source archive for that commit, including its README and licence; local launch metadata excluded by the scoped ignore rules is absent.
- The trial imports upstream `GridManager`, `Hex`, `ScoringSystem`, `TileDefs`, `Rng` and `Events` modules. Adjacency, frontier cells, edge rotation, matching, region sizes, cluster multipliers and chains use upstream code.
- The only upstream source modification extracts the existing placement calculation as `evaluatePlacement`, so a preview can calculate a score without changing points or emitting events. Placement uses that same calculation.
- `state.mjs` follows upstream `Game.placeTile` ordering: evaluate neighbours, insert the cell, then score it. It maps trial tiles to the shared almond assets and rotates the coordinate basis for flat-top hexes. Preview scoring uses a copied grid and current chain.
- `main.mjs` supplies the trial renderer, controls and tile presentation. It loads shared tile groups from `../../hex-almond-world/seven-hex-world.glb` and uses the repository's Three.js, OrbitControls and GLTFLoader files.
- Upstream economy, combat, research, construction, evolving assets and persistence files may be present in the archive but are not loaded by the trial. The trial's points have no relation to newsletter engagement or reader rewards.

The shared Blender asset is original procedural geometry for this study. Tile groups are cloned with shared geometry and materials; each planted tile keeps one main tree, and the pond tile has none. Green and coral outlines indicate the trial's forest/field edge matching rule. Paths and bridges are fixed asset geometry and do not reconnect automatically between arbitrary tiles.

Run from the repository root by serving the files over HTTP. Open `/experiments/hex-game-trials/hexkingdom/`. The placement and scoring self-check is `node experiments/hex-game-trials/hexkingdom/self-check.mjs`.
