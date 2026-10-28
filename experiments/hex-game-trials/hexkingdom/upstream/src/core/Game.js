// ============================================================
// Game — top-level orchestrator. Owns renderer, scene, lights,
// day/night cycle, all systems, input → placement flow, and
// the save/restore lifecycle.
// ============================================================
import * as THREE from 'three';
import { GridManager } from '../grid/GridManager.js';
import { worldToAxial, axialToWorld, cellKey } from '../grid/Hex.js';
import { randomTile, TILE_TYPES } from '../tiles/TileDefs.js';
import { TileFactory } from '../tiles/TileFactory.js';
import { hexFlatGeometry, TILE_H } from '../tiles/TileMeshBuilder.js';
import { buildNatureAssets } from '../assets/NatureAssets.js';
import { InstancePool } from '../rendering/InstancePool.js';
import { MATS, updateMaterialsClock } from '../rendering/Materials.js';
import { ConstructionSystem } from '../buildings/ConstructionSystem.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { ScoringSystem } from '../systems/ScoringSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { DecorationSystem } from '../systems/DecorationSystem.js';
import { CameraController } from '../camera/CameraController.js';
import { UI } from '../ui/UI.js';
import { Rng } from './Rng.js';
import { tweens } from './Tween.js';
import { events } from './Events.js';
import { RoadSystem } from '../systems/RoadSystem.js';
import { ConnectorSystem } from '../systems/ConnectorSystem.js';
import { ResourceSystem } from '../systems/ResourceSystem.js';
import { CitizenSystem } from '../systems/CitizenSystem.js';
import { TerritorySystem } from '../systems/TerritorySystem.js';
import { FactionSystem } from '../systems/FactionSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { AutoMeshSystem } from '../automesh/AutoMeshSystem.js';
import { registerStandardTypes } from '../automesh/AutoMeshAdapters.js';
import { buildOverlay, disposeOverlay } from '../automesh/MeshVariants.js';
import { scaledTileCost, tileUnlockTierName } from '../config/EconomyConfig.js';
import { fmtCost } from '../config/BuildingConfig.js';
import { setSkipConnectorMeshes } from '../tiles/TileMeshBuilder.js';
import { WorldEventsSystem } from '../systems/WorldEventsSystem.js';
import { WallSystem } from '../systems/WallSystem.js';
import { ConstructionPanel } from '../ui/ConstructionPanel.js';
import { ResourcePanel } from '../ui/ResourcePanel.js';
import { ResearchPanel } from '../ui/ResearchPanel.js';
import { FactionPanel } from '../ui/FactionPanel.js';
import { Selection } from '../ui/Selection.js';
import { RadialMenu } from '../ui/RadialMenu.js';
import { BuildingSystem } from '../systems/BuildingSystem.js';
import { ResearchSystem } from '../systems/ResearchSystem.js';
import { ArmySystem } from '../systems/ArmySystem.js';
import { CaravanSystem } from '../systems/CaravanSystem.js';
import { DebugHUD } from '../debug/DebugHUD.js';
import { DebugOverlays } from '../debug/DebugOverlays.js';
import { playerDefense } from '../config/EconomyConfig.js';
import { iconLabel } from '../ui/GameIcons.js';

