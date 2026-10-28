import * as THREE from 'three';
import { OrbitControls } from '../../../public/v2/vendor/OrbitControls.js';
import { GLTFLoader } from '../../hex-almond-world/vendor/loaders/GLTFLoader.js';
import { cubeCoordsInRadius } from './upstream/src/hexmap/HexWFCCore.js';
import { TILE_LIST } from './upstream/src/hexmap/HexTileData.js';
import { ALL_CELLS, keyOf, positionOf, frontier, localPatch, validateGarden } from './garden.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
const counters = document.querySelector('#counters');
const selected = document.querySelector('#selected');
const buttons = Object.fromEntries([...document.querySelectorAll('button')].map(button => [button.id, button]));
const seedInput = document.querySelector('#seed');
let tiles = [], busy = true, rebuilding = false, selectedCell, revision = 0, requestId = 0, seed = 1047, pending;
let templates, renderer, scene, camera, controls, world, ghosts, selection, selectionGeometry, selectionMaterial, light;
const instances = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const worker = new Worker(new URL('./upstream/src/workers/wfc.worker.js', import.meta.url), { type: 'module' });

function updateControls() {
  for (const button of Object.values(buttons)) button.disabled = busy;
  buttons.grow.disabled = busy || tiles.length >= 19;
  buttons['grow-all'].disabled = busy || tiles.length >= 19;
  buttons['apply-patch'].disabled = busy || !rebuilding || !selectedCell;
  seedInput.disabled = busy;
  viewport.setAttribute('aria-busy', String(busy));
  counters.innerHTML = `<strong>${tiles.length} / 19 tiles</strong><br>${tiles.filter(tile => tile.type !== 3).length} almond trees · ${tiles.filter(tile => tile.type === 3).length} ponds<br>Seed ${seed} · ${revision} changes`;
}

function showError(error) {
  status.classList.add('error');
  status.textContent = error.message || String(error);
  console.error('WFC trial:', error);
}

worker.onmessage = ({ data }) => {
  if (data.type !== 'result' || !pending || data.id !== pending.id) return;
  clearTimeout(pending.timeout);
  const { resolve, reject } = pending;
  pending = null;
  if (data.success) resolve(data);
  else reject(new Error('This patch could not be generated. The previous grove is still here; try again.'));
};
worker.onerror = () => {
  if (!pending) return;
  clearTimeout(pending.timeout);
  pending.reject(new Error('The tile generator could not run. Reload this local trial to try again.'));
  pending = null;
};

async function solve(cells, fixed, message, reset = false) {
  if (!cells.length) return;
  busy = true;
  updateControls();
  status.classList.remove('error');
  status.textContent = 'Growing this little world…';
  try {
    const id = ++requestId;
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending = null;
        reject(new Error('The generator took too long. Your previous grove is still here.'));
      }, 6000);
      pending = { id, resolve, reject, timeout };
      worker.postMessage({ type: 'init', seed: seed + revision * 7919 });
      worker.postMessage({ type: 'solve', id, solveCells: cells, fixedCells: fixed, options: { maxTries: 3, quiet: true } });
    });
    const next = validateGarden([...fixed, ...result.tiles]);
    if (next.length !== fixed.length + cells.length) throw new Error('The generator returned an incomplete grove.');
    const changed = new Set(result.tiles.map(keyOf));
    tiles = next;
    revision++;
    drawWorld(changed);
    if (reset) overview();
    status.textContent = `${message} Trial rule: ponds stay apart; all tile rims are land.`;
    window.wfcTrialState = { seed, revision, tiles: tiles.map(tile => ({ ...tile })), lastSolved: result.tiles.length, backtracks: result.backtracks };
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    updateControls();
  }
}

function drawWorld(changed) {
  world.clear();
  instances.clear();
  for (const tile of tiles) {
    const group = templates[tile.type].clone(true);
    const position = positionOf(tile);
    group.position.set(position.x, 0, position.z);
    group.rotation.y += tile.rotation * Math.PI / 3;
    group.userData.cell = tile;
    group.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.userData.cell = tile;
      }
    });
    if (!reducedMotion && changed.has(keyOf(tile))) {
      group.userData.born = performance.now();
      group.scale.setScalar(.75);
    }
    instances.set(keyOf(tile), group);
    world.add(group);
  }
  ghosts.clear();
  for (const cell of frontier(tiles)) {
    const mesh = new THREE.Mesh(ghostGeometry, ghostMaterial);
    const { x, z } = positionOf(cell);
    mesh.position.set(x, -.11, z);
    mesh.userData.cell = cell;
    mesh.userData.empty = true;
    ghosts.add(mesh);
  }
  selectedCell = null;
  selection.clear();
  selection.visible = false;
  selected.textContent = rebuilding ? 'Choose a tile to preview its patch.' : 'Select a tree, or tap a pale empty tile to grow.';
  updateControls();
}

