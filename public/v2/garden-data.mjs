const families = ['Open vase', 'Round crown', 'Weeping', 'Column', 'Wide', 'Wandering'];
const spots = [[-3.2, -.65], [-1.5, 1.8], [1.6, 1.75], [3.25, -.8], [.95, -2.15], [-1.65, -2.25]];
const example = {
  points: 1340,
  trees: [
    { id: 'example-1', number: 1, threshold: 60, family: families[0], palette: 'Cream', earnedAt: '8 June', position: spots[0] },
    { id: 'example-2', number: 2, threshold: 310, family: families[1], palette: 'Rose', earnedAt: '19 June', position: spots[1] },
    { id: 'example-3', number: 3, threshold: 560, family: families[2], palette: 'Peach', earnedAt: '7 July', position: spots[2] },
    { id: 'example-4', number: 4, threshold: 810, family: families[3], palette: 'Cream', earnedAt: '16 August', position: spots[3] },
    { id: 'example-5', number: 5, threshold: 1060, family: families[4], palette: 'Rose', earnedAt: '21 September', position: spots[4] },
    { id: 'example-6', number: 6, threshold: 1310, family: families[5], palette: 'Peach', earnedAt: '11 October', position: spots[5] },
  ],
  nextTree: { number: 7, threshold: 1560, pointsNeeded: 220 },
  stats: { opens: 170, clicks: 100, currentStreak: 6, bestStreak: 14 },
  previousVisit: { points: 1100, treeCount: 5 },
};

const seed = {
  points: 0,
  trees: [],
  nextTree: { number: 1, threshold: 60, pointsNeeded: 60 },
  stats: { opens: 0, clicks: 0, currentStreak: 0, bestStreak: 0 },
  previousVisit: { points: 0, treeCount: 0 },
};

export async function loadGarden() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get('access');
  if (token !== null) {
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('sample');
    history.replaceState(null, '', clean.pathname + clean.search);
    try {
      const claim = await fetch('/api/v2/access/claim', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      if (claim.status === 401) return { kind: 'access', reason: 'invalid_link' };
      if (!claim.ok) return { kind: 'error' };
    } catch { return { kind: 'error' }; }
  } else {
    const sample = new URLSearchParams(location.search).get('sample');
    if (sample === 'seed' || sample === 'forest' || sample === 'choice') {
      return { kind: 'garden', garden: sample === 'seed' ? seed : sample === 'choice' ? { ...example, previousVisit: null } : example, sample: true };
    }
  }
  try {
    const response = await fetch('/api/v2/garden', { credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (response.status === 401) return { kind: 'access', reason: 'private_garden' };
    if (!response.ok) return { kind: 'error' };
    return { kind: 'garden', garden: prepareGarden(await response.json()), sample: false };
  } catch { return { kind: 'error' }; }
}

function prepareGarden(raw) {
  if (!Number.isSafeInteger(raw?.points) || raw.points < 0 || !Array.isArray(raw.trees) ||
      !Number.isSafeInteger(raw.nextTree?.threshold) || !Number.isSafeInteger(raw.nextTree?.pointsNeeded)) {
    throw new TypeError('invalid garden data');
  }
  const trees = raw.trees.map((tree, index) => {
    if (!Number.isSafeInteger(tree?.number) || !Number.isSafeInteger(tree?.threshold) || tree.threshold < 0) {
      throw new TypeError('invalid tree data');
    }
    const angle = index * 2.399;
    const position = spots[index] || [Math.cos(angle) * 3.8, Math.sin(angle) * 2.55];
    return {
      id: tree.id, number: tree.number, threshold: tree.threshold,
      earnedAt: typeof tree.earnedAt === 'string' ? tree.earnedAt : null,
      family: families[index % families.length], palette: null, position,
    };
  });
  const previousVisit = raw.previousVisit &&
    Number.isSafeInteger(raw.previousVisit.points) && raw.previousVisit.points >= 0 &&
    raw.previousVisit.points <= raw.points && Number.isSafeInteger(raw.previousVisit.treeCount) &&
    raw.previousVisit.treeCount >= 0 && raw.previousVisit.treeCount <= trees.length
      ? { points: raw.previousVisit.points, treeCount: raw.previousVisit.treeCount }
      : null;
  const stats = raw.stats?.available === true ? raw.stats : {};
  return {
    points: raw.points, trees, nextTree: raw.nextTree, previousVisit,
    stats: {
      opens: safeCount(stats.opens), clicks: safeCount(stats.clicks),
      currentStreak: safeCount(stats.currentStreak), bestStreak: safeCount(stats.bestStreak),
      coverage: raw.stats?.coverage || null,
    },
  };
}

function safeCount(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }

export async function markGardenViewed(garden) {
  const response = await fetch('/api/v2/garden/viewed', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: garden.points, treeCount: garden.trees.length }),
  });
  if (!response.ok) throw new Error('could not record garden view');
}

export async function recoverGardenLink(email) {
  const response = await fetch('/api/v2/access/recover', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  return response.status;
}
