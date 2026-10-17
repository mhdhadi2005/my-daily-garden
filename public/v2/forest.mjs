import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const families = [
  { height: 2.85, lean: .08, crowns: [[-.71, 2.17, -.13, .62, .43, .5], [.61, 2.21, -.12, .62, .44, .5], [-.35, 2.67, .12, .55, .4, .48], [.38, 2.72, .12, .55, .4, .48]] },
  { height: 2.75, lean: -.04, crowns: [[-.72, 2.05, 0, .7, .54, .58], [.66, 2.07, .09, .73, .53, .57], [0, 2.56, -.04, .76, .57, .66], [-.08, 1.73, .44, .66, .36, .42]] },
  { height: 2.8, lean: .15, crowns: [[-.83, 1.89, -.08, .65, .56, .51], [.84, 1.89, .08, .67, .57, .52], [-.42, 2.53, -.04, .65, .42, .5], [.37, 2.51, 0, .7, .43, .54], [-1.18, 1.33, .45, .27, .68, .33], [1.13, 1.29, .46, .27, .68, .33]] },
  { height: 3.32, lean: -.025, crowns: [[-.38, 2.02, -.07, .42, .55, .39], [.38, 2.2, .08, .4, .58, .41], [-.29, 2.8, .06, .38, .56, .4], [.23, 2.98, -.08, .39, .55, .4], [0, 3.33, 0, .31, .37, .34]] },
  { height: 2.34, lean: .03, crowns: [[-1.16, 1.73, -.02, .78, .41, .56], [1.09, 1.72, .03, .79, .41, .56], [-.49, 2.17, -.05, .75, .42, .55], [.53, 2.19, .02, .77, .44, .58], [0, 1.84, .47, .68, .31, .41]] },
  { height: 2.98, lean: .45, crowns: [[-1.02, 2.17, -.18, .69, .5, .49], [-.52, 2.79, -.07, .61, .47, .53], [.53, 2.34, .05, .76, .46, .55], [1.26, 2.65, -.11, .61, .44, .49], [.24, 3.07, .1, .54, .41, .48]] },
];

