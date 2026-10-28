// ============================================================
// FactionPanel — player-facing faction visibility layer.
// READ-ONLY exposure of FactionSystem (no rewrites).
// Shows borders via DebugOverlays toggle, settlements, strength,
// tribute and relationship. Updates on faction/territory events.
// ============================================================
import { events } from '../core/Events.js';
import { iconHtml, iconLabel } from './GameIcons.js';

const REL_LABEL = {
  friendly_kingdom: { text: 'Allied', cls: 'rel-friendly' },
  neutral_village: { text: 'Neutral', cls: 'rel-neutral' },
  hostile_kingdom: { text: 'Hostile', cls: 'rel-hostile' },
  barbarian_clan: { text: 'Hostile', cls: 'rel-hostile' },
  bandit_camp: { text: 'Hostile', cls: 'rel-hostile' },
};

export class FactionPanel {
  constructor(game) {
    this.game = game;
    this._collapsed = false;
    this._buildDom();
    this._bindEvents();
    this.refresh();
  }

  _buildDom() {
    const root = document.createElement('aside');
    root.id = 'faction-panel';
    root.className = 'hud-side-panel hud-side-right';
    root.setAttribute('aria-label', 'Neighbouring factions');

    root.innerHTML = `
      <div class="hud-panel-head">
        <h2 class="hud-panel-title">Factions</h2>
        <button type="button" class="hud-panel-toggle" id="fp-toggle" aria-label="Collapse panel">−</button>
      </div>
      <button type="button" class="hud-toggle-btn" id="fp-borders-btn"
        data-tip="Show faction territory borders on the map">${iconHtml('borders')} Borders</button>
      <div class="faction-list" id="fp-list"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.el = { list: root.querySelector('#fp-list') };

    root.querySelector('#fp-toggle').addEventListener('click', () => {
      this._collapsed = !this._collapsed;
      root.classList.toggle('collapsed', this._collapsed);
      root.querySelector('#fp-toggle').textContent = this._collapsed ? '+' : '−';
    });

    const bordersBtn = root.querySelector('#fp-borders-btn');
    bordersBtn.addEventListener('click', () => {
      const ov = this.game.debugOverlays;
      const on = !ov.isEnabled('factions');
      ov.setEnabled('factions', on);
      ov.setEnabled('territory', on);
      bordersBtn.classList.toggle('on', on);
    });
  }

  _bindEvents() {
    events.on('factions:generated', () => this.refresh());
    events.on('factions:tick', () => this.refresh());
    events.on('faction:raided', ({ faction, cell }) => {
      this.game.ui.toast(`${iconLabel('sword')} ${faction.label} raided your ${cell.tileType}!`);
      this.refresh();
    });
    events.on('faction:tribute', ({ faction, gold }) => {
      this.game.ui.toast(`${iconLabel('gift')} Tribute from ${faction.label}: +${gold} gold`);
      this.refresh();
    });
    events.on('territory:captured', ({ factionLabel }) => {
      this.game.ui.toast(`${iconLabel('flag')} ${factionLabel || 'Enemies'} captured a border tile!`);
      this.refresh();
    });
    events.on('territory:reclaimed', () => this.refresh());
  }

  refresh() {
    const fs = this.game.factionSystem;
    if (!fs?.factions?.length) {
      this.el.list.innerHTML = '<p class="hud-muted">No neighbours yet…</p>';
      return;
    }

    const html = fs.factions.map((f) => {
      const rel = REL_LABEL[f.archetype] || { text: f.hostile ? 'Hostile' : 'Neutral', cls: f.hostile ? 'rel-hostile' : 'rel-neutral' };
      const tribute = f.archetype === 'friendly_kingdom'
        ? '<span class="fp-tribute">Tribute ~' + Math.round(2 + f.strength * 0.05) + iconLabel('gold') + '/min</span>'
        : '';
      const homeDist = Math.abs(f.home.q) + Math.abs(f.home.r);
      return `
        <div class="faction-card ${rel.cls}" data-tip="<b>${f.label}</b><br>Tiles: ${f.territory.size}<br>Strength: ${Math.round(f.strength)}<br>Settlement ${homeDist} tiles away">
          <span class="fp-icon">${iconHtml(f.icon)}</span>
          <div class="fp-body">
            <span class="fp-name">${f.label}</span>
            <span class="fp-meta">${iconHtml('map')} ${f.territory.size} · ${iconLabel('sword')} ${Math.round(f.strength)} · <span class="${rel.cls}">${rel.text}</span></span>
            ${tribute}
          </div>
        </div>`;
    }).join('');
    this.el.list.innerHTML = html;
  }
}
