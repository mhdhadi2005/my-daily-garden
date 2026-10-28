// ============================================================
// Materials — shared low-poly material library.
// Warm medieval palette + wind / water / flag vertex animation
// injected via onBeforeCompile. One uniform clock drives all.
// ============================================================
import * as THREE from 'three';

export const PALETTE = {
  grass:      0x8fb35a,
  grassDark:  0x77994a,
  field:      0xd9b256,
  fieldDark:  0xc09a3e,
  dirt:       0x9c7a4e,
  sand:       0xd7c08a,
  water:      0x4e8fc4,
  waterDeep:  0x3a72a4,
  rock:       0x8d8d94,
  rockDark:   0x6e6e76,
  snow:       0xeef2f5,
  trunk:      0x7a5230,
  leafA:      0x4e7f3a,
  leafB:      0x6d9c46,
  leafC:      0x8fae52,
  wallPlaster:0xe8dcc0,
  wallStone:  0xb0a89a,
  woodBeam:   0x6b4a2c,
  roofRed:    0xb0523a,
  roofBlue:   0x5c7a9e,
  roofThatch: 0xc2a05a,
  road:       0xb8a684,
  fence:      0x8a6a44,
  flag:       0xc94f3f,
  lantern:    0xffca66,
  flower1:    0xe86a8a,
  flower2:    0xf0d060,
  flower3:    0xffffff,
  crop:       0xd8c25e,
  bush:       0x5d8c40,
  swamp:      0x5a7052,
  swampWater: 0x4a6a58,
  deadWood:   0x5a4a3a,
  ruinStone:  0x9a9284,
  banner:     0x7a4fa0,
  fire:       0xff7a30,
  smoke:      0xb8b8bc,
  bird:       0x4a4a52,
  butterfly:  0xf0a840,
  // --- world content expansion (new, extension only) ---
  leafPine:   0x3d6b3a,
  leafBirch:  0xa8c860,
  birchBark:  0xe8e4d8,
  birchMark:  0x3a3a34,
  cherryPink: 0xe89ab8,
  cherryDeep: 0xd87898,
  appleRed:   0xc83a3a,
  moss:       0x6a8a4a,
  mushroomCap:0xc85a4a,
  mushroomDot:0xf0e8d8,
  mushStem:   0xe8ddc8,
  fern:       0x4a7a3e,
  grassDry:   0xc2a860,
  reed:       0x8a9a58,
  reedHead:   0x7a5a38,
  lilyPad:    0x4e8a44,
  lilyFlower: 0xf0c8d8,
  waterPlant: 0x3e7a52,
  flower4:    0x9a6ac8,
  flower5:    0xf08848,
  barrelWood: 0x8a5f38,
  barrelBand: 0x4a4038,
  crateWood:  0xa87c4e,
  hay:        0xd8b868,
  stonePile:  0x7e7e86,
  charcoal:   0x3a342e,
  signWood:   0x9a7448,
  wagonWheel: 0x5a4228,
  boatHull:   0x7a5838,
  wallStoneB: 0x9a948c,
  roofSlate:  0x5a6270,
  roofGreen:  0x5a7a4a,
  windowGlow: 0xffd98a,
  // --- military & trade expansion (new, extension only) ---
  clothCover: 0xe4d6b4,   // wagon canvas cover
  clothTrim:  0xb89a6a,
  tabardRed:  0xa8382e,   // faction cloth colors
  tabardBlue: 0x3e5e88,
  tabardGreen:0x4a7a3e,
  skin:       0xe0b490,
  steel:      0xb4bcc4,
  steelDark:  0x7e868e,
  ironBand:   0x4e4a44,
  leather:    0x7e5a38,
  leatherDark:0x5e4228,
  ropeTan:    0xc0a878,
  goldCoin:   0xe8b83a,
  goldDeep:   0xc89020,
  gemBlue:    0x4a8ac8,
  ramHead:    0x565058,
  siegeWood:  0x8a6840,
};

// single global clock uniform shared by all animated materials
export const sharedUniforms = {
  uTime: { value: 0 },
};

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