export function mountForest(host, garden, selectTree) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D almond forest. Use View all trees to select trees with a keyboard.');
  host.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI * .48;
  controls.addEventListener('change', draw);
  const events = new AbortController();
  scene.add(new THREE.HemisphereLight('#fff7e5', '#75846c', 2.5));
  const sun = new THREE.DirectionalLight('#fff1d3', 3);
  sun.position.set(-4, 9, 7);
  scene.add(sun);

  const world = new THREE.Group();
  const seedPatch = new THREE.Group();
  const pondArea = new THREE.Group();
  const woodlandArea = new THREE.Group();
  scene.add(world, seedPatch);
  world.add(pondArea, woodlandArea);
  const bark = new THREE.MeshStandardMaterial({ color: '#94633d', roughness: .92 });
  const leafGeometry = new THREE.SphereGeometry(1, 8, 6);
  const blossomGeometry = new THREE.SphereGeometry(1, 9, 6);
  const fruitGeometry = new THREE.SphereGeometry(1, 12, 8);
  const materials = {
    leaf: new THREE.MeshStandardMaterial({ color: '#739755', roughness: .92 }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#91b76d', roughness: .92 }),
    leafShade: new THREE.MeshStandardMaterial({ color: '#658949', roughness: .92 }),
    center: new THREE.MeshStandardMaterial({ color: '#f7ad39', roughness: .92 }),
    almond: new THREE.MeshStandardMaterial({ color: '#c68b50', roughness: .92 }),
    seam: new THREE.MeshStandardMaterial({ color: '#9a673a', roughness: .92 }),
    shadow: new THREE.MeshBasicMaterial({ color: '#476339', transparent: true, opacity: .14, depthWrite: false }),
  };
  const blossoms = Object.fromEntries(Object.entries({ Cream: '#fff4e1', Rose: '#f6c3cd', Peach: '#f9c392', Apricot: '#f9c392' })
    .map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: .9, side: THREE.DoubleSide })]));
  for (const name of Object.keys(blossoms)) blossoms[name.toLowerCase()] = blossoms[name];
  const treeModels = [];
  const maxDetailed = 8;
  const distantPositions = [];
  const distantScales = [];
  let distantTrunks, distantCrowns, distantGround;

  function mesh(parent, geometry, material, position, scale) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...position);
    item.scale.set(...scale);
    parent.add(item);
    return item;
  }
  const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, 1), dummy = new THREE.Object3D();
  function segment(parent, start, end, bottomRadius, topRadius) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const item = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, direction.length(), 9), bark);
    item.position.copy(a.add(b).multiplyScalar(.5));
    item.quaternion.setFromUnitVectors(up, direction.normalize());
    parent.add(item);
  }
  function instances(parent, geometry, material, items) {
    const result = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach(([position, rotation, scale], index) => {
      dummy.position.copy(position); dummy.quaternion.copy(rotation); dummy.scale.copy(scale);
      dummy.updateMatrix(); result.setMatrixAt(index, dummy.matrix);
    });
    result.instanceMatrix.needsUpdate = true;
    parent.add(result);
  }
  function random(seed) {
    let value = seed >>> 0;
    return () => ((value = (1664525 * value + 1013904223) >>> 0) / 4294967296);
  }
  function item(x, y, z, sx, sy, sz, angle = 0) {
    return [new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, angle), new THREE.Vector3(sx, sy, sz)];
  }
  function makeTree(tree, index) {
    const rnd = random(157 + index * 581);
    const recipe = families[index % families.length];
    const model = new THREE.Group();
    model.userData.treeIndex = index;
    const x = tree.position?.[0], z = tree.position?.[1];
    model.position.set(Number.isFinite(x) ? Math.max(-4.5, Math.min(4.5, x)) : 0, .17, Number.isFinite(z) ? Math.max(-3, Math.min(3, z)) : 0);
    const shape = new THREE.Group();
    if (index >= 6) shape.scale.setScalar(.93 + rnd() * .14);
    model.add(shape);
    mesh(shape, new THREE.SphereGeometry(1, 24, 8), materials.shadow, [.12, -.045, .12], [1.13, .006, .8]);
    const { height: h, lean } = recipe;
    const knots = [[0, 0, 0], [lean * .22, h * .29, .02], [lean * .68, h * .58, -.06], [lean, h * .78, .02]];
    for (let i = 0; i < 3; i++) segment(shape, knots[i], knots[i + 1], .18 - i * .032, .15 - i * .035);
    const petals = [], centers = [], almonds = [], seams = [], leaves = [];
    recipe.crowns.forEach(([cx, cy, cz, sx, sy, sz], part) => {
      const start = [lean * .48, h * (.46 + part % 2 * .07), -.04];
      const fork = [cx * .48 + lean * .35, cy * .85, cz * .35];
      segment(shape, start, fork, .082, .057);
      segment(shape, fork, [cx, cy, cz], .057, .032);
      mesh(shape, new THREE.SphereGeometry(1, 16, 11), part % 3 ? materials.leaf : materials.leafShade, [cx, cy, cz], [sx, sy, sz]);
      mesh(shape, new THREE.SphereGeometry(1, 12, 9), materials.leafLight, [cx - sx * .18, cy + sy * .18, cz + sz * .27], [sx * .59, sy * .58, sz * .56]);
      for (let bloom = 0; bloom < Math.round(4 + sx * 2); bloom++) {
        const azimuth = rnd() * Math.PI * 2, elevation = -.28 + rnd() * 1.43;
        const normal = new THREE.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
        if (bloom % 3 !== 0 && normal.z < -.15) normal.z *= -.75;
        normal.normalize();
        const center = new THREE.Vector3(cx + normal.x * sx * .92, cy + normal.y * sy * .94, cz + normal.z * sz * .95);
        const facing = new THREE.Quaternion().setFromUnitVectors(forward, normal);
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5;
          const offset = new THREE.Vector3(Math.cos(angle) * .105, Math.sin(angle) * .105, .016).applyQuaternion(facing);
          petals.push([center.clone().add(offset), facing.clone().multiply(new THREE.Quaternion().setFromAxisAngle(forward, angle - Math.PI / 2)), new THREE.Vector3(.092, .135, .036)]);
        }
        centers.push([center.clone().addScaledVector(normal, .03), facing, new THREE.Vector3(.048, .048, .033)]);
        if (bloom === 1) {
          const fruit = center.clone().add(new THREE.Vector3(0, -.21, 0));
          almonds.push([fruit, new THREE.Quaternion(), new THREE.Vector3(.072, .15, .068)]);
          seams.push([fruit.clone().add(new THREE.Vector3(0, 0, .068)), new THREE.Quaternion(), new THREE.Vector3(.011, .13, .009)]);
        }
      }
      for (let i = 0; i < 9; i++) {
        const angle = rnd() * Math.PI * 2, tip = rnd() * .7;
        const position = new THREE.Vector3(cx + Math.cos(angle) * sx * (.85 + tip * .28), cy + (rnd() - .48) * sy * 1.5, cz + Math.sin(angle) * sz * (.85 + tip * .28));
        leaves.push([position, new THREE.Quaternion().setFromAxisAngle(forward, (rnd() - .5) * 2.3), new THREE.Vector3(.09, .18 + rnd() * .07, .035)]);
      }
    });
    instances(shape, blossomGeometry, blossoms[tree.palette || garden.palette] || blossoms[['Cream', 'Rose', 'Peach'][index % 3]], petals);
    instances(shape, blossomGeometry, materials.center, centers);
    instances(shape, fruitGeometry, materials.almond, almonds);
    instances(shape, fruitGeometry, materials.seam, seams);
    instances(shape, leafGeometry, materials.leafLight, leaves);
    scene.add(model);
    treeModels.push(model);
  }

  const disk = new THREE.CylinderGeometry(1, 1, 1, 72);
  mesh(world, disk, new THREE.MeshStandardMaterial({ color: '#fffdf3', roughness: 1 }), [0, -.33, 0], [5.75, .48, 4.23]);
  mesh(world, disk, new THREE.MeshStandardMaterial({ color: '#b7956e', roughness: 1 }), [0, -.28, 0], [5.68, .44, 4.16]);
  mesh(world, disk, new THREE.MeshStandardMaterial({ color: '#86a667', roughness: 1 }), [0, .01, 0], [5.65, .17, 4.12]);
  mesh(woodlandArea, new THREE.SphereGeometry(1, 32, 12), new THREE.MeshStandardMaterial({ color: '#90ad75', roughness: 1 }), [-3.5, .10, 1.8], [1.65, .14, 1.35]);
  mesh(pondArea, new THREE.SphereGeometry(1, 36, 12), new THREE.MeshStandardMaterial({ color: '#d8c59b', roughness: 1 }), [3.15, .17, 2.35], [1.43, .06, .98]);
  const pond = mesh(pondArea, new THREE.SphereGeometry(1, 36, 12), new THREE.MeshStandardMaterial({ color: '#80b7bb', roughness: .35, metalness: .03 }), [3.15, .20, 2.35], [1.31, .055, .86]);
  pond.rotation.y = -.32;
  const rnd = random(901);
  const tufts = [], woodland = [], stones = [], reeds = [];
  for (let i = 0; i < 170; i++) {
    const x = (rnd() - .5) * 11, z = (rnd() - .5) * 7.9;
    if (x * x / 30.5 + z * z / 16.7 > .86 || (x - 3.15) ** 2 / 2.6 + (z - 2.35) ** 2 / 1.1 < 1) continue;
    tufts.push(item(x, .18, z, .075, .13 + rnd() * .14, .075, rnd() * 6));
  }
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.4, distance = .34 + i % 3 * .3;
    woodland.push(item(-3.5 + Math.cos(angle) * distance, .34, 1.8 + Math.sin(angle) * distance, .18, .26 + i % 3 * .06, .16, angle));
  }
  for (let i = 0; i < 21; i++) {
    const angle = i / 21 * Math.PI * 2;
    const x = 3.15 + Math.cos(angle) * 1.43, z = 2.35 + Math.sin(angle) * .96;
    stones.push(item(x, .20, z, .16, .055, .12, angle));
    if (i % 3 === 0) reeds.push(item(x, .36, z, .035, .3, .035, angle));
  }
  instances(world, leafGeometry, new THREE.MeshStandardMaterial({ color: '#6c9a53', roughness: 1 }), tufts);
  instances(woodlandArea, leafGeometry, new THREE.MeshStandardMaterial({ color: '#537c4f', roughness: 1 }), woodland);
  instances(pondArea, fruitGeometry, new THREE.MeshStandardMaterial({ color: '#d9c7a9', roughness: 1 }), stones);
  instances(pondArea, fruitGeometry, new THREE.MeshStandardMaterial({ color: '#608562', roughness: 1 }), reeds);
  garden.trees.slice(0, maxDetailed).forEach(makeTree);
  const distantCount = Math.max(0, garden.trees.length - maxDetailed);
  if (distantCount) {
    distantTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .09, 1, 6), bark, distantCount);
    distantCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.58, 1), materials.leaf, distantCount);
    distantTrunks.userData.firstDistantIndex = maxDetailed;
    distantCrowns.userData.firstDistantIndex = maxDetailed;
    world.add(distantTrunks, distantCrowns);
    for (let i = 0; i < distantCount; i++) {
      const tree = garden.trees[maxDetailed + i];
      const fallbackX = -6 + (i % 9) * 1.5;
      const fallbackZ = -4.3 - Math.floor(i / 9) * 1.5;
      const x = Number.isFinite(tree.position?.[0]) ? tree.position[0] : fallbackX;
      const z = Number.isFinite(tree.position?.[1]) ? tree.position[1] : fallbackZ;
      const position = new THREE.Vector3(x, 0, z);
      distantPositions.push(position);
      distantScales.push(.62 + random(3001 + i)() * .16);
      setDistantScale(i, 1);
      distantCrowns.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#91b76d' : i % 3 === 1 ? '#739755' : '#658949'));
    }
    const extra = (garden.decorations || []).filter(decoration => Number.isFinite(decoration.position?.[0]) && Number.isFinite(decoration.position?.[1]) && decoration.position[1] < -3.4);
    const xs = [...distantPositions.map(position => position.x), ...extra.map(decoration => decoration.position[0])];
    const zs = [...distantPositions.map(position => position.z), ...extra.map(decoration => decoration.position[1])];
    const left = Math.min(-6, ...xs) - .6, right = Math.max(6, ...xs) + .6;
    const front = -3.35, back = Math.min(-4.3, ...zs) - .7;
    distantGround = mesh(world, new THREE.SphereGeometry(1, 40, 12), new THREE.MeshStandardMaterial({ color: '#77996a', roughness: 1 }),
      [(left + right) / 2, -.13, (front + back) / 2], [(right - left) / 2, .25, (front - back) / 2]);
    distantTrunks.instanceMatrix.needsUpdate = true;
    distantCrowns.instanceMatrix.needsUpdate = true;
    distantCrowns.instanceColor.needsUpdate = true;
  }
  const decorationModels = [];
  const flowerStem = new THREE.MeshStandardMaterial({ color: '#6b9454', roughness: 1 });
  const flowerFace = blossoms[ garden.palette ] || blossoms.Cream;
  const stone = new THREE.MeshStandardMaterial({ color: '#d2b990', roughness: 1 });
  for (const decoration of garden.decorations || []) {
    const model = new THREE.Group();
    const [x, z] = decoration.position || [0, 0];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    model.position.set(x, .2, z);
    if (decoration.type === 'bird_bath') {
      mesh(model, new THREE.CylinderGeometry(.19, .28, .52, 12), stone, [0, .24, 0], [1, 1, 1]);
      mesh(model, new THREE.SphereGeometry(1, 16, 8), stone, [0, .52, 0], [.43, .12, .43]);
      mesh(model, new THREE.SphereGeometry(1, 16, 8), new THREE.MeshStandardMaterial({ color: '#92bec0', roughness: .4 }), [0, .61, 0], [.33, .035, .33]);
    } else if (decoration.type === 'wildflowers') {
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4, radius = .1 + i % 3 * .1, height = .27 + i % 4 * .075;
        const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
        mesh(model, new THREE.CylinderGeometry(.015, .019, height, 5), flowerStem, [dx, height / 2, dz], [1, 1, 1]);
        mesh(model, blossomGeometry, i % 2 ? flowerFace : blossoms.Rose, [dx, height, dz], [.11, .08, .11]);
        mesh(model, blossomGeometry, materials.center, [dx, height + .06, dz], [.027, .025, .027]);
      }
    } else {
      mesh(model, new THREE.SphereGeometry(1, 10, 7), stone, [0, .12, 0], [.32, .18, .26]);
      mesh(model, blossomGeometry, flowerFace, [.02, .31, 0], [.16, .1, .16]);
    }
    world.add(model);
    decorationModels.push({ model, unlockedAtTree: decoration.unlockedAtTree || 0 });
  }
  let resident;
  if (garden.resident === 'fox' || garden.resident === 'hedgehog') {
    resident = new THREE.Group();
    resident.position.set(.15, .22, 2.65);
    const fox = garden.resident === 'fox';
    const coat = new THREE.MeshStandardMaterial({ color: fox ? '#c97843' : '#846c55', roughness: 1 });
    const face = new THREE.MeshStandardMaterial({ color: '#f8e4c6', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#343843', roughness: .8 });
    mesh(resident, new THREE.SphereGeometry(1, 16, 10), coat, [0, .23, 0], [.43, .28, .33]);
    mesh(resident, new THREE.SphereGeometry(1, 16, 10), face, [0, .34, .26], [.27, .23, .18]);
    for (const side of [-1, 1]) {
      mesh(resident, new THREE.ConeGeometry(.13, .33, 8), coat, [side * .18, .63, .17], [1, 1, 1]);
      mesh(resident, new THREE.SphereGeometry(1, 8, 6), dark, [side * .11, .38, .416], [.028, .038, .023]);
    }
    mesh(resident, new THREE.SphereGeometry(1, 8, 6), dark, [0, .3, .445], [.038, .03, .025]);
    if (fox) {
      const tail = mesh(resident, new THREE.SphereGeometry(1, 12, 8), coat, [-.48, .25, -.16], [.37, .16, .17]);
      tail.rotation.z = -.35;
      mesh(resident, new THREE.SphereGeometry(1, 12, 8), face, [-.75, .36, -.16], [.12, .15, .13]);
    } else {
      for (let i = 0; i < 15; i++) {
        const angle = i * 2.4;
        const spike = mesh(resident, new THREE.ConeGeometry(.08, .23, 5), coat,
          [Math.cos(angle) * .28, .48 + i % 3 * .03, Math.sin(angle) * .2 - .08], [1, 1, 1]);
        spike.rotation.z = Math.cos(angle) * .38;
      }
    }
    resident.userData.resident = true;
    world.add(resident);
  }
  const selectionRing = new THREE.Mesh(new THREE.TorusGeometry(.64, .04, 6, 36),
    new THREE.MeshBasicMaterial({ color: '#f2a541' }));
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  scene.add(selectionRing);
  mesh(seedPatch, new THREE.CylinderGeometry(1, 1, 1, 40), new THREE.MeshStandardMaterial({ color: '#a98562', roughness: 1 }), [0, -.1, 0], [1.5, .18, 1.1]);
  mesh(seedPatch, new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: '#a26434', roughness: 1 }), [0, .13, 0], [.2, .28, .15]).rotation.z = -.35;
  mesh(seedPatch, new THREE.CylinderGeometry(.02, .04, .45, 7), new THREE.MeshStandardMaterial({ color: '#608254' }), [.1, .42, 0], [1, 1, 1]).rotation.z = -.25;
  mesh(seedPatch, leafGeometry, new THREE.MeshStandardMaterial({ color: '#769a65' }), [.25, .57, 0], [.22, .05, .12]);
  seedPatch.scale.setScalar(1.5);

  function draw() { renderer.render(scene, camera); }
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 380 ? 58 : width < 500 ? 52 : 38;
    camera.updateProjectionMatrix();
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let sceneInView = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => { sceneInView = entry.isIntersecting; });
  visibilityObserver.observe(host);

  function setArea(area) {
    selectionRing.visible = false;
    const target = { all: [0, host.clientWidth < 500 ? .2 : .6, 0], meadow: [-2.2, .8, .2], pond: [3.15, .6, 2.35], woodland: [-3.5, .8, 1.8] }[area] || [0, .6, 0];
    const offset = area === 'all' ? (distantCount ? [8, 7.3, 10] : host.clientWidth < 320 ? [5.8, 5.5, 7.4] : host.clientWidth < 500 ? [5, 4.8, 6.4] : [6.8, 6.2, 8.5]) : [5.2, 5.3, 6.7];
    controls.target.set(...target);
    camera.position.set(target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]);
    controls.update();
  }
  function setVisibleTrees(count) {
    world.visible = count > 0;
    seedPatch.visible = count === 0;
    pondArea.visible = count >= 4;
    woodlandArea.visible = count >= 6;
    decorationModels.forEach(({ model, unlockedAtTree }) => { model.visible = count >= unlockedAtTree; });
    if (resident) resident.visible = count >= 3;
    treeModels.forEach((model, index) => { model.visible = index < count; });
    if (distantTrunks) {
      const visible = Math.max(0, Math.min(distantCount, count - maxDetailed));
      distantTrunks.count = visible;
      distantCrowns.count = visible;
      distantGround.visible = visible > 0;
    }
    if (count === 0) {
      controls.target.set(0, .1, 0);
      camera.position.set(2.8, 3, 4.2);
      controls.update();
    }
    draw();
  }
  function setTreeScale(index, scale) {
    if (treeModels[index]) treeModels[index].scale.setScalar(scale);
    else if (distantTrunks && distantPositions[index - maxDetailed]) setDistantScale(index - maxDetailed, scale);
    draw();
  }
  function setDistantScale(index, fraction) {
    const position = distantPositions[index], size = distantScales[index] * fraction;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(position.x, .47 * size, position.z);
    dummy.scale.setScalar(size); dummy.updateMatrix();
    distantTrunks.setMatrixAt(index, dummy.matrix);
    dummy.position.y = 1.02 * size;
    dummy.updateMatrix(); distantCrowns.setMatrixAt(index, dummy.matrix);
    distantTrunks.instanceMatrix.needsUpdate = true;
    distantCrowns.instanceMatrix.needsUpdate = true;
  }
  function focusTree(index) {
    const position = treeModels[index]?.position || distantPositions[index - maxDetailed];
    if (!position) return;
    const y = index < maxDetailed ? 1.15 : .7;
    controls.target.set(position.x, y, position.z);
    selectionRing.position.set(position.x, index < maxDetailed ? .24 : .06, position.z);
    selectionRing.scale.setScalar(index < maxDetailed ? 1 : .65);
    selectionRing.visible = true;
    camera.position.set(position.x + (index < maxDetailed ? 4.5 : 2.6), index < maxDetailed ? 4.5 : 2.7, position.z + (index < maxDetailed ? 5.5 : 3.6));
    controls.update();
  }
  function capture() {
    draw();
    return renderer.domElement.toDataURL('image/png');
  }

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let reactionUntil = 0, residentTick;
  if (resident && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    residentTick = setInterval(() => {
      if (!resident.visible || !sceneInView || document.visibilityState !== 'visible') return;
      const now = performance.now();
      resident.position.y = .22 + Math.sin(now / 510) * .025 + (now < reactionUntil ? Math.sin(now / 65) * .09 : 0);
      resident.rotation.y = Math.sin(now / 950) * .09;
      draw();
    }, 100);
  }
  let down;
  renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; }, { signal: events.signal });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (resident?.visible && raycaster.intersectObject(resident, true).length) {
      reactionUntil = performance.now() + 520;
      return;
    }
    const clickable = treeModels.filter(tree => tree.visible);
    if (distantTrunks?.count) clickable.push(distantTrunks, distantCrowns);
    const hit = raycaster.intersectObjects(clickable, true)[0];
    if (hit?.object.userData.firstDistantIndex !== undefined) {
      selectTree(hit.object.userData.firstDistantIndex + hit.instanceId);
      return;
    }
    let object = hit?.object;
    while (object && object.userData.treeIndex === undefined) object = object.parent;
    if (object) selectTree(object.userData.treeIndex);
  }, { signal: events.signal });

  function dispose() {
    clearInterval(residentTick);
    observer.disconnect();
    visibilityObserver.disconnect();
    events.abort();
    controls.removeEventListener('change', draw);
    controls.dispose();
    const geometries = new Set(), usedMaterials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material])
        .forEach(material => usedMaterials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    usedMaterials.forEach(material => material.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  setArea('all');
  setVisibleTrees(garden.trees.length);
  resize();
  return { setArea, setVisibleTrees, setTreeScale, focusTree, capture, dispose };
}
