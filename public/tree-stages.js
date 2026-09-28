(function() {
  const svgNS = "http://www.w3.org/2000/svg";
  
  // Seeded random for consistent tree generation per stage
  let randomSeed = 1;
  let currentProgress = 0.5;
  function random() {
    let x = Math.sin(randomSeed++) * 10000;
    return x - Math.floor(x);
  }
  function randomRange(min, max) {
    return min + random() * (max - min);
  }

  // Inject CSS if not present
  function injectStyles() {
    if (document.getElementById('almond-tree-styles')) return;
    const style = document.createElement('style');
    style.id = 'almond-tree-styles';
    style.innerHTML = `
      .tree-container svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .tree-enter {
        animation: treeEnter 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        transform-origin: 50% 90%;
      }
      @keyframes treeEnter {
        from { transform: scale(0.2); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .tree-leaf {
        transform-origin: center;
        animation: sway 4s ease-in-out infinite alternate;
      }
      .tree-clump {
        animation: clumpSway 5s ease-in-out infinite alternate;
      }
      @keyframes clumpSway {
        0% { transform: rotate(-0.8deg); }
        100% { transform: rotate(0.8deg); }
      }
      .tree-blossom {
        transform-origin: center;
        animation: pulseSway 3.5s ease-in-out infinite alternate;
      }
      .tree-fruit {
        transform-origin: top center;
        animation: bob 5s ease-in-out infinite alternate;
      }
      .tree-glow {
        animation: pulseGlow 4s ease-in-out infinite alternate;
      }
      .tree-sparkle {
        animation: twinkle 2s ease-in-out infinite alternate;
      }
      .falling {
        animation: fall 6s linear infinite;
      }
      @keyframes sway {
        0% { transform: rotate(-5deg); }
        100% { transform: rotate(5deg); }
      }
      @keyframes pulseSway {
        0% { transform: rotate(-3deg) scale(0.95); }
        100% { transform: rotate(3deg) scale(1.05); }
      }
      @keyframes bob {
        0% { transform: translateY(-2px) rotate(-2deg); }
        100% { transform: translateY(2px) rotate(2deg); }
      }
      @keyframes pulseGlow {
        0% { opacity: 0.4; transform: scale(0.95); }
        100% { opacity: 0.7; transform: scale(1.05); }
      }
      @keyframes twinkle {
        0% { opacity: 0.2; transform: scale(0.8); }
        100% { opacity: 1; transform: scale(1.2); }
      }
      @keyframes fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        80% { opacity: 1; }
        100% { transform: translateY(300px) rotate(360deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function createSVGElement(tag, attrs) {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      el.setAttribute(k, v);
    }
    return el;
  }

  // Trees stand in the painted meadow backdrop, so no big dark soil mound
  // (it read as a hole in the grass). Seed/sapling get a small freshly-
  // planted dirt patch; grown trees just a soft grass shadow and a few
  // short root flares at the trunk base.
  function drawSoil(svg, stageIndex) {
    if (stageIndex <= 1) {
      svg.appendChild(createSVGElement('ellipse', {
        cx: 200, cy: 521, rx: 34, ry: 7, fill: "#6B4A33"
      }));
      return;
    }

    svg.appendChild(createSVGElement('ellipse', {
      cx: 200, cy: 522, rx: 60 + stageIndex * 4, ry: 9, fill: "rgba(30, 55, 25, 0.3)"
    }));

    if (stageIndex >= 3) {
      const rootCount = Math.min(stageIndex, 6);
      for (let i = 0; i < rootCount; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const reach = randomRange(18, 34);
        svg.appendChild(createSVGElement('path', {
          d: `M 200 512 Q ${200 + dir * reach * 0.5} ${518} ${200 + dir * reach} ${522}`,
          stroke: "#5C3A20",
          "stroke-width": randomRange(3, 6),
          fill: "none",
          "stroke-linecap": "round"
        }));
      }
    }
  }

  function drawTrunk(svg, height, baseThickness, color, stageIndex) {
    const topThickness = Math.max(baseThickness * 0.4, 1);
    
    let d = "";
    if (stageIndex >= 8) {
      d = `M ${200 - baseThickness/2} 520 
           Q ${200 - baseThickness/1.5} ${520 - height/2} ${200 - topThickness/2} ${520 - height} 
           L ${200 + topThickness/2} ${520 - height}
           Q ${200 + baseThickness/1.2} ${520 - height/2} ${200 + baseThickness/2} 520 Z`;
    } else {
      d = `M ${200 - baseThickness/2} 520 
           Q ${200 - baseThickness/2.5} ${520 - height/2} ${200 - topThickness/2} ${520 - height} 
           L ${200 + topThickness/2} ${520 - height}
           Q ${200 + baseThickness/2.5} ${520 - height/2} ${200 + baseThickness/2} 520 Z`;
    }

    svg.appendChild(createSVGElement('path', {
      d: d,
      fill: color
    }));

    if (stageIndex >= 3) {
      const lineCount = Math.floor(height / 15) * (stageIndex >= 8 ? 3 : 1);
      for (let i = 0; i < lineCount; i++) {
        const yStart = 520 - randomRange(10, height - 10);
        const yEnd = yStart - randomRange(10, 30);
        const xOffset = randomRange(-baseThickness/3, baseThickness/3);
        svg.appendChild(createSVGElement('path', {
          d: `M ${200 + xOffset} ${yStart} Q ${200 + xOffset + randomRange(-2, 2)} ${(yStart+yEnd)/2} ${200 + xOffset} ${yEnd}`,
          stroke: "#4A2F1D",
          "stroke-width": stageIndex >= 8 ? 2 : 1,
          fill: "none",
          opacity: 0.6
        }));
      }
      
      if (stageIndex >= 8) {
        for(let i=0; i<4; i++) {
          const ky = 520 - randomRange(40, height - 20);
          const kx = 200 + randomRange(-baseThickness/3, baseThickness/3);
          svg.appendChild(createSVGElement('ellipse', {
            cx: kx, cy: ky, rx: randomRange(3, 6), ry: randomRange(5, 12),
            fill: "none", stroke: "#3D2B1F", "stroke-width": 2
          }));
          svg.appendChild(createSVGElement('ellipse', {
            cx: kx, cy: ky, rx: 1.5, ry: 3,
            fill: "#3D2B1F"
          }));
        }
      }
    }
  }

  // A pointed leaf silhouette (two arcs meeting at a base point and a tip),
  // not a plain ellipse blob. Same two-element cost as the shape it
  // replaces (one filled shape + one vein line) — leaves are the most
  // repeated element in the whole tree (hundreds at high stages), so this
  // is the single highest-leverage shape to get right, and it can't afford
  // to add per-leaf overhead like a gradient or extra shape would.
  function drawLeaf(svg, x, y, size, color, rotation) {
    const group = createSVGElement('g', {
      class: "tree-leaf",
      style: `transform-origin: ${x}px ${y}px; animation-delay: ${randomRange(0, 2)}s`
    });

    const tipX = x + size;
    const bow = size * 0.34;
    group.appendChild(createSVGElement('path', {
      d: `M ${x} ${y} Q ${x + size * 0.32} ${y - bow} ${tipX} ${y} Q ${x + size * 0.32} ${y + bow} ${x} ${y} Z`,
      fill: color,
      transform: `rotate(${rotation}, ${x}, ${y})`
    }));

    group.appendChild(createSVGElement('path', {
      d: `M ${x} ${y} Q ${x + size * 0.5} ${y} ${tipX} ${y}`,
      stroke: "rgba(255,255,255,0.35)",
      "stroke-width": Math.max(0.5, size * 0.05),
      fill: "none",
      transform: `rotate(${rotation}, ${x}, ${y})`
    }));

    svg.appendChild(group);
  }

  // Five evenly-spaced petals reading as one designed flower, not a
  // spray of randomly-sized overlapping circles — same element budget
  // as before (this used to go up to 6 petals + 1 centre), just a more
  // deliberate arrangement.
  function drawBlossom(svg, x, y, size) {
    const group = createSVGElement('g', {
      class: "tree-blossom",
      style: `transform-origin: ${x}px ${y}px; animation-delay: ${randomRange(0, 2)}s`
    });

    const petalColor = random() > 0.5 ? "#FADADD" : "#F2A49B";
    const petals = 5;
    const startAngle = randomRange(0, Math.PI * 2);

    for (let i = 0; i < petals; i++) {
      const angle = startAngle + (i / petals) * Math.PI * 2;
      const px = x + Math.cos(angle) * size * 0.72;
      const py = y + Math.sin(angle) * size * 0.72;

      group.appendChild(createSVGElement('circle', {
        cx: px,
        cy: py,
        r: size * 0.6,
        fill: petalColor
      }));
    }

    group.appendChild(createSVGElement('circle', {
      cx: x, cy: y, r: size * 0.38, fill: "#E85D75"
    }));

    svg.appendChild(group);
  }

  function drawAlmond(svg, x, y, size, color) {
    const group = createSVGElement('g', {
      class: "tree-fruit",
      style: `transform-origin: ${x}px ${y}px; animation-delay: ${randomRange(0, 2)}s`
    });
    
    group.appendChild(createSVGElement('path', {
      d: `M ${x} ${y} Q ${x - 2} ${y + 5} ${x} ${y + 10}`,
      stroke: "#5C4033", fill: "none", "stroke-width": 1
    }));
    
    group.appendChild(createSVGElement('ellipse', {
      cx: x, cy: y + 10 + size, rx: size * 0.7, ry: size * 1.2,
      fill: color
    }));
    
    svg.appendChild(group);
  }

  // Foliage is queued during branch recursion and drawn after it, so the
  // canopy sits on top of every branch — drawing it inline let later
  // branches slice across earlier clumps. Inner-joint "filler" clumps are
  // queued before their children, so they end up behind the tip clumps.
  let foliageQueue = [];
  function flushFoliage(svg, originX, originY) {
    const q = foliageQueue;
    foliageQueue = [];
    // Whole canopy sways as one piece around the top of the trunk.
    const canopy = createSVGElement('g', {
      class: "tree-clump",
      style: `transform-origin: ${originX}px ${originY}px`
    });
    const layers = {
      dark:  createSVGElement('g'),
      mid:   createSVGElement('g'),
      light: createSVGElement('g'),
      extra: createSVGElement('g'),
    };
    canopy.appendChild(layers.dark);
    canopy.appendChild(layers.mid);
    canopy.appendChild(layers.light);
    canopy.appendChild(layers.extra);
    q.forEach(([kind, x, y, angle, stageIndex]) => {
      if (kind === "fill") drawClump(layers, x, y, clumpRadius(stageIndex) * 0.9, stageIndex);
      else drawFoliage(layers.extra, x, y, angle, stageIndex, layers);
    });
    svg.appendChild(canopy);
  }

  function buildTreeBranches(svg, x, y, angle, length, thickness, level, maxLevel, stageIndex) {
    if (level > maxLevel) return;

    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    if (maxLevel >= 3 && level >= 2 && level < maxLevel) foliageQueue.push(["fill", endX, endY, angle, stageIndex]);
    
    if (level > 0) {
      const color = stageIndex >= 7 ? "#4A2E19" : "#6B4423";
      const controlX = x + Math.cos(angle - 0.2) * (length * 0.5);
      const controlY = y + Math.sin(angle - 0.2) * (length * 0.5);
      
      svg.appendChild(createSVGElement('path', {
        d: `M ${x} ${y} Q ${controlX} ${controlY} ${endX} ${endY}`,
        stroke: color,
        "stroke-width": thickness,
        fill: "none",
        "stroke-linecap": "round"
      }));
    }

    if (level < maxLevel) {
      let numBranches = 2;
      if (stageIndex >= 3 && random() > 0.4) numBranches = 3;
      if (stageIndex >= 8 && level > 1) numBranches = random() > 0.2 ? 3 : 2;
      
      for (let i = 0; i < numBranches; i++) {
        const spread = (stageIndex >= 7 ? 1.45 : 1.15) + (level * 0.2);
        const newAngle = angle - spread/2 + (spread / (numBranches - 1 || 1)) * i + randomRange(-0.2, 0.2);
        const lengthFactor = randomRange(0.6, 0.85);
        buildTreeBranches(svg, endX, endY, newAngle, length * lengthFactor, thickness * 0.72, level + 1, maxLevel, stageIndex);
      }
    } else {
      foliageQueue.push(["tip", endX, endY, angle, stageIndex]);
    }
  }

  // Canopy palettes: [shadow, mid, highlight]. Flat layered tones, like
  // the chosen mockup — each clump is a dark base, a mid-tone body offset
  // up-left, and a small light highlight, which is what makes a flat
  // illustration read as round and lit from above.
  function canopyPalette(stageIndex) {
    // Late stages ripen to a warm olive-gold rather than pure yellow —
    // pure yellow clumps read as balloons, not foliage.
    if (stageIndex >= 7) return ["#5E6424", "#8E8F35", "#C2B85E"];
    if (stageIndex === 6) return ["#4F6A2C", "#7A9142", "#AFC07A"];
    return ["#2C6A43", "#3E8E5A", "#6FAE80"];
  }

  // One bushy clump: a few overlapping circles instead of a spray of
  // separate leaf blades. ~5 elements per branch tip — fewer than the leaf
  // spray it replaces, so this is a node-count win too.
  //
  // Each tone goes into a shared per-tree layer (layers.dark/mid/light)
  // rather than the clump's own group: painting every clump's shadow
  // first, then every mid-tone, then every highlight merges the clumps
  // into one scalloped crown. Per-clump grouping stacked them as separate
  // shaded balls, which read as bubbles, not a canopy.
  function drawClump(layers, x, y, r, stageIndex) {
    const [dark, mid, light] = canopyPalette(stageIndex);
    for (let i = 0; i < 2; i++) {
      const a = randomRange(0, Math.PI * 2);
      layers.dark.appendChild(createSVGElement('circle', {
        cx: x + Math.cos(a) * r * 0.75, cy: y + Math.sin(a) * r * 0.6, r: r * 0.55, fill: dark
      }));
    }
    layers.dark.appendChild(createSVGElement('circle', { cx: x, cy: y, r: r, fill: dark }));
    layers.mid.appendChild(createSVGElement('circle', { cx: x - r * 0.15, cy: y - r * 0.2, r: r * 0.8, fill: mid }));
    layers.light.appendChild(createSVGElement('ellipse', { cx: x - r * 0.25, cy: y - r * 0.5, rx: r * 0.5, ry: r * 0.3, fill: light, opacity: 0.85 }));
  }

  function clumpRadius(stageIndex) {
    const base = stageIndex >= 8 ? 26 : (stageIndex >= 4 ? 22 : 17);
    return base + currentProgress * 3 + randomRange(-2, 2);
  }

  // `svg` here is the extras layer (blossoms, buds, almonds) drawn above the canopy.
  function drawFoliage(svg, x, y, angle, stageIndex, layers) {
    const r = clumpRadius(stageIndex);
    drawClump(layers, x, y, r, stageIndex);

    // Blossom stage: small pink flowers dotted over the canopy, like the mockup.
    if (stageIndex === 4) {
      const n = 2 + Math.floor(currentProgress * 2);
      for (let i = 0; i < n; i++) {
        drawBlossom(svg, x + randomRange(-r * 0.7, r * 0.7), y + randomRange(-r * 0.7, r * 0.5), randomRange(2.6, 3.6));
      }
    }

    if (stageIndex === 2 && currentProgress >= 0.7) {
      if (random() > 0.4) {
        for(let i = 0; i < Math.floor(randomRange(2, 4)); i++) {
          svg.appendChild(createSVGElement('circle', {
            cx: x + randomRange(-8, 8), cy: y + randomRange(-8, 8), r: randomRange(1, 2.5), fill: "#E8F0D6"
          }));
        }
      }
    }

    if (stageIndex === 3 && random() > 0.5) {
      svg.appendChild(createSVGElement('circle', {
        cx: x + randomRange(-5, 5), cy: y + randomRange(-5, 5), r: randomRange(1.5, 3), fill: "#E8F0D6"
      }));
    }
    
    if (stageIndex === 3 && currentProgress >= 0.7) {
      if (random() > 0.3) {
        for(let i = 0; i < Math.floor(randomRange(3, 6)); i++) {
          svg.appendChild(createSVGElement('circle', {
            cx: x + randomRange(-10, 10), cy: y + randomRange(-10, 10), r: randomRange(1, 2), fill: "#F2A49B"
          }));
        }
      }
    }

    if (stageIndex === 4 && random() > 0.2) {
      if (currentProgress >= 0.7 && random() > 0.5) {
        drawAlmond(svg, x + randomRange(-8, 8), y + randomRange(-8, 8), randomRange(2, 4), "#3E8E5A");
      } else {
        drawBlossom(svg, x + randomRange(-8, 8), y + randomRange(-8, 8), randomRange(4, 7));
      }
    }

    if (stageIndex === 5 && random() > 0.4) {
      let aColor = "#3E8E5A";
      if (currentProgress >= 0.7 && random() > 0.6) aColor = "#A4A848";
      drawAlmond(svg, x + randomRange(-5, 5), y + randomRange(0, 5), randomRange(6, 9), aColor);
    }

    if (stageIndex === 6 && random() > 0.4) {
      let aColor = random() > 0.5 ? "#3E8E5A" : "#DAA520";
      if (currentProgress >= 0.7 && random() > 0.3) aColor = "#DAA520";
      drawAlmond(svg, x + randomRange(-5, 5), y + randomRange(0, 5), randomRange(6, 9), aColor);
    }

    if (stageIndex >= 7 && random() > (stageIndex === 8 ? 0.6 : 0.3)) {
      const aColor = random() > 0.5 ? "#DAA520" : "#C4A35A";
      drawAlmond(svg, x + randomRange(-5, 5), y + randomRange(0, 5), randomRange(7, 10), aColor);
    }
  }

  // --- Main API ---
  window.AlmondTree = {
    stages: [
      { name: "Seed",                need: 0,    description: "A tiny almond nestled in rich soil, a sprout just emerging.", particleType: "soil" },
      { name: "Sapling",             need: 25,   description: "A thin green-brown stem with a few delicate leaves.", particleType: "leaves" },
      { name: "Young Tree",          need: 70,   description: "A short trunk with spreading branches and a small canopy.", particleType: "leaves" },
      { name: "Budding Branches",    need: 140,  description: "Fuller branches with visible bark and tiny budding leaves.", particleType: "leaves" },
      { name: "Blossom",             need: 230,  description: "A beautiful display of pink and white almond blossoms.", particleType: "blossoms" },
      { name: "Green Almonds",       need: 350,  description: "Dense green foliage hiding small, growing green almonds.", particleType: "leaves" },
      { name: "Ripening Almonds",    need: 500,  description: "Almonds turning from green to gold as the season shifts.", particleType: "golden" },
      { name: "Harvest Tree",        need: 680,  description: "A mature tree filled with ripe, golden-brown almonds.", particleType: "harvest" },
      { name: "Ancient Almond Tree", need: 880,  description: "A majestic tree with a gnarled trunk and golden aura.", particleType: "sparkles" },
      { name: "Blessed Tree",        need: 1100, description: "Butterflies and songbirds have made this ancient tree their home.", particleType: "sparkles" },
      { name: "Flourishing Tree",    need: 1340, description: "New life springs from the roots — companion saplings emerge.", particleType: "sparkles" },
      { name: "Majestic Tree",       need: 1580, description: "A crown of golden light marks this tree as truly legendary.", particleType: "sparkles" },
      { name: "Golden Orchard",      need: 1820, description: "The tree's influence has spread — a small orchard begins to form.", particleType: "sparkles" },
      { name: "Enchanted Grove",     need: 1960, description: "A magical grove of almond trees bathed in eternal golden light.", particleType: "sparkles" }
    ],

    render: function(containerElement, stageIndex, animate = true, progress = 0.5) {
      injectStyles();
      containerElement.innerHTML = '';
      currentProgress = progress;
      
      const svg = createSVGElement('svg', {
        viewBox: "0 0 400 550",
        xmlns: svgNS,
        class: animate ? "tree-enter" : ""
      });

      randomSeed = stageIndex * 1337 + 42;

      if (stageIndex >= 7) {
        const defs = createSVGElement('defs');
        const gradient = createSVGElement('radialGradient', { id: "goldenGlow", cx: "50%", cy: "50%", r: "50%" });
        let opacity = stageIndex >= 8 ? "0.3" : "0";
        if (stageIndex === 7 && currentProgress >= 0.7) {
            opacity = ((currentProgress - 0.7) * 0.5).toString();
        }
        gradient.appendChild(createSVGElement('stop', { offset: "0%", "stop-color": "#FFD700", "stop-opacity": opacity }));
        gradient.appendChild(createSVGElement('stop', { offset: "100%", "stop-color": "#FFD700", "stop-opacity": "0" }));
        defs.appendChild(gradient);
        
        if (stageIndex >= 11) {
            const crownGradient = createSVGElement('radialGradient', { id: "goldenCrown", cx: "50%", cy: "50%", r: "50%" });
            crownGradient.appendChild(createSVGElement('stop', { offset: "0%", "stop-color": "#FFF3B0", "stop-opacity": "0.6" }));
            crownGradient.appendChild(createSVGElement('stop', { offset: "100%", "stop-color": "#FFF3B0", "stop-opacity": "0" }));
            defs.appendChild(crownGradient);
        }

        if (stageIndex >= 13) {
            const rainbowGrad = createSVGElement('linearGradient', { id: "rainbowGlow", x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "0%",   "stop-color": "rgba(255, 0, 0, 0.15)" }));
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "20%",  "stop-color": "rgba(255, 165, 0, 0.15)" }));
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "40%",  "stop-color": "rgba(255, 255, 0, 0.15)" }));
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "60%",  "stop-color": "rgba(0, 128, 0, 0.15)" }));
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "80%",  "stop-color": "rgba(0, 0, 255, 0.15)" }));
            rainbowGrad.appendChild(createSVGElement('stop', { offset: "100%", "stop-color": "rgba(238, 130, 238, 0.15)" }));
            defs.appendChild(rainbowGrad);
        }

        svg.appendChild(defs);

        if (opacity !== "0") {
            svg.appendChild(createSVGElement('circle', {
              cx: 200, cy: 220, r: 180, fill: "url(#goldenGlow)", class: "tree-glow"
            }));
        }
      }

      drawSoil(svg, stageIndex);

      const treeGroup = createSVGElement('g');
      const scaleFactor = 1.0 + (currentProgress * 0.04);
      treeGroup.setAttribute('transform', `translate(200, 520) scale(${scaleFactor}) translate(-200, -520)`);
      svg.appendChild(treeGroup);

      if (stageIndex === 0) {
        treeGroup.appendChild(createSVGElement('ellipse', {
          cx: 200, cy: 510, rx: 10, ry: 15, fill: "#8B5A2B", transform: "rotate(15, 200, 510)"
        }));
        treeGroup.appendChild(createSVGElement('path', {
          d: "M 200 495 Q 205 480 195 470", stroke: "#3E8E5A", fill: "none", "stroke-width": 2
        }));
        drawLeaf(treeGroup, 195, 470, 5, "#3E8E5A", -45);
        drawLeaf(treeGroup, 197, 475, 4, "#3E8E5A", 20);
        
        if (currentProgress >= 0.7) {
          drawLeaf(treeGroup, 200, 482, 3, "#3E8E5A", 45);
          if (currentProgress >= 0.85) {
             drawLeaf(treeGroup, 197, 488, 3, "#3E8E5A", -30);
          }
        }
      } 
      else if (stageIndex === 1) {
        const stemWidth = currentProgress >= 0.7 ? 5 : 4;
        treeGroup.appendChild(createSVGElement('path', {
          d: "M 200 520 Q 195 460 205 420", stroke: "#6B4423", fill: "none", "stroke-width": stemWidth
        }));
        drawLeaf(treeGroup, 202, 470, 8, "#3E8E5A", -30);
        drawLeaf(treeGroup, 198, 440, 8, "#3E8E5A", 210);
        drawLeaf(treeGroup, 205, 420, 10, "#3E8E5A", -10);
        
        if (currentProgress >= 0.7) {
          drawLeaf(treeGroup, 196, 455, 7, "#3E8E5A", 160);
        }
      }
      else {
        // Trunk height to the first fork. Kept short relative to the canopy
        // (trunk ~40% of the tree, like a real almond / the chosen mockup)
        // — the old values made a tall bare pole with a small cap on top.
        const heights =    [0, 0, 120, 150, 155, 160, 165, 170, 180, 185, 190, 195, 195, 200];
        const thicknesses = [0, 0,  15,  25,  25,  25,  28,  32,  50,  55,  58,  62,  62,  65];
        // Branch depth — each +1 here multiplies node count by ~2.7x (the
        // branching factor below), so this looks small but isn't. The old
        // array went up to 7, which generated ~16,000 DOM nodes for a single
        // tree at the top stages (measured) — with up to 9 of those drawn at
        // once in the forest grove, that's 100,000+ nodes and a multi-second
        // frozen tab. Capped at 5: same visual growth curve, ~10x fewer nodes.
        const levels =     [0, 0,   2,   2,   3,   3,   3,   4,   4,   4,   5,   5,   5,   5];
        
        const h    = heights[stageIndex];
        const t    = thicknesses[stageIndex];
        const maxL = levels[stageIndex];

        drawTrunk(treeGroup, h, t, stageIndex >= 7 ? "#4A2E19" : "#6B4423", stageIndex);
        buildTreeBranches(treeGroup, 200, 520 - h, -Math.PI / 2, h * 0.62, t * 0.6, 1, maxL, stageIndex);
        flushFoliage(treeGroup, 200, 520 - h);

        if (stageIndex === 4) {
          for (let i = 0; i < 15; i++) {
            const bx = randomRange(50, 350);
            const by = randomRange(50, 400);
            const g = createSVGElement('g', { class: "falling", style: `animation-delay: ${randomRange(0, 5)}s` });
            g.appendChild(createSVGElement('circle', { cx: bx, cy: by, r: randomRange(2, 4), fill: "#F2A49B" }));
            treeGroup.appendChild(g);
          }
        }

        if (stageIndex === 7) {
          for (let i = 0; i < 10; i++) {
            const bx = randomRange(80, 320);
            const by = randomRange(100, 400);
            const g = createSVGElement('g', { class: "falling", style: `animation-delay: ${randomRange(0, 6)}s` });
            if (random() > 0.5) {
              drawLeaf(g, bx, by, 8, "#D4A017", randomRange(0, 360));
            } else {
              drawAlmond(g, bx, by, 7, "#DAA520");
            }
            treeGroup.appendChild(g);
          }
        }

        if (stageIndex >= 8) {
          let baseSparkles = 20;
          if (stageIndex >= 9)  baseSparkles = 25;
          if (stageIndex >= 12) baseSparkles = 40;
          if (stageIndex >= 13) baseSparkles = 50;
          const numSparkles = Math.floor(baseSparkles + (currentProgress * (stageIndex >= 13 ? 30 : 20)));
          
          for (let i = 0; i < numSparkles; i++) {
            let sColor = "#FFF8DC";
            if (stageIndex >= 13 && random() > 0.5) {
                const sColors = ["#FFF8DC", "#FFD700", "#FFF3B0", "#F2A49B", "#A8DEC7"];
                sColor = sColors[Math.floor(randomRange(0, sColors.length))];
            }
            treeGroup.appendChild(createSVGElement('circle', {
              cx: randomRange(0, 400),
              cy: randomRange(0, 480),
              r: randomRange(1, 3) * (stageIndex >= 13 ? randomRange(1, 1.5) : 1),
              fill: sColor,
              class: "tree-sparkle",
              style: `animation-delay: ${randomRange(0, 2)}s`
            }));
          }
        }
        
        if (stageIndex >= 9) {
            const numBirds = stageIndex >= 11 ? Math.floor(randomRange(4, 5)) : Math.floor(randomRange(2, 3));
            for (let i = 0; i < numBirds; i++) {
                const birdX = randomRange(120, 280);
                const birdY = randomRange(150, 350);
                const birdGroup = createSVGElement('g', { transform: `translate(${birdX}, ${birdY}) scale(${randomRange(0.6, 0.9)})` });
                const dir = random() > 0.5 ? 1 : -1;
                birdGroup.appendChild(createSVGElement('path', {
                    d: `M 0 0 Q ${dir * 8} -5 ${dir * 10} 2 Q ${dir * 5} 5 0 2 Z`,
                    fill: "#4A90E2"
                }));
                treeGroup.appendChild(birdGroup);
            }
            if (stageIndex >= 11) {
                for (let i = 0; i < 2; i++) {
                    const birdX = randomRange(50, 350);
                    const birdY = randomRange(50, 150);
                    const birdGroup = createSVGElement('g', { transform: `translate(${birdX}, ${birdY}) scale(0.8)`, class: "tree-blossom" });
                    birdGroup.appendChild(createSVGElement('path', {
                        d: "M 0 0 Q 5 -5 10 0 Q 15 -5 20 0 Q 15 2 10 0 Q 5 2 0 0 Z",
                        fill: "#4A90E2"
                    }));
                    treeGroup.appendChild(birdGroup);
                }
            }
        }
        
        if (stageIndex >= 9) {
            let numButterflies = Math.floor(randomRange(5, 8));
            if (stageIndex >= 10) numButterflies = Math.floor(randomRange(8, 10));
            if (stageIndex >= 12) numButterflies = Math.floor(randomRange(10, 15));
            for (let i = 0; i < numButterflies; i++) {
                const bx = randomRange(50, 350);
                const by = randomRange(80, 450);
                const bGroup = createSVGElement('g', { 
                    transform: `translate(${bx}, ${by}) scale(${randomRange(0.5, 0.8)})`,
                    class: "tree-blossom",
                    style: `animation-delay: ${randomRange(0, 3)}s; animation-duration: ${randomRange(2, 4)}s;`
                });
                const bColor = random() > 0.5 ? "#E29D42" : "#A29FD4";
                bGroup.appendChild(createSVGElement('ellipse', { cx: 0, cy: 0, rx: 1, ry: 4, fill: "#333" }));
                bGroup.appendChild(createSVGElement('ellipse', { cx: -4, cy: -2, rx: 4, ry: 5, fill: bColor, transform: "rotate(-30, -4, -2)" }));
                bGroup.appendChild(createSVGElement('ellipse', { cx: 4, cy: -2, rx: 4, ry: 5, fill: bColor, transform: "rotate(30, 4, -2)" }));
                treeGroup.appendChild(bGroup);
            }
        }
        
        if (stageIndex >= 10) {
            let saplingHeights = stageIndex >= 12 ? 100 : (stageIndex >= 11 ? 60 : 40);
            const positions = [100, 300];
            if (stageIndex >= 12) positions.push(150);
            
            positions.forEach(sx => {
                const h = saplingHeights * randomRange(0.8, 1.2);
                drawTrunk(treeGroup, h, stageIndex >= 12 ? 8 : 4, "#6B4423", 2);
                if (stageIndex >= 12) {
                    buildTreeBranches(treeGroup, sx, 520 - h, -Math.PI / 2, h * 0.4, 4, 1, 2, stageIndex);
                    flushFoliage(treeGroup, sx, 520 - h);
                    for(let k=0; k<3; k++) {
                        drawAlmond(treeGroup, sx + randomRange(-15, 15), 520 - h + randomRange(-10, 20), randomRange(4, 6), "#DAA520");
                    }
                } else {
                    drawLeaf(treeGroup, sx, 520 - h, 6, "#3E8E5A", -30);
                    drawLeaf(treeGroup, sx - 5, 520 - h + 10, 6, "#3E8E5A", -150);
                    drawLeaf(treeGroup, sx + 5, 520 - h + 5, 6, "#3E8E5A", 20);
                }
            });
            
            const numFlowers = stageIndex >= 12 ? 15 : randomRange(5, 7);
            const fColors = ["#F2A49B", "#A8DEC7", "#F3D053"];
            for (let i = 0; i < numFlowers; i++) {
                treeGroup.appendChild(createSVGElement('circle', {
                    cx: randomRange(80, 320), cy: randomRange(510, 530),
                    r: randomRange(2, 4), fill: fColors[Math.floor(randomRange(0, fColors.length))]
                }));
            }
        }
        
        if (stageIndex >= 11) {
            treeGroup.appendChild(createSVGElement('circle', {
                cx: 200, cy: 150, r: 100, fill: "url(#goldenCrown)", class: "tree-glow"
            }));
            
            const numShimmer = stageIndex >= 13 ? 50 : randomRange(20, 30);
            for(let i=0; i<numShimmer; i++) {
                treeGroup.appendChild(createSVGElement('circle', {
                    cx: randomRange(50, 350), cy: randomRange(50, 350),
                    r: randomRange(1, 2.5), fill: "#FFD700", class: "tree-sparkle",
                    style: `animation-delay: ${randomRange(0, 2)}s; opacity: 0.8;`
                }));
            }
        }
        
        if (stageIndex >= 12) {
            treeGroup.appendChild(createSVGElement('rect', {
                x: 0, y: 0, width: 400, height: 550, fill: "rgba(226, 157, 66, 0.03)", "pointer-events": "none"
            }));
        }
        
        if (stageIndex >= 13) {
            treeGroup.appendChild(createSVGElement('path', {
                d: "M 0 300 Q 200 -50 400 300",
                fill: "none", stroke: "url(#rainbowGlow)", "stroke-width": 40,
                class: "tree-glow"
            }));
            
            for(let i=0; i<30; i++) {
                treeGroup.appendChild(createSVGElement('circle', {
                    cx: randomRange(0, 400), cy: randomRange(0, 550),
                    r: randomRange(1.5, 3), fill: "#ADFF2F", class: "tree-sparkle",
                    style: `animation-delay: ${randomRange(0, 3)}s; animation-duration: ${randomRange(1.5, 3)}s;`
                }));
            }
            
            treeGroup.appendChild(createSVGElement('rect', {
                x: 0, y: 0, width: 400, height: 550, fill: "rgba(255, 215, 0, 0.05)", "pointer-events": "none",
                class: "tree-glow"
            }));
        }
      }

      containerElement.appendChild(svg);
    }
  };
})();
