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
  let demoStreakState   = "lit";
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
  const $streakHint       = document.getElementById("streak-hint");
  const $stageBanner      = document.querySelector(".stage-banner");
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
      url = `${DEMO_API}?stage=${stageIndex}&harvests=${demoHarvests}&streakState=${demoStreakState}`;
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
    renderStreakHint(data);
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
    // Snapshots from before streaks were recorded have no streak: treat
    // the lights as already there rather than flying them all in.
    const fromStreak = typeof last.streak === "number" ? last.streak : data.streak;
    return { fromPoints, fromStreak, harvestedSince: Math.max(0, harvestedSince), at: last.at };
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

  // Continuous growth position: stage index + how far through that stage.
  function growthFor(points) {
    const stages = window.AlmondTree.stages;
    const idx = stageIndexForPoints(points);
    const next = stages[idx + 1];
    return idx + (next ? (points - stages[idx].need) / (next.need - stages[idx].need) : 1);
  }

  // Labels/progress/particles only — the tree itself is drawn once by the
  // replay and animates its own growth.
  function showFrameLabels(frame) {
    setStageText(frame);
    renderProgress(frame);
    updateParticles(frame.stage.index);
  }

  async function playGrowthReplay(data, replay, requestId) {
    const stages = window.AlmondTree.stages;
    const startStage = stageIndexForPoints(replay.fromPoints);

    // Your tree as it is now, with everything grown since the last visit
    // animating in: it rises from its old height, new branches draw outward
    // and new leaf clusters pop in one after another. Drawn once, so the
    // animation runs uninterrupted (stepping through a re-draw per stage
    // swapped whole trees and read as a slideshow, not growth).
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fromStreak = typeof replay.fromStreak === "number" ? replay.fromStreak : data.streak;
    renderTree(data, false, {
      sproutFrom: growthFor(replay.fromPoints),
      fromStreak: reduceMotion ? data.streak : fromStreak,
    });
    sizeCurrentTree(data.stage.index);

    // Labels start where they were — same task as the final render that
    // preceded this, so the browser never paints the final state first.
    showFrameLabels(replayFrame(data, replay.fromPoints));
    setValueNow($pointsValue, replay.fromPoints);
    if ($streakValue) setValueNow($streakValue, Math.min(fromStreak, data.streak));
    // Not earned yet at the replay's starting point — but hide it without
    // collapsing its space, or everything below jumps twice.
    if ($harvestSection) $harvestSection.style.visibility = "hidden";
    showReplayBanner(data, replay, startStage, fromStreak);

    if (!reduceMotion) {
      // Count up through each stage crossed, then the exact current points,
      // in step with the tree's sprouting (~3s). Every stage crossed gets
      // its own little celebration; the one you've landed on gets the
      // "New stage!" ribbon.
      const steps = [];
      for (let s = startStage + 1; s <= data.stage.index; s++) steps.push({ pts: stages[s].need, stage: s });
      if (!steps.length || steps[steps.length - 1].pts !== data.points) steps.push({ pts: data.points });
      const stepMs = Math.max(650, Math.min(1100, 3300 / steps.length));

      await sleep(600);
      for (const step of steps) {
        if (requestId !== renderRequestId) return; // superseded (e.g. demo control clicked)
        showFrameLabels(replayFrame(data, step.pts));
        animateValue($pointsValue, step.pts);
        if (step.stage !== undefined) celebrateStage(step.stage, step.stage === data.stage.index);
        await sleep(stepMs);
      }
    } else if (data.stage.index > startStage) {
      celebrateStage(data.stage.index, true);
    }
    if (requestId !== renderRequestId) return;

    showFrameLabels(data);
    renderStats(data);
    renderHarvestButton(data);
    updateStageSelector(data.stage.index);
    setTimeout(hideReplayBanner, 4000);
  }

  function showReplayBanner(data, replay, startStage, fromStreak) {
    if (!$growthReplay) return;
    const stages = window.AlmondTree.stages;
    const gained = data.points - replay.fromPoints;
    const parts = [];
    if (gained > 0) parts.push(`<strong>+${gained} points</strong>`);
    if (data.stage.index !== startStage) parts.push(`${stages[startStage].name} → ${data.stage.name}`);
    if (data.streak > fromStreak) parts.push(`${data.streak}-day streak`);
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
  function setStageText(data) {
    const stageData = window.AlmondTree && window.AlmondTree.stages[data.stage.index];
    $stageName.textContent = data.stage.name;
    $stageDescription.textContent = stageData ? stageData.description : "";
  }

  // `opts.sproutFrom`: growth at the last visit — see playGrowthReplay.
  function renderTree(data, animate, opts) {
    if (typeof window.AlmondTree === "undefined") {
      $treeContainer.innerHTML = '<p style="color:var(--text-muted)">Tree renderer not loaded</p>';
      return;
    }
    setStageText(data);
    const num = currentTreeNumber(data);
    // Not `|| 0.5`: progress 0 (exactly at a stage threshold) is real and
    // must draw the tree at the start of the stage, not halfway through.
    const progress = typeof data.stageProgress === "number" ? data.stageProgress : 0.5;
    window.AlmondTree.render($treeContainer, data.stage.index, animate, progress, num, treeLook(num), opts || {});
    renderStreakLights(data, opts && opts.fromStreak);
  }

  // ── Streak lights ──
  // The streak lives ON the tree: a firefly for every day in a row, and
  // every full week those seven fireflies become one lantern. Coming back
  // and seeing tonight's new light arrive is the "I'm keeping it going"
  // moment. They dim while today hasn't been read yet, and fly off when a
  // day is missed (streakState from the server — see streakStatus).
  // Plain HTML moved with transform/opacity only, like .tree-fx: composited,
  // nothing animates inside the tree SVG.
  const DAYS_PER_LANTERN = 7;
  const MAX_LANTERNS = 8;
  const LANTERN_SVG =
    '<svg viewBox="0 0 16 22" width="15" height="21" aria-hidden="true">' +
    '<rect x="6" y="0.5" width="4" height="2.5" rx="1" fill="#6B4423"/>' +
    '<path d="M3.2 3.4 Q8 2.2 12.8 3.4 Q15.6 10 12.8 17.4 Q8 18.8 3.2 17.4 Q0.4 10 3.2 3.4Z" fill="#F2A23A"/>' +
    '<path d="M5.4 4 Q8 3.4 10.6 4 Q12.6 10 10.6 16.8 Q8 17.4 5.4 16.8 Q3.4 10 5.4 4Z" fill="#FFD36E"/>' +
    '<ellipse cx="8" cy="10.4" rx="2.2" ry="4.2" fill="#FFF4C2"/>' +
    '<rect x="5.5" y="17.6" width="5" height="2.4" rx="1" fill="#6B4423"/>' +
    '</svg>';

  // Light i's spot around the canopy — golden-angle scatter so any count
  // spreads evenly, and the same index always lands in the same place.
  function streakLightPos(i) {
    const a = i * 2.39996 + 0.6;
    const r = 0.72 + 0.28 * ((i * 0.618034) % 1); // towards the canopy's edge, clear of the almonds
    return { x: 50 + Math.cos(a) * r * 46, y: 42 + Math.sin(a) * r * 38 };
  }

  function streakLightCounts(streak) {
    const lanterns = Math.min(MAX_LANTERNS, Math.floor(streak / DAYS_PER_LANTERN));
    return { lanterns, fireflies: streak % DAYS_PER_LANTERN };
  }

  // `fromStreak` (growth replay): the streak at the last visit — lights
  // earned since then fly in, and fireflies that completed a week merge
  // into their new lantern.
  function renderStreakLights(data, fromStreak) {
    const streak = data.streak || 0;
    const layer = document.createElement("div");
    layer.className = `streak-lights${data.streakState === "waiting" ? " is-waiting" : ""}`;
    layer.setAttribute("aria-hidden", "true");
    $treeContainer.appendChild(layer);
    if (streak <= 0) return;

    const now = streakLightCounts(streak);
    const replaying = typeof fromStreak === "number" && fromStreak < streak;
    const was = streakLightCounts(replaying ? Math.max(0, fromStreak) : streak);
    const newLantern = replaying && now.lanterns > was.lanterns;
    let delay = 0.9; // after the replay's opening beat
    const nextDelay = () => { const d = delay; delay += 0.45; return d; };

    // Fireflies that just completed a week gather into their lantern.
    if (newLantern) {
      const target = streakLightPos(was.lanterns);
      for (let j = 0; j < was.fireflies; j++) {
        const from = streakLightPos(was.lanterns + j);
        const ghost = document.createElement("span");
        ghost.className = "streak-light is-firefly is-merging";
        ghost.style.cssText =
          `--x0:${from.x.toFixed(1)}%; --y0:${from.y.toFixed(1)}%; --x1:${target.x.toFixed(1)}%; --y1:${target.y.toFixed(1)}%;` +
          `animation-delay:${(delay + j * 0.08).toFixed(2)}s`;
        ghost.innerHTML = '<span class="sl-drift"><span class="sl-glow"></span></span>';
        layer.appendChild(ghost);
      }
      if (was.fireflies) delay += 1.1;
    }

    const total = now.lanterns + now.fireflies;
    for (let i = 0; i < total; i++) {
      const isLantern = i < now.lanterns;
      const arriving = replaying && (isLantern
        ? i >= was.lanterns
        : newLantern || (i - now.lanterns) >= was.fireflies);
      const pos = streakLightPos(i);
      const light = document.createElement("span");
      light.className = `streak-light ${isLantern ? "is-lantern" : "is-firefly"}${arriving ? " is-arriving" : ""}`;
      const fromX = (((i * 53) % 120) - 60).toFixed(0);
      light.style.cssText =
        `left:${pos.x.toFixed(1)}%; top:${pos.y.toFixed(1)}%;` +
        `--drift-dur:${(4.5 + (i % 4) * 0.8).toFixed(1)}s; --drift-delay:-${((i * 1.7) % 5).toFixed(1)}s;` +
        `--from-x:${fromX}px; --from-y:${70 + (i * 29) % 50}px` +
        (arriving ? `; animation-delay:${nextDelay().toFixed(2)}s` : "");
      light.innerHTML = `<span class="sl-drift"><span class="sl-glow">${isLantern ? LANTERN_SVG : ""}</span></span>`;
      layer.appendChild(light);
    }
  }

  // One plain line under the tree saying what the lights mean — and, if
  // today hasn't been read yet, what to do to keep them.
  function renderStreakHint(data) {
    if (!$streakHint) return;
    const streak = data.streak || 0;
    const state = data.streakState || (streak > 0 ? "lit" : "none");
    let html;
    if (state === "waiting" && streak > 0) {
      html = `<strong>Keep your lights glowing</strong> — read today's email to make it a ${streak + 1}-day streak`;
    } else if (state === "broken") {
      html = `<strong>Your fireflies flew off</strong> — read today's email to light the first one again`;
    } else if (streak > 0) {
      html = `<strong>${streak}-day streak</strong> · a firefly a day, a lantern a week`;
    } else {
      html = `Read today's email to light your first firefly`;
    }
    $streakHint.innerHTML = `<span class="streak-hint-dot" aria-hidden="true"></span><span>${html}</span>`;
    $streakHint.classList.toggle("is-waiting", state === "waiting" || state === "broken");
    $streakHint.hidden = false;
  }

  // ── Stage-up celebration ──
  // A burst of golden sparks and petals from the canopy, a ring of light,
  // the stage name popping — and on the stage you've landed on, a "New
  // stage!" ribbon on the banner. HTML/CSS only, removed once it's played.
  function celebrateStage(stageIndex, isLanding) {
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stages = window.AlmondTree.stages;
    const fullyGrown = stageIndex === stages.length - 1;

    if (!reduceMotion) {
      const burst = document.createElement("div");
      burst.className = `stage-burst${isLanding ? " is-landing" : ""}`;
      burst.setAttribute("aria-hidden", "true");
      let sparks = '<span class="sb-flash"></span><span class="sb-ring"></span>';
      const count = isLanding ? 18 : 12;
      for (let k = 0; k < count; k++) {
        const angle = (360 / count) * k + ((k * 37) % 13);
        const dist = (isLanding ? 70 : 50) + ((k * 41) % 45);
        const kind = k % 3 === 0 ? "is-petal" : "";
        sparks += `<span class="sb-spark ${kind}" style="--a:${angle.toFixed(0)}deg; --dist:${dist}px; animation-delay:${((k % 4) * 0.04).toFixed(2)}s"></span>`;
      }
      burst.innerHTML = sparks;
      $treeContainer.appendChild(burst);
      setTimeout(() => burst.remove(), 1700);

      $stageName.classList.remove("stage-pop");
      void $stageName.offsetWidth; // restart the animation
      $stageName.classList.add("stage-pop");
    }

    if (isLanding && $stageBanner) {
      const old = $stageBanner.querySelector(".stage-new-chip");
      if (old) old.remove();
      const chip = document.createElement("span");
      chip.className = "stage-new-chip";
      chip.textContent = fullyGrown ? "Fully grown!" : "New stage!";
      $stageBanner.appendChild(chip);
      setTimeout(() => chip.classList.add("is-leaving"), 4200);
      setTimeout(() => chip.remove(), 4800);
    }
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
      const perDollar = pointValues.purchase.perDollarSpent;
      $purchase.textContent = `+${perDollar} pt${perDollar === 1 ? "" : "s"} per $1`;
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
    // Median across tree shapes/looks at progress=1 (continuous-growth
    // renderer). Within a stage the tree grows inside this box.
    { x: 166.0, y: 465.9, width: 68.0,  height: 62.1  },
    { x: 150.8, y: 277.3, width: 98.6,  height: 252.1 },
    { x: 129.5, y: 199.1, width: 150.5, height: 333.0 },
    { x: 98.1,  y: 143.6, width: 219.9, height: 388.4 },
    { x: 64.9,  y: 69.1,  width: 282.5, height: 462.5 },
    { x: 73.6,  y: 87.8,  width: 273.7, height: 445.6 },
    { x: 49.5,  y: 52.8,  width: 326.3, height: 486.8 },
    { x: 19.0,  y: 26.1,  width: 359.4, height: 514.1 },
    { x: 3.5,   y: -0.2,  width: 392.0, height: 533.4 },
    { x: 0.2,   y: -24.8, width: 408.9, height: 559.5 },
    { x: -0.2,  y: -49.4, width: 432.8, height: 599.6 },
    { x: -3.5,  y: -53.2, width: 450.4, height: 586.3 },
    { x: -7.0,  y: -65.3, width: 450.6, height: 614.0 },
    { x: -8.2,  y: -66.4, width: 452.9, height: 631.9 },
  ];

  // Every tree has an identity for its whole life: tree #N (the Nth tree a
  // reader grows) always has look TREE_LOOK_ORDER[N-1] and branch shape N.
  // So the tree you grow is the tree you harvest — it doesn't turn into a
  // different tree when it joins the forest. Order follows Harry's examples
  // (green, brown, light green, dark green...); #1 is the classic almond.
  const TREE_LOOK_ORDER = ["blossom", "autumn", "spring", "summer", "white", "golden"];
  function treeLook(treeNumber) {
    return TREE_LOOK_ORDER[(treeNumber - 1) % TREE_LOOK_ORDER.length];
  }
  function currentTreeNumber(data) {
    return (data.totalHarvests || 0) + 1;
  }

  // Each look's own little animation over its tree: drifting petals for
  // the blossom trees, falling leaves for the brown one, butterflies, fire-
  // flies, sparkles. Positions/timings come from the tree number, so a
  // tree's effect is stable across re-renders rather than reshuffling.
  const TREE_FX_COUNT = { blossom: 5, white: 5, autumn: 5, spring: 2, summer: 5, golden: 6 };
  function createTreeFx(look, treeNumber) {
    const fx = document.createElement("div");
    fx.className = `tree-fx fx-${look}`;
    const count = TREE_FX_COUNT[look] || 0;
    for (let p = 0; p < count; p++) {
      const seed = treeNumber * 31 + p * 17;
      const s = document.createElement("span");
      s.style.cssText =
        `left:${12 + (seed % 72)}%; top:${10 + ((seed * 7) % 38)}%;` +
        `animation-delay:-${((seed % 60) / 10).toFixed(1)}s; animation-duration:${(5 + (seed % 5) * 0.7).toFixed(1)}s`;
      if (look === "spring" && window.Art) s.innerHTML = window.Art.badge("butterfly", 16);
      fx.appendChild(s);
    }
    return fx;
  }

  // Harvested trees stay the Enchanted Grove tree the reader grew (compact
  // render — see AlmondTree.render). Bounds measured for that render across
  // looks/variants; the widest shapes spill slightly rather than shrinking
  // every tree to fit them.
  const FOREST_TREE_STAGE = 13;
  const FOREST_TREE_BOUNDS = { x: -8.2, y: -66.4, width: 451.8, height: 622.2 }; // median across looks/shapes

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
  // Early stages start big (0.97x at Sapling, was 0.62x): for a new reader
  // the young tree is the whole show, and a ~100px sapling in a wide forest
  // read as "a bare stick in an empty field" (Harry's screenshot).
  function currentTreeHeightScale(stageIndex) {
    if (stageIndex === 0) return 0.5; // the seed sprite is tiny by nature
    const last = TREE_BOUNDS_BY_STAGE.length - 1;
    const t = Math.max(0, Math.min(1, stageIndex / last));
    return 0.8 + 1.0 * Math.pow(t, 0.7); // ~0.97x (Sapling) .. 1.8x (Enchanted Grove)
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
    L.scene.style.height = `${sceneHeightFor(stageIndex)}px`;
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

    // The tree you're growing now is the focal point, in the middle; the
    // trees you've harvested stand around it — alternating left and right,
    // working outward, most recent closest. Each ring sits in a depth row
    // (front / middle / back: smaller, higher, hazier) that differs from
    // its neighbours, with a little size/position jitter, so the whole thing
    // reads as one forest around your tree rather than a queue.
    const containerWidth = $gardenBackdrop.clientWidth || 380;
    const half = containerWidth / 2;
    const DEPTHS = [
      { cls: "is-front", scale: 1.0,  bottom: 8,  z: 3 },
      { cls: "is-mid",   scale: 0.8,  bottom: 30, z: 2 },
      { cls: "is-back",  scale: 0.62, bottom: 52, z: 1 },
    ];
    const DEPTH_BY_RING = [1, 0, 2, 0, 1]; // ring 1 flanks your tree from just behind it
    // Rings overlap heavily — neighbouring rings are in different depth
    // rows, so they layer rather than merge — which keeps trees big enough
    // to read individually even with a full forest.
    const FIRST_RING = 0.6, RING_STEP = 0.42; // offsets from the middle, in front-tree widths
    const perSide = Math.ceil(m / 2);
    const reach = FIRST_RING + RING_STEP * Math.max(0, perSide - 1);
    const frontWidth = Math.max(70, Math.min(120, (half * 0.9) / Math.max(reach, 1)));

    const treeSlots = []; // {xPercent, width, height, bottom} — reused below to anchor critters to a real tree
    let sceneTop = 0; // tallest point above the ground, to size the scene

    shown.forEach((h, i) => {
      const num = h.harvestNumber || i + 1;
      const pts = h.pointsAtHarvest || 0;
      const k = m - 1 - i;                  // 0 = most recently harvested
      const side = k % 2 === 0 ? -1 : 1;
      const ring = Math.floor(k / 2) + 1;
      const d = DEPTHS[DEPTH_BY_RING[(ring - 1) % DEPTH_BY_RING.length]];
      const sizeJitter = 0.9 + ((num * 37) % 21) / 100;            // 0.90 – 1.10
      const xJitter = (((num * 53) % 17) - 8) * (frontWidth / 120); // a few px either way
      const width = frontWidth * d.scale * sizeJitter;
      const height = width * 1.37;
      const offset = (FIRST_RING + RING_STEP * (ring - 1)) * frontWidth;
      const centerPx = Math.max(width / 2, Math.min(containerWidth - width / 2, half + side * offset + xJitter));
      const x = (centerPx / containerWidth) * 100;
      const look = treeLook(num);

      const slot = document.createElement("div");
      slot.className = `grove-tree ${d.cls}`;
      slot.style.cssText = `left:${x.toFixed(2)}%; bottom:${d.bottom}px; z-index:${d.z}; width:${width.toFixed(0)}px; height:${height.toFixed(0)}px; --d:${(k * 0.06).toFixed(2)}s`;
      slot.title = `Tree #${num} — harvested at ${pts} pts`;

      // Each tree sways at its own pace, and carries a small effect that
      // matches its look (falling petals, autumn leaves, sparkles...). Both
      // are CSS animations on plain HTML elements — composited, so no SVG
      // repaints, unlike animating inside the tree's SVG (which is what
      // lagged the page when every tree did it).
      const art = document.createElement("div");
      art.className = "grove-tree-art";
      art.id = `grove-tree-${i}`;
      art.style.cssText = `--sway-dur:${(6 + (num % 4)).toFixed(1)}s; --sway-delay:-${(num * 1.3) % 6}s`;
      slot.appendChild(art);
      slot.appendChild(createTreeFx(look, num));
      scene.appendChild(slot);

      treeSlots.push({ xPercent: x, width, height, bottom: d.bottom });
      sceneTop = Math.max(sceneTop, d.bottom + height);
    });

    // Your current tree: centred, in front. Sized off a fixed base rather
    // than the forest's (shrinking) front-tree width, so the focal tree
    // doesn't get smaller as the forest around it grows.
    currentTreeLayout = {
      scene,
      frontWidth: Math.min(115, containerWidth * 0.3),
      containerWidth,
      baseCenterPx: half,
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

      // Bigger than before, and alive: each critter idles (hops, bobs) on a
      // composited wrapper, staggered so they don't move in unison.
      const size = isPerched ? 44 : 56;
      prop.innerHTML =
        `<div class="critter-idle critter-${c.type}" style="animation-delay:-${((i * 0.9) % 3).toFixed(1)}s">` +
        window.Art.critter(c.type, size) + `</div>`;
      scene.appendChild(prop);
    });

    if (hidden > 0) {
      const more = document.createElement("span");
      more.className = "grove-more";
      more.textContent = `+${hidden} more`;
      scene.appendChild(more);
    }

    if (typeof window.AlmondTree !== "undefined") {
      // A harvested tree is the same tree the reader grew — same look, same
      // shape — still in its Enchanted Grove glory, not a plain stand-in.
      shown.forEach((h, i) => {
        const container = document.getElementById(`grove-tree-${i}`);
        if (!container) return;
        const num = h.harvestNumber || i + 1;
        window.AlmondTree.render(container, FOREST_TREE_STAGE, false, 1, num, treeLook(num), { compact: true });
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
    if (data.canHarvest) {
      $harvestSection.style.display = "";
      $harvestBtn.disabled = false;
      $harvestBtn.textContent = "Harvest Your Tree";
    } else {
      $harvestSection.style.display = "none";
    }
  }

  // Demo harvest: no subscriber to save to, so it's simulated client-side —
  // the tree joins the demo forest (same look it was grown in), the
  // celebration plays, and the next tree starts from a seed. Cosmetic
  // matches what the demo API hands out for that harvest number.
  const DEMO_HARVEST_COSMETICS = [
    { type: "bunny", label: "Bunny", rarity: "common" },
    { type: "fox", label: "Fox", rarity: "common" },
    { type: "gnome_house", label: "Gnome House", rarity: "common" },
    { type: "hedgehog", label: "Hedgehog", rarity: "uncommon" },
    { type: "wildflowers", label: "Wildflowers", rarity: "common" },
    { type: "owl", label: "Owl", rarity: "uncommon" },
    { type: "deer", label: "Deer", rarity: "rare" },
    { type: "fairy_lantern", label: "Fairy Lantern", rarity: "rare" },
  ];
  function demoHarvest() {
    const harvestNumber = demoHarvests + 1;
    demoHarvests = Math.min(harvestNumber, parseInt($demoHarvestsSlider.max, 10));
    $demoHarvestsSlider.value = demoHarvests;
    $demoHarvestsCount.textContent = demoHarvests;
    showHarvestCelebration({
      harvestNumber,
      cosmeticEarned: DEMO_HARVEST_COSMETICS[(harvestNumber - 1) % DEMO_HARVEST_COSMETICS.length],
    });
  }

  function setupHarvestButton() {
    if (!$harvestBtn || !$harvestContinue) return; // embed.html has no harvest UI
    $harvestBtn.addEventListener("click", async () => {
      if (!isRealMode) { demoHarvest(); return; }
      if (!realSubscriberId) return;
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
        $harvestBtn.textContent = "Harvest Your Tree";
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
        const fromStreak = Math.max(0, currentData.streak - 3);
        playGrowthReplay(currentData, { fromPoints, fromStreak, harvestedSince: 0, at: threeDaysAgo }, ++renderRequestId);
      });
    }

    // Preview the streak states a real reader can be in (see streakStatus).
    const $streakStates = document.getElementById("demo-streak-states");
    if ($streakStates) {
      $streakStates.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-state]");
        if (!btn) return;
        demoStreakState = btn.dataset.state;
        $streakStates.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        fetchAndRender(currentStage >= 0 ? currentStage : 0);
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
