// ============================================================
// EvolutionSystem — makes the world grow while the player
// watches. Every placed tile has an evolution plan: a queue of
// timed spawn events (trees, houses, crops, rocks…). The system
// also handles village→town upgrades, castles for big clusters,
// and auto-bridges where roads cross rivers.
// ============================================================
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import { edgeAngle, HEX_SIZE } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { events } from '../core/Events.js';

const APOTHEM = HEX_SIZE * Math.sqrt(3) / 2;

/** point inside hex avoiding river/road strips (reused by BuildingSystem) */
export function scatterPoint(rng, cell, minR = 0, maxR = 0.78) {
  for (let tries = 0; tries < 10; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(minR, maxR);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!blockedByStrips(cell, x, z)) return { x, z };
  }
  return null;
}

/** true if (x,z) lies on a river or road strip of this cell */
function blockedByStrips(cell, x, z) {
  const check = (edges, halfWidth) => {
    if (!edges) return false;
    for (const e of edges) {
      const a = edgeAngle(e);
      // rotate point into strip space (strip runs along +X)
      const lx = x * Math.cos(-a) - z * Math.sin(-a);
      const lz = x * Math.sin(-a) + z * Math.cos(-a);
      if (lx > -0.15 && lx < APOTHEM + 0.1 && Math.abs(lz) < halfWidth) return true;
    }
    return false;
  };
  // center pond/plaza
  if (cell.riverEdges && cell.riverEdges.length && Math.hypot(x, z) < 0.3) return true;
  if (cell.roadEdges && cell.roadEdges.length && Math.hypot(x, z) < 0.26) return true;
  return check(cell.riverEdges, 0.26) || check(cell.roadEdges, 0.22);
}

export class EvolutionSystem {
  /**
   * @param grid GridManager
   * @param pool InstancePool (nature instancing)
   * @param construction ConstructionSystem
   */
  constructor(grid, pool, construction) {
    this.grid = grid;
    this.pool = pool;
    this.construction = construction;
    this.tracked = [];  // cells with pending evolution events
    this._bridged = new Set(); // cell keys that already got an auto-bridge

    events.on('connectors:bridge-needed', ({ cell }) => this.trySpawnBridge(cell));
  }

  /**
   * Register a freshly placed cell: build its evolution plan.
   * fastForward — seconds to instantly simulate (save restore).
   */
  register(cell, fastForward = 0) {
    const rng = new Rng(cell.seed ^ 0x9e3779b9);
    const plan = this._makePlan(cell, rng);
    cell.evo = { plan, elapsed: 0, cursor: 0, rng, castleBuilt: false, townLevel: 0 };
    this.tracked.push(cell);

    // river-road crossing on the same tile → bridge immediately in plan
    if (cell.riverEdges?.length && cell.roadEdges?.length) {
      plan.unshift({ t: 1.2, fn: (c) => this._spawnBridge(c) });
      plan.sort((a, b) => a.t - b.t);
    }

    if (fastForward > 0) this._advance(cell, fastForward, true);
  }

  /** re-check cluster promotions (castle) after each placement */
  onTilePlaced(cell) {
    if (cell.tileType === 'village') this._checkCastle(cell);
    // neighbors of same type may now qualify too
    for (const c of this.grid.cells.values()) {
      if (c.tileType === 'village' && !c.evo?.castleBuilt) this._checkCastle(c);
    }
  }