function overview() {
  if (!tiles.length) return;
  const animated = [...instances.values()].filter(group => group.userData.born).map(group => [group, group.scale.x]);
  for (const [group] of animated) group.scale.setScalar(1);
  world.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(world);
  const points = [];
  world.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      points.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
    }
  });
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = Math.max(bounds.getSize(new THREE.Vector3()).length(), 10);
  camera.zoom = 1;
  camera.position.copy(center).addScaledVector(new THREE.Vector3(11, 13, 17).normalize(), extent * 2);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const projected = points.map(point => point.clone().applyMatrix4(camera.matrixWorldInverse));
  const minX = Math.min(...projected.map(point => point.x)), maxX = Math.max(...projected.map(point => point.x));
  const minY = Math.min(...projected.map(point => point.y)), maxY = Math.max(...projected.map(point => point.y));
  const offset = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0).applyQuaternion(camera.quaternion);
  camera.position.add(offset);
  controls.target.copy(center).add(offset);
  const aspect = viewport.clientWidth / viewport.clientHeight;
  const halfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect)) * 1.12;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.far = extent * 5;
  camera.updateProjectionMatrix();
  light.position.copy(center).add(new THREE.Vector3(-18, 26, 18));
  light.target.position.copy(center);
  Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: extent * 5 });
  light.shadow.camera.updateProjectionMatrix();
  controls.update();
  for (const [group, scale] of animated) group.scale.setScalar(scale);
  world.updateMatrixWorld(true);
}

const ghostGeometry = new THREE.CylinderGeometry(1.43, 1.43, .06, 6, 1, false, Math.PI / 2);
const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#e6c88f', transparent: true, opacity: .22 });
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart, gestureHadMultiplePointers = false;
const pointerIds = new Set();
let keyboardIndex = 0;

function inspectTile(cell) {
  selectedCell = cell;
  const footprint = rebuilding ? localPatch(tiles, cell) : [cell];
  selection.clear();
  for (const tile of footprint) {
    const outline = new THREE.LineLoop(selectionGeometry, selectionMaterial);
    const { x, z } = positionOf(tile);
    outline.position.set(x, .24, z);
    outline.renderOrder = 10;
    selection.add(outline);
  }
  selection.visible = true;
  selected.textContent = rebuilding
    ? `${TILE_LIST[cell.type].name} · tile ${cell.q}, ${cell.r} · ${footprint.length} tiles in patch. Apply when ready.`
    : `${TILE_LIST[cell.type].name} · tile ${cell.q}, ${cell.r}`;
  updateControls();
}

function regeneratePatch(cell) {
  if (!cell) return;
  const patch = localPatch(tiles, cell);
  const keys = new Set(patch.map(keyOf));
  solve(patch, tiles.filter(tile => !keys.has(keyOf(tile))), `Regenerated ${patch.length} tiles; the rest stayed in place.`, true);
}

