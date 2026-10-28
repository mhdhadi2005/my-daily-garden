// ============================================================
// TileFactory — creates full cell records from tile defs,
// builds their 3D groups, plays placement pop animation,
// and manages the ghost/preview tile that follows the cursor.
// ============================================================
import * as THREE from 'three';
import { TILE_TYPES, rotateEdges, rotateConnectors } from './TileDefs.js';
import { buildTileMesh, hexFlatGeometry, TILE_H } from './TileMeshBuilder.js';
import { axialToWorld } from '../grid/Hex.js';
import { Rng, hashCell } from '../core/Rng.js';
import { MATS } from '../rendering/Materials.js';
import { tweens, Easing } from '../core/Tween.js';

export class TileFactory {
  constructor(scene) {
    this.scene = scene;
    this.tileRoot = new THREE.Group();
    this.tileRoot.name = 'tiles';
    scene.add(this.tileRoot);

    // --- ghost preview mesh (recreated when tile/rotation changes) ---
    this.ghost = null;
    this.ghostTint = new THREE.Mesh(hexFlatGeometry(), MATS.ghostValid);
    this.ghostTint.position.y = TILE_H + 0.05;
    this.ghostTint.visible = false;
    scene.add(this.ghostTint);
  }

  /**
   * Build a complete cell record (grid data) for type/variant/rotation.
   */
  makeCell(q, r, type, variant, rotation, seed) {
    const def = TILE_TYPES[type];
    const v = def.variants[variant] || def.variants[0];
    return {
      q, r,
      tileType: type,
      variant,
      rotation,
      seed: seed === undefined ? hashCell(q, r) : seed,
      edges: rotateEdges(v.edges, rotation),
      riverEdges: rotateConnectors(v.river, rotation) || [],
      roadEdges: rotateConnectors(v.road, rotation) || [],
      group: null,        // THREE.Group set on placement
      evo: null,          // evolution state, set by EvolutionSystem
    };
  }

  /**
   * Place a cell into the scene with pop-in bounce animation.
   * Returns the created THREE.Group.
   */
  placeCell(cell, { animate = true } = {}) {
    const rng = new Rng(cell.seed);
    const group = buildTileMesh(cell, rng);
    const { x, z } = axialToWorld(cell.q, cell.r);
    group.position.set(x, 0, z);
    cell.group = group;
    this.tileRoot.add(group);

    if (animate) {
      group.scale.setScalar(0.001);
      group.position.y = 0.5;
      tweens.add(0.45, (e) => {
        group.scale.setScalar(Math.max(e, 0.001));
        group.position.y = 0.5 * (1 - e);
      }, { easing: Easing.backOut });
    }
    return group;
  }

  /** Remove a cell's visuals from the scene and free GPU memory of unique geos. */
  removeCell(cell) {
    if (!cell.group) return;
    this.tileRoot.remove(cell.group);
    cell.group.traverse((o) => {
      // dispose only geometries not shared via caches (merged per-tile geometry)
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    cell.group = null;
  }

  /** Remove everything (restart). */
  clearAll() {
    const children = [...this.tileRoot.children];
    for (const g of children) {
      this.tileRoot.remove(g);
      g.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
    }
    this.hideGhost();
  }

  // ---------------- ghost preview ----------------

  /** Rebuild the semi-transparent ghost for the tile currently in hand. */
  setGhostTile(type, variant, rotation) {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
          if (o.material) o.material.dispose(); // ghosts use cloned materials
        }
      });
      this.ghost = null;
    }
    const cell = this.makeCell(0, 0, type, variant, rotation, 12345);
    const rng = new Rng(12345);
    const g = buildTileMesh(cell, rng);
    // make every mesh translucent
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
        o.material.depthWrite = false;
      }
    });
    g.visible = false;
    this.ghost = g;
    this.scene.add(g);
  }

  /** Move ghost to a hex cell; tint green/red by validity. */
  showGhost(q, r, valid) {
    const { x, z } = axialToWorld(q, r);
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(x, 0.06, z);
    }
    this.ghostTint.visible = true;
    this.ghostTint.position.set(x, TILE_H + 0.06, z);
    this.ghostTint.material = valid ? MATS.ghostValid : MATS.ghostInvalid;
  }

  hideGhost() {
    if (this.ghost) this.ghost.visible = false;
    this.ghostTint.visible = false;
  }
}
