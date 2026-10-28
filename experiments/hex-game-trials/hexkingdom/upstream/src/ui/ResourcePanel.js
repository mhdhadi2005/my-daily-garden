// ============================================================
// ResourcePanel — complete gameplay HUD.
// Top bar: wood/stone/food/gold/population/stability
// Kingdom panel: tier, upgrade progress, upgrade button
// Territory panel: controlled tiles, borders, connected villages
// Event-driven — no per-frame value polling.
// ============================================================
import { events } from '../core/Events.js';
import { fmtCost } from '../config/BuildingConfig.js';
import { iconHtml, iconLabel } from './GameIcons.js';

const TOP_RES = [
  { key: 'wood', icon: 'wood', label: 'Wood' },
  { key: 'stone', icon: 'stone', label: 'Stone' },
  { key: 'food', icon: 'food', label: 'Food' },
  { key: 'gold', icon: 'gold', label: 'Gold' },
  { key: 'influence', icon: 'influence', label: 'Influence' },
];

const STABILITY_TIP =
  '<b>Stability</b> (0–100)<br>' +
  'Affects production: ×0.6 at 0 → ×1.0 at 100<br>' +
  'Adds to kingdom defense<br><br>' +
  '<b>Drifts toward 70</b><br>' +
  'Hunger (food &lt; 5): −0.35/s<br>' +
  'Storage overflow: −0.08/s per resource<br>' +
  'Tile captured: −8 · Reclaimed: +4';

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.floor(n));
}

