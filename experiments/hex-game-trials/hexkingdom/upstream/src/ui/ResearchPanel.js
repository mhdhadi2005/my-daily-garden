// ============================================================
// ResearchPanel — lightweight research tree UI.
// One research at a time via ResearchSystem.start(id).
// Event-driven updates — no per-frame DOM rebuilds.
// ============================================================
import { RESEARCH, RESEARCH_ORDER } from '../config/ResearchConfig.js';
import { fmtCost } from '../config/BuildingConfig.js';
import { events } from '../core/Events.js';
import { iconHtml, iconLabel } from './GameIcons.js';

export class ResearchPanel {
  constructor(game) {
    this.game = game;
    this._buildDom();
    this._bindEvents();
    this.refresh();
  }

  _buildDom() {
    const root = document.createElement('aside');
    root.id = 'research-panel';
    root.className = 'hud-side-panel';
    root.setAttribute('aria-label', 'Research');

    root.innerHTML = `
      <h2 class="hud-panel-title">Research</h2>
      <div class="research-active hidden" id="rp-active">
        <span class="research-active-icon" id="rp-active-icon"></span>
        <span class="research-active-name" id="rp-active-name"></span>
        <div class="hud-progress"><div class="hud-progress-fill" id="rp-active-fill"></div></div>
      </div>
      <div class="research-list" id="rp-list"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.el = {
      active: root.querySelector('#rp-active'),
      activeIcon: root.querySelector('#rp-active-icon'),
      activeName: root.querySelector('#rp-active-name'),
      activeFill: root.querySelector('#rp-active-fill'),
      list: root.querySelector('#rp-list'),
    };
  }

  _bindEvents() {
    events.on('resources:changed', () => this._refreshButtons());
    events.on('research:started', () => this.refresh());
    events.on('research:completed', ({ name, icon, unlocks }) => {
      this.game.ui.toast(`${iconLabel(icon)} ${name} researched! ${unlocks}`);
      this.refresh();
    });
    events.on('research:denied', ({ reason }) => this.game.ui.toast(reason));
  }

  refresh() {
    const rs = this.game.researchSystem;
    if (!rs) return;

    if (rs.active) {
      const def = RESEARCH[rs.active.id];
      this.el.active.classList.remove('hidden');
      this.el.activeIcon.innerHTML = iconHtml(def?.icon || 'research');
      this.el.activeName.textContent = def?.name || rs.active.id;
      this._syncActiveProgress();
    } else {
      this.el.active.classList.add('hidden');
    }

    this.el.list.innerHTML = '';
    for (const id of RESEARCH_ORDER) {
      const def = RESEARCH[id];
      const done = rs.isCompleted(id);
      const inProgress = rs.active?.id === id;
      const check = rs.canStart(id);
      const btn = document.createElement('button');
      btn.className = 'research-btn' +
        (done ? ' done' : '') +
        (inProgress ? ' active' : '') +
        (!done && !inProgress && !check.ok ? ' disabled' : '');
      btn.innerHTML =
        `<span class="research-btn-icon">${iconHtml(def.icon)}</span>` +
        `<span class="research-btn-body">` +
        `<span class="research-btn-name">${def.name}</span>` +
        `<span class="research-btn-meta">${done ? '✓ Complete' : fmtCost(def.cost) + ' · ' + def.duration + 's'}</span>` +
        `</span>`;
      btn.setAttribute('data-tip',
        `<b>${def.name}</b><br>${def.unlocks}` +
        (def.requires.length ? `<br>Requires: ${def.requires.map((r) => RESEARCH[r].name).join(', ')}` : '') +
        (done ? '' : (!check.ok && !inProgress ? `<br><i class="tip-bad">${check.reason}</i>` : ''))
      );
      btn.addEventListener('click', () => {
        if (done || inProgress) return;
        if (!rs.start(id)) return;
      });
      this.el.list.appendChild(btn);
    }
  }

  _refreshButtons() {
    if (!this.game.researchSystem?.active) {
      const rs = this.game.researchSystem;
      if (!rs) return;
      const buttons = this.el.list.querySelectorAll('.research-btn:not(.done):not(.active)');
      let i = 0;
      for (const id of RESEARCH_ORDER) {
        if (rs.isCompleted(id) || rs.active?.id === id) continue;
        const btn = buttons[i++];
        if (!btn) break;
        const check = rs.canStart(id);
        btn.classList.toggle('disabled', !check.ok);
      }
    }
  }

  /** smooth progress bar while research runs — called from Game loop */
  refreshProgress() {
    if (this.game.researchSystem?.active) this._syncActiveProgress();
  }

  _syncActiveProgress() {
    const a = this.game.researchSystem.active;
    if (!a) return;
    const pct = Math.round((1 - a.remaining / Math.max(a.total, 0.01)) * 100);
    this.el.activeFill.style.width = pct + '%';
  }
}
