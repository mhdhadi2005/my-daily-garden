// ============================================================
// GameIcons — medieval SVG pictograms matching the parchment UI.
// Config `icon` fields reference keys from this map.
// ============================================================

/** @type {Record<string, string>} SVG inner markup (viewBox 0 0 24 24) */
const SVG = {
  wood: '<path d="M4 18h16v2H4zm2-4h3v3H6zm5 0h3v3h-3zm5 0h3v3h-3zM5 8h14l-1 6H6zM8 4h8l2 4H6z"/>',
  stone: '<path d="M12 3L4 9v12h16V9zm0 2.2l5.5 4.4H6.5zM8 13h2v5H8zm6 0h2v5h-2z"/>',
  food: '<path d="M12 3c-2 4-6 5-6 10a6 6 0 1012 0c0-5-4-6-6-10zm0 14a4 4 0 110-8 4 4 0 010 8z"/>',
  gold: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  influence: '<path d="M5 18l2-8h10l2 8H5zm3-10l2-4h4l2 4H8zM9 20h6v2H9z"/>',
  population: '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="10" r="2.5"/><path d="M4 20c0-3 2.2-5 5-5s5 2 5 5M13 20c0-2 1.5-3.5 3.5-3.5S20 18 20 20"/>',
  stability: '<path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4zm0 3.5L7 9.5v3.5c0 3.5 2.2 6 5 6.4 2.8-.4 5-2.9 5-6.4V9.5l-5-3z"/>',
  storage: '<path d="M4 8h16v12H4zm2-5h12l2 5H4zm4 7h4v3H8z"/>',

  settlement: '<path d="M6 20V10l6-5 6 5v10H6zm2-2h8v-6l-4-3.2L8 12v6z"/>',
  village_tier: '<path d="M4 20h16v2H4zm3-4h2v4H7zm4 0h2v4h-2zm4 0h2v4h-2zM8 8h8v8H8zm1-4h6l2 4H7z"/>',
  town: '<path d="M3 20h18v2H3zm2-3h3v3H5zm5 0h3v3h-3zm5 0h3v3h-3zM7 7h3v10H7zm7 0h3v10h-3zM10 4h4l2 3h-8z"/>',
  city: '<path d="M4 20h16v2H4zm2-4h3v4H6zm5 0h3v4h-3zm5 0h3v4h-3zM5 9h4v7H5zm5 0h4v7h-4zm5 0h4v7h-4zM8 5h8l2 4H6z"/>',
  kingdom: '<path d="M5 18l2-7h10l2 7H5zm2-9l2-5h6l2 5H7zM8 20h8v2H8z"/><circle cx="12" cy="12" r="1.5"/>',
  castle: '<path d="M5 20V9l3-2v3l2-2 2 2V7l2 2v3l2-2 2 2v11H5zm2-2h10v-7l-1.5-1-1.5 1.5-2-2-2 2-1.5-1.5L7 11v7z"/>',
  bridge: '<path d="M3 16h18v2H3zm2-4c2 0 3-2 4-4 1 2 2 4 4 4s3-2 4-4c1 2 2 4 4 4v2H5v-2z"/>',

  farm: '<path d="M4 20h16v2H4zm2-4h12v2H6zm1-6h4l1 4H7zm6 0h4l1 4h-5zM10 4h4l2 4H8z"/>',
  lumber_mill: '<path d="M4 18h16v2H4zM7 8h10v8H7zm2-4h6l1 4H8zM10 10h4v4h-4z"/><path d="M5 12h2M17 12h2" stroke="currentColor" stroke-width="1.5"/>',
  mine: '<path d="M8 20l4-14 4 14H8zm-2 2h12v2H6zM10 12h4" stroke="currentColor" stroke-width="1.5"/>',
  market: '<path d="M4 10h16l-2 10H6L4 10zm2-6h12l2 4H4zM9 14h6v3H9z"/>',
  watchtower: '<path d="M9 20V8h6v12H9zm1-6h4v2h-4zm1-8h2v4h-2zM6 20h12v2H6z"/>',
  road: '<path d="M4 18h16v2H4zM11 4h2v12h-2zM8 8h8v2H8zm0 4h8v2H8z"/>',
  trade_post: '<path d="M11 4h2v16h-2zM6 20h12v2H6zM13 6h7l-2 2.5L20 11h-7zM11 11H5l1.6 2L5 15h6z"/>',
  garrison: '<circle cx="12" cy="6" r="2.5"/><path d="M8 20v-6a4 4 0 018 0v6H8zM17 8v8l-1.5-1V9z"/><path d="M6 9l2 2-2 2-2-2z"/>',
  archer_tower: '<path d="M8 20V9h8v11H8zm3-7h2v3h-2zM6 6h3v3H6zm9 0h3v3h-3zm-4.5 0h3v3h-3zM6 20h12v2H6z"/>',
  ballista_tower: '<path d="M9 20v-9h6v9H9zM7 8h10v3H7z"/><path d="M12 2v6M9 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 20h12v2H6z"/>',
  gate: '<path d="M4 20V8h4v12H4zm12 0V8h4v12h-4zM8 8h8v3H8zm2 4h4v8h-4zM6 5h3v3H6zm9 0h3v3h-3z"/>',
  bastion: '<path d="M7 20V8h10v12H7zm3-6h4v3h-4zM6 5h3v3H6zm9 0h3v3h-3zm-4.5 0h3v3h-3zM5 20h14v2H5z"/>',
  siege_camp: '<path d="M4 18h16v2H4z"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><path d="M7 14L17 5M15 4l3-1-1 3z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  warfare: '<path d="M5 3l6 6-2 2-6-6zm14 0l-6 6 2 2 6-6zM9 13l-4 4 2 2 4-4zm6 0l4 4-2 2-4-4z"/><circle cx="12" cy="11" r="2"/>',
  apiary: '<path d="M12 4c-3.5 0-5 1.6-5 3h10c0-1.4-1.5-3-5-3zM6.5 9h11l-.7 3h-9.6zM7.5 14h9l-.7 3H8.2zM9 19h6v2H9z"/>',
  fishing_pier: '<path d="M3 12h18v2H3zm2 2h2v6H5zm12 0h2v6h-2zM9 14h2v4H9z"/><path d="M14 17c1.5 0 2.5 1 4 1l-1.5-2L18 14c-1.5 0-2.5 1-4 1z"/>',
  bakery: '<path d="M5 20V10l7-5 7 5v10H5z"/><ellipse cx="12" cy="14" rx="4" ry="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 14h4" stroke="currentColor" stroke-width="1.4"/>',
  sawmill: '<circle cx="9" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8v10M4 13h10M6 9.5l6 7M6 16.5l6-7" stroke="currentColor" stroke-width="1.2"/><path d="M15 16h6v4h-6z"/>',
  forge: '<path d="M6 12h9l3-2v3l-2 2h-4v3H8v-3H6zM5 20h14v2H5z"/><path d="M9 4c0 2-2 2-2 4h4c0-2-2-2-2-4z"/>',
  stable: '<path d="M4 20V9l8-5 8 5v11h-5v-6H9v6H4z"/><path d="M11 16h2v4h-2z"/>',
  barracks: '<path d="M4 20V9h16v11h-6v-5h-4v5H4zM4 9l2-4h12l2 4z"/><path d="M7 12h2v2H7zm8 0h2v2h-2z"/>',
  temple: '<path d="M8 20V9h8v11H8zm3-6h2v6h-2zM12 2v5M10 4h4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 9l4-4 4 4zM5 20h14v2H5z"/>',
  port: '<path d="M12 3a2 2 0 100 4 2 2 0 000-4zM11 7h2v9h-2z"/><path d="M5 12c0 5 3 8 7 8s7-3 7-8h-3c0 3-1.5 5-4 5s-4-2-4-5H5z"/>',
  university: '<path d="M12 3L2 8l10 5 10-5zM5 11v5c0 2 3 4 7 4s7-2 7-4v-5l-7 3.5z"/>',
  observatory: '<path d="M12 4a7 7 0 00-7 7h14a7 7 0 00-7-7z"/><path d="M13 5l6-3 1 2-6 3z"/><path d="M4 13h16v2H4zm3 2h10v5H7z"/>',
  library: '<path d="M4 5h6a2 2 0 012 2 2 2 0 012-2h6v13h-6a2 2 0 00-2 2 2 2 0 00-2-2H4zM6 8h4M6 11h4M14 8h4M14 11h4" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  unit_bow: '<path d="M7 4c5 2 5 12 0 14l-1.5-1.5C9 14 9 8 5.5 5.5z"/><path d="M7 12h10M15 9l3 3-3 3" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  unit_knight: '<path d="M9 3h6v6a3 3 0 01-6 0zM10 5v3M14 5v3" stroke="currentColor" stroke-width="1.2"/><path d="M8 20v-6a4 4 0 018 0v6H8z"/><path d="M17 4l3 3-2 2-3-3z"/>',
  crop_rotation: '<path d="M12 4a8 8 0 018 8h-3l4 4 3-4h-2A10 10 0 0012 2zM12 20a8 8 0 01-8-8h3L3 8 0 12h2a10 10 0 0010 10z" transform="scale(0.9) translate(1.5 1)"/>',
  iron_tools: '<path d="M4 8h9v4H4zM13 6h3v8h-3z"/><path d="M8 12v8h2v-8z"/><path d="M17 5l4 4-2 2-4-4z"/>',
  crossbows: '<path d="M12 3c-4 0-7 3-7 7l2 .5C7.5 7 9.5 5.5 12 5.5S16.5 7 17 10.5l2-.5c0-4-3-7-7-7z"/><path d="M11 6h2v12h-2zM8 18h8v2H8z"/>',
  upgrade: '<path d="M12 4l6 6h-4v10h-4V10H6z"/>',
  build: '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.5"/>',

  agriculture: '<path d="M12 4c-3 5-8 6-8 11a8 8 0 1016 0c0-5-5-6-8-11z"/>',
  mining: '<path d="M8 20l4-12 4 12H8zM6 22h12v-1H6z"/>',
  engineering: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="1.5"/>',
  trade: '<path d="M4 8h16l-2 10H6L4 8zm2-5h12l2 5H6z"/><path d="M8 14h8" stroke="currentColor" stroke-width="1.5"/>',
  military: '<path d="M12 3l2 5h5l-4 3 1.5 5L12 13l-4.5 3 1.5-5-4-3h5z"/><path d="M6 20h12v2H6z"/>',
  research: '<path d="M8 4h8v2a4 4 0 01-4 4 4 4 0 01-4-4V4zm4 8v8M10 18h4" stroke="currentColor" stroke-width="1.5"/>',

  friendly: '<path d="M8 11a4 4 0 118 0v1H8v-1zM6 14h12v6H6z"/>',
  neutral: '<path d="M6 18h12v4H6zM8 8h8v8H8zM10 4h4v4h-4z"/>',
  hostile: '<path d="M6 20l3-12h6l3 12H6zm4-14h4l1 4h-6z"/><path d="M10 10h4" stroke="currentColor" stroke-width="2"/>',
  barbarian: '<path d="M7 20V10l5-4 5 4v10H7zm2-2h6v-6l-3-2.4L9 12v6z"/><path d="M10 6h4" stroke="currentColor" stroke-width="2"/>',
  bandit: '<path d="M5 18h14v2H5zM8 8h8l1 8H7zM10 4h4l1 4h-6z"/>',

  caravan: '<path d="M3 14h12v6H3zm12-4h6v10h-6zM5 12h8l2-4H5z"/><circle cx="7" cy="20" r="2"/><circle cx="17" cy="20" r="2"/>',
  raid: '<path d="M12 2l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z"/>',
  famine: '<path d="M12 4c-2 4-6 5-6 10h12c0-5-4-6-6-10zM6 16h12v4H6z"/>',
  prosperity: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M4 12h3M17 12h3" stroke="currentColor" stroke-width="1.5"/>',
  migration: '<path d="M4 18h16v2H4zM8 8h8v8H8zm2-4h4v4h-4z"/><path d="M16 12h4M4 12H8" stroke="currentColor" stroke-width="1.5"/>',

  map: '<path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2V6z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  borders: '<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>',
  reclaim: '<path d="M12 3v6M9 6l3-3 3 3"/><path d="M5 12a7 7 0 1012.1 4.6" fill="none" stroke="currentColor" stroke-width="2"/>',
  gift: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M12 10V20M5 10h14M12 6c-2 0-3 1-3 2.5S10 10 12 10s3-.5 3-2.5S14 6 12 6z"/>',
  flag: '<path d="M6 20V4h2v16H6zM8 6h10l-2 3 2 3H8z"/>',
  sword: '<path d="M4 20l8-8M14 6l4-4M10 10l8 8M16 4l4 4" stroke="currentColor" stroke-width="2" fill="none"/>',

  forest: '<path d="M12 3L6 14h4l-1 7h6l-1-7h4z"/>',
  field: '<path d="M4 20h16v2H4zM6 10h12v8H6z"/><path d="M8 6h2v4H8zm6 0h2v4h-2z"/>',
  river: '<path d="M4 18c4-8 8-8 12 0s8 0 12 0" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  mountain: '<path d="M4 20h16L12 4 4 20zm4-4h8l-4-7-4 7z"/>',
  village: '<path d="M4 20h16v2H4zm2-4h4v4H6zm4 0h4v4h-4zm4 0h4v4h-4zM9 8h6v8H9zm1-5h4l2 4H8z"/>',
  meadow: '<path d="M4 18h16v2H4z"/><ellipse cx="12" cy="14" rx="8" ry="4"/><path d="M8 10c2 2 6 2 8 0" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  hills: '<path d="M3 18c3-6 6-6 9 0s6 0 9 0" fill="none" stroke="currentColor" stroke-width="2"/>',
  lake: '<ellipse cx="12" cy="14" rx="9" ry="5"/><path d="M6 14c2-2 4-2 6 0s4 0 6 0" fill="none" stroke="currentColor" stroke-width="1"/>',
  quarry: '<path d="M5 18h14l-2-8H7zM8 20h8v2H8z"/><path d="M10 8h4" stroke="currentColor" stroke-width="2"/>',
  swamp: '<path d="M4 18h16v2H4z"/><ellipse cx="12" cy="14" rx="7" ry="3"/><path d="M8 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  ruins: '<path d="M6 20V12l3-2v2l3-3 3 3v-2l3 2v8H6z"/>',
};

