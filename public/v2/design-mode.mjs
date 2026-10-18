const palettes = { cream: ['Cream', '#fff0df'], rose: ['Rose', '#f5c2c7'], apricot: ['Apricot', '#f3c49d'] };
const residents = {
  fox: ['Fox', '<svg viewBox="0 0 48 48"><path d="M6 7 18 15 30 15 42 7 39 33 24 42 9 33Z" fill="#e78e3a" stroke="#262a45" stroke-width="2.8" stroke-linejoin="round"/><path d="M10 30 24 40 38 30 30 31 24 35 18 31Z" fill="#fff4dc"/><circle cx="18" cy="27" r="2" fill="#262a45"/><circle cx="30" cy="27" r="2" fill="#262a45"/><path d="M22 34h4l-2 3Z" fill="#262a45"/></svg>'],
  hedgehog: ['Hedgehog', '<svg viewBox="0 0 48 48"><path d="m5 30 4-8-2-7 8 2 3-9 6 5 7-6 2 8 8-2-3 8 5 5-5 10H16Z" fill="#a67552" stroke="#262a45" stroke-width="2.8" stroke-linejoin="round"/><path d="M14 28c0-8 8-13 17-10 8 3 9 11 6 16-2 5-7 8-13 8-8 0-13-6-10-14Z" fill="#e9c5a0" stroke="#262a45" stroke-width="2.5"/><circle cx="30" cy="27" r="2" fill="#262a45"/><circle cx="39" cy="32" r="2.5" fill="#262a45"/></svg>'],
};
const $ = (root, selector) => root.querySelector(selector);

function sampleDesign(garden, sampleChoice) {
  const count = garden.trees.length;
  return {
    revision: 0, palette: count ? 'cream' : null, resident: sampleChoice ? null : count >= 3 ? 'fox' : null,
    availablePalettes: count ? Object.keys(palettes) : [],
    availableResidents: count >= 3 ? Object.keys(residents) : [],
    requiredChoices: sampleChoice ? ['resident'] : [], foundingAward: sampleChoice,
    areas: [...(count ? ['meadow'] : []), ...(count >= 4 ? ['pond'] : []), ...(count >= 6 ? ['woodland'] : [])],
    trees: garden.trees.map(tree => ({ id: tree.id, number: tree.number, position: tree.position })),
    decorations: [
      ...(count >= 2 ? [{ id: 'decoration-2', type: 'wildflowers', unlockedAtTree: 2, position: [-4.2, -2] }] : []),
      ...(count >= 5 ? [{ id: 'decoration-5', type: 'bird_bath', unlockedAtTree: 5, position: [0, -.2] }] : []),
    ],
    openSpots: [[-4, 1.7], [-.1, 2.65], [3.8, 1], [-.4, -2.6]],
  };
}

function futureRewards(count) {
  const steps = [
    [1, 'Meadow and blossoms'], [2, 'Wildflowers'], [3, 'A forest friend'],
    [4, 'Pond'], [5, 'Bird bath'], [6, 'Woodland'],
  ];
  const upcoming = steps.filter(([tree]) => tree > count).slice(0, 3);
  if (count >= 6) upcoming.push([Math.ceil((count + 1) / 3) * 3, 'Decoration choice']);
  return upcoming;
}

function clone(value) { return structuredClone(value); }
function sameSpot(a, b) { return a?.[0] === b?.[0] && a?.[1] === b?.[1]; }
function mapPosition(point) {
  return [Math.max(6, Math.min(94, (point[0] + 4.5) / 9 * 100)),
    Math.max(10, Math.min(90, (3 - point[1]) / 6 * 100))];
}

async function readDesign() {
  const response = await fetch('/api/v2/design', { credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Could not load your garden design.');
  return response.json();
}

async function writeDesign(design) {
  const placements = [...design.trees.map(item => ({ kind: 'tree', id: item.id, position: item.position })),
    ...design.decorations.map(item => ({ kind: 'decoration', id: item.id, position: item.position }))];
  const response = await fetch('/api/v2/design', {
    method: 'PUT', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: design.revision, palette: design.palette, resident: design.resident, placements }),
  });
  if (response.status === 409) throw new Error('This forest changed in another tab. Reload to see its newest design.');
  if (!response.ok) throw new Error('That spot is unavailable. Choose another and try again.');
  return response.json();
}

