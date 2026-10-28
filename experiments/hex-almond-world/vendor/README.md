# Three.js add-ons

These unmodified files are from the official Three.js `r186` tag, matching
`public/v2/vendor/three.core.js`:

- `loaders/GLTFLoader.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/GLTFLoader.js
- `utils/BufferGeometryUtils.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/BufferGeometryUtils.js
- `utils/SkeletonUtils.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/SkeletonUtils.js

The utils are direct imports of GLTFLoader. All use the existing vendored
Three.js core through the viewer's import map. The upstream MIT licence is
preserved in `LICENSE`.
