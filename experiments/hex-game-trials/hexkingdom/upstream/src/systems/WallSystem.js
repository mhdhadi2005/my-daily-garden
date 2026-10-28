// ============================================================
// WallSystem — palisades on hostile territory borders only.
// Empty-map frontier uses the flat placement hints in Game.js;
// 3D walls appear when enemy-owned tiles are adjacent.
// ============================================================
import { cellKey, edgeMidpoint, edgeAngle, DIRS } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { makeWallPalisade } from '../buildings/BuildingFactory.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';

const OUTWARD_NUDGE = 0.05;

export class WallSystem {
  constructor(game) {
    this.game = game;
    /** @type Map<string, THREE.Object3D> */
    this.segments = new Map();

    events.on('tile:placed', () => this.rebuild());
    events.on('territory:changed', () => this.rebuild());
    events.on('territory:captured', () => this.rebuild());
    events.on('territory:reclaimed', () => this.rebuild());
    events.on('game:restart', () => this.clear());
  }

  clear() {
    for (const mesh of this.segments.values()) {
      if (mesh.parent) mesh.parent.remove(mesh);
    }
    this.segments.clear();
  }

  /** edge faces a placed tile owned by a hostile faction */
  _isHostileEdge(cell, edge) {
    const d = DIRS[edge];
    const nc = this.game.grid.get(cell.q + d.q, cell.r + d.r);
    return !!(nc && nc.owner && nc.owner !== 'player');
  }

  rebuild() {
    this.clear();
    const grid = this.game.grid;

    for (const cell of grid.cells.values()) {
      if ((cell.owner && cell.owner !== 'player') || !cell.group) continue;

      for (let e = 0; e < 6; e++) {
        if (!this._isHostileEdge(cell, e)) continue;
        const key = `${cellKey(cell.q, cell.r)},${e}`;
        const rng = new Rng((cell.seed ^ (e * 0x9e3779b9)) >>> 0);
        const mesh = makeWallPalisade(rng);
        const mp = edgeMidpoint(e);
        const a = edgeAngle(e);
        // tangent to the hex edge (not radial), nudged toward the hostile side
        mesh.position.set(
          mp.x + Math.cos(a) * OUTWARD_NUDGE,
          TILE_H + 0.02,
          mp.z - Math.sin(a) * OUTWARD_NUDGE,
        );
        mesh.rotation.y = a + Math.PI / 2;
        mesh.renderOrder = 2;
        cell.group.add(mesh);
        this.segments.set(key, mesh);
      }
    }
  }

  reset() {
    this.clear();
  }
}
