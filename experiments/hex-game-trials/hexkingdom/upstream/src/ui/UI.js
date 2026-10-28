// ============================================================
// UI — HUD bindings: score counter with pop animation, tile
// shop (category tabs + grid), preview, restart, toast, FPS.
// ============================================================
import { TILE_TYPES } from '../tiles/TileDefs.js';
import { events } from '../core/Events.js';
import { fmtCost } from '../config/BuildingConfig.js';
import { scaledTileCost, tileUnlockTierName, BASE_PRODUCTION } from '../config/EconomyConfig.js';
import { iconHtml } from './GameIcons.js';

const SHOP_ORDER = [
  'forest', 'field', 'meadow', 'hills', 'river', 'lake', 'swamp',
  'mountain', 'quarry', 'village', 'ruins',
];

const TILE_CATEGORIES = {
  all:   { label: 'All',   types: SHOP_ORDER },
  land:  { label: 'Land',  types: ['forest', 'field', 'meadow', 'hills'] },
  water: { label: 'Water', types: ['river', 'lake', 'swamp'] },
  rock:  { label: 'Rock',  types: ['mountain', 'quarry', 'ruins'] },
  town:  { label: 'Town',  types: ['village'] },
};

const EDGE_COLORS = {
  forest: '#4e7f3a',
  field: '#d9b256',
  road: '#b8a684',
  river: '#4e8fc4',
  mountain: '#8d8d94',
  village: '#b0523a',
};