function fmtRate(n) {
  const v = Math.round(n * 100) / 100;
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

export class ResourcePanel {
  constructor(game) {
    this.game = game;
    this._prevRes = {};
    this._buildDom();
    this._bindEvents();
    this.refresh();
  }

  _buildDom() {
    const root = document.createElement('div');
    root.id = 'gameplay-hud';
    root.className = 'ui-panel';
    root.setAttribute('aria-label', 'Kingdom HUD');

    let topCells = '';
    for (const d of TOP_RES) {
      topCells += `
        <div class="hud-res-cell" data-res="${d.key}" data-tip="${d.label} production rate">
          <span class="hud-res-icon">${iconHtml(d.icon)}</span>
          <span class="hud-res-val" id="hud-${d.key}">0</span>
          <span class="hud-res-rate" id="hud-${d.key}-rate">+0/s</span>
          <span class="hud-res-pop hidden" id="hud-${d.key}-pop"></span>
        </div>`;
    }

    root.innerHTML = `
      <div id="hud-top-bar" class="hud-bar">
        ${topCells}
        <div class="hud-res-cell hud-res-popcell" data-tip="Total population across all villages">
          <span class="hud-res-icon">${iconHtml('population')}</span>
          <span class="hud-res-val" id="hud-population">0</span>
        </div>
        <div class="hud-res-cell hud-res-stab" data-tip="${STABILITY_TIP}">
          <span class="hud-res-icon">${iconHtml('stability')}</span>
          <span class="hud-res-val" id="hud-stability">70</span>
          <div class="hud-stab-bar"><div class="hud-stab-fill" id="hud-stability-fill"></div></div>
        </div>
      </div>

      <div id="hud-kingdom-panel" class="hud-sub-panel">
        <h2 class="hud-panel-title">Kingdom</h2>
        <div class="hud-kingdom-row">
          <span class="hud-tier-icon" id="hud-tier-icon"></span>
          <div class="hud-tier-body">
            <span class="hud-tier-name" id="hud-tier-name">Settlement</span>
            <span class="hud-tier-next" id="hud-tier-next"></span>
            <span class="hud-storage" id="hud-storage" data-tip="Resource storage capacity">📦 0 / 140</span>
            <div class="hud-progress hidden" id="hud-tier-progress">
              <div class="hud-progress-fill" id="hud-tier-fill"></div>
            </div>
          </div>
          <button type="button" class="hud-upgrade-btn" id="hud-upgrade-btn"
            data-tip="Upgrade kingdom tier when requirements are met">Upgrade</button>
        </div>
      </div>

      <div id="hud-territory-panel" class="hud-sub-panel">
        <h2 class="hud-panel-title">Territory</h2>
        <div class="hud-territory-stats">
          <div class="hud-stat" data-tip="Tiles under your control">
            <span class="hud-stat-val" id="hud-tiles">0</span>
            <span class="hud-stat-label">Tiles</span>
          </div>
          <div class="hud-stat" data-tip="Border tiles exposed to enemies">
            <span class="hud-stat-val" id="hud-borders">0</span>
            <span class="hud-stat-label">Borders</span>
          </div>
          <div class="hud-stat" data-tip="Villages connected by roads">
            <span class="hud-stat-val" id="hud-villages">0</span>
            <span class="hud-stat-label">Villages</span>
          </div>
          <div class="hud-stat" data-tip="Army strength / cap — recruit at barracks &amp; garrisons, attack enemy border tiles">
            <span class="hud-stat-val" id="hud-army">0</span>
            <span class="hud-stat-label">Army</span>
          </div>
        </div>
      </div>`;

    document.body.appendChild(root);
    this.root = root;
    this.el = {
      population: root.querySelector('#hud-population'),
      stability: root.querySelector('#hud-stability'),
      stabilityFill: root.querySelector('#hud-stability-fill'),
      tierIcon: root.querySelector('#hud-tier-icon'),
      tierName: root.querySelector('#hud-tier-name'),
      tierNext: root.querySelector('#hud-tier-next'),
      storage: root.querySelector('#hud-storage'),
      tierProgress: root.querySelector('#hud-tier-progress'),
      tierFill: root.querySelector('#hud-tier-fill'),
      upgradeBtn: root.querySelector('#hud-upgrade-btn'),
      tiles: root.querySelector('#hud-tiles'),
      borders: root.querySelector('#hud-borders'),
      villages: root.querySelector('#hud-villages'),
      army: root.querySelector('#hud-army'),
    };
    for (const d of TOP_RES) {
      this.el[d.key] = root.querySelector(`#hud-${d.key}`);
      this.el[d.key + 'Rate'] = root.querySelector(`#hud-${d.key}-rate`);
      this.el[d.key + 'Pop'] = root.querySelector(`#hud-${d.key}-pop`);
    }

    this.el.upgradeBtn.addEventListener('click', () => {
      const prog = this.game.progressionSystem;
      const check = prog.canStartUpgrade();
      if (!check.ok) {
        this.game.ui.toast(check.reason || 'Cannot upgrade yet');
        this.el.upgradeBtn.classList.add('shake');
        setTimeout(() => this.el.upgradeBtn.classList.remove('shake'), 400);
        return;
      }
      if (prog.startUpgrade()) {
        this.game.ui.toast(`⬆ Upgrading to ${prog.next.name}…`);
      }
    });
  }

  _bindEvents() {
    events.on('resources:changed', ({ resources, rates }) => {
      this._onResources(resources, rates);
      this._refreshStorage();
      // keep the tier Upgrade button live: requirements (tiles, stability,
      // cost) change constantly, so its disabled state must follow
      this._refreshKingdom();
    });
    events.on('population:changed', () => this._refreshPopulation());
    events.on('stability:changed', () => this._refreshStability());
    events.on('progression:started', () => this._refreshKingdom());
    events.on('progression:completed', (p) => {
      if (!p.silent) this.game.ui.toast(`${iconLabel(p.icon)} Your realm is now a ${p.name}!`);
      this._refreshKingdom();
    });
    events.on('progression:denied', ({ reason }) => this.game.ui.toast(reason));
    events.on('territory:changed', () => this._refreshTerritory());
    events.on('territory:captured', () => this._refreshTerritory());
    events.on('territory:reclaimed', () => this._refreshTerritory());
    events.on('roads:changed', () => this._refreshTerritory());
    events.on('tile:placed', () => this._refreshTerritory());
    events.on('faction:tile-placed', () => this._refreshTerritory());
    events.on('buildings:changed', () => {
      const rs = this.game.resourceSystem;
      if (rs) this._onResources(rs.resources, rs.rates);
      this._refreshStorage();
      this._refreshArmy();
    });
    events.on('army:changed', () => this._refreshArmy());
  }

  _refreshArmy() {
    if (!this.el.army) return;
    const army = this.game.armySystem;
    if (!army) return;
    this.el.army.textContent = `${Math.round(army.strength)}/${Math.round(army.cap)}`;
  }

  refresh() {
    const rs = this.game.resourceSystem;
    if (rs) this._onResources(rs.resources, rs.rates);
    this._refreshPopulation();
    this._refreshStability();
    this._refreshKingdom();
    this._refreshTerritory();
    this._refreshArmy();
  }

  _onResources(resources, rates) {
    const bRates = this.game.buildingSystem?.productionRates() || {};
    for (const d of TOP_RES) {
      const val = resources[d.key] || 0;
      const prev = this._prevRes[d.key];
      if (prev !== undefined && val > prev + 0.4) {
        this._popGain(d.key, val - prev);
      }
      this._prevRes[d.key] = val;
      this.el[d.key].textContent = fmt(val);
      const rate = (rates[d.key] || 0) + (bRates[d.key] || 0);
      const rateEl = this.el[d.key + 'Rate'];
      rateEl.textContent = fmtRate(rate) + '/s';
      rateEl.classList.toggle('neg', rate < -0.001);
    }
  }

  _popGain(key, delta) {
    const pop = this.el[key + 'Pop'];
    if (!pop) return;
    pop.textContent = '+' + fmt(delta);
    pop.classList.remove('hidden');
    pop.classList.remove('gain-pop');
    void pop.offsetWidth;
    pop.classList.add('gain-pop');
    pop.onanimationend = () => pop.classList.add('hidden');
  }

  _refreshPopulation() {
    this.el.population.textContent = String(this.game.citizenSystem?.totalPopulation || 0);
  }

  _refreshStability() {
    const stab = Math.round(this.game.resourceSystem?.stability ?? 70);
    this.el.stability.textContent = String(stab);
    this.el.stabilityFill.style.width = stab + '%';
    this.el.stabilityFill.style.background =
      stab < 30 ? '#c0503a' : stab < 55 ? '#d9a84c' : '#7fae52';
  }

  _refreshKingdom() {
    const prog = this.game.progressionSystem;
    if (!prog) return;

    this.el.tierIcon.innerHTML = iconHtml(prog.current.icon);
    this.el.tierName.textContent = prog.current.name;

    if (prog.maxed) {
      this.el.tierNext.textContent = 'Maximum tier reached';
      this.el.tierProgress.classList.add('hidden');
      this.el.upgradeBtn.classList.add('hidden');
      this.el.upgradeBtn.disabled = true;
      this._refreshStorage();
      return;
    }

    const nxt = prog.next;
    const check = prog.canStartUpgrade();
    const reqs = prog.upgradeRequirements();
    const reqParts = [`${nxt.minTiles} tiles`, `${nxt.minStability} stability`, fmtCost(nxt.upgradeCost)];
    this.el.tierNext.textContent = `→ ${nxt.name} (${reqParts.join(' · ')})`;
    this.el.upgradeBtn.classList.toggle('hidden', prog.upgrading);
    this.el.upgradeBtn.disabled = !check.ok && !prog.upgrading;
    this.el.upgradeBtn.classList.toggle('disabled', !check.ok && !prog.upgrading);
    const tipLines = reqs.map((r) =>
      `<span class="${r.ok ? 'tip-ok' : 'tip-bad'}">${r.ok ? '✓' : '✗'} ${r.label}</span>`
    ).join('<br>');
    this.el.upgradeBtn.setAttribute('data-tip',
      check.ok
        ? `Upgrade to ${nxt.name} (${nxt.upgradeTime}s)`
        : `<b>Requirements</b><br>${tipLines}`
    );

    if (prog.upgrading && nxt) {
      this.el.tierProgress.classList.remove('hidden');
      this._syncTierProgress();
    } else {
      this.el.tierProgress.classList.add('hidden');
    }
    this._refreshStorage();
  }

  _refreshStorage() {
    const rs = this.game.resourceSystem;
    if (!rs || !this.el.storage) return;
    const cap = rs.storageCap;
    const used = Math.max(
      rs.resources.wood || 0,
      rs.resources.stone || 0,
      rs.resources.food || 0,
      rs.resources.gold || 0,
      rs.resources.influence || 0,
    );
    this.el.storage.innerHTML = `${iconHtml('storage')} ${fmt(Math.round(used))} / ${fmt(cap)}`;
    this.el.storage.classList.toggle('storage-warn', used >= cap * 0.9);
  }

  _refreshTerritory() {
    const grid = this.game.grid;
    const terr = this.game.territorySystem;
    const roads = this.game.roadSystem;
    if (!grid) return;

    let controlled = 0;
    for (const cell of grid.cells.values()) {
      if (!cell.owner || cell.owner === 'player') controlled++;
    }
    this.el.tiles.textContent = String(controlled);
    this.el.borders.textContent = String(terr ? terr.playerBorderCells().length : 0);
    this.el.villages.textContent = String(roads?.connectedVillages ?? 0);
  }

  /** called from Game loop only while a tier upgrade is running */
  refreshProgress() {
    if (this.game.progressionSystem?.upgrading) this._syncTierProgress();
  }

  _syncTierProgress() {
    const prog = this.game.progressionSystem;
    if (!prog?.upgrading || !prog.next) return;
    const pct = Math.round((1 - prog.upgradeT / prog.next.upgradeTime) * 100);
    this.el.tierFill.style.width = pct + '%';
  }
}
