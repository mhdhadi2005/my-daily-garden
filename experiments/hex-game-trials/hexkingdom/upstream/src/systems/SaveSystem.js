// ============================================================
// SaveSystem — LocalStorage persistence.
// Saves grid layout, score, tile counter, RNG stream position
// and elapsed evolution time per cell so the world restores
// mid-growth on reload.
// ============================================================

const KEY = 'kingdom-tiles-save-v2';
const VERSION = 3;

export class SaveSystem {
  constructor() {
    this.enabled = this._probe();
  }

  _probe() {
    try {
      localStorage.setItem('__kt_test', '1');
      localStorage.removeItem('__kt_test');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param game exposes grid, scoring, tilesPlaced, drawSeedState, nextTile
   */
  save(game) {
    if (!this.enabled) return;
    try {
      const cells = [];
      for (const c of game.grid.cells.values()) {
        cells.push({
          q: c.q, r: c.r,
          t: c.tileType,
          v: c.variant,
          rot: c.rotation,
          seed: c.seed,
          age: c.evo ? Math.round(c.evo.elapsed * 10) / 10 : 0,
          river: c.riverEdges?.length ? [...c.riverEdges] : undefined,
          road: c.roadEdges?.length ? [...c.roadEdges] : undefined,
          owner: c.owner && c.owner !== 'player' ? c.owner : undefined,
        });
      }
      const data = {
        version: VERSION,
        score: game.scoring.total,
        tilesPlaced: game.tilesPlaced,
        drawCount: game.drawCount,
        worldSeed: game.worldSeed,
        next: game.nextTile ? { type: game.nextTile.type, variant: game.nextTile.variant } : null,
        cells,
        resources: game.resourceSystem ? game.resourceSystem.serialize() : null,
        citizens: game.citizenSystem ? game.citizenSystem.serialize() : null,
        progression: game.progressionSystem ? game.progressionSystem.serialize() : null,
        territory: game.territorySystem ? game.territorySystem.serialize() : null,
        factions: game.factionSystem ? game.factionSystem.serialize() : null,
        buildings: game.buildingSystem ? game.buildingSystem.serialize() : null,
        research: game.researchSystem ? game.researchSystem.serialize() : null,
        army: game.armySystem ? game.armySystem.serialize() : null,
        savedAt: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[SaveSystem] save failed:', e);
    }
  }

  load() {
    if (!this.enabled) return null;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== VERSION && data.version !== 2) return null;
      if (!Array.isArray(data.cells)) return null;
      return data;
    } catch (e) {
      console.warn('[SaveSystem] load failed:', e);
      return null;
    }
  }

  clear() {
    if (!this.enabled) return;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}
