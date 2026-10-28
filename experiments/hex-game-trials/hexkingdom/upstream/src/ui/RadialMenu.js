// ============================================================
// RadialMenu — contextual action ring for the selected tile.
// Opens on 'selection:changed', anchored to the tile's projected
// screen position (updated only while open — one project() per
// frame, no scene scans). Actions are derived from
// BuildingConfig per tile type; unavailable actions render
// disabled with the reason in their tooltip. All gameplay goes
// through the EXISTING systems (BuildingSystem / TerritorySystem).
// ============================================================
import * as THREE from 'three';
import { axialToWorld } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { BUILDINGS, VILLAGE_UPGRADE, MAX_BUILDINGS_PER_TILE, fmtCost } from '../config/BuildingConfig.js';
import { UNIT_TYPES, ATTACK_SUPPLY_COST } from '../config/EconomyConfig.js';
import { TILE_TYPES } from '../tiles/TileDefs.js';
import { events } from '../core/Events.js';
import { iconHtml, iconLabel } from './GameIcons.js';

const RADIUS = 86; // px ring radius

const RES_ICONS = { wood: 'wood', stone: 'stone', food: 'food', gold: 'gold', influence: 'influence' };

/** production string keeping fractional rates */
function fmtProduction(prod) {
  return Object.entries(prod)
    .map(([k, v]) => `${iconLabel(RES_ICONS[k] || k)} +${v}`)
    .join(' · ');
}

export class RadialMenu {
  constructor(game) {
    this.game = game;
    this.cell = null;
    this._worldPos = new THREE.Vector3();
    this._screen = new THREE.Vector3();

    this.root = document.createElement('div');
    this.root.id = 'radial-menu';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);