function wireInteraction(canvas) {
  canvas.addEventListener('keydown', event => {
    if (busy || !tiles.length || !['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    keyboardIndex = (keyboardIndex + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0) + tiles.length) % tiles.length;
    const cell = tiles[keyboardIndex];
    if (event.key === 'Enter' && rebuilding && selectedCell) regeneratePatch(selectedCell);
    else inspectTile(cell);
  });
  canvas.addEventListener('pointerdown', event => {
    pointerIds.add(event.pointerId);
    if (pointerIds.size > 1) gestureHadMultiplePointers = true;
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointercancel', event => { pointerIds.delete(event.pointerId); pointerStart = null; });
  canvas.addEventListener('pointerup', event => {
    pointerIds.delete(event.pointerId);
    const multi = gestureHadMultiplePointers;
    if (!pointerIds.size) gestureHadMultiplePointers = false;
    if (busy || multi || event.button !== 0 || !pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
    pointerStart = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...world.children, ...ghosts.children], true)[0];
    if (!hit) return;
    const cell = hit.object.userData.cell;
    if (hit.object.userData.empty) {
      solve([cell], tiles, 'One new tile has joined the grove.', true);
    } else {
      keyboardIndex = tiles.findIndex(tile => keyOf(tile) === keyOf(cell));
      inspectTile(cell);
    }
  });
}

buttons.grow.onclick = () => { if (!busy) solve(frontier(tiles).slice(0, 1), tiles, 'One new tile has joined the grove.', true); };
buttons['grow-all'].onclick = () => {
  if (busy) return;
  const keys = new Set(tiles.map(keyOf));
  solve(ALL_CELLS.filter(cell => !keys.has(keyOf(cell))), tiles, 'The full 19-tile grove is here.', true);
};
buttons.overview.onclick = () => overview();
buttons['apply-patch'].onclick = () => { if (!busy && rebuilding) regeneratePatch(selectedCell); };
buttons.new.onclick = () => {
  const value = Number(seedInput.value);
  if (!Number.isInteger(value) || value < 1 || value > 999999) { status.textContent = 'Choose a whole-number seed between 1 and 999999.'; seedInput.focus(); return; }
  seed = value;
  revision = 0;
  solve(cubeCoordsInRadius(0, 0, 0, 1), [], 'A fresh seven-tile grove. All changes here are disposable.', true);
};
for (const [id, value] of [['explore', false], ['rebuild', true]]) buttons[id].onclick = () => {
  rebuilding = value;
  selectedCell = null;
  selection.clear();
  selection.visible = false;
  selected.textContent = value ? 'Choose a tile to preview its patch.' : 'Select a tree, or tap a pale empty tile to grow.';
  buttons.explore.setAttribute('aria-pressed', String(!value));
  buttons.rebuild.setAttribute('aria-pressed', String(value));
  status.textContent = value ? 'Select a planted tile to preview the affected area, then choose Regenerate patch to apply.' : 'Tap a tree to inspect it, or a pale empty tile to grow.';
  updateControls();
};

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#fff1d4');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Almond grove. Drag to orbit. Left and right arrows select tiles; Enter applies the selected patch in Patch mode. Use the Grow buttons for keyboard placement.');
  viewport.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-15, 15, 15, -15, .1, 150);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.enablePan = false;
  controls.minZoom = .6;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minPolarAngle = Math.PI / 10;
  scene.add(new THREE.HemisphereLight('#fff9e7', '#b6baa1', 1.8));
  light = new THREE.DirectionalLight('#fff1d4', 3);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.normalBias = .04;
  scene.add(light, light.target);
  world = new THREE.Group();
  ghosts = new THREE.Group();
  scene.add(world, ghosts);
  const border = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 3) * 1.51, 0, Math.sin(i * Math.PI / 3) * 1.51));
  selectionGeometry = new THREE.BufferGeometry().setFromPoints(border);
  selectionMaterial = new THREE.LineBasicMaterial({ color: '#ff9c24', depthTest: false });
  selection = new THREE.Group();
  selection.visible = false;
  scene.add(selection);
  wireInteraction(renderer.domElement);
  new ResizeObserver(() => {
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    if (tiles.length) overview();
  }).observe(viewport);
  renderer.setAnimationLoop(time => {
    for (const group of instances.values()) if (group.userData.born) {
      const t = Math.min(1, (time - group.userData.born) / 350);
      group.scale.setScalar(.75 + .25 * (1 - (1 - t) ** 3));
      if (t === 1) delete group.userData.born;
    }
    controls.update();
    renderer.render(scene, camera);
  });
  const gltf = await new GLTFLoader().loadAsync('../../hex-almond-world/seven-hex-world.glb');
  templates = TILE_LIST.map(tile => {
    const group = gltf.scene.getObjectByName(tile.mesh);
    if (!group) throw new Error(`Missing Blender tile: ${tile.mesh}`);
    const template = group.clone(true);
    template.position.set(0, 0, 0);
    return template;
  });
  await solve(cubeCoordsInRadius(0, 0, 0, 1), [], 'A seven-tile grove. Grow it, orbit it, or try regenerating a patch.', true);
} catch (error) {
  busy = true;
  updateControls();
  showError(error);
}