const TILE_KEYS = new Set(['forest', 'field', 'river', 'mountain', 'village', 'meadow', 'hills', 'lake', 'quarry', 'swamp', 'ruins']);

/** @type {Record<string, string>} */
export const GAME_ICONS = Object.fromEntries(
  Object.keys(SVG).map((k) => [k, { svg: k }]),
);

export function iconSvg(key) {
  const path = SVG[key] || SVG.build;
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg>`;
}

/** Plain label for toasts. */
export function iconLabel(key) {
  if (TILE_KEYS.has(key)) return key.charAt(0).toUpperCase() + key.slice(1);
  const labels = {
    wood: 'Wood', stone: 'Stone', food: 'Food', gold: 'Gold', influence: 'Influence',
    village_tier: 'Village', prosperity: 'Prosperity', lumber_mill: 'Mill',
  };
  return labels[key] || key.replace(/_/g, ' ');
}

/**
 * Inline icon for HUD / menus.
 * @param {string} key
 * @param {'sm'|'md'|'lg'} [size]
 */
export function iconHtml(key, size = 'sm') {
  const k = SVG[key] ? key : (TILE_KEYS.has(key) ? key : 'build');
  return `<span class="ico ico--${size} ico-${k}" aria-hidden="true">${iconSvg(k)}</span>`;
}

export function withIcon(key, text) {
  return `${iconHtml(key, 'sm')} ${text}`;
}

/** Tile shop swatch color helper — uses tile preview hex when available. */
export function tileIconHtml(type, previewColor) {
  const inner = SVG[type] ? iconSvg(type) : '';
  const style = previewColor ? ` style="--swatch:${previewColor}"` : '';
  return `<span class="ico ico--tile ico-tile${style}" aria-hidden="true">${inner}</span>`;
}