    events.on('selection:changed', ({ cell }) => {
      this.cell = cell;
      if (cell) this._build(cell);
      else this._hide();
    });
    // requirements can change while open (resources, research, construction)
    events.on('resources:changed', () => this._refreshDisabled());
    events.on('buildings:changed', () => { if (this.cell) this._build(this.cell); });
    events.on('research:completed', () => { if (this.cell) this._build(this.cell); });
    events.on('army:changed', () => { if (this.cell) this._build(this.cell); });
  }

  _hide() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this._items = null;
  }

  /** action list for a cell, derived from config + existing checks */
  _actionsFor(cell) {
    const bs = this.game.buildingSystem;
    const actions = [];

    // enemy tile → Reclaim (captured land, influence) and/or Attack (army)
    if (cell.owner && cell.owner !== 'player') {
      const terr = this.game.territorySystem;
      const army = this.game.armySystem;
      const key = `${cell.q},${cell.r}`;
      if (terr.captured.has(key)) {
        const cost = terr.reclaimCost;
        const affordable = (this.game.resourceSystem.resources.influence || 0) >= cost;
        actions.push({
          id: 'reclaim',
          icon: 'reclaim',
          label: 'Reclaim',
          tip: `<b>Reclaim territory</b><br>Cost: ${cost} influence` +
            (affordable ? '' : '<br><i class="tip-bad">Not enough influence</i>'),
          disabled: !affordable,
          run: () => terr.reclaim(cell),
        });
      }
      if (army) {
        const check = army.canAttack(cell);
        const power = Math.round(army.strength);
        const defense = Math.round(army.defenseOf(cell));
        actions.push({
          id: 'attack',
          icon: 'sword',
          label: 'Attack',
          tip: `<b>Attack this tile</b><br>Your army: ${power} ⚔ vs defense ~${defense}` +
            `<br>Supplies: ${fmtCost(ATTACK_SUPPLY_COST)} · casualties expected` +
            (check.ok ? '<br>Victory claims the tile for your kingdom' : `<br><i class="tip-bad">${check.reason}</i>`),
          disabled: !check.ok,
          run: () => army.attack(cell),
        });
      }
      return actions;
    }

    // muster site → recruit units into the army
    const army = this.game.armySystem;
    if (army && army.isMusterSite(cell)) {
      for (const u of Object.values(UNIT_TYPES)) {
        const check = army.canRecruit(u.id);
        actions.push({
          id: `recruit_${u.id}`,
          icon: u.icon,
          label: u.name,
          tip: `<b>Recruit ${u.name}</b><br>${u.desc}` +
            `<br>Cost: ${fmtCost(u.cost)} · +${u.strength} army strength` +
            `<br>Army: ${Math.round(army.strength)} / cap ${Math.round(army.cap)}` +
            (check.ok ? '' : `<br><i class="tip-bad">${check.reason}</i>`),
          disabled: !check.ok,
          run: () => army.recruit(u.id, cell),
        });
      }
    }

    // manual village upgrade
    if (cell.tileType === 'village' && !bs.isVillageUpgraded(cell)) {
      const check = bs.canUpgradeVillage(cell);
      const inProgress = bs.isVillageUpgrading(cell);
      actions.push({
        id: 'village_upgrade',
        icon: VILLAGE_UPGRADE.icon,
        label: inProgress ? 'Upgrading…' : 'Upgrade',
        tip: `<b>${VILLAGE_UPGRADE.name}</b><br>${VILLAGE_UPGRADE.desc}` +
          `<br>Cost: ${fmtCost(VILLAGE_UPGRADE.cost)} · ${VILLAGE_UPGRADE.buildTime}s` +
          `<br>Needs: ${VILLAGE_UPGRADE.minPopulation} pop · ${VILLAGE_UPGRADE.minStability} stability · tier ${VILLAGE_UPGRADE.minTier + 1}+` +
          (check.ok || inProgress ? '' : `<br><i class="tip-bad">${check.reason}</i>`),
        disabled: !check.ok || inProgress,
        run: () => bs.upgradeVillage(cell),
      });
    }

    // in-place upgrades for completed buildings (tower chain)
    const rs = this.game.researchSystem;
    for (const b of bs.buildingsOn(cell)) {
      const cur = BUILDINGS[b.id];
      const target = cur?.upgradesTo ? BUILDINGS[cur.upgradesTo] : null;
      if (!target || (!b.done && !b.upgradeTo)) continue;
      // keep the wheel lean: reveal the upgrade once its research is done
      if (target.research && rs && !rs.isCompleted(target.research)) continue;
      const check = bs.canUpgradeBuilding(cell, b);
      actions.push({
        id: `upgrade_b${b.slot}`,
        icon: target.icon,
        label: b.upgradeTo ? 'Upgrading…' : `→ ${target.name}`,
        tip: `<b>Upgrade: ${cur.name} → ${target.name}</b><br>${target.desc}` +
          `<br>Cost: ${fmtCost(target.cost)} · ${Math.round(target.buildTime)}s` +
          (check.ok || b.upgradeTo ? '' : `<br><i class="tip-bad">${check.reason}</i>`),
        disabled: !check.ok || !!b.upgradeTo,
        run: () => bs.upgradeBuilding(cell, b),
      });
    }

    // buildings that fit this tile type
    const tileFull = bs.buildingsOn(cell).length >= MAX_BUILDINGS_PER_TILE;
    for (const def of Object.values(BUILDINGS)) {
      if (!bs.fitsTile(def, cell)) continue;
      // keep the wheel lean: hide buildings whose research is not unlocked yet
      if (def.research && rs && !rs.isCompleted(def.research)) continue;
      const existing = bs.buildingsOn(cell).find((b) => b.id === def.id);
      // full tile: only show what is already built here (plus upgrades above)
      if (tileFull && !existing) continue;
      const check = bs.canBuild(cell, def.id);
      let label = def.name;
      if (existing) label = existing.done ? `${def.name} ✓` : 'Building…';
      actions.push({
        id: def.id,
        icon: def.icon,
        label,
        tip: `<b>${def.name}</b><br>${def.desc}` +
          `<br>Cost: ${fmtCost(def.cost)} · ${Math.round(def.buildTime)}s` +
          (Object.keys(def.production).length
            ? `<br>Produces: ${fmtProduction(def.production)}/s` : '') +
          (def.capBonus ? `<br>+${def.capBonus} storage` : '') +
          (existing || check.ok ? '' : `<br><i class="tip-bad">${check.reason}</i>`),
        disabled: !!existing || !check.ok,
        run: () => bs.build(cell, def.id),
      });
    }
    return actions;
  }

  _build(cell) {
    const actions = this._actionsFor(cell);
    this.root.innerHTML = '';
    this._items = [];

    // center label: tile name + construction progress slot
    const center = document.createElement('div');
    center.className = 'radial-center';
    const def = TILE_TYPES[cell.tileType];
    const towny = this.game.buildingSystem.isVillageUpgraded(cell);
    center.innerHTML =
      `<span class="radial-title">${towny ? 'Town' : (def ? def.name : cell.tileType)}</span>` +
      `<span class="radial-progress" id="radial-progress"></span>`;
    center.addEventListener('click', () => this.game.selection.clear());
    center.setAttribute('data-tip', 'Click to deselect (Esc)');
    this.root.appendChild(center);
    this._progressEl = center.querySelector('#radial-progress');

    const n = actions.length;
    actions.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'radial-btn' + (a.disabled ? ' disabled' : '');
      btn.innerHTML = `<span class="radial-icon">${iconHtml(a.icon)}</span><span class="radial-label">${a.label}</span>`;
      btn.setAttribute('data-tip', a.tip);
      btn.dataset.actionId = a.id;
      const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
      btn.style.setProperty('--rx', `${Math.cos(angle) * RADIUS}px`);
      btn.style.setProperty('--ry', `${Math.sin(angle) * RADIUS}px`);
      btn.style.animationDelay = `${i * 0.03}s`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('disabled')) return;
        a.run();
      });
      this.root.appendChild(btn);
      this._items.push({ action: a, btn });
    });

    this.root.classList.remove('hidden');
    this._place();
  }

  /** re-evaluate disabled state without rebuilding DOM (smooth updates) */
  _refreshDisabled() {
    if (!this.cell || !this._items) return;
    const fresh = this._actionsFor(this.cell);
    for (const item of this._items) {
      const a = fresh.find((x) => x.id === item.action.id);
      if (!a) continue;
      item.btn.classList.toggle('disabled', !!a.disabled);
      item.btn.setAttribute('data-tip', a.tip);
    }
  }

  /** project the tile to screen space and anchor the ring there */
  _place() {
    if (!this.cell) return;
    const { x, z } = axialToWorld(this.cell.q, this.cell.r);
    this._worldPos.set(x, TILE_H, z);
    this._screen.copy(this._worldPos).project(this.game.camera);
    const sx = (this._screen.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._screen.y * 0.5 + 0.5) * window.innerHeight;
    this.root.style.left = sx + 'px';
    this.root.style.top = sy + 'px';
    // hide if behind the camera
    this.root.style.visibility = this._screen.z < 1 ? 'visible' : 'hidden';
  }

  /** construction progress of this tile's active works (center readout) */
  _refreshProgress() {
    if (!this.cell || !this._progressEl) return;
    const bs = this.game.buildingSystem;
    const parts = [];
    for (const b of bs.buildingsOn(this.cell)) {
      if (b.upgradeTo) {
        const pct = Math.round((1 - b.upRemaining / Math.max(b.upTotal, 0.01)) * 100);
        parts.push(`up ${pct}%`);
        continue;
      }
      if (b.done) continue;
      const pct = Math.round((1 - b.remaining / Math.max(b.total, 0.01)) * 100);
      parts.push(`${BUILDINGS[b.id].icon} ${pct}%`);
    }
    const key = `${this.cell.q},${this.cell.r}`;
    const up = bs.upgrading.get(key);
    if (up) {
      const pct = Math.round((1 - up.remaining / Math.max(up.total, 0.01)) * 100);
      parts.push(`Up ${pct}%`);
    }
    const txt = parts.join(' ');
    if (this._progressEl.textContent !== txt) this._progressEl.textContent = txt;
  }

  update() {
    if (!this.cell) return;
    this._place();          // follows camera while open
    this._refreshProgress();
  }
}