/** Inject sway animation: vertices displaced by wind, stronger at higher local Y. */
function makeWindMaterial(color, strength = 0.08, speed = 1.2) {
  const mat = lambert(color);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float sway = position.y * ${strength.toFixed(3)};
          #ifdef USE_INSTANCING
            vec3 wp = (instanceMatrix * vec4(position,1.0)).xyz;
          #else
            vec3 wp = position;
          #endif
          float ph = wp.x * 0.9 + wp.z * 0.7;
          transformed.x += sin(uTime * ${speed.toFixed(2)} + ph) * sway;
          transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + ph * 1.3) * sway * 0.6;
        }`
      );
  };
  return mat;
}

/** Water: gentle vertex waves + flowing brightness stripes. */
function makeWaterMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.water,
    transparent: true,
    opacity: 0.92,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\nvarying vec3 vWpos;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = (instanceMatrix * vec4(position,1.0)).xyz;
          #else
            vec3 wp = position;
          #endif
          vWpos = wp;
          transformed.y += sin(uTime * 1.6 + wp.x * 2.2 + wp.z * 1.7) * 0.035;
        }`
      );
    shader.fragmentShader =
      'uniform float uTime;\nvarying vec3 vWpos;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          float flow = sin(vWpos.x * 3.0 + vWpos.z * 4.0 - uTime * 2.4);
          float stripe = smoothstep(0.75, 1.0, flow);
          gl_FragColor.rgb += stripe * 0.10;
        }`
      );
  };
  return mat;
}

/** Flag: wave animation increasing along local X (away from pole). */
function makeFlagMaterial(color = PALETTE.flag) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = max(position.x, 0.0);
          transformed.z += sin(uTime * 7.0 + position.x * 9.0) * w * 0.35;
          transformed.y += cos(uTime * 5.0 + position.x * 7.0) * w * 0.12;
        }`
      );
  };
  return mat;
}

/** Lantern glow: emissive pulses with shared clock. */
function makeLanternMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.lantern,
    emissive: new THREE.Color(0xff9d3c),
    emissiveIntensity: 0.9,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.fragmentShader =
      'uniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(1.0, 0.62, 0.25) * (0.18 + 0.14 * sin(uTime * 3.2));`
      );
  };
  return mat;
}

/** Banner cloth: same wave as flag but purple, hangs downward. */
function makeBannerMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.banner,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = max(-position.y, 0.0);
          transformed.z += sin(uTime * 4.0 + position.y * 8.0) * w * 0.3;
        }`
      );
  };
  return mat;
}

/** Campfire flame: emissive flicker with shared clock. */
function makeFireMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.fire,
    emissive: new THREE.Color(0xff5a10),
    emissiveIntensity: 1.2,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float f = max(position.y, 0.0);
          transformed.x += sin(uTime * 9.0 + position.y * 12.0) * f * 0.25;
          transformed.y += sin(uTime * 6.0) * f * 0.12;
        }`
      );
    shader.fragmentShader =
      'uniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(1.0, 0.45, 0.1) * (0.25 + 0.2 * sin(uTime * 11.0));`
      );
  };
  return mat;
}

/** Window glow: warm emissive pane with a very soft flicker (candlelight). */
function makeWindowGlowMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.windowGlow,
    emissive: new THREE.Color(0xffb84d),
    emissiveIntensity: 0.7,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.fragmentShader =
      'uniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(1.0, 0.72, 0.35) * (0.10 + 0.06 * sin(uTime * 2.1) * sin(uTime * 3.7));`
      );
  };
  return mat;
}

/** Torch flame: small emissive flame with strong flicker (shares fire look). */
function makeTorchMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffa040,
    emissive: new THREE.Color(0xff6a18),
    emissiveIntensity: 1.3,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float f = max(position.y, 0.0);
          transformed.x += sin(uTime * 10.0 + position.y * 14.0) * f * 0.3;
          transformed.z += cos(uTime * 8.0 + position.y * 11.0) * f * 0.22;
        }`
      );
    shader.fragmentShader =
      'uniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(1.0, 0.5, 0.12) * (0.3 + 0.22 * sin(uTime * 13.0 + 1.7));`
      );
  };
  return mat;
}

