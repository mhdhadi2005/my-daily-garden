// ============================================================
// DebugHUD — collapsible debug panel exposing EXISTING system
// state in real time. Pure read-only: every value is fetched
// from the systems (or their already-emitted events); nothing
// is recomputed and no gameplay state is mutated (the overlay
// checkboxes only toggle visualization groups).
//
// Sections: Resources / Population / Road Network / Kingdom /
// Territory / Factions / AutoMesh / Performance + the debug
// overlay toggle menu (DebugOverlays).
// ============================================================
import { events } from '../core/Events.js';
import { OVERLAY_DEFS } from './DebugOverlays.js';

const UPDATE_INTERVAL = 0.5; // seconds between HUD refreshes

function row(label, id) {
  return `<div class="dbg-row"><span>${label}</span><b id="${id}">—</b></div>`;
}

export class DebugHUD {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this._t = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;
    this._fps = 0;
    this._lastFactionEvent = '—';
    this._lastTerritoryEvent = '—';
    this._lastResourceEvent = '—';
    this._lastPopEvent = '—';
    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    const root = document.createElement('div');
    root.id = 'debug-hud';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="dbg-header">
        <span class="dbg-title">👑 KINGDOM — DEBUG</span>
        <button class="dbg-collapse" id="dbg-close" title="Close">✕</button>
      </div>
      <div class="dbg-body">

        <details open><summary>Resources</summary>
          ${row('Wood', 'dbg-wood')}
          ${row('Stone', 'dbg-stone')}
          ${row('Food', 'dbg-food')}
          ${row('Gold', 'dbg-gold')}
          ${row('Influence', 'dbg-influence')}
          ${row('Stability', 'dbg-stability')}
          ${row('Storage cap', 'dbg-cap')}
          ${row('Last change', 'dbg-res-event')}
        </details>

        <details open><summary>Population</summary>
          ${row('Total population', 'dbg-pop')}
          ${row('Villages', 'dbg-villages')}
          ${row('Active citizens', 'dbg-citizens')}
          ${row('Last change', 'dbg-pop-event')}
        </details>

        <details open><summary>Road Network</summary>
          ${row('Road nodes', 'dbg-road-nodes')}
          ${row('Connected villages', 'dbg-road-villages')}
          ${row('Network components', 'dbg-road-components')}
          ${row('Trade routes', 'dbg-road-routes')}
          ${row('Bridges', 'dbg-road-bridges')}
        </details>

        <details open><summary>Kingdom</summary>
          ${row('Current tier', 'dbg-tier')}
          ${row('Upgrade progress', 'dbg-tier-progress')}
          ${row('Next tier reqs', 'dbg-tier-reqs')}
          ${row('Buildings', 'dbg-buildings')}
          ${row('Score', 'dbg-score')}
        </details>

        <details open><summary>Territory</summary>
          ${row('Owned tiles', 'dbg-terr-owned')}
          ${row('Border tiles', 'dbg-terr-border')}
          ${row('Captured tiles', 'dbg-terr-captured')}
          ${row('Reclaim cost', 'dbg-terr-reclaim')}
          ${row('Last event', 'dbg-terr-event')}
        </details>

        <details open><summary>Factions</summary>
          ${row('Faction count', 'dbg-fac-count')}
          ${row('Threat level', 'dbg-fac-threat')}
          ${row('Player defense', 'dbg-fac-defense')}
          <div class="dbg-list" id="dbg-fac-list"></div>
          ${row('Last event', 'dbg-fac-event')}
        </details>

        <details open><summary>AutoMesh</summary>
          ${row('Registered types', 'dbg-am-types')}
          ${row('Propagation queue', 'dbg-am-queue')}
          ${row('Updated tiles', 'dbg-am-updates')}
          ${row('Overlay rebuilds', 'dbg-am-rebuilds')}
          ${row('Flow recomputes', 'dbg-am-flow')}
          ${row('Overlay count', 'dbg-am-overlays')}
        </details>

