// ============================================================
// Selection — selecting an already placed tile.
// Reuses the EXISTING pointer→cell raycast from Game (no new
// camera or input system): Game calls select() when the player
// clicks an occupied cell. Draws a pulsing hex outline on the
// selected tile and emits 'selection:changed' for the UI layer
// (radial menu, info panel).
// ============================================================
import * as THREE from 'three';
import { axialToWorld, HEX_SIZE } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { events } from '../core/Events.js';

/** hex outline ring geometry (shared) */
function hexRingGeometry() {
  const outer = HEX_SIZE * 1.0;
  const inner = HEX_SIZE * 0.88;
  const shape = new THREE.Shape();
  const hole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const ox = Math.cos(a) * outer, oy = Math.sin(a) * outer;
    const ix = Math.cos(a) * inner, iy = Math.sin(a) * inner;
    i === 0 ? shape.moveTo(ox, oy) : shape.lineTo(ox, oy);
    i === 0 ? hole.moveTo(ix, iy) : hole.lineTo(ix, iy);
  }
  shape.closePath();
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(Math.PI / 6); // align flat edges with pointy-top hex tiles
  geo.userData.shared = true;
  return geo;
}

export class Selection {
  constructor(game) {
    this.game = game;
    this.cell = null;
    this._pulseT = 0;

    this.outline = new THREE.Mesh(
      hexRingGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffd86a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.outline.position.y = TILE_H + 0.045;
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    game.scene.add(this.outline);
  }

  select(cell) {
    if (this.cell === cell) return;
    this.cell = cell;
    if (cell) {
      const { x, z } = axialToWorld(cell.q, cell.r);
      this.outline.position.x = x;
      this.outline.position.z = z;
      this.outline.visible = true;
      this._pulseT = 0;
    } else {
      this.outline.visible = false;
    }
    events.emit('selection:changed', { cell });
  }

  clear() {
    this.select(null);
  }

  /** cheap pulse animation — one mesh, no scene scans */
  update(dt) {
    if (!this.cell) return;
    // selected tile might have been removed (restart)
    if (!this.cell.group || !this.game.grid.has(this.cell.q, this.cell.r)) {
      this.clear();
      return;
    }
    this._pulseT += dt;
    const s = 1 + Math.sin(this._pulseT * 3.2) * 0.035;
    this.outline.scale.setScalar(s);
    this.outline.material.opacity = 0.72 + Math.sin(this._pulseT * 3.2) * 0.18;
  }
}
