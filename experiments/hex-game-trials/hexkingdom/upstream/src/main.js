// ============================================================
// main.js — bootstrap: loading screen, game creation, start.
// ============================================================
import { Game } from './core/Game.js';
import { initTooltip } from './ui/Tooltip.js';

function boot() {
  initTooltip();
  const canvas = document.getElementById('game-canvas');
  const fill = document.getElementById('loading-fill');

  // fake-but-honest progress: asset build is synchronous & fast,
  // so we animate the bar across the actual init steps.
  fill.style.width = '30%';

  requestAnimationFrame(() => {
    fill.style.width = '65%';
    let game;
    try {
      game = new Game(canvas);
    } catch (err) {
      console.error('[KingdomTiles] fatal init error:', err);
      const inner = document.getElementById('loading-inner');
      if (inner) {
        inner.innerHTML =
          '<h1>Hexkingdom</h1><p style="color:#e08a7a">Failed to start: ' +
          String(err && err.message ? err.message : err) +
          '</p>';
      }
      return;
    }
    fill.style.width = '100%';
    game.start();
    setTimeout(() => game.ui.hideLoading(), 350);

    // expose for debugging / headless tests
    window.__game = game;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
