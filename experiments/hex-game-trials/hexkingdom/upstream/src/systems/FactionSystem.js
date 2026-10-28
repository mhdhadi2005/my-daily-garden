// ============================================================
// FactionSystem — AI kingdoms that place real tiles and grow.
// Each faction starts at a home hex, expands by building
// adjacent tiles (forest, field, village…), runs evolution,
// and hostile ones may capture player border tiles.
// ============================================================
import { cellKey, neighbors, hexDistance } from '../grid/Hex.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';
import { TILE_TYPES } from '../tiles/TileDefs.js';
import {
  FACTION_ARCHETYPES, FACTION_TICK, CAPTURE_BASE_CHANCE, EARLY_CAPTURE_MIN_TILES, playerDefense,
} from '../config/EconomyConfig.js';

export class FactionSystem {
  constructor(grid, resources, territory) {
    this.grid = grid;
    this.resources = resources;
    this.territory = territory;
    this.factions = [];
    this._tickT = 0;
    this._tributeT = 0;
    this.populationProvider = null;
    this._world = null;
  }

  /** late-bind world builders (TileFactory, EvolutionSystem, …) */
  bindWorld(world) {
    this._world = world;
  }

  generate(worldSeed) {
    this.factions.length = 0;
    const rng = new Rng((worldSeed ^ 0x517cc1b7) >>> 0);
    let idCounter = 0;

    for (const [arch, def] of Object.entries(FACTION_ARCHETYPES)) {
      for (let i = 0; i < def.count; i++) {
        let q, r, tries = 0;
        do {
          const dist = rng.int(def.spawnDist[0], def.spawnDist[1]);
          const angle = rng.range(0, Math.PI * 2);
          q = Math.round(Math.cos(angle) * dist);
          r = Math.round(Math.sin(angle) * dist * 0.866 - q / 2);
          tries++;
        } while (tries < 30 && (this.grid.has(q, r) || hexDistance({ q, r }, { q: 0, r: 0 }) < 4));

        const f = {
          id: `${arch}_${idCounter++}`,
          archetype: arch,
          label: def.label,
          icon: def.icon,
          hostile: def.hostile,
          home: { q, r },
          territory: new Set(),
          strength: def.strength,
          aggression: def.aggression,
          expansion: def.expansion,
          rng: new Rng((worldSeed ^ (idCounter * 0x2545f491)) >>> 0),
        };
        this.factions.push(f);
      }
    }
    events.emit('factions:generated', { count: this.factions.length });
  }

  /** place starting tile for every faction (after bindWorld) */
  spawnHomes() {
    if (!this._world) return;
    for (const f of this.factions) {
      if (this._ownedTileCount(f) > 0) continue;
      const def = this._def(f);
      if (!this.grid.has(f.home.q, f.home.r)) {
        this._placeTile(f, f.home.q, f.home.r, def.startTile || 'village', true);
      }
    }
  }

  /** rebuild territory sets from grid owners (save restore) */
  syncFromGrid() {
    for (const f of this.factions) f.territory.clear();
    for (const cell of this.grid.cells.values()) {
      if (!cell.owner || cell.owner === 'player') continue;
      const f = this.factions.find((x) => x.id === cell.owner);
      if (f) f.territory.add(cellKey(cell.q, cell.r));
    }
    this.spawnHomes();
  }

  _def(f) { return FACTION_ARCHETYPES[f.archetype]; }

  _ownedTileCount(f) {
    let n = 0;
    for (const key of f.territory) {
      const [q, r] = key.split(',').map(Number);
      const c = this.grid.get(q, r);
      if (c && c.owner === f.id) n++;
    }
    return n;
  }

  _playerTileCount() {
    let n = 0;
    for (const cell of this.grid.cells.values()) {
      if (!cell.owner || cell.owner === 'player') n++;
    }
    return n;
  }

  _playerDefense() {
    const b = this.resources.buildings;
    return playerDefense({
      towers: b.tower, castles: b.castle,
      stability: this.resources.stability,
      population: this.populationProvider ? this.populationProvider() : 0,
    });
  }

  _placeTile(f, q, r, type, instant = false) {
    const world = this._world;
    if (!world || this.grid.has(q, r)) return null;
    const def = TILE_TYPES[type];
    if (!def) return null;

    const variant = f.rng.int(0, def.variants.length - 1);
    const rotation = f.rng.int(0, 5);
    const cell = world.tileFactory.makeCell(q, r, type, variant, rotation);
    cell.owner = f.id;

    world.connectorSystem.syncRiversOnPlacement(cell);
    this.grid.set(cell);
    world.tileFactory.placeCell(cell, { animate: !instant });
    world.evolution.register(cell);
    world.autoMesh.onTileChanged(q, r);
    world.deco.decorate(cell);

    f.territory.add(cellKey(q, r));
    events.emit('faction:tile-placed', { faction: f, cell });
    events.emit('tile:placed', { cell, score: null, ai: true });
    return cell;
  }

