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
    butterfly:  { icon: "🦋", label: "Butterfly",   rarity: "common" },
    bird:       { icon: "🐦", label: "Songbird",    rarity: "uncommon" },
    rare_seed:  { icon: "🌱", label: "Rare Seed",   rarity: "rare" },
    golden_can: { icon: "✨", label: "Golden Can",  rarity: "epic" },
    rainbow:    { icon: "🌈", label: "Rainbow",     rarity: "epic" },
    legendary:  { icon: "👑", label: "Legendary",   rarity: "legendary" },
  };

  const RARITY_COLORS = {
    common:    "var(--text-muted)",
    uncommon:  "#6BCB77",
    rare:      "#4ECDC4",
    epic:      "#C77DFF",
    legendary: "#FFD700",
  };

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
  // Forest
  const $forestSection    = document.getElementById("forest-section");
  const $forestCount      = document.getElementById("forest-count");
  const $forestScene      = document.getElementById("forest-scene");
  const $cosmeticsShelf   = document.getElementById("cosmetics-shelf");
  const $cosmeticsGrid    = document.getElementById("cosmetics-grid");
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
      const meta = REWARD_META[r.reward_type] || { icon: "🎁", label: r.reward_type, rarity: "common" };
      return `<div class="reward-item" data-rarity="${meta.rarity}">
        <span class="reward-icon">${meta.icon}</span>
        <span class="reward-name">${meta.label}</span>
        <span class="reward-qty">×${r.count}</span>
      </div>`;
    }).join("");
  }

  // ── Forest Rendering ──
  function renderForest(data) {
    const totalHarvests = data.totalHarvests || 0;
    const cosmetics     = data.cosmetics || [];
    const forest        = data.forest    || [];

    if (totalHarvests === 0) {
      $forestSection.style.display = "none";
      return;
    }

    $forestSection.style.display = "";
    $forestCount.textContent = `${totalHarvests} tree${totalHarvests !== 1 ? "s" : ""} grown`;

    // Build panoramic forest scene: small completed trees, current growing tree implied
    const CDN = "https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji/color/svg/";
    // Completed trees use the full-grown Enchanted Grove emoji style (1F333)
    const completedTreeEmoji = "1F333";

    let sceneHTML = "";

    // Completed trees (up to 6 shown, then "+N more")
    const MAX_VISIBLE = 6;
    const visible = forest.slice(0, MAX_VISIBLE);

    visible.forEach((h, i) => {
      const treeSize = Math.max(50, 80 - i * 5); // perspective shrink
      const cosmetic = data.cosmetics ? data.cosmetics[i] : null;
      const cosmeticHTML = cosmetic
        ? `<div class="forest-tree-cosmetic" title="${cosmetic.label}">${cosmetic.icon}</div>`
        : "";
      sceneHTML += `
        <div class="forest-tree-item" style="animation-delay:${i * 0.12}s">
          <img src="${CDN}${completedTreeEmoji}.svg"
               alt="Completed Tree ${h.harvestNumber}"
               class="forest-tree-img"
               width="${treeSize}" height="${treeSize}"
               title="Tree #${h.harvestNumber} — harvested with ${h.pointsAtHarvest} pts"
          >
          ${cosmeticHTML}
          <span class="forest-tree-num">#${h.harvestNumber}</span>
        </div>`;
    });

    if (forest.length > MAX_VISIBLE) {
      sceneHTML += `<div class="forest-tree-more">+${forest.length - MAX_VISIBLE}<br>more</div>`;
    }

    $forestScene.innerHTML = sceneHTML;

    // Cosmetics shelf
    if (cosmetics.length > 0) {
      $cosmeticsShelf.style.display = "";
      $cosmeticsGrid.innerHTML = cosmetics.map(c => `
        <div class="cosmetic-item" data-rarity="${c.rarity || "common"}" title="${c.label}">
          <span class="cosmetic-icon">${c.icon}</span>
          <span class="cosmetic-name">${c.label}</span>
          <span class="cosmetic-rarity" style="color:${RARITY_COLORS[c.rarity] || "inherit"}">${c.rarity}</span>
        </div>`).join("");
    } else {
      $cosmeticsShelf.style.display = "none";
    }
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
    $harvestEmoji.textContent       = "🌾";
    $harvestSub.textContent         = `Tree #${result.harvestNumber} added to your forest!`;
    $harvestCosmeticIcon.textContent  = cosmetic.icon;
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