export async function mountDesignMode({ host, garden, sample, sampleChoice, onSaved, onChoiceComplete }) {
  let design;
  try { design = sample ? sampleDesign(garden, sampleChoice) : await readDesign(); }
  catch (error) { return { error, requiredChoices: [], areas: [] }; }
  let draft = clone(design), history = [], selected = null, mode = 'edit';
  const chosenRequired = new Set();
  const panel = document.createElement('section');
  panel.className = 'design-mode';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'design-heading');
  panel.innerHTML = `<div class="design-head"><div><h2 id="design-heading">Design Your Garden</h2><p id="design-intro">Choose a look and place what you have earned.</p></div><button type="button" id="design-close">Back to forest</button></div><div id="design-choices"></div><div id="design-placement"></div><div id="design-coming"></div><p id="design-status" role="status"></p><div class="design-actions"><button type="button" id="design-undo">Undo</button><button type="button" id="design-save">Save garden</button></div>`;
  host.append(panel);
  const requiredChoices = Array.isArray(design.requiredChoices) ? design.requiredChoices : [];
  const allItems = () => [
    ...draft.trees.map(item => ({ ...item, kind: 'tree', label: `Tree ${item.number}` })),
    ...draft.decorations.map(item => ({ ...item, kind: 'decoration', label: item.type === 'wildflowers' ? 'Wildflowers' : item.type === 'bird_bath' ? 'Bird bath' : 'Decoration' })),
  ];
  const itemKey = item => `${item.kind}:${item.id}`;
  const selectedItem = () => allItems().find(item => itemKey(item) === selected);
  const remember = () => { history.push(clone(draft)); if (history.length > 20) history.shift(); };
  const status = message => { $(panel, '#design-status').textContent = message; };

  function renderChoice(group, title, options, current) {
    const wrap = document.createElement('fieldset');
    wrap.className = 'design-choice';
    const legend = document.createElement('legend'); legend.textContent = title; wrap.append(legend);
    const row = document.createElement('div'); row.className = 'design-options'; wrap.append(row);
    for (const id of options) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `design-${group}`; input.value = id; input.checked = current === id;
      const artwork = document.createElement('span'); artwork.className = `design-art ${group}`;
      artwork.setAttribute('aria-hidden', 'true');
      if (group === 'palette') artwork.style.setProperty('--blossom', palettes[id]?.[1] || '#fff0df');
      else artwork.innerHTML = residents[id]?.[1] || '';
      const name = document.createElement('strong'); name.textContent = group === 'palette' ? palettes[id]?.[0] || id : residents[id]?.[0] || id;
      label.append(input, artwork, name); row.append(label);
    }
    return wrap;
  }

  function render() {
    const choiceOnly = mode === 'choice';
    const choiceCopy = requiredChoices.length === 1
      ? requiredChoices[0] === 'resident'
        ? ['Choose your forest friend', 'Who will live among your almond trees?']
        : ['Choose your blossoms', 'Pick the colour that will bloom across your forest.']
      : ['New choices for your forest', 'Choose each new reward to continue.'];
    panel.classList.toggle('choice-mode', choiceOnly);
    $(panel, '#design-heading').textContent = choiceOnly ? choiceCopy[0] : 'Design Your Garden';
    $(panel, '#design-intro').textContent = choiceOnly ? choiceCopy[1] : 'Choose a look and place what you have earned.';
    $(panel, '#design-close').hidden = choiceOnly;
    $(panel, '#design-undo').hidden = choiceOnly;
    $(panel, '#design-save').textContent = choiceOnly ? 'Continue to forest' : 'Save garden';
    const choices = $(panel, '#design-choices'); choices.replaceChildren();
    if (draft.availablePalettes.length && (!choiceOnly || requiredChoices.includes('palette'))) {
      choices.append(renderChoice('palette', 'Blossom colour for your forest', draft.availablePalettes,
        choiceOnly && !chosenRequired.has('palette') ? null : draft.palette));
    }
    if (draft.availableResidents.length && (!choiceOnly || requiredChoices.includes('resident'))) {
      choices.append(renderChoice('resident', 'Forest friend', draft.availableResidents,
        choiceOnly && !chosenRequired.has('resident') ? null : draft.resident));
    }
    const placement = $(panel, '#design-placement'); placement.replaceChildren();
    placement.hidden = choiceOnly || !allItems().length;
    if (!placement.hidden) {
      const title = document.createElement('h3'); title.textContent = 'Your trees and decorations'; placement.append(title);
      const list = document.createElement('div'); list.className = 'design-items'; placement.append(list);
      for (const item of allItems()) {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.item = itemKey(item); button.textContent = item.label;
        button.setAttribute('aria-pressed', String(selected === itemKey(item)));
        list.append(button);
      }
      const chosen = selectedItem();
      if (chosen) {
        const scenic = chosen.kind === 'tree' ? chosen.number <= 8 : chosen.unlockedAtTree <= 5;
        const hint = document.createElement('p');
        hint.textContent = scenic ? `Move ${chosen.label}: choose an open spot on the map.` : `Move ${chosen.label}: choose an open spot in the back forest.`;
        placement.append(hint);
        const spots = document.createElement('div'); spots.className = scenic ? 'design-map' : 'design-backdrop-spots';
        spots.setAttribute('role', 'group'); spots.setAttribute('aria-label', scenic ? 'Open garden spots' : 'Open back forest spots');
        placement.append(spots);
        for (const item of scenic ? allItems().filter(item => item.kind === 'tree' ? item.number <= 8 : item.unlockedAtTree <= 5) : []) {
          const marker = document.createElement('span'); marker.className = 'design-marker';
          marker.textContent = item.kind === 'tree' ? String(item.number) : '✿';
          marker.title = item.label; marker.setAttribute('aria-hidden', 'true');
          const [left, top] = mapPosition(item.position);
          marker.style.left = `${left}%`; marker.style.top = `${top}%`;
          if (itemKey(item) === selected) marker.classList.add('selected');
          spots.append(marker);
        }
        const validSpots = scenic ? (draft.openSpots || []) : (draft.distantSlots || []);
        const startingSpots = [...design.trees.filter(item => (item.number <= 8) === scenic).map(item => item.position),
          ...design.decorations.filter(item => (item.unlockedAtTree <= 5) === scenic).map(item => item.position)];
        const available = [...validSpots, ...startingSpots]
          .filter((spot, index, array) => array.findIndex(other => sameSpot(other, spot)) === index)
          .filter(spot => !allItems().filter(item => itemKey(item) !== selected).some(item => Math.hypot(item.position[0] - spot[0], item.position[1] - spot[1]) < 1.49))
          .filter(spot => !sameSpot(spot, chosen.position)).slice(0, 8);
        available.forEach((spot, index) => {
          const button = document.createElement('button'); button.type = 'button';
          button.dataset.spot = JSON.stringify(spot);
          button.textContent = scenic ? String(index + 1) : `Back forest spot ${index + 1}`;
          button.setAttribute('aria-label', `Move ${chosen.label} to ${scenic ? 'open' : 'back forest'} spot ${index + 1}`);
          if (scenic) {
            const [left, top] = mapPosition(spot);
            button.style.left = `${left}%`; button.style.top = `${top}%`;
          }
          spots.append(button);
        });
        if (!available.length) hint.textContent = 'No open spot is available here. You can still change your forest colours and friend.';
      }
    }
    const coming = $(panel, '#design-coming'); coming.replaceChildren();
    coming.hidden = choiceOnly;
    if (!choiceOnly) {
      const title = document.createElement('h3'); title.textContent = 'Coming soon'; coming.append(title);
      for (const [tree, reward] of futureRewards(draft.trees.length)) {
        const line = document.createElement('p'); line.textContent = `${reward} · grow Tree ${tree} to unlock`; coming.append(line);
      }
    }
    $(panel, '#design-undo').disabled = history.length === 0;
  }

  function open(nextMode = 'edit', treeId = null) {
    mode = requiredChoices.length ? 'choice' : nextMode;
    selected = treeId == null ? null : `tree:${treeId}`;
    panel.hidden = false; render(); panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $(panel, '#design-heading').setAttribute('tabindex', '-1'); $(panel, '#design-heading').focus();
  }
  function close() {
    if (mode === 'choice') return;
    panel.hidden = true; draft = clone(design); history = []; selected = null; status('');
  }
  $(panel, '#design-close').addEventListener('click', close);
  $(panel, '#design-undo').addEventListener('click', () => {
    if (history.length) {
      draft = history.pop(); render(); status('Last change undone.');
      $(panel, '#design-save').focus();
    }
  });
  panel.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'design-palette' || input.name === 'design-resident') {
      if (mode !== 'choice') remember();
      const choice = input.name.slice(7);
      draft[choice] = input.value;
      if (mode === 'choice') chosenRequired.add(choice);
      status('Choice ready to save.');
    }
  });
  panel.addEventListener('click', event => {
    const itemButton = event.target.closest('[data-item]');
    if (itemButton) {
      selected = itemButton.dataset.item; render();
      $(panel, `[data-item="${selected}"]`)?.focus();
      return;
    }
    const spotButton = event.target.closest('[data-spot]');
    if (spotButton) {
      const item = selectedItem(); if (!item) return;
      remember();
      const target = draft[item.kind === 'tree' ? 'trees' : 'decorations'].find(entry => entry.id === item.id);
      target.position = JSON.parse(spotButton.dataset.spot);
      render(); status(`${item.label} moved. Save your garden to keep this spot.`);
      $(panel, `[data-item="${selected}"]`)?.focus();
    }
  });
  $(panel, '#design-save').addEventListener('click', async () => {
    const button = $(panel, '#design-save'); button.disabled = true; status('Saving your garden…');
    try {
      if (mode === 'choice' && requiredChoices.some(choice => !chosenRequired.has(choice))) {
        status('Please choose each new option before continuing.'); return;
      }
      const saved = sample ? { ...draft, revision: draft.revision + 1, requiredChoices: [] } : await writeDesign(draft);
      design = saved; draft = clone(saved); history = [];
      requiredChoices.splice(0, requiredChoices.length, ...(saved.requiredChoices || []));
      try { onSaved(saved); } catch (error) { console.warn('Forest preview could not update.', error); }
      if (mode === 'choice' && !requiredChoices.length) { mode = 'edit'; onChoiceComplete?.(); }
      panel.hidden = true; status('');
    } catch (error) { status(error.message); }
    finally { button.disabled = false; }
  });
  return {
    open: () => open(), openTree: id => open('edit', id),
    showRequiredChoices: () => {
      if (!requiredChoices.length) return false;
      open('choice'); return true;
    },
    requiredChoices, areas: design.areas, design,
  };
}
