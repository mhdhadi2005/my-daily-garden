/* ===================================================================
   My Daily Garden — Client-Side Application Logic
   Fetches tree data, renders the almond tree, manages animations,
   forest/prestige system, harvest flow, and cosmetics
   =================================================================== */

(function () {
  "use strict";

  // ── Config ──
  const DEMO_API = "/api/demo/tree";
  const REAL_API = "/api/tree/";

  const REWARD_META = {
    butterfly:  { art: "butterfly",  label: "Butterfly",  rarity: "common" },
    bird:       { art: "bird",       label: "Songbird",   rarity: "uncommon" },
    rare_seed:  { art: "rare_seed",  label: "Rare Seed",  rarity: "rare" },
    golden_can: { art: "golden_can", label: "Golden Can", rarity: "epic" },
    rainbow:    { art: "rainbow",    label: "Rainbow",    rarity: "epic" },
    legendary:  { art: "legendary",  label: "Legendary",  rarity: "legendary" },
  };

  const RARITY_COLORS = {
    common:    "var(--text-muted)",
    uncommon:  "#3E8E5A",
    rare:      "#2E8B8B",
    epic:      "#B48CD6",
    legendary: "#E0912A",
  };

  // Swaps every [data-icon] placeholder for its drawn SVG (see artwork.js)
  function paintIcons(root) {
    if (!window.Art) return;
    (root || document).querySelectorAll("[data-icon]").forEach((el) => {
      const size = parseInt(el.dataset.iconSize || "22", 10);
      el.innerHTML = window.Art.icon(el.dataset.icon, size);
    });
  }

  // ── State ──
  let currentStage      = -1;
  let currentData       = null;
  let demoHarvests      = 0;
  let particleInterval  = null;
  let isRealMode        = false;
  // Bumped at the start of every fetchAndRender call; a call only touches the
  // DOM if it's still the most recent one by the time its work is ready to
  // apply. Needed because the demo harvests slider fires a fresh
  // fetchAndRender on every native "input" event — dozens per drag — with no
  // guarantee an earlier request's fetch resolves before a later one's.
  // Without this, dragging the slider could leave the page showing a stage
  // the slider passed through mid-drag rather than where it was released.
  let renderRequestId    = 0;
  let realSubscriberId  = null;

  // ── DOM Elements ──
  const $stageName        = document.getElementById("stage-name");
  const $stageDescription = document.getElementById("stage-description");
  const $treeContainer    = document.getElementById("tree-container");
  const $progressSection  = document.getElementById("progress-section");
  const $progressCurrent  = document.getElementById("progress-current");
  const $progressNext     = document.getElementById("progress-next");
  const $progressFill     = document.getElementById("progress-fill");
  const $progressPoints   = document.getElementById("progress-points");
  const $streakValue      = document.getElementById("streak-value");
  const $pointsValue      = document.getElementById("points-value");
  const $opensValue       = document.getElementById("opens-value");
  const $clicksValue      = document.getElementById("clicks-value");
  const $longestValue     = document.getElementById("longest-value");
  const $harvestsValue    = document.getElementById("harvests-value");
  const $statStreak       = document.getElementById("stat-streak");
  const $rewardsGrid      = document.getElementById("rewards-grid");
  const $rewardsCount     = document.getElementById("rewards-count");
  const $stageSelector    = document.getElementById("stage-selector");
  const $particleContainer = document.getElementById("particles");
  // Forest / Garden scene
  const $forestSection    = document.getElementById("forest-section");
  const $forestCount      = document.getElementById("forest-count");
  const $forestScene      = document.getElementById("forest-scene");
  const $cosmeticsShelf   = document.getElementById("cosmetics-shelf");
  const $cosmeticsGrid    = document.getElementById("cosmetics-grid");
  const $gardenBackdrop   = document.getElementById("garden-backdrop");
  const $gardenCritters   = document.getElementById("garden-critters");

  // Harvest
  const $harvestSection   = document.getElementById("harvest-section");
  const $growthReplay     = document.getElementById("growth-replay");
  const $harvestBtn       = document.getElementById("harvest-btn");
  const $harvestOverlay   = document.getElementById("harvest-overlay");
  const $harvestEmoji     = document.getElementById("harvest-emoji");
  const $harvestSub       = document.getElementById("harvest-sub");
  const $harvestCosmeticIcon  = document.getElementById("harvest-cosmetic-icon");
  const $harvestCosmeticLabel = document.getElementById("harvest-cosmetic-label");
  const $harvestCosmeticRarity = document.getElementById("harvest-cosmetic-rarity");
  const $harvestContinue  = document.getElementById("harvest-continue");
  // Demo
  const $demoHarvestsSlider = document.getElementById("demo-harvests-slider");
  const $demoHarvestsCount  = document.getElementById("demo-harvests-count");

  // ── Initialization ──
  function init() {
    const params = new URLSearchParams(window.location.search);
    realSubscriberId = params.get("subscriber");
    isRealMode = !!realSubscriberId;

    if (isRealMode) {
      document.getElementById("demo-controls").style.display = "none";
    } else {
      setupDemoControls();
    }

    paintIcons();
    buildStageSelector();
    fetchAndRender(0);
    setupHarvestButton();
  }

  // ── Data Fetching ──
  async function fetchTreeData(stageIndex) {
    let url;
    if (isRealMode) {
      url = REAL_API + encodeURIComponent(realSubscriberId);
    } else {
      url = `${DEMO_API}?stage=${stageIndex}&harvests=${demoHarvests}`;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("Failed to fetch tree data:", err);
      return null;
    }
  }

  // ── Render Pipeline ──
  async function fetchAndRender(stageIndex) {
    const requestId = ++renderRequestId;
    const data = await fetchTreeData(stageIndex);
    if (!data || requestId !== renderRequestId) return; // superseded by a newer call while this one was in flight
    currentData = data;

    const newStage    = data.stage.index;
    const shouldAnimate = newStage !== currentStage;

    if (shouldAnimate && currentStage >= 0) {
      $treeContainer.classList.add("fade-out");
      await sleep(300);
      if (requestId !== renderRequestId) return;
    }

    renderTree(data, shouldAnimate);
    renderStats(data);
    renderProgress(data);
    renderRewards(data.rewards);
    renderForest(data);
    renderHarvestButton(data);

    renderPointGuide(data.pointValues);
    updateStageSelector(newStage);
    updateParticles(newStage);


    if (shouldAnimate && currentStage >= 0) {
      $treeContainer.classList.remove("fade-out");
      $treeContainer.classList.add("fade-in");
      await sleep(500);
      if (requestId !== renderRequestId) return;
      $treeContainer.classList.remove("fade-in");
    }

    currentStage = newStage;

    if (isRealMode) {
      const replay = takeReplayFor(data);
      if (replay) await playGrowthReplay(data, replay, requestId);
      if (requestId === renderRequestId) markViewed();
    }
  }

  // ── "Grown since your last visit" replay ──
  // The server remembers what the reader saw last time (lastView). On their
  // first load of this page, if the tree has grown since then, we snap back
  // to that state and grow it forward stage by stage to now.
  let replayTaken = false;
  const REPLAY_MAX_MS = 6000;

  function takeReplayFor(data) {
    if (replayTaken) return null;
    replayTaken = true;
    const last = data.lastView;
    if (!last) return null; // first ever visit — nothing to compare against
    const harvestedSince = (data.totalHarvests || 0) - (last.totalHarvests || 0);
    // A harvest resets points, so if trees were harvested since, the
    // current tree started from a seed after the last visit.
    const fromPoints = harvestedSince > 0 ? 0 : last.points;
    if (harvestedSince <= 0 && data.points <= fromPoints) return null; // no growth
    return { fromPoints, harvestedSince: Math.max(0, harvestedSince), at: last.at };
  }

  // A snapshot of `data` as it would have looked at `points`.
  function replayFrame(data, points) {
    const stages = window.AlmondTree.stages;
    const idx = stageIndexForPoints(points);
    const next = stages[idx + 1];
    return Object.assign({}, data, {
      points,
      stage: { index: idx, name: stages[idx].name },
      nextStage: next ? { name: next.name, pointsNeeded: next.need - points } : null,
      stageProgress: next ? (points - stages[idx].need) / (next.need - stages[idx].need) : 1,
      canHarvest: false,
    });
  }

  function showFrame(frame) {
    renderTree(frame, false);
    sizeCurrentTree(frame.stage.index);
    renderProgress(frame);
    updateParticles(frame.stage.index);
  }

  async function playGrowthReplay(data, replay, requestId) {
    const stages = window.AlmondTree.stages;
    const startStage = stageIndexForPoints(replay.fromPoints);

    // Hold the scene at its final (largest) height for the whole replay.
    if (currentTreeLayout) currentTreeLayout.lockedSceneHeight = sceneHeightFor(data.stage.index);

    // Snap back to where they were — same task as the final render that
    // preceded this, so the browser never paints the final state first.
    showFrame(replayFrame(data, replay.fromPoints));
    setValueNow($pointsValue, replay.fromPoints);
    // Not earned yet at the replay's starting point — but hide it without
    // collapsing its space, or everything below jumps twice.
    if ($harvestSection) $harvestSection.style.visibility = "hidden";
    showReplayBanner(data, replay, startStage);

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      // One step per stage crossed, then the exact current points.
      const steps = [];
      for (let s = startStage + 1; s <= data.stage.index; s++) steps.push(stages[s].need);
      if (steps[steps.length - 1] !== data.points) steps.push(data.points);
      const stepMs = Math.max(550, Math.min(1100, REPLAY_MAX_MS / steps.length));

      await sleep(900); // let them see where they were
      for (const pts of steps) {
        if (requestId !== renderRequestId) return; // superseded (e.g. demo control clicked)
        showFrame(replayFrame(data, pts));
        animateValue($pointsValue, pts);
        await sleep(stepMs);
      }
    }
    if (requestId !== renderRequestId) return;

    if (currentTreeLayout) currentTreeLayout.lockedSceneHeight = 0;
    showFrame(data);
    renderStats(data);
    renderHarvestButton(data);
    updateStageSelector(data.stage.index);
    setTimeout(hideReplayBanner, 4000);
  }

  function showReplayBanner(data, replay, startStage) {
    if (!$growthReplay) return;
    const stages = window.AlmondTree.stages;
    const gained = data.points - replay.fromPoints;
    const parts = [];
    if (gained > 0) parts.push(`<strong>+${gained} points</strong>`);
    if (data.stage.index !== startStage) parts.push(`${stages[startStage].name} → ${data.stage.name}`);
    if (replay.harvestedSince > 0) {
      parts.push(`${replay.harvestedSince} new tree${replay.harvestedSince === 1 ? "" : "s"} in your forest`);
    }
    const ago = timeAgo(replay.at);
    $growthReplay.innerHTML =
      `<span class="growth-replay-title">Welcome back!</span>` +
      `<span class="growth-replay-body">Since your last visit${ago ? ` ${ago}` : ""}: ${parts.join(" · ")}</span>`;
    $growthReplay.hidden = false;
    $growthReplay.classList.remove("is-leaving");
  }

  function hideReplayBanner() {
    if (!$growthReplay || $growthReplay.hidden) return;
    $growthReplay.classList.add("is-leaving");
    setTimeout(() => { $growthReplay.hidden = true; }, 600);
  }

  // SQLite datetime('now') is UTC without a zone marker.
  function timeAgo(sqliteUtc) {
    if (!sqliteUtc) return "";
    const then = Date.parse(sqliteUtc.replace(" ", "T") + "Z");
    if (isNaN(then)) return "";
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 60) return mins <= 1 ? "a minute ago" : `${mins} minutes ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  function markViewed() {
    fetch(`/api/tree/${encodeURIComponent(realSubscriberId)}/viewed`, { method: "POST" })
      .catch((err) => console.error("Failed to record visit:", err));
  }

  // ── Tree Rendering ──
  // Sizing/positioning of $treeContainer now happens in renderForest — the
  // current tree is one slot in the same continuous scene as past
  // harvests, not a separate hero box (see renderForest for why).
  function renderTree(data, animate) {
    if (typeof window.AlmondTree === "undefined") {
      $treeContainer.innerHTML = '<p style="color:var(--text-muted)">Tree renderer not loaded</p>';
      return;
    }
    const stageData = window.AlmondTree.stages[data.stage.index];
    $stageName.textContent = data.stage.name;
    $stageDescription.textContent = stageData ? stageData.description : "";
    window.AlmondTree.render($treeContainer, data.stage.index, animate, data.stageProgress || 0.5);
  }

  // ── Stats Rendering ──
  function renderStats(data) {
    animateValue($streakValue,   data.streak);
    animateValue($pointsValue,   data.points);
    animateValue($opensValue,    data.totalOpens   || 0);
    animateValue($clicksValue,   data.totalClicks  || 0);
    animateValue($longestValue,  data.longestStreak);
    animateValue($harvestsValue, data.totalHarvests || 0);

    if (data.streak >= 3) {
      $statStreak.classList.add("streak-active");
    } else {
      $statStreak.classList.remove("streak-active");
    }
  }

  // One running count per element: a new target cancels the old count
  // instead of two intervals fighting over the same number.
  function animateValue(el, targetValue) {
    if (!el) return; // embed.html shows only some of the stats
    clearInterval(el._countTimer);
    const startValue = parseInt(el.textContent) || 0;
    if (startValue === targetValue) { el.textContent = targetValue; return; }
    const duration = 600, steps = 30;
    const increment = (targetValue - startValue) / steps;
    let step = 0;
    el._countTimer = setInterval(() => {
      step++;
      if (step >= steps) { el.textContent = targetValue; clearInterval(el._countTimer); }
      else el.textContent = Math.round(startValue + increment * step);
    }, duration / steps);
  }

  function setValueNow(el, value) {
    clearInterval(el._countTimer);
    el.textContent = value;
  }

  // ── Progress Bar ──
  function renderProgress(data) {
    const stage     = data.stage;
    const stageData = window.AlmondTree ? window.AlmondTree.stages[stage.index] : null;
    const currentNeed = stageData ? stageData.need : 0;

    if (data.nextStage) {
      const nextNeed   = currentNeed + data.nextStage.pointsNeeded + (data.points - currentNeed);
      const stageRange = nextNeed - currentNeed;
      const progress   = stageRange > 0 ? ((data.points - currentNeed) / stageRange) * 100 : 0;
      $progressCurrent.textContent = stage.name;
      $progressNext.textContent    = `→ ${data.nextStage.name}`;
      $progressFill.style.width    = `${Math.min(100, Math.max(2, progress))}%`;
      $progressPoints.innerHTML    = `<strong>${data.points}</strong> pts — ${data.nextStage.pointsNeeded} to next stage`;
      $progressSection.classList.remove("maxed");
    } else {
      $progressCurrent.textContent = stage.name;
      $progressNext.textContent    = "✦ Max Stage — Ready to Harvest!";
      $progressFill.style.width    = "100%";
      $progressPoints.innerHTML    = `<strong>${data.points}</strong> pts — 🏅 Fully grown!`;
      $progressSection.classList.add("maxed");
    }
  }

  // ── Rewards ──
  function renderRewards(rewards) {
    if (!rewards || rewards.length === 0) {
      $rewardsGrid.innerHTML = '<p class="rewards-empty">Click newsletter links to discover rewards!</p>';
      $rewardsCount.textContent = "";
      return;
    }
    const totalCount = rewards.reduce((sum, r) => sum + r.count, 0);
    $rewardsCount.textContent = `${totalCount} total`;
    $rewardsGrid.innerHTML = rewards.map(r => {
      const meta = REWARD_META[r.reward_type] || { art: "", label: r.reward_type, rarity: "common" };
      const art = window.Art ? window.Art.badge(meta.art, 30) : "";
      return `<div class="reward-item" data-rarity="${meta.rarity}">
        <span class="reward-icon">${art}</span>
        <span class="reward-name">${meta.label}</span>
        <span class="reward-qty">×${r.count}</span>
      </div>`;
    }).join("");
  }

  // ── Points Guide ──
  function renderPointGuide(pointValues) {
    if (!pointValues) return;
    const $open = document.getElementById("guide-pts-open");
    const $click = document.getElementById("guide-pts-click");
    const $quiz = document.getElementById("guide-pts-quiz");
    const $purchase = document.getElementById("guide-pts-purchase");

    if ($open && pointValues.open !== undefined) {
      $open.textContent = `+${pointValues.open} pt${pointValues.open === 1 ? "" : "s"}`;
    }
    if ($click && pointValues.click !== undefined) {
      $click.textContent = `+${pointValues.click} pts`;
    }
    if ($quiz && pointValues.quiz !== undefined) {
      $quiz.textContent = `+${pointValues.quiz} pts`;
    }
    if ($purchase && pointValues.purchase) {
      $purchase.textContent = `+${pointValues.purchase.perDollarSpent} pt/$`;
    }
  }

  // ── Forest Rendering (into unified garden scene) ──

  const GROVE_MAX_TREES = 9;

  // The tree renderer draws well outside its 400x550 viewBox at late stages and
  // paints two full-bleed tint rects. In the full-width hero that's invisible,
  // but in a small grove tile the rects show up as boxes and the canopy gets
  // clipped. Strip the rects, then refit the viewBox to the real content.
  //
  // This used to call svg.getBBox() to measure that content, but getBBox() on
  // a multi-thousand-node SVG is slow in every browser engine — measured a
  // single call costing ~370ms here, and neither reordering writes-before-
  // reads nor deduplicating calls across same-stage trees reduced that (it's
  // a per-call cost, not a caching/thrashing one). render()'s RNG reseeds
  // from stageIndex alone though, so a given stage's geometry is always
  // identical — confirmed byte-for-byte across renders — which means the
  // bounds can be measured once, offline, instead of on every render. This
  // table was generated by rendering all 14 stages at progress=1 (the fixed
  // progress grove trees use) and reading .getBBox() once per stage; rerun
  // that if the renderer's geometry changes. Zero measurement cost at runtime.
  const TREE_BOUNDS_BY_STAGE = [
    { x: 166.0, y: 463.7,  width: 68.0,  height: 64.3  },
    { x: 166.0, y: 412.5,  width: 68.0,  height: 115.5 },
    { x: 132.0, y: 242.7,  width: 136.0, height: 288.3 },
    { x: 125.5, y: 183.2,  width: 146.5, height: 347.8 },
    { x: 48.1,  y: 34.6,   width: 309.8, height: 496.4 },
    { x: 89.2,  y: 75.9,   width: 234.4, height: 455.1 },
    { x: 47.7,  y: 93.6,   width: 292.7, height: 437.4 },
    { x: 19.0,  y: 38.0,   width: 342.0, height: 493.0 },
    { x: -8.9,  y: -20.3,  width: 408.4, height: 551.3 },
    { x: -2.2,  y: -14.6,  width: 442.3, height: 545.6 },
    { x: -47.9, y: -108.5, width: 528.0, height: 666.8 },
    { x: -11.7, y: -14.5,  width: 452.0, height: 565.7 },
    { x: -65.0, y: -109.1, width: 548.4, height: 643.2 },
    { x: -14.7, y: -107.2, width: 471.0, height: 640.9 },
  ];

  // Forest (harvested) trees: a mature almond structure with a seasonal look
  // and no magic effects — see renderForest. Bounds measured the same way
  // as TREE_BOUNDS_BY_STAGE, for that stage rendered with a look.
  const FOREST_TREE_STAGE = 8;
  const FOREST_LOOK_ORDER = ["blossom", "summer", "autumn", "white", "spring", "golden"];
  // Typical box (widths measured 372–442 across looks/variants); the widest
  // shapes spill slightly rather than shrinking every tree to fit them.
  const FOREST_TREE_BOUNDS = { x: -12, y: -24, width: 424, height: 552 };

  function fitTreeToBox(container, stageIndex, boxOverride) {
    const svg = container.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("rect").forEach((r) => {
      if (parseFloat(r.getAttribute("width")) >= 400 && parseFloat(r.getAttribute("height")) >= 550) {
        r.remove();
      }
    });

    const box = boxOverride || TREE_BOUNDS_BY_STAGE[stageIndex];
    if (!box) return;
    const pad = 8;
    svg.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  }

  // Height of the current tree's slot, relative to a nominal front grove
  // tree, by stage — a Seed reads as a thin new sprout next to the grown
  // forest, an Enchanted Grove tree dominates it. Driven by the stage number
  // so it strictly increases: deriving it from each stage's measured bounds
  // (the old approach) made the tree SHRINK between some stages, since later
  // stages are often wider but squatter — visible as the tree getting
  // smaller mid-way through the growth replay.
  function currentTreeHeightScale(stageIndex) {
    const last = TREE_BOUNDS_BY_STAGE.length - 1;
    const t = Math.max(0, Math.min(1, stageIndex / last));
    return 0.45 + 1.35 * Math.pow(t, 0.8); // 0.45x (Seed) .. 1.8x (Enchanted Grove)
  }

  // Layout from the last renderForest, so the current tree can be resized to
  // a different stage (growth replay) without rebuilding the whole forest.
  let currentTreeLayout = null;

  // Size/position the current tree for a stage — a Seed reads as a thin new
  // sprout, an Enchanted Grove tree dominates — clamped so its (very
  // variable) width never overflows the scene, and grow the scene to fit.
  // The container's width/height CSS transitions make a stage change here
  // read as the tree growing, not as a swap.
  function currentTreeSize(stageIndex) {
    const L = currentTreeLayout;
    const box    = TREE_BOUNDS_BY_STAGE[stageIndex];
    const height = L.frontWidth * 1.37 * currentTreeHeightScale(stageIndex);
    const width  = Math.min(L.containerWidth - 8, box ? height * (box.width / box.height) : height / 1.37);
    return { width, height };
  }

  function sceneHeightFor(stageIndex) {
    const L = currentTreeLayout;
    return Math.max(200, Math.max(L.forestTop, 8 + currentTreeSize(stageIndex).height) + 30);
  }

  function sizeCurrentTree(stageIndex) {
    const L = currentTreeLayout;
    if (!L) return null;
    const { width, height } = currentTreeSize(stageIndex);
    const centerPx = Math.max(width / 2 + 4, Math.min(L.containerWidth - width / 2 - 4, L.baseCenterPx));
    const xPercent = (centerPx / L.containerWidth) * 100;

    $treeContainer.style.left = `${xPercent.toFixed(2)}%`;
    $treeContainer.style.width = `${width.toFixed(0)}px`;
    $treeContainer.style.height = `${height.toFixed(0)}px`;
    fitTreeToBox($treeContainer, stageIndex);
    // During a growth replay the scene is held at its final height, so the
    // progress bar and everything below it don't move as the tree grows.
    L.scene.style.height = `${Math.max(sceneHeightFor(stageIndex), L.lockedSceneHeight || 0)}px`;
    return { xPercent, width, height };
  }

  // A harvested tree completed its whole cycle, so it should be drawn at the
  // stage it reached at harvest — not at whatever stage the current tree is.
  function stageIndexForPoints(points) {
    const stages = (window.AlmondTree && window.AlmondTree.stages) || [];
    let idx = 0;
    for (let i = 0; i < stages.length; i++) {
      if (points >= stages[i].need) idx = i;
    }
    return idx;
  }

  // The current tree and the forest of past harvests used to be two
  // separate things — a big hero box above a small strip below — so
  // completing a tree reset the whole prominent area back down to a tiny
  // seed in mostly-empty space. That's the literal "starting from
  // scratch" feeling Harry called out. Now there's one scene: the forest
  // never resets, and the current tree is just its newest (and, early on,
  // smallest) member, growing in place among the others.
  function renderForest(data) {
    const totalHarvests = data.totalHarvests || 0;
    const cosmetics     = data.cosmetics || [];
    const forest        = data.forest    || [];

    if (!$gardenBackdrop) return;

    $gardenBackdrop.innerHTML = "";
    if ($gardenCritters) {
      $gardenCritters.innerHTML = "";
      $gardenCritters.style.display = "none";
    }
    $gardenBackdrop.style.display = "";

    if (totalHarvests > 0) {
      const head = document.createElement("div");
      head.className = "grove-head";
      head.innerHTML =
        `<span class="grove-title">Your Forest</span>` +
        `<span class="grove-count">${totalHarvests} tree${totalHarvests === 1 ? "" : "s"} grown</span>`;
      $gardenBackdrop.appendChild(head);
    }

    const scene = document.createElement("div");
    scene.className = "grove-scene";
    $gardenBackdrop.appendChild(scene);

    // Most recently harvested, not the oldest — otherwise a forest past
    // GROVE_MAX_TREES would forever show its first few trees and never
    // the ones nearest in time to what you're growing right now.
    const shown  = forest.slice(-GROVE_MAX_TREES);
    const hidden = forest.length - shown.length;
    const n = shown.length + 1; // +1 for the current tree's own slot
    const m = shown.length;

    // One layered cluster, not a queue. Each harvested tree gets a depth
    // row — front, middle or back (smaller, higher, hazier) — chosen so
    // neighbours differ, plus a small size/position jitter from its harvest
    // number, and they overlap heavily. With its own branch shape (the
    // `variant` passed to render below) that reads as one continuous
    // forest rather than a row of identical clones. The cluster is kept
    // compact and centred (spreading trees across the full width was an
    // earlier bug: two trees ended up at opposite edges) and only tightens
    // when it would overflow. The current tree stands at its front edge.
    const containerWidth = $gardenBackdrop.clientWidth || 380;
    const DEPTHS = [
      { cls: "is-front", scale: 1.0,  bottom: 8,  z: 3 },
      { cls: "is-mid",   scale: 0.8,  bottom: 30, z: 2 },
      { cls: "is-back",  scale: 0.62, bottom: 52, z: 1 },
    ];
    const DEPTH_PATTERN = [0, 2, 1, 2, 0, 1];
    const CURRENT_GAP = 1.4; // the current tree stands a little apart, in front

    let frontWidth = 120;
    let spacing = frontWidth * 0.5;
    const units = Math.max(0, m - 1) + (m > 0 ? CURRENT_GAP : 0);
    const maxSpan = containerWidth * 0.78;
    if (spacing * units > maxSpan) {
      const k = maxSpan / (spacing * units);
      spacing *= k;
      frontWidth = Math.max(60, frontWidth * Math.max(k, 0.55));
    }
    const groupStart = (containerWidth - spacing * units) / 2;

    const treeSlots = []; // {xPercent, width, height, bottom} — reused below to anchor critters to a real tree
    let sceneTop = 0; // tallest point above the ground, to size the scene

    shown.forEach((h, i) => {
      const num = h.harvestNumber || i + 1;
      const pts = h.pointsAtHarvest || 0;
      const d = DEPTHS[DEPTH_PATTERN[i % DEPTH_PATTERN.length]];
      const sizeJitter = 0.9 + ((num * 37) % 21) / 100;           // 0.90 – 1.10
      const xJitter = (((num * 53) % 17) - 8) * (spacing / 60);    // a few px either way
      const width = frontWidth * d.scale * sizeJitter;
      const height = width * 1.37;
      const centerPx = groupStart + spacing * i + xJitter;
      const x = (centerPx / containerWidth) * 100;

      const slot = document.createElement("div");
      slot.className = `grove-tree ${d.cls}`;
      slot.style.cssText = `left:${x.toFixed(2)}%; bottom:${d.bottom}px; z-index:${d.z}; width:${width.toFixed(0)}px; height:${height.toFixed(0)}px; --d:${(i * 0.06).toFixed(2)}s`;
      slot.title = `Tree #${num} — harvested at ${pts} pts`;

      const art = document.createElement("div");
      art.className = "grove-tree-art";
      art.id = `grove-tree-${i}`;
      slot.appendChild(art);
      scene.appendChild(slot);

      treeSlots.push({ xPercent: x, width, height, bottom: d.bottom });
      sceneTop = Math.max(sceneTop, d.bottom + height);
    });

    // The current tree stands at the front edge of the cluster.
    currentTreeLayout = {
      scene,
      frontWidth,
      containerWidth,
      baseCenterPx: m > 0 ? groupStart + spacing * units : containerWidth / 2,
      forestTop: sceneTop,
    };
    $treeContainer.classList.add("grove-tree-current");
    scene.appendChild($treeContainer);
    const cur = sizeCurrentTree(data.stage.index);
    treeSlots.push({ xPercent: cur.xPercent, width: cur.width, height: cur.height, bottom: 8 });

    // A few grass tufts along the ground band, layered BETWEEN the back and
    // front tree rows (z-index) rather than on top of everything — so front
    // trees overlap them and they read as ground the forest stands in, not
    // stickers scattered over it. This is deliberately a single added layer,
    // not several: see the "simplicity over decoration" note on this project.
    const tuftCount = Math.min(6, Math.max(3, n + 1));
    for (let i = 0; i < tuftCount; i++) {
      const x = 6 + (i / Math.max(1, tuftCount - 1)) * 88;
      const tuft = document.createElement("div");
      tuft.className = "grove-tuft";
      tuft.style.cssText = `left:${x.toFixed(2)}%; --d:${(i * 0.05).toFixed(2)}s`;
      tuft.innerHTML = window.Art.decor("grass", 15 + (i % 3) * 4);
      scene.appendChild(tuft);
    }

    // Cosmetics earned from harvests — birds perch partway up a real tree
    // (like the reference image), everything else stands grounded but
    // anchored near a specific tree instead of floating independently
    // along an evenly-spaced row.
    const perchingTypes = ["owl", "peacock"]; // the only bird-like cosmetics in the catalog
    // Most recently earned cosmetics, not the earliest 5 — otherwise a
    // growing forest would forever show the same starter set and rarer
    // later unlocks (owl, deer, fairy lantern...) would never appear.
    const props = cosmetics.slice(-5);
    props.forEach((c, i) => {
      if (!window.Art || !window.Art.hasCritter(c.type)) return;
      const tree = treeSlots.length ? treeSlots[i % treeSlots.length] : null;
      const jitter = ((i * 37) % 11) - 5; // small deterministic per-slot offset, not random-per-render
      const isPerched = perchingTypes.includes(c.type) && !!tree;

      const prop = document.createElement("div");
      prop.className = `grove-prop${isPerched ? " is-perched" : ""}`;
      prop.dataset.rarity = c.rarity || "common";
      prop.title = `${c.label} (${c.rarity})`;

      if (tree) {
        const xPercent = tree.xPercent + (jitter / containerWidth) * 100;
        if (isPerched) {
          // Sit in the tree's upper canopy, measured from the ground up —
          // trees are bottom-anchored, so measuring from the scene's top
          // left birds floating in the sky whenever the scene grew taller
          // than the tree (e.g. a tall current tree next to small ones).
          const bottomPx = tree.bottom + tree.height * (0.6 + ((i * 19) % 10) / 100);
          prop.style.cssText = `left:${xPercent.toFixed(2)}%; bottom:${bottomPx.toFixed(0)}px; --d:${(0.3 + i * 0.08).toFixed(2)}s`;
        } else {
          prop.style.cssText = `left:${xPercent.toFixed(2)}%; --d:${(0.3 + i * 0.08).toFixed(2)}s`;
        }
      } else {
        const x = 10 + ((i + 0.5) / props.length) * 80;
        prop.style.cssText = `left:${x.toFixed(2)}%; --d:${(0.3 + i * 0.08).toFixed(2)}s`;
      }

      prop.innerHTML = window.Art.critter(c.type, isPerched ? 32 : 40);
      scene.appendChild(prop);
    });

    if (hidden > 0) {
      const more = document.createElement("span");
      more.className = "grove-more";
      more.textContent = `+${hidden} more`;
      scene.appendChild(more);
    }

    if (typeof window.AlmondTree !== "undefined") {
      // Harvested trees are all fully grown (harvest is only possible at
      // the final stage), so drawing each at its harvest stage made the whole
      // forest the same Enchanted-Grove tree. Instead each gets a mature
      // almond structure plus its own look (blossom, summer, autumn...),
      // cycling so neighbouring trees always differ.
      shown.forEach((h, i) => {
        const container = document.getElementById(`grove-tree-${i}`);
        if (!container) return;
        const num = h.harvestNumber || i + 1;
        const look = FOREST_LOOK_ORDER[(num - 1) % FOREST_LOOK_ORDER.length];
        window.AlmondTree.render(container, FOREST_TREE_STAGE, false, 1, num, look);
        fitTreeToBox(container, FOREST_TREE_STAGE, FOREST_TREE_BOUNDS);
      });
    }
  }

  function getCosmeticCategory(type) {
    const animals = ['bunny', 'fox', 'hedgehog', 'owl', 'deer', 'peacock'];
    const nature = ['wildflowers', 'mushroom_ring', 'lily_pond', 'rainbow_arch'];
    if (animals.includes(type)) return 'animal';
    if (nature.includes(type)) return 'nature';
    return 'structure';
  }




  // ── Harvest Button ──
  function renderHarvestButton(data) {
    if (!$harvestSection || !$harvestBtn) return;
    $harvestSection.style.visibility = ""; // undo the growth replay's temporary hide
    if (data.canHarvest && isRealMode) {
      $harvestSection.style.display = "";
    } else if (data.canHarvest && !isRealMode) {
      // Demo: show but disabled with note
      $harvestSection.style.display = "";
      $harvestBtn.disabled = true;
      $harvestBtn.title = "Harvesting requires a real subscriber link";
      $harvestBtn.textContent = "🌾 Harvest Your Tree (demo)";
    } else {
      $harvestSection.style.display = "none";
    }
  }

  function setupHarvestButton() {
    if (!$harvestBtn || !$harvestContinue) return; // embed.html has no harvest UI
    $harvestBtn.addEventListener("click", async () => {
      if (!isRealMode || !realSubscriberId) return;
      $harvestBtn.disabled = true;
      $harvestBtn.textContent = "Harvesting…";

      try {
        const res = await fetch(`/api/tree/${encodeURIComponent(realSubscriberId)}/harvest`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showHarvestCelebration(result);
      } catch (err) {
        console.error("Harvest failed:", err);
        $harvestBtn.disabled = false;
        $harvestBtn.textContent = "🌾 Harvest Your Tree";
        alert("Oops — something went wrong. Please try again!");
      }
    });

    $harvestContinue.addEventListener("click", () => {
      $harvestOverlay.style.display = "none";
      $harvestOverlay.setAttribute("aria-hidden", "true");
      // Reload with fresh data
      fetchAndRender(0);
    });
  }

  function showHarvestCelebration(result) {
    const cosmetic = result.cosmeticEarned;
    $harvestEmoji.innerHTML         = window.Art ? window.Art.icon("harvest", 54) : "";
    $harvestSub.textContent         = `Tree #${result.harvestNumber} added to your forest!`;
    $harvestCosmeticIcon.innerHTML  = window.Art ? window.Art.badge(cosmetic.type, 54) : "";
    $harvestCosmeticLabel.textContent = `You earned: ${cosmetic.label}!`;
    $harvestCosmeticRarity.textContent = cosmetic.rarity;
    $harvestCosmeticRarity.style.color = RARITY_COLORS[cosmetic.rarity] || "inherit";

    $harvestOverlay.style.display = "";
    $harvestOverlay.setAttribute("aria-hidden", "false");

    // Burst animation
    $harvestEmoji.style.animation = "none";
    requestAnimationFrame(() => {
      $harvestEmoji.style.animation = "";
    });
  }

  // ── Stage Selector (Demo) ──
  function buildStageSelector() {
    if (!window.AlmondTree) return;
    const stages = window.AlmondTree.stages;
    $stageSelector.innerHTML = stages.map((s, i) => `
      <div class="stage-dot-wrapper" data-stage="${i}" role="button" tabindex="0" aria-label="Preview ${s.name}">
        <div class="stage-dot"></div>
        <span class="stage-dot-label">${s.name}</span>
      </div>`).join("");

    $stageSelector.addEventListener("click", (e) => {
      const wrapper = e.target.closest(".stage-dot-wrapper");
      if (!wrapper) return;
      fetchAndRender(parseInt(wrapper.dataset.stage, 10));
    });
    $stageSelector.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const wrapper = e.target.closest(".stage-dot-wrapper");
        if (!wrapper) return;
        e.preventDefault();
        fetchAndRender(parseInt(wrapper.dataset.stage, 10));
      }
    });
  }

  function setupDemoControls() {
    if (!$demoHarvestsSlider) return;
    // Dragging fires "input" on every pixel of movement — far more often
    // than there's any point re-fetching. Coalesce with a short timer rather
    // than requestAnimationFrame: rAF is paused while the tab is hidden/
    // backgrounded, which would silently stop the slider updating in that
    // state; setTimeout keeps firing regardless of tab visibility.
    let renderTimer = null;
    $demoHarvestsSlider.addEventListener("input", () => {
      demoHarvests = parseInt($demoHarvestsSlider.value, 10);
      $demoHarvestsCount.textContent = demoHarvests;
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        fetchAndRender(currentStage >= 0 ? currentStage : 0);
      }, 16);
    });

    // Real readers get the replay automatically; in the demo it's a button,
    // replaying from 3 stages below whatever stage is selected.
    const $replayBtn = document.getElementById("demo-replay-btn");
    if ($replayBtn) {
      $replayBtn.addEventListener("click", () => {
        if (!currentData || !window.AlmondTree) return;
        const stages = window.AlmondTree.stages;
        const fromPoints = stages[Math.max(0, currentData.stage.index - 3)].need;
        if (fromPoints >= currentData.points) return;
        const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 19).replace("T", " ");
        playGrowthReplay(currentData, { fromPoints, harvestedSince: 0, at: threeDaysAgo }, ++renderRequestId);
      });
    }
  }

  function updateStageSelector(activeIndex) {
    const wrappers = $stageSelector.querySelectorAll(".stage-dot-wrapper");
    wrappers.forEach((w, i) => {
      w.classList.toggle("active", i === activeIndex);
      w.classList.toggle("passed", i < activeIndex);
    });
  }

  // ── Particle System ──
  function updateParticles(stageIndex) {
    if (particleInterval) { clearInterval(particleInterval); particleInterval = null; }
    $particleContainer.innerHTML = "";
    if (!window.AlmondTree) return;
    const stageData = window.AlmondTree.stages[stageIndex];
    if (!stageData) return;
    const type = stageData.particleType;
    if (!type) return;
    particleInterval = setInterval(() => {
      if ($particleContainer.children.length > 25) return;
      spawnParticle(type);
    }, 800);
    for (let i = 0; i < 5; i++) setTimeout(() => spawnParticle(type), i * 200);
  }

  function spawnParticle(type) {
    const particle = document.createElement("div");
    particle.className = `particle ${type}`;
    const startX  = Math.random() * 100;
    const driftX  = (Math.random() - 0.5) * 80;
    const driftY  = 150 + Math.random() * 200;
    const spin    = Math.random() * 360;
    const duration = 4 + Math.random() * 6;
    particle.style.left = `${startX}%`;
    particle.style.top  = `${10 + Math.random() * 30}%`;
    particle.style.setProperty("--drift-x", `${driftX}px`);
    particle.style.setProperty("--drift-y", `${driftY}px`);
    particle.style.setProperty("--spin", `${spin}deg`);
    particle.style.animationDuration = `${duration}s`;
    $particleContainer.appendChild(particle);
    setTimeout(() => { if (particle.parentNode) particle.parentNode.removeChild(particle); }, duration * 1000);
  }

  // ── Utilities ──
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
