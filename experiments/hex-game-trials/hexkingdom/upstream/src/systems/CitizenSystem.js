// ============================================================
// CitizenSystem — lightweight population simulation.
// Villages accumulate population as houses complete; citizens
// are instanced low-poly NPCs that walk ONLY along the road
// graph (graph edge traversal, no pathfinding AI) and idle-
// wander around their home tile when no road is reachable.
// Citizens raise village gold production via ResourceSystem.
// ============================================================
import * as THREE from 'three';
import { part, merge } from '../assets/GeometryUtils.js';
import { PALETTE } from '../rendering/Materials.js';
import { axialToWorld, cellKey } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';

const MAX_CITIZENS = 120;
const WALK_SPEED = 0.45;      // world units / sec
const GROWTH_INTERVAL = 12;   // seconds between growth checks
const POP_PER_HOUSE = 1;
const MAX_POP_PER_VILLAGE = 8;

/** low-poly villager: body cone + head sphere (hi), single cone (lo) */
function buildCitizenAsset() {
  const hi = merge([
    part(new THREE.ConeGeometry(0.055, 0.14, 5), PALETTE.roofBlue, { t: [0, 0.07, 0] }),
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.wallPlaster, { t: [0, 0.165, 0] }),
    part(new THREE.ConeGeometry(0.045, 0.045, 5), PALETTE.roofRed, { t: [0, 0.2, 0] }),
  ]);
  const lo = merge([
    part(new THREE.ConeGeometry(0.055, 0.18, 4), PALETTE.roofBlue, { t: [0, 0.09, 0] }),
  ]);
  return { hi, lo, windy: false };
}

export class CitizenSystem {
  /**
   * @param grid GridManager
   * @param roads RoadSystem
   * @param pool InstancePool
   */
  constructor(grid, roads, pool) {
    this.grid = grid;
    this.roads = roads;
    this.pool = pool;
    this.pool.registerAsset('citizen', buildCitizenAsset(), MAX_CITIZENS);

    this.villages = new Map(); // key -> {cell, population, houses}
    this.citizens = [];        // active agents
    this._growthT = 0;
    this.totalPopulation = 0;
    this.growthMultiplier = 1.0; // ThreatSystem can slow growth

    events.on('evolution:house', ({ cell }) => this._onHouse(cell));
    events.on('tile:placed', ({ cell }) => {
      if (cell.tileType === 'village') this._ensureVillage(cell);
    });
  }

  _ensureVillage(cell) {
    const key = cellKey(cell.q, cell.r);
    if (!this.villages.has(key)) {
      this.villages.set(key, { cell, population: 0, houses: 0 });
    }
    return this.villages.get(key);
  }

  _onHouse(cell) {
    const v = this._ensureVillage(cell);
    v.houses++;
    this._grow(v, POP_PER_HOUSE);
  }

  _grow(v, amount) {
    const before = v.population;
    v.population = Math.min(MAX_POP_PER_VILLAGE, v.population + amount);
    const added = v.population - before;
    if (added <= 0) return;
    for (let i = 0; i < added; i++) this._spawnCitizen(v);
    this._recount();
  }