/** Vertex-colored lambert (merged low-poly assets, 1 material for many colors). */
function vcLambert() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/** Vertex-colored + wind sway — used by instanced trees/bushes/flowers. */
function makeWindVCMaterial(strength = 0.06, speed = 1.2) {
  const mat = vcLambert();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float sway = max(position.y - 0.15, 0.0) * ${strength.toFixed(3)};
          #ifdef USE_INSTANCING
            vec3 wp = (instanceMatrix * vec4(position,1.0)).xyz;
          #else
            vec3 wp = position;
          #endif
          float ph = wp.x * 0.9 + wp.z * 0.7;
          transformed.x += sin(uTime * ${speed.toFixed(2)} + ph) * sway;
          transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + ph * 1.3) * sway * 0.6;
        }`
      );
  };
  return mat;
}

// -------- shared material instances (created once) --------
export const MATS = {
  grass: lambert(PALETTE.grass),
  grassDark: lambert(PALETTE.grassDark),
  field: lambert(PALETTE.field),
  fieldDark: lambert(PALETTE.fieldDark),
  dirt: lambert(PALETTE.dirt),
  sand: lambert(PALETTE.sand),
  rock: lambert(PALETTE.rock),
  rockDark: lambert(PALETTE.rockDark),
  snow: lambert(PALETTE.snow),
  trunk: lambert(PALETTE.trunk),
  leafA: makeWindMaterial(PALETTE.leafA, 0.055, 1.1),
  leafB: makeWindMaterial(PALETTE.leafB, 0.065, 1.35),
  bush: makeWindMaterial(PALETTE.bush, 0.05, 1.5),
  flower1: makeWindMaterial(PALETTE.flower1, 0.16, 2.0),
  flower2: makeWindMaterial(PALETTE.flower2, 0.16, 2.2),
  crop: makeWindMaterial(PALETTE.crop, 0.12, 1.7),
  water: makeWaterMaterial(),
  wallPlaster: lambert(PALETTE.wallPlaster),
  wallStone: lambert(PALETTE.wallStone),
  woodBeam: lambert(PALETTE.woodBeam),
  roofRed: lambert(PALETTE.roofRed),
  roofBlue: lambert(PALETTE.roofBlue),
  roofThatch: lambert(PALETTE.roofThatch),
  road: lambert(PALETTE.road),
  fence: lambert(PALETTE.fence),
  swamp: lambert(PALETTE.swamp),
  swampWater: new THREE.MeshLambertMaterial({
    color: PALETTE.swampWater, transparent: true, opacity: 0.9,
  }),
  banner: makeBannerMaterial(),
  fire: makeFireMaterial(),
  smoke: new THREE.MeshLambertMaterial({
    color: PALETTE.smoke, transparent: true, opacity: 0.4, depthWrite: false,
  }),
  flag: makeFlagMaterial(),
  // --- military & trade expansion: faction flag cloths ---
  flagRed: makeFlagMaterial(PALETTE.tabardRed),
  flagBlue: makeFlagMaterial(PALETTE.tabardBlue),
  flagGreen: makeFlagMaterial(PALETTE.tabardGreen),
  lantern: makeLanternMaterial(),
  windowGlow: makeWindowGlowMaterial(),
  torchFlame: makeTorchMaterial(),
  roofSlate: lambert(PALETTE.roofSlate),
  roofGreen: lambert(PALETTE.roofGreen),
  wallStoneB: lambert(PALETTE.wallStoneB),
  vcStatic: vcLambert(),                     // rocks, terrain, buildings (merged colors)
  vcWind: makeWindVCMaterial(0.06, 1.15),    // trees
  vcWindStrong: makeWindVCMaterial(0.14, 1.9), // flowers, crops, grass
  ghostValid: new THREE.MeshBasicMaterial({
    color: 0xa8e07a, transparent: true, opacity: 0.35, depthWrite: false,
  }),
  ghostInvalid: new THREE.MeshBasicMaterial({
    color: 0xe07a6a, transparent: true, opacity: 0.35, depthWrite: false,
  }),
  frontier: new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false,
  }),
};

/** advance shared animation clock — call once per frame */
export function updateMaterialsClock(elapsed) {
  sharedUniforms.uTime.value = elapsed;
}
