// ============================================================
// ProgressionSystem — MANUAL kingdom tier progression.
// Settlement → Village → Town → City → Kingdom.
// Each upgrade must be started by the player, costs resources,
// requires minimum tiles + stability, and takes real time to
// complete. Tiers gate: which tile types can be drawn/placed,
// the max tile count, and the resource storage cap.
// Pure game logic — no rendering.
// ============================================================
import { TIERS } from '../config/EconomyConfig.js';
import { fmtCost } from '../config/BuildingConfig.js';
import { events } from '../core/Events.js';

export class ProgressionSystem {
  /**
   * @param resources ResourceSystem
   * @param grid GridManager
   */
  constructor(resources, grid) {
    this.resources = resources;
    this.grid = grid;
    this.tier = 0;              // index into TIERS
    this.upgrading = false;
    this.upgradeT = 0;          // seconds remaining on active upgrade
    this.resources.storageCapProvider = () => this.current.storageCap;
  }

  get current() { return TIERS[this.tier]; }
  get next() { return TIERS[this.tier + 1] || null; }
  get maxed() { return this.tier >= TIERS.length - 1; }

  /** is this tile type unlocked at the current tier? */
  isUnlocked(tileType) {
    return this.current.unlocks.includes(tileType);
  }

  /** can the player place ANOTHER tile at all? (tier tile cap) */
  underTileCap(tilesPlaced) {
    return tilesPlaced < this.current.maxTiles;
  }

  /** tiles the player still controls (not captured by factions) */
  _playerTileCount() {
    let n = 0;
    for (const cell of this.grid.cells.values()) {
      if (!cell.owner || cell.owner === 'player') n++;
    }
    return n;
  }

  /** checklist for upgrade UI tooltips */
  upgradeRequirements() {
    const nxt = this.next;
    if (!nxt || this.maxed) return [];
    const owned = this._playerTileCount();
    return [
      {
        id: 'tiles',
        label: `Tiles under control: ${owned} / ${nxt.minTiles}`,
        ok: owned >= nxt.minTiles,
      },
      {
        id: 'stability',
        label: `Stability: ${Math.round(this.resources.stability)} / ${nxt.minStability}`,
        ok: this.resources.stability >= nxt.minStability,
      },
      {
        id: 'cost',
        label: `Cost: ${fmtCost(nxt.upgradeCost)}`,
        ok: this.resources.canAfford(nxt.upgradeCost),
      },
    ];
  }

  /**
   * Check upgrade preconditions. Returns { ok, reason }.
   */
  canStartUpgrade() {
    if (this.maxed) return { ok: false, reason: 'Already a Kingdom — max tier reached' };
    if (this.upgrading) return { ok: false, reason: 'Upgrade already in progress' };
    const missing = this.upgradeRequirements().filter((r) => !r.ok);
    if (missing.length) {
      return { ok: false, reason: missing.map((r) => r.label).join(' · ') };
    }
    return { ok: true, reason: '' };
  }

  /** player-initiated: pay now, wait upgradeTime seconds */
  startUpgrade() {
    const check = this.canStartUpgrade();
    if (!check.ok) {
      events.emit('progression:denied', { reason: check.reason });
      return false;
    }
    const nxt = this.next;
    if (!this.resources.spend(nxt.upgradeCost, `Upgrade → ${nxt.name}`)) return false;
    this.upgrading = true;
    this.upgradeT = nxt.upgradeTime;
    events.emit('progression:started', { to: nxt.name, time: nxt.upgradeTime });
    return true;
  }

  update(dt) {
    if (!this.upgrading) return;
    this.upgradeT -= dt;
    if (this.upgradeT <= 0) {
      this.upgrading = false;
      this.upgradeT = 0;
      this.tier++;
      this.resources.adjustStability(+5); // celebration
      events.emit('progression:completed', {
        tier: this.tier,
        name: this.current.name,
        icon: this.current.icon,
        unlocks: this.current.unlocks,
      });
    }
  }

  serialize() {
    return {
      tier: this.tier,
      upgrading: this.upgrading,
      upgradeT: Math.round(this.upgradeT * 10) / 10,
    };
  }

  restore(data) {
    if (!data) return;
    this.tier = Math.min(data.tier || 0, TIERS.length - 1);
    this.upgrading = !!data.upgrading;
    this.upgradeT = data.upgradeT || 0;
    events.emit('progression:completed', {
      tier: this.tier, name: this.current.name, icon: this.current.icon,
      unlocks: this.current.unlocks, silent: true,
    });
  }

  reset() {
    this.tier = 0;
    this.upgrading = false;
    this.upgradeT = 0;
  }
}
