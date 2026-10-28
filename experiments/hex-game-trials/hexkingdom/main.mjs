import * as THREE from 'three';
import { OrbitControls } from '../../../public/v2/vendor/OrbitControls.js';
import { GLTFLoader } from '../../hex-almond-world/vendor/loaders/GLTFLoader.js';
import { AlmondTrial, CATALOG, RADIUS, makeCell, modelName, cellPosition, cellAtPosition } from './state.mjs?v=5';

const viewport = document.querySelector('#viewport');
const message = document.querySelector('#message');
const trial = new AlmondTrial();
let selected = 'blossom', rotation = 0, keyboardIndex = 0, ready = false;
let previewCell = null, refreshPreview = () => {};
const buttons = new Map();
const models = new Map();
const tiles = new THREE.Group();
const frontier = new THREE.Group();
const ghost = new THREE.Group();
const previewMaterials = new Map();
const selectedOutline = new THREE.LineBasicMaterial({ color: '#e38b00' });
const matchOutline = new THREE.LineBasicMaterial({ color: '#188c70' });
const mismatchOutline = new THREE.LineBasicMaterial({ color: '#d65c43' });
const forestMarker = new THREE.MeshBasicMaterial({ color: '#408d42' });
const fieldMarker = new THREE.MeshBasicMaterial({ color: '#eacb71' });
const markerGeometry = new THREE.SphereGeometry(.072, 6, 4);
const hexShape = new THREE.Shape();
for (let i = 0; i < 6; i++) {
  const angle = i * Math.PI / 3;
  const x = Math.cos(angle) * (RADIUS - .02), y = Math.sin(angle) * (RADIUS - .02);
  if (i === 0) hexShape.moveTo(x, y); else hexShape.lineTo(x, y);
}
hexShape.closePath();
const frontierGeometry = new THREE.ShapeGeometry(hexShape);
frontierGeometry.rotateX(-Math.PI / 2);
const outlineGeometry = new THREE.EdgesGeometry(frontierGeometry);
const frontierMaterial = new THREE.MeshBasicMaterial({ color: '#e7bd77', transparent: true, opacity: .32, side: THREE.DoubleSide });