  _borderPlayerCells(f) {
    const out = [];
    const seen = new Set();
    for (const key of f.territory) {
      const [q, r] = key.split(',').map(Number);
      const src = this.grid.get(q, r);
      if (!src || src.owner !== f.id) continue;
      for (const n of neighbors(q, r)) {
        const k = cellKey(n.q, n.r);
        if (seen.has(k)) continue;
        seen.add(k);
        const cell = this.grid.get(n.q, n.r);
        if (cell && (!cell.owner || cell.owner === 'player')) out.push(cell);
      }
    }
    return out;
  }

  /** build one new tile on the frontier (replaces virtual expansion) */
  _tryExpand(f) {
    const def = this._def(f);
    if (this._ownedTileCount(f) >= def.maxTerritory) return;

    const options = [];
    for (const key of f.territory) {
      const [q, r] = key.split(',').map(Number);
      const src = this.grid.get(q, r);
      if (!src || src.owner !== f.id) continue;
      for (const n of neighbors(q, r)) {
        const k = cellKey(n.q, n.r);
        if (this.grid.has(n.q, n.r)) continue;
        if (this.factions.some((o) => o !== f && o.territory.has(k))) continue;
        options.push({ q: n.q, r: n.r, d: hexDistance(n, { q: 0, r: 0 }) });
      }
    }
    if (!options.length) return;

    if (f.hostile) options.sort((a, b) => a.d - b.d);
    const pickPool = f.hostile ? options.slice(0, Math.max(1, Math.ceil(options.length * 0.35))) : options;
    const pick = pickPool[f.rng.int(0, pickPool.length - 1)];
    const pool = def.tilePool || ['field', 'forest'];
    const type = pool[f.rng.int(0, pool.length - 1)];
    this._placeTile(f, pick.q, pick.r, type);
  }

  _tryCapture(f) {
    const targets = this._borderPlayerCells(f);
    if (!targets.length) return;
    const defense = this._playerDefense();
    const ratio = f.strength / Math.max(defense, 1);
    const chance = CAPTURE_BASE_CHANCE * f.aggression * Math.min(ratio, 2);
    if (!f.rng.chance(chance)) return;

    targets.sort((a, b) => (a.tileType === 'village' ? 1 : 0) - (b.tileType === 'village' ? 1 : 0));
    const target = targets[0];
    if (this.territory.capture(target, f.id, f.label)) {
      f.territory.add(cellKey(target.q, target.r));
      f.strength = Math.max(this._def(f).strength * 0.5, f.strength * 0.92);
      events.emit('faction:raided', { faction: f, cell: target });
    }
  }

  update(dt) {
    if (!this.factions.length) return;

    this._tickT += dt;
    if (this._tickT >= FACTION_TICK) {
      this._tickT = 0;
      const playerSize = this._playerTileCount();

      for (const f of this.factions) {
        const def = this._def(f);
        f.strength = Math.min(def.maxStrength, f.strength * (1 + def.strengthGrowth) + this._ownedTileCount(f) * 0.02);

        const drive = f.expansion * (f.hostile ? Math.min(1 + playerSize / 80, 1.4) : 1);
        if (f.rng.chance(Math.min(drive, 0.9))) this._tryExpand(f);

        if (f.hostile && f.aggression > 0 && playerSize >= EARLY_CAPTURE_MIN_TILES) this._tryCapture(f);
      }
      events.emit('factions:tick', { factions: this.summary() });
    }

    this._tributeT += dt;
    if (this._tributeT >= 60) {
      this._tributeT = 0;
      for (const f of this.factions.filter((x) => x.archetype === 'friendly_kingdom')) {
        const gold = Math.round(2 + f.strength * 0.05);
        this.resources.grant({ gold, influence: 1 }, `Tribute from ${f.label}`);
        events.emit('faction:tribute', { faction: f, gold });
      }
    }
  }

  summary() {
    return this.factions.map((f) => ({
      id: f.id, label: f.label, icon: f.icon, hostile: f.hostile,
      strength: Math.round(f.strength), territory: this._ownedTileCount(f),
    }));
  }

  serialize() {
    return this.factions.map((f) => ({
      id: f.id, archetype: f.archetype,
      home: f.home,
      territory: [...f.territory],
      strength: Math.round(f.strength * 100) / 100,
    }));
  }

  restore(data, worldSeed) {
    this.generate(worldSeed);
    if (!Array.isArray(data)) return;
    for (const rec of data) {
      const f = this.factions.find((x) => x.id === rec.id);
      if (!f) continue;
      f.home = rec.home || f.home;
      f.territory = new Set(rec.territory || []);
      f.strength = rec.strength ?? f.strength;
    }
  }

  reset() {
    this.factions.length = 0;
    this._tickT = 0;
    this._tributeT = 0;
  }
}