const DAY_LENGTH = 150; // seconds for a full day/night cycle
const AUTOSAVE_INTERVAL = 6; // seconds

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.grid = new GridManager();
    this.tilesPlaced = 0;
    this.drawCount = 0;
    this.worldSeed = (Math.random() * 0xffffffff) >>> 0;
    this.nextTile = null;   // {type, variant}
    this.rotation = 0;
    this.hoverCell = null;  // {q, r} under cursor
    this._autosaveT = 0;
    this._dayT = DAY_LENGTH * 0.22; // start mid-morning
    this.elapsed = 0;

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initInput();
    this._restoreOrStart();
  }

  // ---------------- renderer / scene ----------------

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 200);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc4dd);
    this.scene.fog = new THREE.Fog(0x9fc4dd, 26, 70);

    // sun (animated across day/night)
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    this.sun.position.set(10, 18, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xbfd4e8, 0.9);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xcfe4f5, 0x8a7a5a, 0.55);
    this.scene.add(this.hemi);

    // huge soft ground disc far below tiles (ocean-ish backdrop)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 48),
      new THREE.MeshLambertMaterial({ color: 0x74a8c4 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    this.scene.add(ground);

    // frontier highlight meshes (placement hints)
    this.frontierGroup = new THREE.Group();
    this.scene.add(this.frontierGroup);
    this._frontierMeshes = [];
  }

  _initSystems() {
    this.controls = new CameraController(this.camera, this.canvas);
    this.tileFactory = new TileFactory(this.scene);
    const natureAssets = buildNatureAssets();
    this.pool = new InstancePool(this.scene, natureAssets);
    this.construction = new ConstructionSystem(this.scene);
    this.evolution = new EvolutionSystem(this.grid, this.pool, this.construction);
    this.scoring = new ScoringSystem(this.grid);
    this.saveSystem = new SaveSystem();
    this.deco = new DecorationSystem(this.pool);
    this.ui = new UI(this);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_H);
    this._pointerNdc = new THREE.Vector2();

    this.roadSystem = new RoadSystem(this.grid);
    this.connectorSystem = new ConnectorSystem(this.grid);
    this.autoMesh = new AutoMeshSystem(this.grid);
    registerStandardTypes(this.autoMesh, { buildOverlay, disposeOverlay });
    setSkipConnectorMeshes(true);
    this.resourceSystem = new ResourceSystem(this.grid, this.roadSystem);
    this.citizenSystem = new CitizenSystem(this.grid, this.roadSystem, this.pool);
    this.progressionSystem = new ProgressionSystem(this.resourceSystem, this.grid);
    this.territorySystem = new TerritorySystem(this.grid, this.resourceSystem);
    this.factionSystem = new FactionSystem(this.grid, this.resourceSystem, this.territorySystem);
    this.factionSystem.populationProvider = () => this.citizenSystem.totalPopulation;
    this.resourceSystem.populationProvider = (cell) => this.citizenSystem.populationOf(cell);

    // ---- gameplay layer (buildings, research, selection) ----
    this.researchSystem = new ResearchSystem(this.resourceSystem);
    this.buildingSystem = new BuildingSystem(this);
    this.armySystem = new ArmySystem(this);
    this.caravanSystem = new CaravanSystem(this);
    this.worldEvents = new WorldEventsSystem(this);
    this.wallSystem = new WallSystem(this);
    this._wireStorageCap();
    this._wireFactionDefense();
    this._wireEconomyBonuses();

    this.selection = new Selection(this);
    this.radialMenu = new RadialMenu(this);

    // ---- read-only exposure layers (HUD + debug visualization) ----
    this.resourcePanel = new ResourcePanel(this);
    this.researchPanel = new ResearchPanel(this);
    this.constructionPanel = new ConstructionPanel(this);
    this.factionPanel = new FactionPanel(this);
    this.debugOverlays = new DebugOverlays(this);
    this.debugHUD = new DebugHUD(this);

    events.on('evolution:castle', () => {
      this.scoring.addBonus(150, 'Castle!');
      this.ui.toast(`${iconLabel('castle')} A castle rises over your kingdom! +150`);
    });
    events.on('evolution:town', () => {
      this.scoring.addBonus(60, 'Town!');
      this.ui.toast(`${iconLabel('town')} A village grew into a town! +60`);
    });
    events.on('evolution:bridge', () => {
      this.scoring.addBonus(40, 'Bridge');
      this.ui.toast(`${iconLabel('bridge')} A bridge spans the river! +40`);
    });
    events.on('build:completed', ({ name, icon }) => {
      this.ui.toast(`${iconLabel(icon)} ${name} complete!`);
    });
    events.on('build:denied', ({ reason }) => this.ui.toast(reason));
    events.on('progression:completed', () => this._refreshTilePanelMeta());
    events.on('army:battle', ({ won, faction }) => {
      this.ui.toast(won
        ? `${iconLabel('sword')} Victory! The tile is yours${faction ? ` (${faction} routed)` : ''}`
        : `${iconLabel('sword')} Defeat… the assault${faction ? ` on ${faction}` : ''} failed`);
      if (won) this.scoring.addBonus(25, 'Conquest');
    });
  }

  /** storage cap = tier base + Storage building bonuses */
  _wireStorageCap() {
    this.resourceSystem.storageCapProvider = () => {
      const base = this.progressionSystem.current.storageCap;
      return base + (this.buildingSystem?.capBonus || 0);
    };
  }

  /** research military bonus feeds into existing defense calc */
  _wireFactionDefense() {
    const popFn = () => this.citizenSystem.totalPopulation;
    this.factionSystem._playerDefense = () => {
      const b = this.resourceSystem.buildings;
      return playerDefense({
        towers: b.tower,
        castles: b.castle,
        stability: this.resourceSystem.stability,
        population: popFn(),
        army: this.armySystem?.strength || 0,
      }) + (this.researchSystem?.defenseBonus || 0);
    };
  }

  /** research / tier / building bonuses feed into the economy tick */
  _wireEconomyBonuses() {
    const rs = this.resourceSystem;
    rs.researchMultProvider = (res) => this.researchSystem.resourceMult(res);
    rs.tierProdMultProvider = () => this.progressionSystem.current.prodMult || 1;
    rs.stabilityRegenProvider = () => this.buildingSystem.stabilityRegen();
    rs.totalPopulationProvider = () => this.citizenSystem.totalPopulation;
    // production multipliers change when research or the tier completes
    events.on('research:completed', () => { rs._ratesDirty = true; });
    events.on('progression:completed', () => { rs._ratesDirty = true; });
  }

  /** wire faction AI to world builders */
  _bindFactionWorld() {
    this.factionSystem.bindWorld({
      tileFactory: this.tileFactory,
      evolution: this.evolution,
      deco: this.deco,
      autoMesh: this.autoMesh,
      connectorSystem: this.connectorSystem,
    });
  }

  // ---------------- input ----------------

  _initInput() {
    this.canvas.addEventListener('pointermove', (e) => {
      this._pointerNdc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this._updateHover();
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      if (this.controls.moved) return; // was a drag, not a click
      this._tryPlaceAtPointer();
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // RMB is also the rotate-camera drag: only rotate the tile in hand
      // when the right button was a clean click (no drag).
      if (!this.controls.rmbMoved) this.rotateHand();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') this.rotateHand();
      if (e.key === 'v' || e.key === 'V') this.rollHandVariant();
      if (e.key === 'Escape') this.selection.clear();
    });
  }

  _pointerToCell() {
    this.raycaster.setFromCamera(this._pointerNdc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return worldToAxial(hit.x, hit.z);
  }

  _updateHover() {
    const cell = this._pointerToCell();
    if (!cell) { this.tileFactory.hideGhost(); this.hoverCell = null; return; }
    this.hoverCell = cell;
    const canPlace = this.grid.canPlace(cell.q, cell.r);
    const atCap = !this.progressionSystem.underTileCap(this.tilesPlaced);
    const affordable = this.nextTile
      ? this.resourceSystem.canAfford(scaledTileCost(this.nextTile.type, this.tilesPlaced))
      : true;
    const valid = canPlace && !atCap && affordable;
    if (this.grid.has(cell.q, cell.r)) {
      this.tileFactory.hideGhost();
    } else {
      this.tileFactory.showGhost(cell.q, cell.r, valid);
    }
  }

  _tryPlaceAtPointer() {
    const cell = this._pointerToCell();
    if (!cell) return;

    if (this.grid.has(cell.q, cell.r)) {
      const existing = this.grid.get(cell.q, cell.r);
      if (this.selection.cell === existing) this.selection.clear();
      else this.selection.select(existing);
      return;
    }

    if (!this.grid.canPlace(cell.q, cell.r)) {
      this.ui.toast('Place next to an existing tile');
      return;
    }
    this.selection.clear();
    this.placeTile(cell.q, cell.r);
  }

  // ---------------- tile hand / placement ----------------

  _drawRng() {
    // deterministic draw stream so save/restore reproduces future draws
    return new Rng((this.worldSeed ^ (this.drawCount * 0x85ebca6b)) >>> 0);
  }

  _drawUnlockedTile(rng) {
    const prog = this.progressionSystem;
    for (let i = 0; i < 40; i++) {
      const tile = randomTile(rng);
      if (prog.isUnlocked(tile.type)) return tile;
    }
    const pool = prog.current.unlocks.filter((t) => TILE_TYPES[t]);
    const type = pool[rng.int(0, pool.length - 1)] || 'forest';
    const def = TILE_TYPES[type];
    return { type, variant: rng.int(0, def.variants.length - 1) };
  }

  _setHand(type, variant) {
    this.nextTile = { type, variant };
    this.rotation = 0;
    this.tileFactory.setGhostTile(type, variant, 0);
    this.ui.drawPreview(type, variant, 0);
    this._refreshTilePanelMeta();
    this.ui.refreshTileShop();
    this._updateHover();
  }

  /** Player picks a tile type from the shop (rolls a new variant). */
  selectTileType(type) {
    if (!TILE_TYPES[type]) return;
    const prog = this.progressionSystem;
    if (!prog.isUnlocked(type)) {
      const name = TILE_TYPES[type]?.name || type;
      this.ui.toast(`${name} unlocks at ${tileUnlockTierName(type)}`);
      return;
    }
    if (!prog.underTileCap(this.tilesPlaced)) {
      this.ui.toast(`Tile cap reached — upgrade your kingdom!`);
      return;
    }
    const rng = this._drawRng();
    this.drawCount++;
    const def = TILE_TYPES[type];
    const variant = rng.int(0, def.variants.length - 1);
    this._setHand(type, variant);
  }

  /** Re-roll variant for the currently selected tile type after placement. */
  rollHandVariant() {
    if (!this.nextTile) return;
    const { type } = this.nextTile;
    const rng = this._drawRng();
    this.drawCount++;
    const def = TILE_TYPES[type];
    const variant = rng.int(0, def.variants.length - 1);
    this._setHand(type, variant);
  }

  drawNextTile() {
    const rng = this._drawRng();
    this.drawCount++;
    const tile = this._drawUnlockedTile(rng);
    this._setHand(tile.type, tile.variant);
  }

  _refreshTilePanelMeta() {
    if (!this.nextTile) return;
    const cost = scaledTileCost(this.nextTile.type, this.tilesPlaced);
    this.ui.setTileCost(cost);
    const prog = this.progressionSystem;
    this.ui.setTileCap(this.tilesPlaced, prog.current.maxTiles);
  }

  rotateHand() {
    if (!this.nextTile) return;
    this.rotation = (this.rotation + 1) % 6;
    this.tileFactory.setGhostTile(this.nextTile.type, this.nextTile.variant, this.rotation);
    this.ui.drawPreviewRotation(this.nextTile.type, this.nextTile.variant, this.rotation);
    this._updateHover();
  }

  placeTile(q, r) {
    const { type, variant } = this.nextTile;
    const prog = this.progressionSystem;

    if (!prog.underTileCap(this.tilesPlaced)) {
      this.ui.toast(`Tile cap reached (${prog.current.maxTiles}) — upgrade your kingdom!`);
      return;
    }
    if (!prog.isUnlocked(type)) {
      const name = TILE_TYPES[type]?.name || type;
      this.ui.toast(`${name} unlocks at a higher kingdom tier`);
      return;
    }

    const cost = scaledTileCost(type, this.tilesPlaced);
    if (!this.resourceSystem.canAfford(cost)) {
      this.ui.toast(`Not enough resources! Need ${fmtCost(cost)}`);
      return;
    }
    this.resourceSystem.spend(cost, `Place ${type}`);

    const cell = this.tileFactory.makeCell(q, r, type, variant, this.rotation);

    // auto-extend rivers to/from neighbors before mesh refresh
    this.connectorSystem.syncRiversOnPlacement(cell);

    // score BEFORE insertion (evaluate against neighbors)
    const evalResult = this.grid.evaluateEdges(q, r, cell.edges);
    this.grid.set(cell);
    this.tileFactory.placeCell(cell);
    this.evolution.register(cell);
    this.evolution.onTilePlaced(cell);
    this.autoMesh.onTileChanged(q, r);

    const result = this.scoring.scorePlacement(cell, evalResult);
    if (result.perfect) this.ui.toast('Perfect alignment! x3');
    else if (result.chain >= 3) this.ui.toast(`Chain x${result.chain}!`);

    this.tilesPlaced++;
    this.ui.setTilesPlaced(this.tilesPlaced);
    this.tileFactory.hideGhost();
    this._refreshFrontier();
    this.rollHandVariant();
    this._updateHover();
    events.emit('tile:placed', { cell, score: result });
    this.deco.decorate(cell);

    this.saveSystem.save(this);
  }

  _refreshFrontier() {
    // reuse pool of flat hex meshes for frontier hints
    const frontier = this.grid.frontierCells();
    while (this._frontierMeshes.length < frontier.length) {
      const m = new THREE.Mesh(hexFlatGeometry(), MATS.frontier);
      m.renderOrder = -1;
      this.frontierGroup.add(m);
      this._frontierMeshes.push(m);
    }
    for (let i = 0; i < this._frontierMeshes.length; i++) {
      const m = this._frontierMeshes[i];
      if (i < frontier.length) {
        const { x, z } = axialToWorld(frontier[i].q, frontier[i].r);
        m.position.set(x, 0.015, z);
        m.visible = true;
      } else {
        m.visible = false;
      }
    }
  }

  // ---------------- save / restore / restart ----------------

  _restoreOrStart() {
    const data = this.saveSystem.load();
    if (data && data.cells.length) {
      this.worldSeed = data.worldSeed >>> 0;
      this.drawCount = data.drawCount || 0;
      this.tilesPlaced = data.tilesPlaced || 0;
      this.scoring.total = data.score || 0;

      // rebuild cells sorted by distance from origin for a nice cascade
      const cells = [...data.cells].sort((a, b) => (Math.abs(a.q) + Math.abs(a.r)) - (Math.abs(b.q) + Math.abs(b.r)));
      let delay = 0;
      for (const c of cells) {
        const cell = this.tileFactory.makeCell(c.q, c.r, c.t, c.v, c.rot, c.seed);
        if (c.river?.length) cell.riverEdges = [...c.river];
        if (c.road?.length) cell.roadEdges = [...c.road];
        if (c.owner) cell.owner = c.owner;
        this.grid.set(cell);
        this.tileFactory.placeCell(cell, { animate: false });
        // pop-in cascade
        const g = cell.group;
        g.scale.setScalar(0.001);
        tweens.add(0.4, (e) => g.scale.setScalar(Math.max(e, 0.001)), { delay: delay });
        delay += 0.03;
        this.evolution.register(cell, c.age || 0);
        this.deco.decorate(cell);
      }

      this.roadSystem.rebuild();
      this.connectorSystem.syncAllRivers();
      this.autoMesh.refreshAll();
      this.resourceSystem.restore(data.resources);
      this.citizenSystem.restore(data.citizens);
      this.progressionSystem.restore(data.progression);
      this.territorySystem.restore(data.territory);
      this.factionSystem.restore(data.factions, this.worldSeed);
      this._bindFactionWorld();
      this.factionSystem.syncFromGrid();
      this.researchSystem.restore(data.research);
      this.buildingSystem.restore(data.buildings);
      this.armySystem.restore(data.army);
      this.wallSystem.rebuild();

      events.emit('score:changed', { total: this.scoring.total, delta: 0, multiplier: 1 });
      this.ui.setTilesPlaced(this.tilesPlaced);

      // restore hand
      if (data.next && TILE_TYPES[data.next.type]) {
        this._setHand(data.next.type, data.next.variant);
      } else {
        this.selectTileType('forest');
      }
      this._refreshFrontier();
      this.ui.toast(`${iconLabel('kingdom')} Kingdom restored`);
    } else {
      this._newGame();
    }
  }

  _newGame() {
    // starter village tile at origin
    const cell = this.tileFactory.makeCell(0, 0, 'village', 1, 0);
    this.grid.set(cell);
    this.tileFactory.placeCell(cell);
    this.evolution.register(cell);
    this.deco.decorate(cell);
    this.tilesPlaced = 1;
    this.ui.setTilesPlaced(1);
    this.roadSystem.rebuild();
    this.autoMesh.onTileChanged(0, 0);
    this.factionSystem.generate(this.worldSeed);
    this._bindFactionWorld();
    this.factionSystem.spawnHomes();
    this.wallSystem.rebuild();
    this._refreshFrontier();
    this.selectTileType('forest');
    this.saveSystem.save(this);
  }

  restart() {
    events.emit('game:restart', {});
    this.saveSystem.clear();
    // clear world
    this.tileFactory.clearAll();
    this.grid.clear();
    this.pool.clear();
    this.deco.clear();
    this.construction.clear();
    this.evolution.clear();
    tweens.clear();
    this.scoring.reset();
    this.roadSystem.clear();
    this.autoMesh.clear();
    this.resourceSystem.reset();
    this.citizenSystem.clear();
    this.progressionSystem.reset();
    this.territorySystem.reset();
    this.factionSystem.reset();
    this.buildingSystem.reset();
    this.researchSystem.reset();
    this.armySystem.reset();
    this.caravanSystem.clear();
    this.worldEvents.reset();
    this.wallSystem.reset();
    this.selection.clear();
    this.debugOverlays.clear();
    this.tilesPlaced = 0;
    this.drawCount = 0;
    this.worldSeed = (Math.random() * 0xffffffff) >>> 0;
    this.controls.focusOn(0, 0);
    this._newGame();
    this.ui.toast(`${iconLabel('kingdom')} A new kingdom begins`);
  }

  // ---------------- day / night ----------------

  _updateDayNight(dt) {
    this._dayT = (this._dayT + dt) % DAY_LENGTH;
    const t = this._dayT / DAY_LENGTH; // 0..1
    const sunAngle = t * Math.PI * 2 - Math.PI / 2; // -90° at t=0 (dawn)
    const elev = Math.sin(sunAngle);                // -1..1
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25); // 0 night → 1 day

    // sun orbit around camera focus
    const focus = this.controls.target;
    const R = 24;
    this.sun.position.set(
      focus.x + Math.cos(sunAngle) * R,
      Math.max(elev, 0.06) * 20 + 4,
      focus.z + Math.sin(sunAngle * 0.7) * R * 0.6
    );
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.sun.intensity = 0.25 + day * 2.1;
    this.sun.color.setHSL(0.09 + day * 0.035, 0.72 - day * 0.36, 0.62 + day * 0.12);
    this.ambient.intensity = 0.28 + day * 0.62;
    this.hemi.intensity = 0.18 + day * 0.4;

    // sky / fog blend: warm day ↔ deep blue night
    const daySky = new THREE.Color(0x9fc4dd);
    const duskSky = new THREE.Color(0xd9926a);
    const nightSky = new THREE.Color(0x1c2740);
    const dusk = Math.max(0, 1 - Math.abs(elev) * 4); // near horizon
    const sky = new THREE.Color().copy(nightSky).lerp(daySky, day).lerp(duskSky, dusk * 0.55);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);

    // lantern emissive stronger at night (uniform trick via material)
    MATS.lantern.emissiveIntensity = 0.5 + (1 - day) * 1.6;
  }

  // ---------------- main loop ----------------

  start() {
    this._last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      dt = Math.min(dt, 0.1); // clamp tab-switch spikes
      this.elapsed += dt;

      updateMaterialsClock(this.elapsed);
      tweens.update(dt);
      this.controls.update(dt);
      this.construction.update(dt);
      this.evolution.update(dt);
      this.pool.update(dt, this.controls.target);
      this._updateDayNight(dt);
      this.ui.updateFps(dt);
      this.resourceSystem.update(dt);
      this.citizenSystem.update(dt);
      this.progressionSystem.update(dt);
      this.territorySystem.update(dt);
      this.factionSystem.update(dt);
      this.buildingSystem.update(dt);
      this.researchSystem.update(dt);
      this.caravanSystem.update(dt);
      this.worldEvents.update(dt);
      this.selection.update(dt);
      this.radialMenu.update();
      if (this.progressionSystem.upgrading) this.resourcePanel.refreshProgress();
      if (this.researchSystem.active) this.researchPanel.refreshProgress();
      if (this.constructionPanel.hasActiveWork()) this.constructionPanel.refreshProgress();
      this.debugHUD.update(dt);
      this.debugOverlays.update(dt);

      // periodic autosave (keeps evolution ages fresh)
      this._autosaveT += dt;
      if (this._autosaveT >= AUTOSAVE_INTERVAL) {
        this._autosaveT = 0;
        this.saveSystem.save(this);
      }

      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }
}