function say(text) { message.textContent = text; }
function clearPreview() {
  ghost.clear();
  previewCell = null;
  for (const material of previewMaterials.values()) material.dispose();
  previewMaterials.clear();
}
function updateHud() {
  document.querySelector('#tile-count').textContent = trial.grid.size;
  document.querySelector('#score').textContent = trial.scoring.total;
  for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === selected));
  document.querySelector('#rotate').textContent = `Rotate · ${rotation * 60}°`;
  const edges = document.querySelector('#edges');
  const values = makeCell(0, 0, selected, rotation).edges;
  edges.replaceChildren(...values.map(value => {
    const dot = document.createElement('span');
    dot.className = `edge ${value}`;
    dot.title = value === 'forest' ? 'Woodland edge' : 'Meadow edge';
    return dot;
  }));
  edges.setAttribute('aria-label', `Selected tile: ${values.map(v => v === 'forest' ? 'woodland' : 'meadow').join(', ')}`);
}
for (const [id, def] of Object.entries(CATALOG)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = def.name;
  button.disabled = true;
  button.addEventListener('click', () => {
    selected = id;
    rotation = 0;
    updateHud();
    if (previewCell) refreshPreview();
    else say(`${def.name} selected. Choose an outlined hex to preview it.`);
  });
  document.querySelector('#tiles').append(button);
  buttons.set(id, button);
}
updateHud();

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#fff2d9');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Almond tile placement game. Arrow keys preview an empty neighbor. R rotates the preview. Enter plants the preview, or chooses one when none is selected.');
  viewport.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(tiles, frontier, ghost);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 500);
  camera.position.set(12, 14, 17);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 10;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minZoom = .7;
  controls.maxZoom = 3.5;
  scene.add(new THREE.HemisphereLight('#fff9e7', '#b6baa1', 1.8));
  const key = new THREE.DirectionalLight('#fff1d4', 3);
  key.position.set(-14, 24, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.normalBias = .04;
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: .1, far: 100 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);

  function tileVisual(cell, preview = false) {
    const source = models.get(modelName(cell));
    const group = source.clone(true);
    group.position.set(0, 0, 0);
    group.rotation.y = cell.rotation * Math.PI / 3;
    if (preview) group.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      const ghostMaterial = material => {
        if (!previewMaterials.has(material)) {
          const copy = material.clone();
          copy.transparent = true;
          copy.opacity = .48;
          copy.depthWrite = false;
          previewMaterials.set(material, copy);
        }
        return previewMaterials.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(ghostMaterial) : ghostMaterial(object.material);
    });
    const container = new THREE.Group();
    container.add(group);
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      const dot = new THREE.Mesh(markerGeometry, cell.edges[i] === 'forest' ? forestMarker : fieldMarker);
      dot.position.set(Math.cos(angle) * 1.19, .225, -Math.sin(angle) * 1.19);
      container.add(dot);
    }
    const p = cellPosition(cell.q, cell.r);
    container.position.set(p.x, 0, p.z);
    return container;
  }
  function refreshWorld() {
    tiles.clear();
    for (const cell of trial.grid.cells.values()) {
      cell.group = tileVisual(cell);
      tiles.add(cell.group);
    }
    frontier.clear();
    for (const p of trial.grid.frontierCells()) {
      const slot = new THREE.Mesh(frontierGeometry, frontierMaterial);
      const pos = cellPosition(p.q, p.r);
      slot.position.set(pos.x, .018, pos.z);
      frontier.add(slot);
    }
    updateHud();
  }
  function overview(resetAngle = false) {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    if (!ready) return;
    const points = [];
    for (const group of previewCell ? [tiles, ghost] : [tiles]) {
      group.updateWorldMatrix(true, true);
      group.traverse(object => {
        if (!object.isMesh) return;
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
        }
      });
    }
    // Keep both the planted world and the current candidate wholly visible.
    const bounds = new THREE.Box3().setFromPoints(points);
    const center = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3()).length();
    const direction = resetAngle ? new THREE.Vector3(12, 14, 17) : camera.position.clone().sub(controls.target);
    camera.position.copy(center).addScaledVector(direction.normalize(), span * 2 + 8);
    camera.lookAt(center);
    camera.zoom = 1;
    camera.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) {
      point.applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    const offset = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0).applyQuaternion(camera.quaternion);
    camera.position.add(offset);
    controls.target.copy(center.add(offset));
    camera.updateMatrixWorld(true);
    const aspect = width / height, half = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect)) * 1.12;
    Object.assign(camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, far: span * 5 + 30 });
    camera.updateProjectionMatrix();
    controls.update();
  }
  new ResizeObserver(() => overview()).observe(viewport);
  document.querySelector('#overview').addEventListener('click', () => overview(true));
  const rotate = () => {
    rotation = (rotation + 1) % 6;
    updateHud();
    if (previewCell) refreshPreview();
    else say(`${CATALOG[selected].name} rotated to ${rotation * 60}°. Choose an outlined hex to preview it.`);
  };
  document.querySelector('#rotate').addEventListener('click', rotate);
  document.querySelector('#restart').addEventListener('click', () => {
    trial.restart(); clearPreview(); keyboardIndex = 0; refreshWorld(); overview(true);
    say('Back to seven starting tiles. Trial points reset.');
  });
  function preview(cell) {
    if (cell && previewCell && cell.q === previewCell.q && cell.r === previewCell.r && selected === previewCell.asset && rotation === previewCell.rotation) return;
    clearPreview();
    if (!cell || !ready) return;
    const candidate = trial.preview(cell.q, cell.r, selected, rotation);
    if (!candidate) { say('Choose an empty outlined hex to preview your tile.'); return; }
    previewCell = candidate.cell;
    keyboardIndex = trial.grid.frontierCells().findIndex(p => p.q === cell.q && p.r === cell.r);
    ghost.add(tileVisual(candidate.cell, true));
    const marker = new THREE.LineSegments(outlineGeometry, selectedOutline);
    const p = cellPosition(cell.q, cell.r);
    marker.position.set(p.x, .25, p.z);
    ghost.add(marker);
    for (const edge of candidate.evaluation.perEdge) {
      const ring = new THREE.LineSegments(outlineGeometry, edge.match ? matchOutline : mismatchOutline);
      const neighbor = cellPosition(edge.neighborCell.q, edge.neighborCell.r);
      ring.position.set(neighbor.x, .25, neighbor.z);
      ghost.add(ring);
    }
    const bounds = new THREE.Box3().setFromObject(ghost);
    let clipped = false;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      if (Math.abs(point.x) > .92 || Math.abs(point.y) > .92) clipped = true;
    }
    if (clipped) overview();
    say(`${CATALOG[selected].name} · ${rotation * 60}° · +${candidate.score.delta} points · ${candidate.evaluation.matches}/${candidate.evaluation.total} touching edges match${candidate.score.perfect ? ' · perfect ×3' : ''}. Click, tap again or Enter to plant.`);
  }
  refreshPreview = () => { const cell = previewCell; clearPreview(); if (cell) preview(cell); };
  function place(cell) {
    if (!ready || !cell) return;
    const result = trial.place(cell.q, cell.r, selected, rotation);
    if (!result) { say('Choose an empty outlined hex next to the world.'); return; }
    clearPreview(); refreshWorld(); overview();
    say(`+${result.score.delta} trial points · ${result.score.matches} matching edges${result.score.perfect ? ' · perfect ×3' : ''}. ${trial.grid.size} tiles in your world.`);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.2);
  function pointerCell(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? cellAtPosition(hit.x, hit.z) : null;
  }
  const pointers = new Map();
  let multiTouch = false;
  renderer.domElement.addEventListener('pointerdown', event => {
    const cell = pointerCell(event);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, confirmed: !!previewCell && cell?.q === previewCell.q && cell?.r === previewCell.r });
    if (pointers.size > 1) multiTouch = true;
  });
  renderer.domElement.addEventListener('pointermove', event => {
    const start = pointers.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) { clearPreview(); return; }
    if (!multiTouch && event.pointerType !== 'touch') preview(pointerCell(event));
  });
  renderer.domElement.addEventListener('pointerup', event => {
    const start = pointers.get(event.pointerId);
    const tap = start && !multiTouch && event.button === 0 && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 6;
    pointers.delete(event.pointerId);
    if (!pointers.size) multiTouch = false;
    if (tap) {
      const cell = pointerCell(event);
      const confirmed = start.confirmed && cell?.q === previewCell?.q && cell?.r === previewCell?.r;
      if (!confirmed) preview(cell);
      else place(cell);
    }
  });
  renderer.domElement.addEventListener('pointercancel', event => {
    pointers.delete(event.pointerId); if (!pointers.size) multiTouch = false; clearPreview();
  });
  renderer.domElement.addEventListener('keydown', event => {
    if (!ready) return;
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); }
    const slots = trial.grid.frontierCells();
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      keyboardIndex = (keyboardIndex + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + slots.length) % slots.length;
      preview(slots[keyboardIndex]);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (previewCell) place(previewCell);
      else preview(slots[keyboardIndex % slots.length]);
    }
  });
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  new GLTFLoader().load('../../hex-almond-world/seven-hex-world.glb', ({ scene: world }) => {
    for (const def of Object.values(CATALOG)) for (const name of def.roots) {
      const root = world.getObjectByName(name);
      if (!root) throw new Error(`Missing Blender tile: ${name}`);
      const clean = root.clone(true);
      clean.position.set(0, 0, 0);
      clean.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      models.set(name, clean);
    }
    ready = true;
    for (const button of document.querySelectorAll('button')) button.disabled = false;
    refreshWorld(); overview(true);
    say('Seven starting tiles. Hover or tap an outlined hex to preview your Blender tile and points.');
  }, undefined, error => {
    console.error(error);
    message.classList.add('error');
    say('Could not load the Blender tiles. Serve the repository root over HTTP and check the GLB export.');
  });
} catch (error) {
  console.error(error);
  message.classList.add('error');
  say('The trial could not start. It needs a WebGL-capable browser and the local scene export.');
}
