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
    const data = await fetchTreeData(stageIndex);
    if (!data) return;
    currentData = data;

    const newStage    = data.stage.index;
    const shouldAnimate = newStage !== currentStage;

    if (shouldAnimate && currentStage >= 0) {
      $treeContainer.classList.add("fade-out");
      await sleep(300);
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
      $treeContainer.classList.remove("fade-in");
    }

    currentStage = newStage;
  }

  // ── Tree Rendering ──
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

  function animateValue(el, targetValue) {
    const startValue = parseInt(el.textContent) || 0;
    if (startValue === targetValue) { el.textContent = targetValue; return; }
    const duration = 600, steps = 30;
    const increment = (targetValue - startValue) / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step >= steps) { el.textContent = targetValue; clearInterval(timer); }
      else el.textContent = Math.round(startValue + increment * step);
    }, duration / steps);
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
    if ($purchase && pointValues.purchase !== undefined) {
      $purchase.textContent = `+${pointValues.purchase} pts`;
    }
  }

  // ── Forest Rendering (into unified garden scene) ──

  const GROVE_MAX_TREES = 9;

  // The tree renderer draws well outside its 400x550 viewBox at late stages and
  // paints two full-bleed tint rects. In the full-width hero that's invisible,
  // but in a small grove tile the rects show up as boxes and the canopy gets
  // clipped. Strip the rects, then refit the viewBox to the real content.
  function fitTreeToBox(container) {
    const svg = container.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("rect").forEach((r) => {
      if (parseFloat(r.getAttribute("width")) >= 400 && parseFloat(r.getAttribute("height")) >= 550) {
        r.remove();
      }
    });

    let box;
    try { box = svg.getBBox(); } catch (_) { return; }
    if (!box || !box.width || !box.height) return;

    const pad = 8;
    svg.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
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

    if (totalHarvests === 0) {
      $gardenBackdrop.style.display = "none";
      return;
    }
    $gardenBackdrop.style.display = "";

    // The current growing tree stays the hero (rendered in #tree-container).
    // This is the grove of past harvests: trees staggered across two depth
    // rows so it reads as a little treeline rather than a row of clones.
    const head = document.createElement("div");
    head.className = "grove-head";
    head.innerHTML =
      `<span class="grove-title">Your Forest</span>` +
      `<span class="grove-count">${totalHarvests} tree${totalHarvests === 1 ? "" : "s"} grown</span>`;
    $gardenBackdrop.appendChild(head);

    const scene = document.createElement("div");
    scene.className = "grove-scene";
    $gardenBackdrop.appendChild(scene);

    const shown  = forest.slice(0, GROVE_MAX_TREES);
    const hidden = forest.length - shown.length;

    shown.forEach((h, i) => {
      const isBack = i % 2 === 1;
      const x = ((i + 0.5) / shown.length) * 100;
      const num = h.harvestNumber || i + 1;
      const pts = h.pointsAtHarvest || 0;

      const slot = document.createElement("div");
      slot.className = `grove-tree ${isBack ? "is-back" : "is-front"}`;
      slot.style.cssText = `left:${x.toFixed(2)}%; --d:${(i * 0.06).toFixed(2)}s`;
      slot.title = `Tree #${num} — harvested at ${pts} pts`;

      const art = document.createElement("div");
      art.className = "grove-tree-art";
      art.id = `grove-tree-${i}`;
      slot.appendChild(art);
      scene.appendChild(slot);
    });

    // Cosmetics earned from harvests, standing along the front of the grove
    const props = cosmetics.slice(0, 5);
    props.forEach((c, i) => {
      if (!window.Art || !window.Art.hasCritter(c.type)) return;
      const x = 10 + ((i + 0.5) / props.length) * 80;
      const prop = document.createElement("div");
      prop.className = "grove-prop";
      prop.dataset.rarity = c.rarity || "common";
      prop.style.cssText = `left:${x.toFixed(2)}%; --d:${(0.3 + i * 0.08).toFixed(2)}s`;
      prop.title = `${c.label} (${c.rarity})`;
      prop.innerHTML = window.Art.critter(c.type, 40);
      scene.appendChild(prop);
    });

    if (hidden > 0) {
      const more = document.createElement("span");
      more.className = "grove-more";
      more.textContent = `+${hidden} more`;
      scene.appendChild(more);
    }

    if (typeof window.AlmondTree !== "undefined") {
      const maxStage = (window.AlmondTree.stages || []).length - 1;
      shown.forEach((h, i) => {
        const container = document.getElementById(`grove-tree-${i}`);
        if (!container) return;
        // fall back to the final stage — harvesting is only possible there
        const stage = h.pointsAtHarvest ? stageIndexForPoints(h.pointsAtHarvest) : maxStage;
        window.AlmondTree.render(container, stage, false, 1);
        fitTreeToBox(container);
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
    $demoHarvestsSlider.addEventListener("input", () => {
      demoHarvests = parseInt($demoHarvestsSlider.value, 10);
      $demoHarvestsCount.textContent = demoHarvests;
      fetchAndRender(currentStage >= 0 ? currentStage : 0);
    });
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
