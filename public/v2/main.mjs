import { loadGarden, markGardenViewed, recoverGardenLink } from './garden-data.mjs';
import { mountDesignMode } from './design-mode.mjs';
import { renderShareCard, shareOrDownloadCard } from './share.mjs';

const $ = selector => document.querySelector(selector);
const result = await loadGarden();
$('#retry-access').addEventListener('click', () => location.reload());
$('#recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#recovery-email').value.trim();
  const button = $('#recovery-form button');
  button.disabled = true;
  $('#recovery-status').textContent = 'Checking link recovery…';
  try {
    const status = await recoverGardenLink(email);
    $('#recovery-status').textContent = status === 202
      ? 'If this address has a garden, a fresh link will arrive by email.'
      : status === 400 ? 'Please enter a valid email address.'
      : status === 503 ? 'Fresh links are not available yet. Please try again later.'
      : 'We could not request a link right now. Please try again.';
  } catch {
    $('#recovery-status').textContent = 'We could not request a link right now. Please try again.';
  } finally { button.disabled = false; }
});

if (result.kind !== 'garden') {
  $('#access-heading').textContent = result.kind === 'error' ? 'Your forest is unavailable' : 'Open your private forest';
  $('#access-message').textContent = result.kind === 'error'
    ? 'We could not load your forest. Please try again.'
    : result.reason === 'invalid_link'
      ? 'This private link has expired or was already used. Request a fresh link.'
      : 'Open your forest from your 10almonds email, or request a fresh private link.';
  $('#recovery-form').hidden = result.kind === 'error';
  $('#retry-access').hidden = result.kind !== 'error';
} else {
$('#access-panel').hidden = true;
$('#garden-content').hidden = false;
$('#sample-label').hidden = !result.sample;
$('#footer-note').textContent = result.sample ? 'Example data. Nothing is saved.' : 'Your garden is private.';
const garden = result.garden;
const currentTreeCount = garden.trees.length;
const previousTreeCount = garden.previousVisit?.treeCount ?? currentTreeCount;
const number = value => value.toLocaleString('en');
const metric = value => Number.isSafeInteger(value) ? number(value) : '—';
const ordinal = count => `${count}${count % 100 >= 11 && count % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[count % 10] || 'th')}`;
const reward = count => {
  const extra = { 1: ' and meadow', 2: ' and wildflowers', 3: ' and a forest friend', 4: ' and pond', 5: ' and a decoration', 6: ' and woodland' }[count]
    || (count > 6 && count % 3 === 0 ? ' and a decoration choice' : '');
  return `Your ${count === 1 ? 'first' : ordinal(count)} almond tree${extra}`;
};

let forest, forestFactory, replayFrame, introTimer, selected = -1, viewAcknowledged = false;
const designMode = await mountDesignMode({
  host: $('.forest'), garden, sample: result.sample,
  sampleChoice: new URLSearchParams(location.search).get('sample') === 'choice',
  onSaved: applyDesign,
  onChoiceComplete: () => { readyForInteraction(); acknowledgeView(); },
});
if (designMode.design) applyDesign(designMode.design);
const areaOptions = $('#area').options;
for (const option of areaOptions) {
  if (option.value !== 'all') option.disabled = !designMode.areas?.includes(option.value);
}
$('#design-entry').addEventListener('click', () => designMode.open?.());
$('#design-tree').addEventListener('click', () => designMode.openTree?.(garden.trees[selected]?.id));
$('#features-pending').textContent = designMode.error
  ? 'Garden design is unavailable right now.'
  : result.sample ? 'Example forest. Design changes stay on this page.'
  : 'Sharing will open when newsletter totals are verified.';
$('#share-entry').addEventListener('click', async () => {
  const button = $('#share-entry');
  button.disabled = true;
  $('#features-pending').textContent = 'Preparing your example forest image…';
  try {
    const forestImage = await captureForest();
    const card = await renderShareCard({
      mode: 'sample', forestImage, subscriberSinceYear: 2022,
      opens: garden.stats.opens, clicks: garden.stats.clicks, trees: garden.trees.length,
      latestMilestone: garden.trees.length >= 6 ? 'Woodland unlocked' : garden.trees.length ? `Tree ${garden.trees.length} grown` : 'Almond seed planted',
      coverage: { opensFromYear: 2022, clicksFromYear: 2022, opensComplete: true, clicksComplete: true },
    });
    await shareOrDownloadCard(card);
    $('#features-pending').textContent = 'Example image ready to save. It is marked EXAMPLE ONLY.';
  } catch (error) {
    $('#features-pending').textContent = 'The example image could not be saved. Please try again.';
    console.warn('Share preview failed.', error);
  } finally { button.disabled = false; }
});

function readyForInteraction() {
  $('#design-entry').disabled = !!designMode.error;
  $('#design-tree').disabled = !!designMode.error;
  $('#share-entry').disabled = !result.sample || !!designMode.requiredChoices?.length;
}

function acknowledgeView() {
  if (result.sample || designMode.error || designMode.requiredChoices?.length || viewAcknowledged) return;
  viewAcknowledged = true;
  markGardenViewed(garden).catch(() => { viewAcknowledged = false; });
}

function applyDesign(saved) {
  garden.palette = saved.palette;
  garden.resident = saved.resident;
  garden.decorations = saved.decorations;
  const positions = new Map(saved.trees.map(tree => [tree.id, tree.position]));
  for (const tree of garden.trees) {
    tree.position = positions.get(tree.id) || tree.position;
    tree.palette = saved.palette;
  }
  if ($('#still-trees')) $('#still-trees').innerHTML = garden.trees.map(makeStillTree).join('');
  if (forestFactory) {
    forest?.dispose();
    forest = forestFactory($('#scene'), garden, selectTree);
    forest.setArea($('#area').value);
  }
}

async function captureForest() {
  if (forest) return forest.capture();
  const svg = $('#scene .still-forest');
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 880; canvas.height = 360;
  canvas.getContext('2d').drawImage(image, 0, 0, 880, 360);
  return canvas.toDataURL('image/png');
}

function makeStillTree(tree, index) {
  const x = Number.isFinite(tree.position?.[0]) ? Math.max(-4.5, Math.min(4.5, tree.position[0])) : 0;
  const z = Number.isFinite(tree.position?.[1]) ? Math.max(-3, Math.min(3, tree.position[1])) : 0;
  const sx = 440 + x * 55;
  const sy = 213 + z * 16;
  const foliage = ['#789466', '#698d79', '#899b64'][index % 3];
  const bloom = { cream: '#fff0df', rose: '#f5c2c7', apricot: '#f3c49d' }[tree.palette] || ['#fff0df', '#f5c2c7', '#f3c49d'][index % 3];
  return `<g data-still-tree="${index}" transform="translate(${sx} ${sy})"><path d="M0 55 L1 -20 M1 9 L-27 -26 M2 -2 L31 -40" fill="none" stroke="#80624c" stroke-width="12" stroke-linecap="round"/><ellipse cx="-28" cy="-34" rx="38" ry="29" fill="${foliage}"/><ellipse cx="7" cy="-54" rx="45" ry="37" fill="${foliage}"/><ellipse cx="35" cy="-42" rx="37" ry="27" fill="${foliage}"/><circle cx="-42" cy="-39" r="5" fill="${bloom}"/><circle cx="-3" cy="-73" r="6" fill="${bloom}"/><circle cx="25" cy="-57" r="5" fill="${bloom}"/><circle cx="48" cy="-31" r="5" fill="${bloom}"/></g>`;
}

$('#still-trees').innerHTML = garden.trees.map(makeStillTree).join('');
$('#still-seed').toggleAttribute('hidden', currentTreeCount !== 0);
$('#collection').hidden = currentTreeCount === 0;
$('#area').disabled = currentTreeCount === 0;
$('#area').closest('.area-row').hidden = currentTreeCount === 0;
garden.trees.forEach((tree, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tree = index;
  button.setAttribute('aria-pressed', 'false');
  button.append(`Tree ${tree.number}`);
  $('#tree-list').append(button);
});
for (const [id, value] of [['opens', garden.stats.opens], ['clicks', garden.stats.clicks], ['best', garden.stats.bestStreak]]) {
  const element = $(`#stat-${id}`);
  element.textContent = metric(value);
  if (value === null) element.setAttribute('aria-label', 'Unavailable');
}
if (!result.sample) {
  const coverage = garden.stats.coverage;
  const asOf = coverage?.asOfDay;
  const failed = coverage?.lastReportStatus === 'failed';
  $('#stats-note').textContent = garden.stats.opens === null && garden.stats.clicks === null
    ? 'Newsletter totals and click streaks are unavailable until a verified update.'
    : `Newsletter totals as of ${asOf || 'the latest update'}. Earlier coverage is unverified.${failed ? ' The latest update failed, so these figures may be behind.' : ''}`;
  $('#stats-note').hidden = false;
}

function setVisibleTrees(count) {
  document.querySelectorAll('[data-still-tree]').forEach((tree, index) => tree.toggleAttribute('hidden', index >= count));
  document.querySelectorAll('[data-tree]').forEach((button, index) => { button.hidden = index >= count; });
  forest?.setVisibleTrees(count);
}

function showProgress(points, treeCount, final = false) {
  $('#stat-points').textContent = number(points);
  $('#stat-trees').textContent = number(treeCount);
  $('#stat-streak').textContent = metric(garden.stats.currentStreak);
  if (garden.stats.currentStreak === null) $('#stat-streak').setAttribute('aria-label', 'Unavailable');
  const next = treeCount + 1;
  const floor = treeCount ? garden.trees[treeCount - 1].threshold : 0;
  const limit = final ? garden.nextTree.threshold : (garden.trees[treeCount]?.threshold ?? garden.nextTree.threshold);
  const needed = final ? garden.nextTree.pointsNeeded : Math.max(0, limit - points);
  const earned = Math.max(0, Math.min(limit - floor, points - floor));
  $('#next-reward').textContent = reward(next);
  $('#points-left').textContent = `${number(needed)} points to grow it`;
  const progress = $('#progress');
  progress.setAttribute('aria-valuemax', String(limit - floor));
  progress.setAttribute('aria-valuenow', String(earned));
  progress.setAttribute('aria-valuetext', `${number(needed)} points to grow the next almond tree`);
  $('#progress-fill').style.width = `${100 * earned / (limit - floor)}%`;
  setVisibleTrees(treeCount);
}

function selectTree(index) {
  if (index < 0 || index >= currentTreeCount) return;
  selected = index;
  const tree = garden.trees[index];
  document.querySelectorAll('[data-tree]').forEach((button, item) => button.setAttribute('aria-pressed', String(item === index)));
  $('#tree-title').textContent = `Tree ${tree.number}`;
  const earned = tree.earnedAt && /\d{4}/.test(tree.earnedAt) && !Number.isNaN(Date.parse(tree.earnedAt))
    ? new Date(tree.earnedAt).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : tree.earnedAt || 'date unavailable';
  $('#tree-copy').textContent = `${tree.family} almond${tree.palette ? ` · ${tree.palette} blossom` : ''} · Grown ${earned}`;
  $('#tree-detail').hidden = false;
  forest?.focusTree(index);
  document.querySelectorAll('[data-still-tree]').forEach((item, number) => item.toggleAttribute('data-selected', number === index));
  $('#tree-detail').focus();
}

$('#tree-list').addEventListener('click', event => {
  const button = event.target.closest('[data-tree]');
  if (button) selectTree(Number(button.dataset.tree));
});
$('#close-tree').addEventListener('click', () => {
  $('#tree-detail').hidden = true;
  forest?.setArea($('#area').value);
  document.querySelector(`[data-tree="${selected}"]`)?.focus();
  selected = -1;
  document.querySelectorAll('[data-tree]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll('[data-still-tree]').forEach(item => item.removeAttribute('data-selected'));
});
function setStillArea(area) {
  const views = { all: '0 0 880 360', meadow: '70 0 490 360', pond: '195 0 490 360', woodland: '320 0 490 360' };
  $('#scene .still-forest').setAttribute('viewBox', views[area] || views.all);
  $('#scene .still-forest').setAttribute('aria-label', area === 'all' ? 'Illustration of your almond forest' : `Illustration of your ${area} area`);
}
$('#area').addEventListener('change', event => {
  forest?.setArea(event.target.value);
  setStillArea(event.target.value);
});

function finishReplay() {
  cancelAnimationFrame(replayFrame);
  clearTimeout(introTimer);
  $('#replay').hidden = true;
  showProgress(garden.points, currentTreeCount, true);
  forest?.setTreeScale(currentTreeCount - 1, 1);
  readyForInteraction();
  if (!designMode.showRequiredChoices?.()) acknowledgeView();
}

function replayGrowth() {
  if (!garden.previousVisit && currentTreeCount > 0) {
    $('#replay strong').textContent = 'Welcome to your forest';
    $('#replay-copy').textContent = designMode.design?.foundingAward
      ? `Your earlier newsletter activity has grown ${number(currentTreeCount)} almond ${currentTreeCount === 1 ? 'tree' : 'trees'}.`
      : `Your forest has ${number(currentTreeCount)} almond ${currentTreeCount === 1 ? 'tree' : 'trees'}.`;
    $('#skip-replay').hidden = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('#still-note').textContent = $('#replay-copy').textContent;
      $('#still-note').hidden = false;
      finishReplay();
      return;
    }
    $('#replay').hidden = false;
    introTimer = setTimeout(finishReplay, 1800);
    return;
  }
  if (!garden.previousVisit || garden.points <= garden.previousVisit.points) {
    showProgress(garden.points, currentTreeCount, true);
    readyForInteraction();
    if (!designMode.showRequiredChoices?.()) acknowledgeView();
    return;
  }
  const gained = garden.points - garden.previousVisit.points;
  const newTrees = currentTreeCount - previousTreeCount;
  $('#replay-copy').textContent = `+${number(gained)} points${newTrees ? ` · ${newTrees} new almond ${newTrees === 1 ? 'tree' : 'trees'}` : ''}`;
  $('#skip-replay').hidden = !!designMode.requiredChoices?.length;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishReplay();
    $('#still-note').textContent = `Since your last visit: +${number(gained)} points${newTrees ? ` and ${newTrees} new almond ${newTrees === 1 ? 'tree' : 'trees'}` : ''}.`;
    $('#still-note').hidden = false;
    return;
  }
  $('#replay').hidden = false;
  showProgress(garden.previousVisit.points, previousTreeCount);
  const started = performance.now();
  function frame(now) {
    const part = Math.min(1, (now - started) / 2400);
    const points = Math.round(garden.previousVisit.points + gained * part);
    const count = garden.trees.filter(tree => tree.threshold <= points).length;
    showProgress(points, count);
    if (count > previousTreeCount) forest?.setTreeScale(count - 1, Math.max(.05, Math.min(1, (points - garden.trees[count - 1].threshold) / 30)));
    replayFrame = part < 1 ? requestAnimationFrame(frame) : null;
    if (part === 1) finishReplay();
  }
  replayFrame = requestAnimationFrame(frame);
}

$('#skip-replay').addEventListener('click', finishReplay);

showProgress(garden.previousVisit?.points ?? garden.points, previousTreeCount);
if (new URLSearchParams(location.search).get('still') === '1') {
  $('#still-note').hidden = false;
  $('#still-note').textContent = currentTreeCount ? 'Still view of your forest. You can explore every tree below.' : 'Still view of your planted almond seed.';
} else {
  try {
    const { mountForest } = await import('./forest.mjs');
    forestFactory = mountForest;
    forest = forestFactory($('#scene'), garden, selectTree);
    forest.setVisibleTrees(previousTreeCount);
    $('#scene .still-forest').setAttribute('hidden', '');
  } catch (error) {
    $('#still-note').hidden = false;
    $('#still-note').textContent = currentTreeCount ? 'Still view of your forest. You can explore every tree below.' : 'Still view of your planted almond seed.';
    console.warn('3D forest unavailable; showing still view.', error);
  }
}
replayGrowth();
}
