// ============================================================
// ConstructionSystem — drives staged building construction.
// Each building goes: Foundation → Structure → Details →
// Decoration, with a rise+scale animation for every phase and
// dust-puff style scale pops. Also spins windmill blades.
// ============================================================
import * as THREE from 'three';
import { BUILDING_MAKERS } from './BuildingFactory.js';
import { tweens, Easing } from '../core/Tween.js';
import { events } from '../core/Events.js';

const PHASE_DELAY = [0, 1.4, 2.9, 4.4];    // seconds after start when each phase begins
const PHASE_DURATION = 0.8;                // reveal animation length

export class ConstructionSystem {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];    // active building records
    this.spinners = [];     // windmill blades etc.
  }

  /**
   * Queue a building for construction.
   * @param kind key of BUILDING_MAKERS
   * @param parent THREE.Group (usually a tile group)
   * @param position local THREE.Vector3
   * @param rng seeded Rng for variation
   * @param opts {rotY, scale, instant}
   * @returns building record
   */
  build(kind, parent, position, rng, opts = {}) {
    const maker = BUILDING_MAKERS[kind];
    if (!maker) return null;
    const { group, phases } = maker(rng);
    group.position.copy(position);
    group.rotation.y = opts.rotY || 0;
    if (opts.scale) group.scale.setScalar(opts.scale);
    parent.add(group);

    const rec = {
      kind,
      group,
      phases,
      phase: -1,       // last revealed phase index
      elapsed: 0,
      done: false,
    };

    // collect animated spinners (windmill blades)
    group.traverse((o) => {
      if (o.userData && o.userData.spin) this.spinners.push(o);
    });

    if (opts.instant) {
      for (let i = 0; i < 4; i++) phases[i].visible = true;
      rec.phase = 3;
      rec.done = true;
    } else {
      this.buildings.push(rec);
    }
    return rec;
  }

  /** Reveal phase i with rise/scale animation. */
  _revealPhase(rec, i) {
    const ph = rec.phases[i];
    ph.visible = true;
    ph.scale.set(1, 0.01, 1);
    const baseY = ph.position.y;
    ph.position.y = baseY - 0.05;
    tweens.add(PHASE_DURATION, (e) => {
      ph.scale.y = Math.max(e, 0.01);
      // gentle horizontal pop
      const xz = 1 + Math.sin(Math.min(e, 1) * Math.PI) * 0.06;
      ph.scale.x = xz;
      ph.scale.z = xz;
      ph.position.y = baseY - 0.05 * (1 - e);
    }, {
      easing: Easing.backOut,
      onComplete: () => {
        ph.scale.set(1, 1, 1);
        ph.position.y = baseY;
      },
    });
    rec.phase = i;
    events.emit('building:phase', { building: rec, phase: i });
  }

  update(dt) {
    // staged construction
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const rec = this.buildings[i];
      // guard: building's tile might have been removed on restart
      if (!rec.group.parent) {
        this.buildings.splice(i, 1);
        continue;
      }
      rec.elapsed += dt;
      const next = rec.phase + 1;
      if (next < 4 && rec.elapsed >= PHASE_DELAY[next]) {
        this._revealPhase(rec, next);
      }
      if (rec.phase >= 3) {
        rec.done = true;
        this.buildings.splice(i, 1);
        events.emit('building:complete', { building: rec });
      }
    }

    // spinning parts (windmill blades) — cull dead ones
    for (let i = this.spinners.length - 1; i >= 0; i--) {
      const s = this.spinners[i];
      if (!s.parent) { this.spinners.splice(i, 1); continue; }
      if (s.visible || (s.parent && s.parent.visible)) {
        s.rotation.z += dt * 0.9;
      }
    }
  }

  clear() {
    this.buildings.length = 0;
    this.spinners.length = 0;
  }
}