        <details open><summary>Performance</summary>
          ${row('FPS', 'dbg-fps')}
          ${row('Tile count', 'dbg-tiles')}
          ${row('Draw calls', 'dbg-drawcalls')}
          ${row('Triangles', 'dbg-tris')}
          ${row('Pool instances', 'dbg-pool')}
        </details>

        <details><summary>Debug Overlays</summary>
          <div id="dbg-overlay-toggles"></div>
        </details>

      </div>`;
    document.body.appendChild(root);
    this.root = root;

    this.el = {};
    root.querySelectorAll('[id^="dbg-"]').forEach((n) => { this.el[n.id] = n; });

    root.querySelector('#dbg-close').addEventListener('click', () => this.setVisible(false));

    // overlay toggle checkboxes
    const togglesHost = root.querySelector('#dbg-overlay-toggles');
    for (const def of OVERLAY_DEFS) {
      const label = document.createElement('label');
      label.className = 'dbg-toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => {
        this.game.debugOverlays.setEnabled(def.id, cb.checked);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + def.label));
      togglesHost.appendChild(label);
    }
  }

  _bindEvents() {
    events.on('territory:captured', ({ factionLabel }) => {
      this._lastTerritoryEvent = `captured by ${factionLabel || '?'}`;
    });
    events.on('territory:reclaimed', () => {
      this._lastTerritoryEvent = 'tile reclaimed';
    });
    events.on('faction:raided', ({ faction }) => {
      this._lastFactionEvent = `${faction.icon} ${faction.label} raided!`;
    });
    events.on('faction:tribute', ({ faction, gold }) => {
      this._lastFactionEvent = `${faction.icon} tribute +${gold}g`;
    });
    events.on('resources:spent', ({ label }) => {
      if (label) this._lastResourceEvent = `spent: ${label}`;
    });
    events.on('population:changed', ({ total }) => {
      this._lastPopEvent = `total → ${total}`;
    });
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (v) this._refresh();
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  update(dt) {
    // FPS tracked even while hidden so it's accurate on open
    this._fpsFrames++;
    this._fpsTime += dt;
    if (this._fpsTime >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }
    if (!this.visible) return;
    this._t += dt;
    if (this._t < UPDATE_INTERVAL) return;
    this._t = 0;
    this._refresh();
  }

  _set(id, val) {
    const el = this.el[id];
    if (el && el.textContent !== String(val)) el.textContent = String(val);
  }

  _refresh() {
    const g = this.game;
    const rs = g.resourceSystem;
    const f1 = (n) => Math.round(n * 10) / 10;

    // ---- Resources (ResourceSystem) ----
    const rate = (k) => {
      const v = Math.round((rs.rates[k] || 0) * 100) / 100;
      return `${f1(rs.resources[k] || 0)} (${v >= 0 ? '+' : ''}${v.toFixed(2)}/s)`;
    };
    this._set('dbg-wood', rate('wood'));
    this._set('dbg-stone', rate('stone'));
    this._set('dbg-food', rate('food'));
    this._set('dbg-gold', rate('gold'));
    this._set('dbg-influence', rate('influence'));
    this._set('dbg-stability', f1(rs.stability) + ' / 100');
    this._set('dbg-cap', rs.storageCap);
    this._set('dbg-res-event', this._lastResourceEvent);

    // ---- Population (CitizenSystem) ----
    const cs = g.citizenSystem;
    this._set('dbg-pop', cs.totalPopulation);
    this._set('dbg-villages', cs.villages.size);
    this._set('dbg-citizens', cs.citizens.filter((c) => c.alive).length);
    this._set('dbg-pop-event', this._lastPopEvent);

    // ---- Road Network (RoadSystem) ----
    const road = g.roadSystem;
    this._set('dbg-road-nodes', road.nodes.size);
    this._set('dbg-road-villages', `${road.connectedVillages} / ${road.totalVillages}`);
    this._set('dbg-road-components', road.components.length);
    this._set('dbg-road-routes', road.tradeRoutes.length);
    this._set('dbg-road-bridges', road.bridgeCells.length);

    // ---- Kingdom (ProgressionSystem + ScoringSystem) ----
    const prog = g.progressionSystem;
    this._set('dbg-tier', `${prog.current.icon} ${prog.current.name} (T${prog.tier + 1})`);
    if (prog.upgrading && prog.next) {
      const pct = Math.round((1 - prog.upgradeT / prog.next.upgradeTime) * 100);
      this._set('dbg-tier-progress', `${pct}% (${Math.ceil(prog.upgradeT)}s left)`);
    } else {
      this._set('dbg-tier-progress', prog.maxed ? 'MAX' : 'idle');
    }
    if (prog.next) {
      const chk = prog.canStartUpgrade();
      this._set('dbg-tier-reqs', chk.ok ? '✅ ready' : chk.reason);
    } else {
      this._set('dbg-tier-reqs', '—');
    }
    const b = rs.buildings;
    this._set('dbg-buildings', `🏠${b.house} 🗼${b.tower} 🏰${b.castle} 🌉${b.bridge}`);
    this._set('dbg-score', g.scoring.total);

    // ---- Territory (TerritorySystem) ----
    const terr = g.territorySystem;
    let owned = 0;
    for (const cell of g.grid.cells.values()) {
      if (!cell.owner || cell.owner === 'player') owned++;
    }
    this._set('dbg-terr-owned', owned);
    this._set('dbg-terr-border', terr.playerBorderCells().length);
    this._set('dbg-terr-captured', terr.captured.size);
    this._set('dbg-terr-reclaim', terr.reclaimCost + ' influence');
    this._set('dbg-terr-event', this._lastTerritoryEvent);

    // ---- Factions (FactionSystem) ----
    const fs = g.factionSystem;
    const summary = fs.summary();
    this._set('dbg-fac-count', summary.length);
    let threat = 0;
    for (const f of summary) if (f.hostile) threat += f.strength;
    const defense = Math.round(fs._playerDefense());
    this._set('dbg-fac-threat',
      `${threat} (${threat > defense * 1.5 ? '🔴 high' : threat > defense * 0.8 ? '🟡 medium' : '🟢 low'})`);
    this._set('dbg-fac-defense', defense);
    const list = this.el['dbg-fac-list'];
    if (list) {
      list.innerHTML = summary.map((f) =>
        `<div class="dbg-row dbg-sub"><span>${f.icon} ${f.label}${f.hostile ? ' ⚔' : ' ☮'}</span>` +
        `<b>str ${f.strength} · ${f.territory} hex</b></div>`
      ).join('');
    }
    this._set('dbg-fac-event', this._lastFactionEvent);

    // ---- AutoMesh (AutoMeshSystem) ----
    const am = g.autoMesh;
    this._set('dbg-am-types', am.registry.all().map((t) => t.typeId).join(', ') || '—');
    this._set('dbg-am-queue', am.queue.pendingCount +
      ` (enq ${am.queue.stats.enqueued}, dedup ${am.queue.stats.deduped})`);
    this._set('dbg-am-updates', am.stats.updates);
    this._set('dbg-am-rebuilds', am.stats.rebuilds);
    this._set('dbg-am-flow', am.stats.flowRecomputes);
    let overlays = 0;
    for (const cell of g.grid.cells.values()) {
      if (!cell.autoMesh) continue;
      for (const entry of Object.values(cell.autoMesh)) {
        if (entry && entry.handle) overlays++;
      }
    }
    this._set('dbg-am-overlays', overlays);

    // ---- Performance ----
    this._set('dbg-fps', this._fps);
    this._set('dbg-tiles', g.grid.size);
    const info = g.renderer.info.render;
    this._set('dbg-drawcalls', info.calls);
    this._set('dbg-tris', info.triangles.toLocaleString());
    this._set('dbg-pool', g.pool.count());
  }
}
