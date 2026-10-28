// ============================================================
// Tooltip — single shared hover tooltip for all HUD elements.
// Any element with a `data-tip` attribute (set statically or
// refreshed dynamically) gets a styled tooltip near the cursor.
// One document-level listener pair — no per-element handlers.
// ============================================================

let el = null;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'ui-tooltip';
  el.className = 'hidden';
  document.body.appendChild(el);
  return el;
}

export function initTooltip() {
  const tip = ensure();

  document.addEventListener('pointerover', (e) => {
    const host = e.target.closest && e.target.closest('[data-tip]');
    if (!host) return;
    const text = host.getAttribute('data-tip');
    if (!text) return;
    tip.innerHTML = text;
    tip.classList.remove('hidden');
    positionTip(tip, e.clientX, e.clientY);
  });

  document.addEventListener('pointermove', (e) => {
    if (tip.classList.contains('hidden')) return;
    const host = e.target.closest && e.target.closest('[data-tip]');
    if (!host) { tip.classList.add('hidden'); return; }
    positionTip(tip, e.clientX, e.clientY);
  });

  document.addEventListener('pointerout', (e) => {
    const host = e.target.closest && e.target.closest('[data-tip]');
    if (host) tip.classList.add('hidden');
  });
}

function positionTip(tip, x, y) {
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let px = x + pad, py = y + pad;
  if (px + r.width > window.innerWidth - 8) px = x - r.width - pad;
  if (py + r.height > window.innerHeight - 8) py = y - r.height - pad;
  tip.style.left = px + 'px';
  tip.style.top = py + 'px';
}