  _spawnCitizen(v) {
    if (this.citizens.length >= MAX_CITIZENS) return;
    const { x, z } = axialToWorld(v.cell.q, v.cell.r);
    const rng = new Rng((v.cell.seed ^ (this.citizens.length * 0x1f7b3d)) >>> 0);
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.1, 0.45);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const idx = this.pool.spawn('citizen', px, TILE_H, pz, rng.range(0, 6.28), rng.range(0.85, 1.1), 3.0);
    if (idx < 0) return;
    this.citizens.push({
      idx,
      home: cellKey(v.cell.q, v.cell.r),
      x: px, z: pz,
      rotY: 0,
      state: 'idle',       // idle | walk
      path: null,          // array of world waypoints
      pathI: 0,
      waitT: rng.range(0.5, 3),
      rng,
      alive: true,
    });
  }

  _recount() {
    let total = 0;
    for (const v of this.villages.values()) total += v.population;
    this.totalPopulation = total;
    events.emit('population:changed', { total, villages: this.villages.size });
  }

  /** population of a specific village cell — used by ResourceSystem */
  populationOf(cell) {
    const v = this.villages.get(cellKey(cell.q, cell.r));
    return v ? v.population : 0;
  }

  /** pick a road path for a citizen: home → random reachable node → back */
  _planPath(c) {
    const targets = this.roads.villagesReachableFrom(c.home);
    let destKey = null;
    if (targets.length) {
      destKey = targets[c.rng.int(0, targets.length - 1)];
    } else {
      // walk to any linked road node instead
      const node = this.roads.nodes.get(c.home);
      if (node && node.links.size) {
        const links = [...node.links].sort();
        destKey = links[c.rng.int(0, links.length - 1)];
      }
    }
    if (!destKey) return null;
    const cellPath = this.roads.pathBetween(c.home, destKey);
    if (!cellPath || cellPath.length < 2) return null;
    // there and back again
    const roundTrip = [...cellPath, ...cellPath.slice(0, -1).reverse()];
    return roundTrip.map((p) => {
      const w = axialToWorld(p.q, p.r);
      return { x: w.x, z: w.z };
    });
  }

  update(dt) {
    // -------- movement --------
    for (const c of this.citizens) {
      if (!c.alive) continue;
      if (c.state === 'idle') {
        c.waitT -= dt;
        // gentle idle wander around current spot
        const wob = Math.sin(performance.now() * 0.001 + c.idx) * 0.002;
        c.x += wob;
        this.pool.setTransform('citizen', c.idx, c.x, TILE_H, c.z, c.rotY);
        if (c.waitT <= 0) {
          const path = this._planPath(c);
          if (path) {
            c.path = path;
            c.pathI = 1;
            c.state = 'walk';
          } else {
            // no road network: short wander step on home tile
            const home = axialToWorld(
              parseInt(c.home.split(',')[0], 10),
              parseInt(c.home.split(',')[1], 10)
            );
            const a = c.rng.range(0, Math.PI * 2);
            const d = c.rng.range(0.1, 0.5);
            c.path = [{ x: home.x + Math.cos(a) * d, z: home.z + Math.sin(a) * d }];
            c.pathI = 0;
            c.state = 'walk';
          }
        }
      } else if (c.state === 'walk') {
        const target = c.path[c.pathI];
        const dx = target.x - c.x;
        const dz = target.z - c.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.04) {
          c.pathI++;
          if (c.pathI >= c.path.length) {
            c.state = 'idle';
            c.path = null;
            c.waitT = c.rng.range(2, 8);
          }
        } else {
          const step = Math.min(WALK_SPEED * dt, dist);
          c.x += (dx / dist) * step;
          c.z += (dz / dist) * step;
          c.rotY = Math.atan2(dx, dz);
          // tiny walk bob
          const bob = Math.abs(Math.sin(performance.now() * 0.008 + c.idx)) * 0.015;
          this.pool.setTransform('citizen', c.idx, c.x, TILE_H + bob, c.z, c.rotY);
        }
      }
    }

    // -------- growth --------
    this._growthT += dt;
    if (this._growthT >= GROWTH_INTERVAL) {
      this._growthT = 0;
      for (const v of this.villages.values()) {
        if (v.population >= MAX_POP_PER_VILLAGE) continue;
        if (v.houses === 0) continue;
        const roadBonus = this.roads.growthBonusFor(v.cell);
        const p = 0.35 * roadBonus * this.growthMultiplier;
        const rng = new Rng((v.cell.seed ^ Math.floor(v.population * 977)) >>> 0);
        if (rng.next() < p) this._grow(v, 1);
      }
    }
  }

  /** world event / hook: distribute migrants across villages with room */
  grantPopulation(amount) {
    const list = [...this.villages.values()];
    if (!list.length) return 0;
    list.sort((a, b) => b.population - a.population);
    let left = amount;
    let added = 0;
    for (const v of list) {
      if (left <= 0) break;
      const before = v.population;
      this._grow(v, left);
      const gained = v.population - before;
      left -= gained;
      added += gained;
    }
    return added;
  }

  /** plague / decline / famine — returns how many citizens were lost */
  reducePopulation(amount) {
    let left = amount;
    let removed = 0;
    const villages = [...this.villages.values()].sort((a, b) => b.population - a.population);
    for (const v of villages) {
      while (left > 0 && v.population > 0) {
        v.population--;
        left--;
        removed++;
        const i = this.citizens.findIndex((c) => c.alive && c.home === cellKey(v.cell.q, v.cell.r));
        if (i >= 0) {
          this.pool.release('citizen', this.citizens[i].idx);
          this.citizens[i].alive = false;
          this.citizens.splice(i, 1);
        }
      }
      if (left <= 0) break;
    }
    if (removed) this._recount();
    return removed;
  }

  serialize() {
    const out = [];
    for (const [key, v] of this.villages) {
      out.push({ key, population: v.population, houses: v.houses });
    }
    return out;
  }

  restore(data) {
    if (!Array.isArray(data)) return;
    for (const rec of data) {
      const [q, r] = rec.key.split(',').map(Number);
      const cell = this.grid.get(q, r);
      if (!cell) continue;
      const v = this._ensureVillage(cell);
      v.houses = rec.houses || 0;
      this._grow(v, rec.population || 0);
    }
    this._recount();
  }

  clear() {
    for (const c of this.citizens) {
      if (c.alive) this.pool.release('citizen', c.idx);
    }
    this.citizens.length = 0;
    this.villages.clear();
    this.totalPopulation = 0;
    this._growthT = 0;
    this.growthMultiplier = 1.0;
    events.emit('population:changed', { total: 0, villages: 0 });
  }
}
