// ============================================================
// CaravanSystem — visible trade wagons rolling along roads.
// For every trade route (villages connected by roads) a small
// caravan travels back and forth; each arrival pays a coin
// bonus. Makes the existing trade-route income tangible.
// ============================================================
import * as THREE from 'three';
import { axialToWorld } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { BUILDING_MAKERS } from '../buildings/BuildingFactory.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';

const MAX_WAGONS = 4;
const SPEED = 0.55;            // world units per second
const ARRIVAL_GOLD = 2;        // coins granted per completed leg

export class CaravanSystem {
  constructor(game) {
    this.game = game;
    this.wagons = [];          // {routeKey, group, points, t, dir, length}
    this._rng = new Rng(0xcaba7 ^ (game.worldSeed || 1));
    this._dirty = true;

    events.on('roads:changed', () => { this._dirty = true; });
    events.on('tile:placed', () => { this._dirty = true; });
    events.on('game:restart', () => this.clear());
  }

  clear() {
    for (const w of this.wagons) {
      if (w.group.parent) w.group.parent.remove(w.group);
    }
    this.wagons.length = 0;
    this._dirty = true;
  }

  /** rebuild wagons to match current trade routes */
  _sync() {
    this._dirty = false;
    const roads = this.game.roadSystem;
    const routes = roads.tradeRoutes.slice(0, MAX_WAGONS);
    const wanted = new Set(routes.map((r) => `${r.a}|${r.b}`));

    // remove wagons whose route vanished
    for (let i = this.wagons.length - 1; i >= 0; i--) {
      if (!wanted.has(this.wagons[i].routeKey)) {
        const w = this.wagons[i];
        if (w.group.parent) w.group.parent.remove(w.group);
        this.wagons.splice(i, 1);
      }
    }

    // spawn wagons for new routes
    for (const r of routes) {
      const key = `${r.a}|${r.b}`;
      if (this.wagons.some((w) => w.routeKey === key)) continue;
      const path = roads.pathBetween(r.a, r.b);
      if (!path || path.length < 2) continue;

      const points = path.map(({ q, r: rr }) => {
        const { x, z } = axialToWorld(q, rr);
        return new THREE.Vector3(x, TILE_H + 0.01, z);
      });
      const maker = BUILDING_MAKERS.caravanWagon;
      if (!maker) continue;
      const { group, phases } = maker(this._rng);
      for (const p of phases) p.visible = true;
      group.scale.setScalar(0.7);
      this.game.scene.add(group);

      let length = 0;
      for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);

      this.wagons.push({
        routeKey: key, group, points,
        t: this._rng.range(0, 1), dir: 1, length: Math.max(length, 0.001),
      });
    }
  }

  /** position along the waypoint chain at t ∈ [0,1] (+ facing angle) */
  _sample(w, t) {
    const total = w.length * t;
    let acc = 0;
    for (let i = 1; i < w.points.length; i++) {
      const seg = w.points[i].distanceTo(w.points[i - 1]);
      if (acc + seg >= total || i === w.points.length - 1) {
        const k = seg > 0 ? (total - acc) / seg : 0;
        const pos = new THREE.Vector3().lerpVectors(w.points[i - 1], w.points[i], Math.min(Math.max(k, 0), 1));
        const dirV = new THREE.Vector3().subVectors(w.points[i], w.points[i - 1]);
        return { pos, angle: Math.atan2(dirV.x, dirV.z) };
      }
      acc += seg;
    }
    return { pos: w.points[w.points.length - 1].clone(), angle: 0 };
  }

  update(dt) {
    if (this._dirty) this._sync();
    if (!this.wagons.length) return;

    for (const w of this.wagons) {
      w.t += (SPEED / w.length) * dt * w.dir;
      if (w.t >= 1 || w.t <= 0) {
        w.t = Math.min(Math.max(w.t, 0), 1);
        w.dir *= -1;
        // a leg completed — the caravan pays out
        this.game.resourceSystem.grant({ gold: ARRIVAL_GOLD }, 'Caravan arrived');
      }
      const { pos, angle } = this._sample(w, w.t);
      w.group.position.copy(pos);
      // caravan model front faces +Z; flip when driving back
      w.group.rotation.y = angle + (w.dir < 0 ? Math.PI : 0);
    }
  }
}