  _checkCastle(cell) {
    if (!cell.evo || cell.evo.castleBuilt) return;
    const size = this.grid.regionSize(cell.q, cell.r);
    if (size >= 4) {
      // build castle on the region cell with the smallest |q|+|r| that has none
      cell.evo.castleBuilt = true;
      const rng = cell.evo.rng;
      const p = scatterPoint(rng, cell, 0, 0.35) || { x: 0, z: 0 };
      this.construction.build('castle', cell.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
        rotY: rng.range(0, Math.PI * 2),
      });
      events.emit('evolution:castle', { cell });
    }
  }

  _spawnBridge(cell) {
    if (!cell.group) return;
    const rng = cell.evo?.rng || new Rng(cell.seed);
    // bridge sits at tile center where road crosses the river pond,
    // oriented along the first road edge
    const roadE = cell.roadEdges[0];
    this.construction.build('bridge', cell.group, new THREE.Vector3(0, TILE_H + 0.02, 0), rng, {
      rotY: edgeAngle(roadE),
    });
    events.emit('evolution:bridge', { cell });
  }

  /** Road built across an existing river strip (player infrastructure). */
  trySpawnBridge(cell) {
    if (!cell.riverEdges?.length || !cell.roadEdges?.length) return;
    const key = `${cell.q},${cell.r}`;
    if (this._bridged.has(key)) return;
    this._bridged.add(key);
    this._spawnBridge(cell);
  }

  // ---------------- evolution plans per tile type ----------------

  _makePlan(cell, rng) {
    const plan = [];
    const push = (t, fn) => plan.push({ t, fn });
    const wx = () => scatterPoint(rng, cell);

    switch (cell.tileType) {
      case 'forest': {
        // waves of trees, thickening over ~70s; bushes, rocks, flowers
        const waves = 4;
        let t = 0.4;
        for (let w = 0; w < waves; w++) {
          const n = rng.int(2, 4);
          for (let i = 0; i < n; i++) {
            const tt = t + rng.range(0, 2.5);
            push(tt, (c, gp) => {
              const p = wx(); if (!p) return;
              const kind = rng.chance(0.6) ? 'treeA' : 'treeB';
              this.pool.spawn(kind, gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.8, 1.25), 1.4);
            });
          }
          t += rng.range(9, 16) * (w + 1) * 0.5;
        }
        for (let i = 0; i < 3; i++) {
          push(rng.range(3, 30), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn('bush', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.8, 1.3), 1.8);
          });
        }
        push(rng.range(8, 40), (c, gp) => {
          const p = wx(); if (!p) return;
          this.pool.spawn('rock', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.7, 1.1), 2.2);
        });
        for (let i = 0; i < 2; i++) {
          push(rng.range(5, 25), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn('flowers', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), 1, 2.5);
          });
        }
        // instant starter trees
        push(0.15, (c, gp) => {
          for (let i = 0; i < 3; i++) {
            const p = wx(); if (!p) continue;
            const kind = rng.chance(0.6) ? 'treeA' : 'treeB';
            this.pool.spawn(kind, gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.75, 1.15), 1.6);
          }
        });
        break;
      }

      case 'field': {
        // crops grow in rows, then fences, maybe barn, maybe windmill
        push(0.3, (c, gp) => {
          const rows = rng.int(3, 4);
          for (let rI = 0; rI < rows; rI++) {
            for (let k = 0; k < 3; k++) {
              const x = (rI / (rows - 1) - 0.5) * 0.9;
              const z = (k - 1) * 0.32 + rng.range(-0.05, 0.05);
              if (blockedByStrips(c, x, z)) continue;
              this.pool.spawn('crop', gp.x + x, TILE_H, gp.z + z, rng.range(0, 6.28), rng.range(0.8, 1.1), 0.35);
            }
          }
        });
        push(rng.range(6, 12), (c, gp) => {
          const p = scatterPoint(rng, c, 0.35, 0.66); if (!p) return;
          this.construction.build('barn', c.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
            rotY: rng.range(0, 6.28), scale: 0.9,
          });
        });
        if (rng.chance(0.45)) {
          push(rng.range(20, 42), (c) => {
            const p = scatterPoint(rng, c, 0.3, 0.6); if (!p) return;
            this.construction.build('windmill', c.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
              rotY: rng.range(0, 6.28),
            });
          });
        }
        for (let i = 0; i < 2; i++) {
          push(rng.range(4, 18), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn('flowers', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), 1, 2.5);
          });
        }
        break;
      }

      case 'village': {
        // houses appear over time; more if cluster large
        const houseSlots = rng.int(3, 4);
        let t = 0.8;
        for (let i = 0; i < houseSlots; i++) {
          push(t, (c) => {
            const p = scatterPoint(rng, c, 0.18, 0.62); if (!p) return;
            this.construction.build('house', c.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
              rotY: rng.range(0, 6.28), scale: rng.range(0.85, 1.05),
            });
            c.evo.townLevel++;
            events.emit('evolution:house', { cell: c });
          });
          t += rng.range(10, 22);
        }
        // NOTE: village→town upgrade is now MANUAL (BuildingSystem.upgradeVillage)
        // decorative grass + flowers
        for (let i = 0; i < 3; i++) {
          push(rng.range(2, 14), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn(rng.chance(0.5) ? 'flowers' : 'grass', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), 1, 2.2);
          });
        }
        break;
      }

      case 'mountain': {
        for (let i = 0; i < rng.int(3, 5); i++) {
          push(rng.range(0.5, 12), (c, gp) => {
            const p = scatterPoint(rng, c, 0.45, 0.8); if (!p) return;
            this.pool.spawn('rock', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.7, 1.3), 2.0);
          });
        }
        for (let i = 0; i < 2; i++) {
          push(rng.range(3, 20), (c, gp) => {
            const p = scatterPoint(rng, c, 0.5, 0.8); if (!p) return;
            this.pool.spawn('bush', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.6, 0.9), 1.8);
          });
        }
        break;
      }

      case 'river': {
        // reeds (grass), bushes and flowers along the banks
        for (let i = 0; i < 5; i++) {
          push(rng.range(0.5, 20), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn('grass', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.9, 1.4), 2.2);
          });
        }
        for (let i = 0; i < 2; i++) {
          push(rng.range(4, 24), (c, gp) => {
            const p = wx(); if (!p) return;
            this.pool.spawn(rng.chance(0.5) ? 'bush' : 'flowers', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), 1, 2.0);
          });
        }
        break;
      }
    }

    // universal ambient grass tufts on every tile
    for (let i = 0; i < 4; i++) {
      push(rng.range(0.3, 8), (c, gp) => {
        const p = wx(); if (!p) return;
        this.pool.spawn('grass', gp.x + p.x, TILE_H, gp.z + p.z, rng.range(0, 6.28), rng.range(0.8, 1.3), 3.0);
      });
    }

    plan.sort((a, b) => a.t - b.t);
    return plan;
  }

  /** advance a single cell's evolution clock */
  _advance(cell, dt, instant = false) {
    const evo = cell.evo;
    evo.elapsed += dt;
    while (evo.cursor < evo.plan.length && evo.plan[evo.cursor].t <= evo.elapsed) {
      const ev = evo.plan[evo.cursor++];
      if (cell.group) {
        const gp = cell.group.position;
        ev.fn(cell, gp, instant);
      }
    }
  }

  update(dt) {
    for (let i = this.tracked.length - 1; i >= 0; i--) {
      const cell = this.tracked[i];
      if (!cell.group) { this.tracked.splice(i, 1); continue; }
      this._advance(cell, dt);
      if (cell.evo.cursor >= cell.evo.plan.length) this.tracked.splice(i, 1);
    }
  }

  clear() {
    this.tracked.length = 0;
    this._bridged.clear();
  }
}
