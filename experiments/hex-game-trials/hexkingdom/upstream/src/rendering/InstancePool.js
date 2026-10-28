// ============================================================
// InstancePool — instanced rendering with grow-in animation and
// simple 2-level LOD (hi/lo InstancedMesh pair swapped by camera
// distance). One pool per asset kind → few draw calls total.
// ============================================================
import * as THREE from 'three';
import { MATS } from './Materials.js';

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const LOD_DIST = 26; // beyond this camera distance → low-detail mesh

function materialFor(windy) {
  if (windy === 'strong') return MATS.vcWindStrong;
  if (windy) return MATS.vcWind;
  return MATS.vcStatic;
}

class Pool {
  constructor(scene, asset, capacity) {
    this.capacity = capacity;
    this.items = []; // {pos, rotY, targetScale, scale, growSpeed, alive}
    this.free = [];
    const mat = materialFor(asset.windy);

    this.hi = new THREE.InstancedMesh(asset.hi, mat, capacity);
    this.lo = new THREE.InstancedMesh(asset.lo, mat, capacity);
    for (const m of [this.hi, this.lo]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false; // culling handled per-pool via bounds check
      scene.add(m);
    }
    this.bounds = new THREE.Box3();
    this.boundsDirty = true;
    this.activeLOD = 'hi';
    this.dirty = false;
  }

  spawn(x, y, z, rotY, scale, growSpeed = 2.2) {
    let idx;
    if (this.free.length) {
      idx = this.free.pop();
    } else {
      if (this.items.length >= this.capacity) return -1;
      idx = this.items.length;
      this.items.push(null);
    }
    this.items[idx] = {
      pos: new THREE.Vector3(x, y, z),
      rotY,
      targetScale: scale,
      scale: 0.001,
      growSpeed,
      alive: true,
    };
    this.boundsDirty = true;
    this.dirty = true;
    return idx;
  }

  /** Move a live instance (dynamic agents: citizens). */
  setTransform(idx, x, y, z, rotY) {
    const it = this.items[idx];
    if (!it || !it.alive) return;
    it.pos.set(x, y, z);
    if (rotY !== undefined) it.rotY = rotY;
    this.boundsDirty = true;
    this.dirty = true;
  }

  /** Release a single instance back to the free list. */
  release(idx) {
    const it = this.items[idx];
    if (!it || !it.alive) return;
    it.alive = false;
    this.free.push(idx);
    this.boundsDirty = true;
    this.dirty = true;
  }

  releaseAll() {
    this.items.length = 0;
    this.free.length = 0;
    this.hi.count = 0;
    this.lo.count = 0;
    this.dirty = true;
  }

  update(dt, cameraTarget) {
    let animating = false;
    for (const it of this.items) {
      if (!it || !it.alive) continue;
      if (it.scale < it.targetScale) {
        // grow with slight overshoot handled by clamping
        it.scale = Math.min(it.scale + dt * it.growSpeed * it.targetScale, it.targetScale);
        animating = true;
      }
    }
    if (animating) this.dirty = true;

    // LOD selection by distance from camera focus to pool bounds center
    if (this.boundsDirty && this.items.length) {
      this.bounds.makeEmpty();
      for (const it of this.items) if (it && it.alive) this.bounds.expandByPoint(it.pos);
      this.boundsDirty = false;
    }
    let lod = 'hi';
    if (this.items.length) {
      const d = this.bounds.distanceToPoint(cameraTarget);
      lod = d > LOD_DIST ? 'lo' : 'hi';
    }
    if (lod !== this.activeLOD) {
      this.activeLOD = lod;
      this.dirty = true;
    }

    if (!this.dirty) return;
    this.dirty = false;

    const active = this.activeLOD === 'hi' ? this.hi : this.lo;
    const inactive = this.activeLOD === 'hi' ? this.lo : this.hi;
    inactive.count = 0;

    let n = 0;
    for (const it of this.items) {
      if (!it || !it.alive) continue;
      _quat.setFromAxisAngle(_up, it.rotY);
      // small pop overshoot near the end of growth
      const t = it.scale / it.targetScale;
      const pop = t > 0.75 && t < 1 ? 1 + Math.sin((t - 0.75) * 4 * Math.PI) * 0.08 : 1;
      _scl.setScalar(it.scale * pop);
      _m4.compose(_pos.copy(it.pos), _quat, _scl);
      active.setMatrixAt(n++, _m4);
    }
    active.count = n;
    active.instanceMatrix.needsUpdate = true;
  }
}

export class InstancePool {
  /**
   * @param scene THREE.Scene
   * @param assets output of buildNatureAssets()
   */
  constructor(scene, assets) {
    this.scene = scene;
    this.pools = new Map();
    const capacities = {
      treeA: 1500, treeB: 1500, rock: 600, bush: 800,
      flowers: 900, grass: 2500, crop: 1200,
      // world content expansion
      oak: 800, pine: 800, birch: 700, deadTree: 300,
      cherry: 400, apple: 400,
      rockLarge: 400, rockSmall: 700, rockMoss: 400,
      stump: 400, fallenLog: 400, fern: 800, mushrooms: 600,
      tallGrass: 1500, dryGrass: 1000, reeds: 900,
      lilyPads: 500, waterPlants: 600,
      wildflowersA: 700, wildflowersB: 700,
      // decoration props
      barrel: 500, crate: 500, bench: 300, fenceSeg: 600,
      wagon: 200, cart: 200, hayBale: 400, well: 150,
      lampPost: 300, torch: 400, signpost: 250, scarecrow: 200,
    };
    for (const [name, asset] of Object.entries(assets)) {
      this.pools.set(name, new Pool(scene, asset, capacities[name] || 500));
    }
  }

  /** Register an extra instanced asset at runtime (citizens, wall props…). */
  registerAsset(name, asset, capacity = 500) {
    if (this.pools.has(name)) return this.pools.get(name);
    const p = new Pool(this.scene, asset, capacity);
    this.pools.set(name, p);
    return p;
  }

  spawn(kind, x, y, z, rotY = 0, scale = 1, growSpeed = 2.2) {
    const p = this.pools.get(kind);
    return p ? p.spawn(x, y, z, rotY, scale, growSpeed) : -1;
  }

  /** Move a dynamic instance. */
  setTransform(kind, idx, x, y, z, rotY) {
    const p = this.pools.get(kind);
    if (p) p.setTransform(idx, x, y, z, rotY);
  }

  /** Release a single instance. */
  release(kind, idx) {
    const p = this.pools.get(kind);
    if (p) p.release(idx);
  }

  update(dt, cameraTarget) {
    for (const p of this.pools.values()) p.update(dt, cameraTarget);
  }

  clear() {
    for (const p of this.pools.values()) p.releaseAll();
  }

  /** total live instances (debug) */
  count() {
    let n = 0;
    for (const p of this.pools.values()) n += p.items.length - p.free.length;
    return n;
  }
}