function fmtProduction(type) {
  const prod = BASE_PRODUCTION[type];
  if (!prod || !Object.keys(prod).length) return '';
  return Object.entries(prod)
    .map(([k, v]) => `${iconHtml(k, 'sm')}+${v}/s`)
    .join(' ');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      score: document.getElementById('score-value'),
      scorePopup: document.getElementById('score-popup'),
      tilesPlaced: document.getElementById('tiles-placed'),
      preview: document.getElementById('tile-preview'),
      tileName: document.getElementById('tile-name'),
      tileCostBreakdown: document.getElementById('tile-cost-breakdown'),
      tileProd: document.getElementById('tile-prod'),
      tileCap: document.getElementById('tile-cap'),
      tileShopTabs: document.getElementById('tile-shop-tabs'),
      tileShop: document.getElementById('tile-shop'),
      rerollBtn: document.getElementById('reroll-btn'),
      rotateBtn: document.getElementById('rotate-btn'),
      restartBtn: document.getElementById('restart-btn'),
      debugBtn: document.getElementById('debug-btn'),
      fpsLabel: document.getElementById('fps-label'),
      fpsValue: document.getElementById('fps-value'),
      toast: document.getElementById('toast'),
      loading: document.getElementById('loading-screen'),
      loadingFill: document.getElementById('loading-fill'),
    };
    this.ctx = this.el.preview.getContext('2d');
    this.debugVisible = false;
    this._toastTimer = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;
    this._shopCategory = 'all';
    this._shopBuilt = false;

    this._bind();
    this._buildShopTabs();
  }

  _bind() {
    this.el.rotateBtn.addEventListener('click', () => this.game.rotateHand());
    this.el.rerollBtn.addEventListener('click', () => this.game.rollHandVariant());
    this.el.restartBtn.addEventListener('click', () => {
      if (confirm('Start a new kingdom? Current progress will be lost.')) {
        this.game.restart();
      }
    });
    this.el.debugBtn.addEventListener('click', () => {
      this.debugVisible = !this.debugVisible;
      this.el.fpsLabel.classList.toggle('hidden', !this.debugVisible);
      this.game.debugHUD?.toggle();
    });

    events.on('score:changed', ({ total, delta, multiplier, bonusLabel }) => {
      this.el.score.textContent = String(total);
      if (delta > 0) {
        this.el.score.classList.remove('bump');
        void this.el.score.offsetWidth;
        this.el.score.classList.add('bump');
        setTimeout(() => this.el.score.classList.remove('bump'), 200);
        const label = bonusLabel
          ? `+${delta} ${bonusLabel}`
          : multiplier > 1 ? `+${delta} ×${multiplier}` : `+${delta}`;
        this._popScore(label);
      }
    });

    events.on('resources:changed', () => {
      this._refreshShopAfford();
      this.refreshTileDetail();
    });

    events.on('progression:completed', () => {
      this._shopBuilt = false;
      this.refreshTileShop();
    });
    events.on('tile:placed', () => this.refreshTileShop());
  }

  _buildShopTabs() {
    const tabs = this.el.tileShopTabs;
    if (!tabs) return;
    tabs.innerHTML = '';
    for (const [id, cat] of Object.entries(TILE_CATEGORIES)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile-shop-tab' + (id === this._shopCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.dataset.cat = id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', id === this._shopCategory ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (this._shopCategory === id) return;
        this._shopCategory = id;
        tabs.querySelectorAll('.tile-shop-tab').forEach((t) => {
          const on = t.dataset.cat === id;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        this._shopBuilt = false;
        this.refreshTileShop();
      });
      tabs.appendChild(btn);
    }
  }

  _typesForCategory() {
    const cat = TILE_CATEGORIES[this._shopCategory] || TILE_CATEGORIES.all;
    return cat.types.filter((t) => TILE_TYPES[t]);
  }

  /** Catalog grid — player picks tile type before placing. */
  refreshTileShop() {
    const shop = this.el.tileShop;
    if (!shop || !this.game?.progressionSystem) return;

    if (!this._shopBuilt) {
      this._buildShopGrid();
      this._shopBuilt = true;
    }
    this._refreshShopAfford();
    this.refreshTileDetail();
  }

  _buildShopGrid() {
    const shop = this.el.tileShop;
    shop.innerHTML = '';
    const types = this._typesForCategory();

    for (const type of types) {
      const def = TILE_TYPES[type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile-chip';
      btn.dataset.type = type;
      btn.innerHTML =
        `<span class="tile-chip-swatch" style="background:${def.previewColor}"></span>` +
        `<span class="tile-chip-name">${def.name}</span>` +
        `<span class="tile-chip-lock" hidden></span>`;
      btn.setAttribute('data-tip', def.name);
      btn.addEventListener('click', () => this.game.selectTileType(type));
      shop.appendChild(btn);
    }
  }

  _refreshShopAfford() {
    const shop = this.el.tileShop;
    if (!shop || !this.game?.progressionSystem) return;

    const prog = this.game.progressionSystem;
    const rs = this.game.resourceSystem;
    const placed = this.game.tilesPlaced;
    const atCap = !prog.underTileCap(placed);
    const selected = this.game.nextTile?.type;

    for (const btn of shop.querySelectorAll('.tile-chip')) {
      const type = btn.dataset.type;
      const def = TILE_TYPES[type];
      if (!def) continue;

      const unlocked = prog.isUnlocked(type);
      const cost = scaledTileCost(type, placed);
      const affordable = unlocked && rs.canAfford(cost);
      const isSelected = type === selected;

      btn.classList.toggle('selected', isSelected);
      btn.classList.toggle('locked', !unlocked);
      btn.classList.toggle('unaffordable', unlocked && !atCap && !affordable);
      btn.classList.toggle('at-cap', unlocked && atCap);
      btn.disabled = !unlocked || atCap;

      const lockEl = btn.querySelector('.tile-chip-lock');
      if (lockEl) {
        lockEl.hidden = unlocked;
        lockEl.textContent = unlocked ? '' : tileUnlockTierName(type).slice(0, 3);
      }

      const costStr = fmtCost(cost);
      const tip = !unlocked
        ? `Unlocks at ${tileUnlockTierName(type)}`
        : atCap
          ? 'Tile cap — upgrade kingdom'
          : `<b>${def.name}</b><br>${costStr}${affordable ? '' : '<br><i class="tip-bad">Not enough resources</i>'}` +
            (fmtProduction(type) ? `<br>${fmtProduction(type)}` : '');
      btn.setAttribute('data-tip', tip);
    }
  }

  /** Update cost chips, production, and action buttons for the selected tile. */
  refreshTileDetail() {
    const tile = this.game?.nextTile;
    if (!tile) {
      if (this.el.tileCostBreakdown) this.el.tileCostBreakdown.innerHTML = '';
      if (this.el.tileProd) this.el.tileProd.innerHTML = '';
      return;
    }

    const cost = scaledTileCost(tile.type, this.game.tilesPlaced);
    const rs = this.game.resourceSystem;
    const canAfford = rs.canAfford(cost);
    const atCap = !this.game.progressionSystem.underTileCap(this.game.tilesPlaced);

    if (this.el.tileCostBreakdown) {
      const chips = Object.entries(cost).map(([k, v]) => {
        const have = rs.resources[k] || 0;
        const ok = have >= v;
        return `<span class="cost-chip ${ok ? 'ok' : 'bad'}">${iconHtml(k, 'sm')}${Math.ceil(v)}</span>`;
      }).join('');
      this.el.tileCostBreakdown.innerHTML = chips;
      this.el.tileCostBreakdown.classList.toggle('unaffordable', !canAfford && !atCap);
    }

    if (this.el.tileProd) {
      const prod = fmtProduction(tile.type);
      this.el.tileProd.innerHTML = prod ? `Yields ${prod}` : '';
    }

    const actionsOk = !atCap && tile;
    this.el.rotateBtn.disabled = !actionsOk;
    this.el.rerollBtn.disabled = !actionsOk;
  }

  _popScore(text) {
    const p = this.el.scorePopup;
    p.textContent = text;
    p.classList.remove('hidden', 'pop');
    void p.offsetWidth;
    p.classList.add('pop');
    setTimeout(() => p.classList.add('hidden'), 1100);
  }

  setTilesPlaced(n) {
    this.el.tilesPlaced.textContent = String(n);
    if (this.game?.progressionSystem) {
      this.setTileCap(n, this.game.progressionSystem.current.maxTiles);
    }
  }

  /** @deprecated use refreshTileDetail */
  setTileCost(cost) {
    void cost;
    this.refreshTileDetail();
  }

  setTileCap(placed, max) {
    if (!this.el.tileCap) return;
    if (placed >= max) {
      this.el.tileCap.textContent = `${placed} / ${max} tiles — upgrade to expand`;
    } else {
      this.el.tileCap.textContent = `${placed} / ${max} tiles`;
    }
    this.el.tileCap.classList.toggle('at-cap', placed >= max);
  }

  toast(msg, ms = 1800) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  setLoadingProgress(t) {
    this.el.loadingFill.style.width = `${Math.round(t * 100)}%`;
  }

  hideLoading() {
    this.el.loading.classList.add('done');
    setTimeout(() => this.el.loading.remove(), 900);
  }

  drawPreview(type, variant, rotation) {
    const def = TILE_TYPES[type];
    const v = def.variants[variant] || def.variants[0];
    const ctx = this.ctx;
    const W = this.el.preview.width;
    const cx = W / 2, cy = W / 2, R = W * 0.38;

    ctx.clearRect(0, 0, W, W);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = cx + Math.cos(a) * R;
      const y = cy - Math.sin(a) * R;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = def.previewColor;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3a2a18';
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const edgeType = v.edges[(i - rotation + 6) % 6];
      const a0 = (i * Math.PI) / 3 - Math.PI / 6;
      const a1 = (i * Math.PI) / 3 + Math.PI / 6;
      const rr = R * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * rr, cy - Math.sin(a0) * rr);
      ctx.lineTo(cx + Math.cos(a1) * rr, cy - Math.sin(a1) * rr);
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.strokeStyle = EDGE_COLORS[edgeType] || '#fff';
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
    ctx.fill();

    this.el.tileName.textContent = def.name;
    this.refreshTileDetail();

    this.el.preview.classList.remove('swap');
    void this.el.preview.offsetWidth;
    this.el.preview.classList.add('swap');
  }

  drawPreviewRotation(type, variant, rotation) {
    const cls = this.el.preview.classList;
    const hadSwap = cls.contains('swap');
    this.drawPreview(type, variant, rotation);
    if (!hadSwap) cls.remove('swap');
  }

  updateFps(dt) {
    if (!this.debugVisible) return;
    this._fpsFrames++;
    this._fpsTime += dt;
    if (this._fpsTime >= 0.5) {
      this.el.fpsValue.textContent = String(Math.round(this._fpsFrames / this._fpsTime));
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }
  }
}
